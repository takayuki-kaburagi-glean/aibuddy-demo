import React, { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import { I18nProvider, useI18n } from './i18n.jsx';
import Header from './components/Header.jsx';
import BuddyChat from './components/BuddyChat.jsx';
import RegistryView from './components/RegistryView.jsx';
import MemoryView from './components/MemoryView.jsx';
import ModelsView from './components/ModelsView.jsx';
import ToolsView from './components/ToolsView.jsx';
import HistoryView from './components/HistoryView.jsx';

const USER_ID = 'default';

function AppInner() {
  const { t } = useI18n();
  const [view, setView] = useState('buddy');
  const [connected, setConnected] = useState(false);
  const [gleanAgentId, setGleanAgentId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [agents, setAgents] = useState([]);
  const [dept, setDept] = useState('Engineering');
  const [model, setModelState] = useState('');
  const [models, setModels] = useState([]);
  const [banner, setBanner] = useState(null);
  const [chatKey, setChatKey] = useState(0); // Increment on logo click -> remount BuddyChat (reset conversation)

  // Logo (top-left) click: return to top (AI Buddy) and reset the conversation (discard saved conversation and start a new one)
  const onHome = () => { try { localStorage.removeItem('aibuddy.conv'); } catch { /* noop */ } setView('buddy'); setChatKey((k) => k + 1); };

  const loadProfile = useCallback(async () => {
    try {
      setProfileError(null);
      const p = await api.profile(USER_ID);
      setProfile(p);
    } catch (e) {
      setProfile(null);
      setProfileError(e.message);
    }
  }, []);

  const loadModels = useCallback(async () => {
    try {
      const m = await api.models(USER_ID);
      setModels(m.models || []);
      setModelState(m.selected || '');
    } catch { /* Ignore when not connected */ }
  }, []);

  const refreshConnection = useCallback(async () => {
    try {
      const info = await api.gleanInfo(USER_ID);
      setGleanAgentId(info.agentId);
      setConnected(!!info.connected && !info.expired);
      return !!info.connected && !info.expired;
    } catch (e) {
      setBanner(`${t('bannerConnInfo')}: ${e.message}`);
      return false;
    }
  }, []);

  const loadAgents = useCallback(async () => {
    try {
      const r = await api.listAgents();
      setAgents(r.agents || []);
    } catch (e) { setBanner(`${t('bannerRegistry')}: ${e.message}`); }
  }, []);

  // Initialization: handle OAuth redirect -> connection status -> fetch data
  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const oauth = params.get('oauth');
      if (oauth) {
        if (oauth === 'error') setBanner(`${t('bannerOauthError')}: ${params.get('message') || t('bannerUnknown')}`);
        window.history.replaceState({}, '', window.location.pathname);
      }
      await loadAgents();
      const ok = await refreshConnection();
      if (ok) { await Promise.all([loadProfile(), loadModels()]); }
    })();
  }, [loadAgents, refreshConnection, loadProfile, loadModels]);

  // Immediately reflect models enabled in the LLM Gateway tab into the dropdown when returning to the Buddy tab.
  useEffect(() => { if (view === 'buddy' && connected) loadModels(); }, [view, connected, loadModels]);

  const onConnect = async () => {
    try {
      if (!gleanAgentId) { setBanner(t('bannerAgentNotRegistered')); return; }
      const { authorizeUrl } = await api.oauthAuthorize(gleanAgentId, USER_ID);
      window.location.assign(authorizeUrl);
    } catch (e) { setBanner(`${t('bannerConnStart')}: ${e.message}`); }
  };

  const onDisconnect = async () => {
    try {
      if (gleanAgentId) await api.oauthDisconnect(gleanAgentId, USER_ID);
      setConnected(false); setProfile(null);
    } catch (e) { setBanner(`${t('bannerDisconnectFail')}: ${e.message}`); }
  };

  const onSetModel = async (m) => {
    setModelState(m);
    try { await api.setModel(m); } catch (e) { setBanner(`${t('bannerModelChangeFail')}: ${e.message}`); }
  };

  return (
    <div className="app">
      <Header
        view={view} setView={setView}
        connected={connected} onConnect={onConnect} onDisconnect={onDisconnect}
        dept={dept} setDept={setDept} onHome={onHome}
      />
      {banner && <div className="banner" onClick={() => setBanner(null)}>{banner} <span className="banner-x">✕</span></div>}
      {profileError && connected && (
        <div className="banner warn">{t('bannerMemoryFail')}: {profileError}</div>
      )}

      <main className="content">
        {view === 'buddy' && <BuddyChat key={chatKey} connected={connected} profile={profile} userId={USER_ID} dept={dept} model={model} models={models} setModel={onSetModel} />}
        {view === 'registry' && <RegistryView agents={agents} connected={connected} onChanged={loadAgents} />}
        {view === 'memory' && <MemoryView connected={connected} />}
        {view === 'models' && <ModelsView connected={connected} onModelsChanged={loadModels} />}
        {view === 'tools' && <ToolsView connected={connected} />}
        {view === 'history' && <HistoryView connected={connected} onOpenChat={onHome} />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppInner />
    </I18nProvider>
  );
}
