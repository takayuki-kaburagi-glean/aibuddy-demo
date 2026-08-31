import React, { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';

// History tab: list, view details for, and delete AI Buddy run history.
export default function HistoryView() {
  const { t } = useI18n();
  const [runs, setRuns] = useState([]);
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try { const r = await api.listRuns(); setRuns(r.runs || []); } catch { /* noop */ }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function toggle(id) {
    if (open === id) { setOpen(null); setDetail(null); return; }
    setOpen(id); setDetail(null);
    try { setDetail(await api.getRun(id)); } catch { /* noop */ }
  }
  async function del(id, e) {
    e.stopPropagation();
    try { await api.deleteRun(id); } catch { /* noop */ }
    if (open === id) { setOpen(null); setDetail(null); }
    load();
  }
  async function clearAll() {
    try { await api.clearRuns(); } catch { /* noop */ }
    setOpen(null); setDetail(null); load();
  }

  const fmt = (iso) => { try { return new Date(iso).toLocaleString('en-US'); } catch { return iso; } };

  return (
    <div className="pane">
      <div className="pane-head">
        <div>
          <h2>🕐 {t('historyTab')}</h2>
          <p className="pane-sub">{t('historyPaneSub')}</p>
        </div>
        <div className="pane-actions">
          {runs.length > 0 && <button className="reload" onClick={clearAll}>{t('historyClear')}</button>}
          <button className="reload" onClick={load} disabled={loading}>{loading ? t('loading') : t('reload')}</button>
        </div>
      </div>

      {!loading && !runs.length && <div className="notice">{t('historyEmpty')}</div>}

      <div className="run-list">
        {runs.map((r) => (
          <div key={r.id} className={open === r.id ? 'run-card open' : 'run-card'} onClick={() => toggle(r.id)}>
            <div className="run-top">
              <span className="run-dept">{r.dept}</span>
              <span className="run-query">{r.query}</span>
              <span className="run-time">{fmt(r.createdAt)}</span>
              <button className="link sm run-del" onClick={(e) => del(r.id, e)}>{t('historyDelete')}</button>
            </div>
            {(r.routed || []).length > 0 && (
              <div className="run-meta">➜ {(r.routed || []).map((a) => a.name).join(' / ')}</div>
            )}
            {open === r.id && detail && (
              <div className="run-detail" onClick={(e) => e.stopPropagation()}>
                {(detail.routed || []).length > 0 && (
                  <div className="run-agents">
                    {detail.routed.map((a, i) => (
                      <span key={i} className={a.permissionOk ? 'chip ok' : 'chip err'}>{a.permissionOk ? '✓' : '✕'} {a.name}</span>
                    ))}
                  </div>
                )}
                <div className="final"><Markdown remarkPlugins={[remarkGfm]}>{detail.final || t('noAnswerText')}</Markdown></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
