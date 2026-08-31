import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';

// Header gear menu: configure the demo email recipient (all email actions
// are redirected to this address server-side).
export default function SettingsMenu() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const ref = useRef(null);

  async function load() {
    try {
      const s = await api.getSettings();
      setEmail(s.emailRecipient || '');
      setSaved(s.emailRecipient || '');
    } catch { /* backend may not be up yet */ }
  }
  useEffect(() => { load(); }, []);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  async function save() {
    setBusy(true); setStatus(null);
    try {
      const r = await api.setSettings({ emailRecipient: email.trim() });
      setSaved(r.emailRecipient || '');
      setEmail(r.emailRecipient || '');
      setStatus('saved');
    } catch (e) {
      setStatus(`error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-menu" ref={ref}>
      <button className="settings-btn" onClick={() => setOpen((v) => !v)} title={t('settingsTitle')}>⚙</button>
      {open && (
        <div className="settings-pop">
          <div className="settings-pop-title">{t('settingsTitle')}</div>
          <label className="settings-field">
            <span>{t('settingsEmailLabel')}</span>
            <input
              type="email"
              value={email}
              placeholder={t('settingsEmailPh')}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) save(); }}
            />
          </label>
          <p className="settings-hint">{t('settingsHint')}</p>
          <div className="settings-actions">
            {status === 'saved' && <span className="settings-ok">{t('savedOk')}</span>}
            {status && status.startsWith('error') && <span className="settings-err">{status}</span>}
            <button className="settings-save" onClick={save} disabled={busy || email.trim() === saved.trim()}>
              {busy ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
