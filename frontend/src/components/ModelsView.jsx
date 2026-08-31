import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';

// LLM Gateway tab: shows the lineup of models provided by the Glean LLM Gateway.
// "Test & enable" calls the model once for real, and if it responds, adds it as an AI Buddy orchestrator model candidate.
const PROVIDER = (id) => {
  const s = String(id).toLowerCase();
  if (/claude|anthropic/.test(s)) return { label: 'Anthropic', cls: 'pv-anthropic', logo: '/logos/anthropic.svg' };
  if (/gpt|openai|^o[13]|davinci/.test(s)) return { label: 'OpenAI', cls: 'pv-openai', logo: '/logos/openai-icon.png' };
  if (/gemini|palm|bison|google/.test(s)) return { label: 'Google', cls: 'pv-google', logo: '/logos/googlegemini.svg' };
  if (/glm|zhipu/.test(s)) return { label: 'Zhipu GLM', cls: 'pv-glm', logo: '/logos/glm.webp' };
  if (/kimi|moonshot/.test(s)) return { label: 'Moonshot (Kimi)', cls: 'pv-kimi', logo: null };
  if (/nemotron|nvidia|fireworks/.test(s)) return { label: 'NVIDIA', cls: 'pv-nvidia', logo: '/logos/nvidia.svg' };
  if (/llama|meta/.test(s)) return { label: 'Meta', cls: 'pv-meta', logo: '/logos/meta.svg' };
  if (/mistral|mixtral/.test(s)) return { label: 'Mistral', cls: 'pv-mistral', logo: '/logos/mistralai.svg' };
  if (/amazon|titan|nova|bedrock/.test(s)) return { label: 'AWS', cls: 'pv-amazon', logo: null };
  return { label: 'Other', cls: '', logo: null };
};

export default function ModelsView({ connected, onModelsChanged }) {
  const { t } = useI18n();
  const [models, setModels] = useState([]);
  const [meta, setMeta] = useState({ count: 0, selectable: [], selected: '', urls: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [probes, setProbes] = useState({});

  async function load() {
    if (!connected) return;
    setLoading(true); setError(null);
    try {
      // Retry once on a transient network failure (e.g. "Failed to fetch" while the backend is restarting)
      let r;
      try { r = await api.listGatewayModels(); }
      catch (e1) {
        if (/Failed to fetch|NetworkError|load failed/i.test(e1.message)) {
          await new Promise((res) => setTimeout(res, 900));
          r = await api.listGatewayModels();
        } else throw e1;
      }
      setModels(r.models || []);
      setMeta({ count: r.count ?? (r.models || []).length, selectable: r.selectable || [], selected: r.selected || '', urls: r.urls || [] });
    } catch (e) {
      setError(e.message);
      try { const m = await api.models(); setModels((m.models || []).map((id) => ({ id }))); setMeta({ count: (m.models || []).length, selectable: m.models || [], selected: m.selected || '', urls: [] }); } catch { /* noop */ }
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [connected]);

  async function testEnable(id) {
    setProbes((p) => ({ ...p, [id]: { state: 'testing' } }));
    try {
      const r = await api.probeModel(id, true);
      const state = r.ok ? 'ok' : r.reason === 'empty' ? 'empty' : 'error';
      setProbes((p) => ({ ...p, [id]: { state, text: r.output || r.detail || '' } }));
      if (r.enabled) { setMeta((m) => (m.selectable.includes(id) ? m : { ...m, selectable: [...m.selectable, id] })); onModelsChanged?.(); }
    } catch (e) { setProbes((p) => ({ ...p, [id]: { state: 'error', text: e.message } })); }
  }
  async function disable(id) {
    try { await api.disableModel(id); setMeta((m) => ({ ...m, selectable: m.selectable.filter((x) => x !== id) })); onModelsChanged?.(); }
    catch { /* noop */ }
  }

  if (!connected) return <div className="pane"><div className="notice">{t('notConnected')}</div></div>;

  const isSel = (id) => meta.selectable.includes(id);
  const sorted = [...models].sort((a, b) => {
    const av = (isSel(a.id) ? 1 : 0) + (a.id === meta.selected ? 2 : 0);
    const bv = (isSel(b.id) ? 1 : 0) + (b.id === meta.selected ? 2 : 0);
    return bv - av || String(a.id).localeCompare(String(b.id));
  });

  return (
    <div className="pane">
      <div className="pane-head">
        <div>
          <h2>⚡ {t('modelsTab')} — {meta.count} {t('modelsCountSuffix')}</h2>
          <p className="pane-sub">
            {t('modelsPaneSub1')} <b>{t('testEnable')}</b> {t('modelsPaneSub2')}
            {meta.urls.length ? <> / {meta.urls.length} {t('modelsAggregated')}</> : null}
          </p>
        </div>
        <button className="reload" onClick={load} disabled={loading}>{loading ? t('loading') : t('reload')}</button>
      </div>

      {error && <div className="banner warn" style={{ borderRadius: 10 }}>catalog: {error}</div>}

      <div className="model-grid">
        {sorted.map((m) => {
          const pv = PROVIDER(m.id);
          const usable = isSel(m.id);
          const pr = probes[m.id];
          return (
            <div key={m.id} className={`model-card ${usable ? 'usable' : ''}`}>
              <div className="model-top">
                <span className={`pv ${pv.cls}`}>
                  {pv.logo && <img className="pv-logo" src={pv.logo} alt="" loading="lazy" />}
                  {pv.label}
                </span>
                {m.id === meta.selected && <span className="chip accent">{t('selected')}</span>}
                {usable && <span className="chip ok">✅ {t('builderOk')}</span>}
              </div>
              <code className="model-id">{m.id}</code>
              {m.ownedBy ? <div className="model-owner">{m.ownedBy}</div> : null}
              <div className="model-actions">
                {usable ? (
                  <button className="link sm" onClick={() => disable(m.id)}>{t('disable')}</button>
                ) : (
                  <button className="link sm" onClick={() => testEnable(m.id)} disabled={pr?.state === 'testing'}>
                    {pr?.state === 'testing' ? t('testing') : t('testEnable')}
                  </button>
                )}
                {pr?.state === 'ok' && <span className="chip ok">✅ {t('respondsOk')}</span>}
                {pr?.state === 'empty' && <span className="chip muted">⚠️ {t('emptyResp')}</span>}
                {pr?.state === 'error' && <span className="chip err">❌ {t('errorResp')}</span>}
              </div>
              {pr && pr.state !== 'testing' && pr.text ? <div className="model-probe-out">{pr.text}</div> : null}
            </div>
          );
        })}
        {!loading && !sorted.length && <div className="notice">{t('noModels')}</div>}
      </div>
    </div>
  );
}
