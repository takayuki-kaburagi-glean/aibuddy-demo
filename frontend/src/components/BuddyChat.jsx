import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import SuggestionCard from './SuggestionCard.jsx';
import RoutingTrace from './RoutingTrace.jsx';
import MD from './MdView.jsx';
import { toolLogo, toolDisplayName } from '../toolMeta.js';

const emptyEvents = () => ({ assistant: [], thinking: [], routings: [], toolUses: [], final: '', suggestions: [], memory: null, memoryError: null, error: null, streaming: true });
const emptyChat = () => ({ steps: [], answer: '', citations: [], error: null, streaming: true });

// Update an AI Buddy (routing) turn
function applyEvent(messages, ev) {
  const next = messages.slice();
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i].role === 'buddy' && next[i].events.streaming) {
      const e = { ...next[i].events, assistant: [...next[i].events.assistant], thinking: [...(next[i].events.thinking || [])], routings: next[i].events.routings.map((r) => ({ ...r })), toolUses: (next[i].events.toolUses || []).map((x) => ({ ...x })) };
      switch (ev.type) {
        case 'memory_loaded': e.memory = { projects: ev.projects, threads: ev.threads, topics: ev.topics, tool: ev.tool }; break;
        case 'memory_error': e.memoryError = ev.message; break;
        case 'thinking': if (ev.text?.trim()) e.thinking.push(ev.text.trim()); break;
        case 'assistant': if (ev.text?.trim()) e.assistant.push(ev.text.trim()); break;
        case 'routing_decision': e.routings.push({ decision: ev, result: null, live: null }); break;
        case 'worker_delta': {
          for (let k = e.routings.length - 1; k >= 0; k--) {
            if (!e.routings[k].result) { e.routings[k] = { ...e.routings[k], live: ev.result }; break; }
          }
          break;
        }
        case 'tool_use': e.toolUses.push({ tool: ev.tool, input: ev.input, result: null }); break;
        case 'tool_result': {
          if (ev.isTool) {
            for (let k = e.toolUses.length - 1; k >= 0; k--) { if (!e.toolUses[k].result) { e.toolUses[k].result = ev.result; break; } }
          } else {
            for (let k = e.routings.length - 1; k >= 0; k--) {
              if (!e.routings[k].result) { e.routings[k] = { ...e.routings[k], result: { result: ev.result, denied: !!ev.denied } }; break; }
            }
          }
          break;
        }
        case 'final': e.final = ev.text || ''; break;
        case 'suggestions': e.suggestions = ev.suggestions || []; break;
        case 'error': e.error = ev.message; break;
        case 'done': e.streaming = false; break;
        default: break;
      }
      next[i] = { ...next[i], events: e };
      break;
    }
  }
  return next;
}

// Update a chat mode (Glean chat) turn
function applyChatEvent(messages, ev) {
  const next = messages.slice();
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i].role === 'chat' && next[i].ev.streaming) {
      const e = { ...next[i].ev };
      switch (ev.type) {
        case 'steps': e.steps = ev.steps || []; break;
        case 'answer': e.answer = ev.text || ''; break;
        case 'citations': e.citations = ev.citations || []; break;
        case 'final': if (ev.text) e.answer = ev.text; break;
        case 'error': e.error = ev.message; break;
        case 'done': e.streaming = false; break;
        default: break;
      }
      next[i] = { ...next[i], ev: e };
      break;
    }
  }
  return next;
}

const CONV_KEY = 'aibuddy.conv';
const newCid = () => 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function loadConv() {
  try {
    const j = JSON.parse(localStorage.getItem(CONV_KEY) || 'null');
    if (j && j.cid && Array.isArray(j.messages)) {
      // On restore, clear the streaming flag (show as a past, completed conversation)
      const msgs = j.messages.map((m) => {
        if (m.role === 'buddy' && m.events) return { ...m, events: { ...m.events, streaming: false } };
        if (m.role === 'chat' && m.ev) return { ...m, ev: { ...m.ev, streaming: false } };
        return m;
      });
      return { cid: j.cid, messages: msgs };
    }
  } catch { /* noop */ }
  return null;
}

