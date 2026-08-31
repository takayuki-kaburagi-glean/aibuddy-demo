import React, { useState } from 'react';
import { useI18n } from '../i18n.jsx';

// Toggle display of a ```html code block between "preview (iframe) / code".
// The iframe is rendered safely with sandbox (allow-scripts only, isolated from the parent origin).
export default function HtmlPreview({ code }) {
  const { t } = useI18n();
  const [view, setView] = useState('preview');
  const html = String(code || '');
  return (
    <div className="html-preview">
      <div className="html-preview-bar">
        <span className="html-preview-label">{t('htmlPreviewLabel')}</span>
        <div className="html-preview-tabs">
          <button className={view === 'preview' ? 'on' : ''} onClick={() => setView('preview')}>{t('previewBtn')}</button>
          <button className={view === 'code' ? 'on' : ''} onClick={() => setView('code')}>{t('codeBtn')}</button>
          <button onClick={() => { const w = window.open('', '_blank'); if (w) { w.document.open(); w.document.write(html); w.document.close(); } }} title={t('openNewTab')}>↗</button>
        </div>
      </div>
      {view === 'preview'
        ? <iframe className="html-preview-frame" sandbox="allow-scripts" srcDoc={html} title="HTML preview" />
        : <pre className="html-preview-code"><code>{html}</code></pre>}
    </div>
  );
}
