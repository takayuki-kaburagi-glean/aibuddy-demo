import React, { useState } from 'react';
import AgentCard from './AgentCard.jsx';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';

// A2A / registry. Unified catalog of multi-platform agents + search/add for real Glean agents.
export default function RegistryView({ agents, connected, onChanged }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState(null);
  // Filter / sort
  const [fText, setFText] = useState('');
  const [fDept, setFDept] = useState('all');
  const [fPlat, setFPlat] = useState('all');
  const [sortBy, setSortBy] = useState('department');
  const [sortDir, setSortDir] = useState('asc');

  async function search() {
    if (!q.trim() || !connected) return;
    setSearching(true); setErr(null);
    try { const r = await api.gleanSearch(q); setResults(r.agents || []); }
    catch (e) { setErr(e.message); setResults([]); }
    finally { setSearching(false); }
  }
  async function add(a) {
    setErr(null);
    try { await api.gleanAdd(a); setResults((rs) => rs.map((x) => (x.agentId === a.agentId ? { ...x, added: true } : x))); onChanged?.(); }
    catch (e) { setErr(e.message); }
  }
  async function del(id) {
    try { await api.deleteAgent(id); onChanged?.(); } catch (e) { setErr(e.message); }
  }

  const domain = agents.filter((a) => a.meta && a.meta.department);
  const realCount = domain.filter((a) => a.meta?.real).length;
  const depts = ['all', ...new Set(domain.map((a) => a.meta.department).filter(Boolean))];
  const plats = ['all', ...new Set(domain.map((a) => a.meta.platform).filter(Boolean))];

  const sortVal = (x) => {
    if (sortBy === 'rating') return x.meta.rating ?? 0;
    if (sortBy === 'exec') return x.meta.executionRating ?? 0;
    if (sortBy === 'name') return x.name || '';
    if (sortBy === 'platform') return x.meta.platform || '';
    return x.meta.department || '';
  };
  const filtered = domain
    .filter((a) => {
      if (fDept !== 'all' && a.meta.department !== fDept) return false;
      if (fPlat !== 'all' && (a.meta.platform || '') !== fPlat) return false;
      if (fText) {
        const needle = fText.toLowerCase();
        if (!(`${a.name} ${a.description} ${a.meta.department}`.toLowerCase().includes(needle))) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const va = sortVal(a), vb = sortVal(b);
      return (typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ja')) * dir;
    });

  return (
    <div className="registry">
      <div className="registry-head">
        <h2>{t('registry')}</h2>
        <p className="registry-sub">
          {t('registrySub1')}
          <b> {t('registrySub2')}</b>
          <span className="synthetic-note">{t('registrySynthNote')}</span>
        </p>
      </div>

      {/* Search/add menu for real Glean agents */}
      <div className="glean-search">
        <div className="glean-search-title">{t('gleanSearchTitle')}{realCount > 0 && <span className="glean-added-count">{realCount} {t('gleanAddedCount')}</span>}</div>
        {!connected ? (
          <div className="notice">{t('notConnected')}</div>
        ) : (
          <>
            <div className="glean-search-bar">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) search(); }}
                placeholder={t('gleanSearchPlaceholder')}
              />
              <button onClick={search} disabled={searching || !q.trim()}>{searching ? t('searching') : t('searchBtn')}</button>
            </div>
            {err && <div className="banner warn" style={{ borderRadius: 10 }}>{err}</div>}
            {results && (
              <div className="glean-results">
                {!results.length && <div className="glean-empty">{t('noAgentsFound')}</div>}
                {results.map((a) => (
                  <div key={a.agentId} className="glean-result">
                    <div className="glean-result-info">
                      <span className="glean-result-name">{a.name}</span>
                      {a.description && <span className="glean-result-desc">{a.description}</span>}
                    </div>
                    <button className="add-btn" onClick={() => add(a)} disabled={a.added}>{a.added ? t('added') : t('addBtn')}</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="registry-toolbar">
        <input className="reg-search" placeholder={t('filterPlaceholder')} value={fText} onChange={(e) => setFText(e.target.value)} />
        <label className="reg-ctl"><span>{t('department')}</span>
          <select value={fDept} onChange={(e) => setFDept(e.target.value)}>
            {depts.map((d) => <option key={d} value={d}>{d === 'all' ? t('all') : d}</option>)}
          </select>
        </label>
        <label className="reg-ctl"><span>{t('platformLabel')}</span>
          <select value={fPlat} onChange={(e) => setFPlat(e.target.value)}>
            {plats.map((p) => <option key={p} value={p}>{p === 'all' ? t('all') : p}</option>)}
          </select>
        </label>
        <label className="reg-ctl"><span>{t('sortBy')}</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="department">{t('sortDepartment')}</option>
            <option value="name">{t('sortName')}</option>
            <option value="rating">{t('sortRating')}</option>
            <option value="exec">{t('sortExec')}</option>
            <option value="platform">{t('sortPlatform')}</option>
          </select>
        </label>
        <button className="sort-dir" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))} title={t('sortDirTitle')}>
          {sortDir === 'asc' ? t('sortAsc') : t('sortDesc')}
        </button>
        <span className="reg-count">{filtered.length} / {domain.length}</span>
      </div>

      <div className="agent-grid">
        {filtered.map((a) => <AgentCard key={a.id} agent={a} onDelete={a.meta?.real ? () => del(a.id) : null} />)}
        {!filtered.length && <div className="glean-empty">{t('noAgentsMatch')}</div>}
      </div>
    </div>
  );
}