export default function BuddyChat({ connected, profile, userId, dept, model, models, setModel }) {
  const { t, lang } = useI18n();
  const restored = loadConv();
  const [messages, setMessages] = useState(restored?.messages || []);
  const cidRef = useRef(restored?.cid || newCid());
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // Display format: false=standard (Markdown) / true=HTML (also render raw HTML)
  const [htmlRender, setHtmlRender] = useState(() => { try { return localStorage.getItem('aibuddy.html') === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('aibuddy.html', htmlRender ? '1' : '0'); } catch { /* noop */ } }, [htmlRender]);
  // Mode: 'buddy' (routing) / 'chat' (Glean chat as-is)
  const [mode, setMode] = useState('buddy');
  // Chat mode options (user-selectable items of the Chat API)
  const [gAgent, setGAgent] = useState('DEFAULT');
  const [gSave, setGSave] = useState(false);
  const [gInclude, setGInclude] = useState('');
  const [gExclude, setGExclude] = useState('');
  const [showOpts, setShowOpts] = useState(false);
  const esRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => () => esRef.current?.close(), []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);
  // Persist the conversation to localStorage (so you can continue after reload/sleep)
  useEffect(() => {
    try { localStorage.setItem(CONV_KEY, JSON.stringify({ cid: cidRef.current, messages: messages.slice(-30) })); } catch { /* Ignore quota exceeded, etc. */ }
  }, [messages]);

  function ask(q) {
    const query = (q ?? input).trim();
    if (!query || busy || !connected) return;
    setInput('');
    setBusy(true);

    if (mode === 'chat') {
      setMessages((prev) => [...prev, { role: 'user', text: query }, { role: 'chat', ev: emptyChat() }]);
      const tz = -new Date().getTimezoneOffset();
      const es = new EventSource(api.gchatUrl({ q: query, userId, agent: gAgent, save: gSave, include: gInclude, exclude: gExclude, tz }));
      esRef.current = es;
      es.onmessage = (e) => {
        let ev; try { ev = JSON.parse(e.data); } catch { return; }
        setMessages((prev) => applyChatEvent(prev, ev));
        if (ev.type === 'done') { es.close(); setBusy(false); }
      };
      es.onerror = () => { es.close(); setBusy(false); setMessages((prev) => applyChatEvent(prev, { type: 'done' })); };
      return;
    }

    setMessages((prev) => [...prev, { role: 'user', text: query }, { role: 'buddy', events: emptyEvents() }]);
    const es = new EventSource(api.chatStreamUrl({ q: query, userId, dept, model, cid: cidRef.current, lang }));
    esRef.current = es;
    es.onmessage = (e) => {
      let ev; try { ev = JSON.parse(e.data); } catch { return; }
      setMessages((prev) => applyEvent(prev, ev));
      if (ev.type === 'done') { es.close(); setBusy(false); }
    };
    es.onerror = () => { es.close(); setBusy(false); setMessages((prev) => applyEvent(prev, { type: 'done' })); };
  }

  const topProjects = profile?.projects?.slice(0, 3) || [];
  const showSplash = messages.length === 0;

  return (
    <div className="buddy">
      {/* Mode toggle + chat options */}
      <div className="mode-bar">
        <div className="seg mode-seg">
          <button className={mode === 'buddy' ? 'seg-btn on' : 'seg-btn'} onClick={() => setMode('buddy')} disabled={busy}>{t('modeBuddy')}</button>
          <button className={mode === 'chat' ? 'seg-btn on' : 'seg-btn'} onClick={() => setMode('chat')} disabled={busy}>{t('modeChat')}</button>
        </div>
        {mode === 'chat' && (
          <div className="chat-opts">
            <label className="reg-ctl"><span>{t('chatAssistant')}</span>
              <select value={gAgent} onChange={(e) => setGAgent(e.target.value)} disabled={busy}>
                <option value="DEFAULT">{t('chatDefault')}</option>
                <option value="GPT">GPT</option>
              </select>
            </label>
            <label className="chk"><input type="checkbox" checked={gSave} onChange={(e) => setGSave(e.target.checked)} disabled={busy} /> {t('chatSaveHistory')}</label>
            <button className="opts-more" onClick={() => setShowOpts((v) => !v)}>{t('chatDataSources')} {showOpts ? '▲' : '▼'}</button>
          </div>
        )}
      </div>
      {mode === 'chat' && showOpts && (
        <div className="chat-opts-adv">
          <label className="reg-ctl"><span>{t('chatInclude')}</span><input value={gInclude} onChange={(e) => setGInclude(e.target.value)} placeholder={t('chatIncludePh')} /></label>
          <label className="reg-ctl"><span>{t('chatExclude')}</span><input value={gExclude} onChange={(e) => setGExclude(e.target.value)} placeholder={t('chatExcludePh')} /></label>
          <span className="opts-hint">{t('chatSourcesHint')}</span>
        </div>
      )}

      <div className="chat-scroll" ref={scrollRef}>
        {showSplash ? (
          <div className="splash">
            <div className="splash-avatar">✦</div>
            {connected ? (
              <>
                <h1 className="splash-hello">{t('splashHello')}</h1>
                <p className="splash-sub">
                  {mode === 'chat'
                    ? t('chatSplashSub')
                    : (profile ? t('buddySplashSub') : t('greetingFallback'))}
                  {profile?.tool && <span className="mem-badge">🧠 {t('memBadge')}</span>}
                </p>
                {mode === 'buddy' && topProjects.length > 0 && (
                  <div className="splash-context">
                    <div className="splash-context-label">{t('projects')}</div>
                    <div className="chip-row">
                      {topProjects.map((p, i) => <span key={i} className="ctx-chip">{p.label}</span>)}
                    </div>
                  </div>
                )}
                {mode === 'buddy' && profile?.suggestions?.length > 0 && (
                  <div className="splash-suggestions">
                    <div className="greeting-suglabel">{t('suggestionsTitle')}</div>
                    <div className="suggestion-list">
                      {profile.suggestions.map((s, i) => (
                        <SuggestionCard key={i} title={s.title} onClick={() => ask(s.prompt)} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <h1 className="splash-hello">{t('splashHello')}</h1>
                <p className="splash-sub">{t('notConnected')}</p>
              </>
            )}
          </div>
        ) : (
          <div className="messages">
            {messages.map((m, i) => {
              if (m.role === 'user') return <div key={i} className="msg user"><div className="bubble">{m.text}</div></div>;
              if (m.role === 'chat') {
                return (
                  <div key={i} className="msg buddy">
                    <div className="bubble">
                      {m.ev.streaming && m.ev.steps?.length ? (
                        <div className="chat-steps">{m.ev.steps.map((s, k) => <span key={k} className="chat-step">⚙ {s}</span>)}</div>
                      ) : null}
                      {m.ev.answer ? (
                        <div className="final"><MD html={htmlRender}>{m.ev.answer}</MD></div>
                      ) : m.ev.streaming ? <div className="typing">{t('thinking')}</div> : null}
                      {m.ev.error && <div className="err">{m.ev.error}</div>}
                      {m.ev.citations?.length ? (
                        <div className="citations">
                          <div className="citations-label">{t('sourcesLabel')}</div>
                          {m.ev.citations.map((c, k) => c.url
                            ? <a key={k} href={c.url} target="_blank" rel="noreferrer" className="citation">{c.title}</a>
                            : <span key={k} className="citation">{c.title}</span>)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} className="msg buddy">
                  <div className="bubble">
                    {m.events.memory && (
                      <div className="mem-loaded">🧠 {t('memoryLoaded')}
                        {m.events.memory.tool ? <code>{m.events.memory.tool}</code> : null}</div>
                    )}
                    {m.events.memoryError && <div className="mem-err">memory: {m.events.memoryError}</div>}
                    {m.events.thinking?.length ? (
                      <div className="thinking-box">
                        <div className="thinking-label">{t('reasoningLabel')}</div>
                        {m.events.thinking.map((a, k) => (
                          <div key={k} className="thinking-text"><MD html={htmlRender}>{a}</MD></div>
                        ))}
                      </div>
                    ) : null}
                    {m.events.assistant.map((a, k) => <div key={k} className="assistant-note">{a}</div>)}
                    {m.events.routings.map((r, k) => <RoutingTrace key={k} decision={r.decision} result={r.result} live={r.live} html={htmlRender} />)}
                    {m.events.toolUses?.map((tu, k) => (
                      <div key={k} className="tool-trace">
                        <div className="tool-trace-head">
                          <img className="tool-trace-logo" src={toolLogo(tu.tool)} alt="" />
                          <b>{toolDisplayName(tu.tool)}</b>
                          <code className="tool-trace-id">{tu.tool}</code>
                        </div>
                        {tu.result ? <div className="tool-trace-result md"><MD html={htmlRender}>{String(tu.result)}</MD></div> : <div className="typing">{t('runningLabel')}</div>}
                      </div>
                    ))}
                    {m.events.final ? (
                      <div className="final"><MD html={htmlRender}>{m.events.final}</MD></div>
                    ) : m.events.streaming ? <div className="typing">{t('thinking')}</div> : null}
                    {m.events.error && <div className="err">{m.events.error}</div>}
                    {m.events.suggestions?.length ? (
                      <div className="next-actions">
                        <div className="next-label">{t('nextActions')}</div>
                        <div className="suggestion-row">
                          {m.events.suggestions.map((s, k) => (
                            <SuggestionCard key={k} title={s.title} onClick={() => ask(s.prompt)} />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="composer-wrap">
        <div className="composer">
          {mode === 'buddy' && models?.length > 0 && (
            <select className="model-select" value={model || ''} onChange={(e) => setModel(e.target.value)} title={t('modelSelectTitle')} disabled={busy}>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          {mode === 'buddy' && (
            <select className="fmt-select" value={htmlRender ? 'html' : 'md'} onChange={(e) => setHtmlRender(e.target.value === 'html')} title={t('fmtTitle')}>
              <option value="md">{t('fmtStandard')}</option>
              <option value="html">{t('fmtHtml')}</option>
            </select>
          )}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) ask(); }}
            placeholder={mode === 'chat' ? t('askPlaceholderChat') : t('askPlaceholder')}
            disabled={!connected || busy}
          />
          <button className="send-btn" onClick={() => ask()} disabled={!connected || busy || !input.trim()} title={t('send')}>
            {busy ? '…' : '➤'}
          </button>
        </div>
        <div className="composer-hint">{mode === 'chat' ? t('hintChat') : `${t('hintBuddyAskingAs')} ${dept} · ${t('hintPressEnter')}`}</div>
      </div>
    </div>
  );
}
