import React from 'react';
import { useI18n } from '../i18n.jsx';
import SettingsMenu from './SettingsMenu.jsx';

// Departments (ordered to match the Personal Memory persona: eng / QA / platform first)
const DEPTS = ['Engineering', 'QA', 'SRE', 'Data', 'Platform', 'Security', 'Finance', 'Executive', 'Sales', 'Research', 'Legal', 'HR', 'IT'];

export default function Header({ view, setView, connected, onConnect, onDisconnect, dept, setDept, onHome }) {
  const { t, lang, setLang } = useI18n();
  const tabs = [
    ['buddy', t('buddy')],
    ['registry', t('registry')],
    ['memory', t('memoryTab')],
    ['models', t('modelsTab')],
    ['tools', t('toolsTab')],
    ['history', t('historyTab')],
  ];
  return (
    <header className="app-header">
      <button className="brand" onClick={onHome} title={t('brandHomeTitle')}>
        <div className="brand-logo">✦</div>
        <div className="brand-text">
          <div className="brand-title">AI Buddy</div>
          <div className="brand-by">Powered by <img className="glean-inline" src="/logos/glean-logo.png" alt="" /><b>Glean</b></div>
        </div>
      </button>

      <nav className="tabs">
        {tabs.map(([k, label]) => (
          <button key={k} className={view === k ? 'tab active' : 'tab'} onClick={() => setView(k)}>{label}</button>
        ))}
      </nav>

      <div className="header-controls">
        <label className="ctl dept-ctl">
          <span>{t('dept')}</span>
          <select value={dept} onChange={(e) => setDept(e.target.value)}>
            {DEPTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>

        <button className="lang" onClick={() => setLang(lang === 'en' ? 'ja' : 'en')}>{t('langLabel')}</button>

        <SettingsMenu />

        {connected ? (
          <div className="conn-menu" tabIndex={0}>
            <button className="conn-pill"><span className="dot ok" />{t('connected')}<span className="conn-caret">▾</span></button>
            <div className="conn-pop">
              <div className="conn-pop-title"><span className="dot ok" />{t('connectedToGlean')}</div>
              <button className="conn-disc" onClick={onDisconnect}>{t('disconnect')}</button>
            </div>
          </div>
        ) : (
          <button className="connect" onClick={onConnect}>{t('connect')}</button>
        )}
      </div>
    </header>
  );
}
