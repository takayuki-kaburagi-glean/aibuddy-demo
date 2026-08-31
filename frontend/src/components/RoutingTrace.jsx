import React from 'react';
import { useI18n } from '../i18n.jsx';
import MD from './MdView.jsx';

const platformClass = (p) => {
  const k = String(p || '').toLowerCase();
  if (k.includes('glean')) return 'pf glean';
  if (k.includes('copilot')) return 'pf copilot';
  if (k.includes('dify')) return 'pf dify';
  if (k.includes('low')) return 'pf lowcode';
  return 'pf';
};

const Stars = ({ v }) => {
  if (v == null) return null;
  const full = Math.round(v);
  return <span className="stars" title={`${v}`}>{'★'.repeat(full)}<span className="stars-dim">{'★'.repeat(5 - full)}</span> {v.toFixed(1)}</span>;
};

// Visualizes the routing decision (which agent, permission, rating, execution success rate).
export default function RoutingTrace({ decision, result, live, html }) {
  const { t } = useI18n();
  const a = decision.agent;
  return (
    <div className={`routing ${decision.permissionOk ? '' : 'denied'}`}>
      <div className="routing-head">
        <span className="routing-label">➜ {t('routingTitle')}</span>
        <span className="routing-agent">{a.name}</span>
        <span className={platformClass(a.platform)}>{a.platform}</span>
        <span className="routing-dept">{a.department}</span>
        <span className={decision.permissionOk ? 'perm ok' : 'perm ng'}>
          {decision.permissionOk ? '✓ ' + t('permissionOk') : '✕ ' + t('permissionNg')}
        </span>
      </div>
      {decision.reason ? <div className="routing-reason">“{decision.reason}”</div> : null}
      <div className="routing-meta">
        <span>{t('rating')}: <Stars v={a.rating} /></span>
        <span>{t('execRating')}: <b>{a.executionRating != null ? Math.round(a.executionRating * 100) + '%' : '—'}</b></span>
        <span>{t('canUse')}: {(a.permission || []).join(' / ') || t('companyWide')}</span>
      </div>
      {result ? (
        <div className={`routing-result md ${result.denied ? 'denied' : ''}`}>
          <MD html={html}>{String(result.result || '')}</MD>
        </div>
      ) : live ? (
        <div className="routing-result md live">
          <MD html={html}>{String(live)}</MD>
          <span className="stream-caret">▍</span>
        </div>
      ) : null}
    </div>
  );
}
