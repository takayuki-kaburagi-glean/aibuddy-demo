import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';

// Personal Memory tab: visualizes what the memory tool returns.
// When the UI language is Japanese, the default is Japanese (translated on the server only the first time -> cached; not re-translated on later access).
// The "show original" button live-fetches and displays the raw data from MCP.
// When the UI language is not Japanese, the raw memory is shown as-is with no translation.
export default function MemoryView({ connected }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState(null);
  const [showJa, setShowJa] = useState(lang === 'ja');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // mode: 'ja' -> Japanese (cached), 'raw' -> original (live-fetch raw MCP data)
  async function fetchMemory(mode) {
    if (!connected) return;
    setLoading(true); setError(null);
    try {
      const useJa = lang === 'ja' && mode === 'ja';
      const d = await api.memory(useJa ? 'ja' : undefined);
      setData(d);
      setShowJa(useJa);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchMemory(lang === 'ja' ? 'ja' : 'raw'); /* eslint-disable-next-line */ }, [connected]);

  if (!connected) return <div className="pane"><div className="notice">{t('notConnected')}</div></div>;

  const p = data?.parsed || {};
  const List = ({ label, items, render }) =>
    items?.length ? (
      <div className="mem-block">
        <div className="mem-block-label">{label} <span className="mem-count">{items.length}</span></div>
        <div className="mem-items">{items.map(render)}</div>
      </div>
    ) : null;

  return (
    <div className="pane">
      <div className="pane-head">
        <div>
          <h2>🧠 {t('memoryTab')}</h2>
          <p className="pane-sub">
            {t('memPaneSub1')} “{t('showOriginal')}” {t('memPaneSub2')}
          </p>
        </div>
        <div className="pane-actions">
          {lang === 'ja' && (
            <div className="seg">
              <button className={showJa ? 'seg-btn on' : 'seg-btn'} onClick={() => fetchMemory('ja')} disabled={loading}>日本語</button>
              <button className={!showJa ? 'seg-btn on' : 'seg-btn'} onClick={() => fetchMemory('raw')} disabled={loading}>{t('showOriginal')}</button>
            </div>
          )}
          <button className="reload" onClick={() => fetchMemory(showJa ? 'ja' : 'raw')} disabled={loading}>{loading ? t('loading') : t('reload')}</button>
        </div>
      </div>

      {error && <div className="banner warn" style={{ borderRadius: 10 }}>memory: {error}</div>}
      {loading && !data && <div className="notice">{showJa ? t('memTranslatingFirst') : t('loading')}</div>}

      {data && (
        <>
          <div className="mem-meta">
            <span className="mem-badge">🧠 {t('memToolLabel')}: <b>{data.tool}</b></span>
            <span>{t('memRawLen')}: <b>{(data.rawLength || 0).toLocaleString()}</b> {t('memChars')}</span>
            <span>{t('memCategories')}: {(data.categories || []).map((c) => <span key={c} className="cat-chip">{c}</span>)}</span>
            {showJa && data.translated && <span className="ja-badge">🌐 {t('translatedBadge')}{data.cached ? t('memCached') : ''}</span>}
          </div>

          <div className="mem-grid">
            <div className="mem-parsed">
              <div className="mem-section-title">{t('memParsed')}</div>
              <List label={t('memProjects')} items={p.projects} render={(x, i) => (
                <div key={i} className="mem-line"><b>{x.label}</b>{x.detail ? <span className="mem-detail"> — {x.detail}</span> : null}</div>
              )} />
              <List label={t('memThreads')} items={p.threads} render={(x, i) => (
                <div key={i} className="mem-line"><b>{x.label}</b>{x.detail ? <span className="mem-detail"> — {x.detail}</span> : null}</div>
              )} />
              <List label={t('memSummaries')} items={p.summaries} render={(x, i) => (
                <div key={i} className="mem-line"><b>{x.label}</b>{x.detail ? <span className="mem-detail"> — {x.detail}</span> : null}</div>
              )} />
              <List label={t('memTopics')} items={p.topics} render={(x, i) => <span key={i} className="ctx-chip">{x}</span>} />
              <List label={t('memCollab')} items={p.collaborators} render={(x, i) => <span key={i} className="ctx-chip">{x}</span>} />
              <List label={t('memPrefs')} items={p.preferences} render={(x, i) => <div key={i} className="mem-line pref">“{x}”</div>} />
            </div>

            <div className="mem-raw">
              <div className="mem-section-title">{t('memRaw')}{!showJa && <span className="ja-badge" style={{ background: '#eef0f6', color: '#475467' }}>{t('memRawMcp')}</span>}</div>
              <pre className="mem-pre">{data.sample}</pre>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
