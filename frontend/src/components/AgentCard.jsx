import React from 'react';
import { useI18n } from '../i18n.jsx';
import { localizeAgent } from '../agentI18n.js';

const platformClass = (p) => {
  const k = String(p || '').toLowerCase();
  if (k.includes('glean')) return 'pf glean';
  if (k.includes('copilot')) return 'pf copilot';
  if (k.includes('dify')) return 'pf dify';
  if (k.includes('low')) return 'pf lowcode';
  return 'pf';
};

// Platform (category) -> logo
const platformLogo = (p) => {
  const k = String(p || '').toLowerCase();
  if (k.includes('glean')) return '/logos/glean-logo.png';
  if (k.includes('copilot') || k.includes('microsoft')) return '/logos/microsoft.svg';
  if (k.includes('dify')) return '/logos/dify.png';
  if (k.includes('github')) return '/logos/github.svg';
  if (k.includes('jenkins')) return '/logos/jenkins.svg';
  if (k.includes('low')) return '/logos/lowcode.svg';
  return '/logos/inhouse.svg'; // In-house, etc.
};

// A single registry card. Shows the annotations from hand-written notes (description/permission/metadata/rating/execution rating).
export default function AgentCard({ agent, onDelete }) {
  const { t, lang } = useI18n();
  const m = agent.meta || {};
  const loc = localizeAgent(agent, lang); // localized name / description / skill labels
  return (
    <div className={m.real ? 'agent-card real' : 'agent-card'}>
      <div className="agent-card-top">
        <div className="agent-dept-chip">{m.department || '—'}</div>
        <span className={platformClass(m.platform)}>
          <img className="pf-logo" src={platformLogo(m.platform)} alt="" loading="lazy" />
          {m.platform || t('inHouse')}
        </span>
        {onDelete && <button className="agent-del" onClick={onDelete} title={t('delete')}>✕</button>}
      </div>
      <div className="agent-name">{loc.name}</div>
      <div className="agent-desc">{loc.description}</div>

      {agent.skills?.length ? (
        <div className="agent-skills">
          {agent.skills.slice(0, 3).map((s) => <span key={s.id || s.name} className="skill-tag">{loc.skillName(s.name)}</span>)}
        </div>
      ) : null}

      <div className="agent-metrics">
        <div className="metric">
          <span className="metric-label">{t('rating')}</span>
          <span className="metric-value">{m.rating != null ? `★ ${m.rating.toFixed(1)}` : '—'}</span>
        </div>
        <div className="metric">
          <span className="metric-label">{t('execRating')}</span>
          <span className="metric-value">{m.executionRating != null ? `${Math.round(m.executionRating * 100)}%` : '—'}</span>
        </div>
      </div>

      <div className="agent-perm">
        <span className="agent-perm-label">{t('canUse')}</span>
        <span className="agent-perm-chips">
          {(m.permission || [t('companyWide')]).map((p) => <span key={p} className="perm-chip">{p}</span>)}
        </span>
      </div>
    </div>
  );
}
