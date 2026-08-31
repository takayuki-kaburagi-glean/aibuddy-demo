import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { toolLogo, toolDisplayName as displayName, toolDescriptionJa } from '../toolMeta.js';

const safeJson = (v) => { try { return JSON.parse(v); } catch { return v; } };

// Dummy tools for well-known SaaS (demo-only, not connected). Logos are shown in grayscale to distinguish them from actually connected tools.
const DUMMY_TOOLS = [
  { name: 'salesforce', label: 'Salesforce opportunity lookup', logo: '/logos/salesforce.svg', desc: 'Looks up/updates CRM accounts, opportunities, and leads.', props: { object: { type: 'string', description: 'Account / Opportunity / Lead' }, keyword: { type: 'string', description: 'Search keyword' } } },
  { name: 'servicenow', label: 'ServiceNow ticket', logo: '/logos/servicenow.svg', desc: 'Creates/updates ITSM incidents and requests.', props: { short_description: { type: 'string' }, priority: { type: 'string', description: '1-Critical / 2-High / 3-Moderate' } } },
  { name: 'notion', label: 'Create Notion page', logo: '/logos/notion.svg', desc: 'Creates/searches Notion pages and databases.', props: { title: { type: 'string' }, body: { type: 'string' } } },
  { name: 'confluence', label: 'Create Confluence doc', logo: '/logos/confluence.svg', desc: 'Creates/searches Confluence pages.', props: { space: { type: 'string' }, title: { type: 'string' } } },
  { name: 'gitlab', label: 'Create GitLab issue', logo: '/logos/gitlab.svg', desc: 'Works with GitLab issues / merge requests.', props: { project: { type: 'string' }, title: { type: 'string' } } },
  { name: 'zendesk', label: 'Zendesk ticket', logo: '/logos/zendesk.svg', desc: 'Looks up/updates support tickets.', props: { subject: { type: 'string' }, requester: { type: 'string' } } },
  { name: 'box', label: 'Box file sharing', logo: '/logos/box.svg', desc: 'Searches/shares Box files.', props: { query: { type: 'string' } } },
  { name: 'dropbox', label: 'Dropbox files', logo: '/logos/dropbox.svg', desc: 'Searches/shares Dropbox files.', props: { query: { type: 'string' } } },
  { name: 'gdrive', label: 'Google Drive search', logo: '/logos/googledrive.svg', desc: 'Searches/creates Google Drive files.', props: { query: { type: 'string' } } },
  { name: 'gcal', label: 'Google Calendar event', logo: '/logos/googlecalendar.svg', desc: 'Creates/looks up calendar events.', props: { title: { type: 'string' }, when: { type: 'string' } } },
  { name: 'asana', label: 'Create Asana task', logo: '/logos/asana.svg', desc: 'Works with Asana tasks/projects.', props: { name: { type: 'string' } } },
  { name: 'linear', label: 'Create Linear issue', logo: '/logos/linear.svg', desc: 'Creates/updates Linear issues.', props: { title: { type: 'string' } } },
  { name: 'hubspot', label: 'HubSpot CRM', logo: '/logos/hubspot.svg', desc: 'Works with HubSpot contacts/deals.', props: { email: { type: 'string' } } },
  { name: 'figma', label: 'View Figma design', logo: '/logos/figma.svg', desc: 'References Figma design files.', props: { file: { type: 'string' } } },
  { name: 'teams', label: 'Teams message', logo: '/logos/teams.svg', desc: 'Sends a message to Microsoft Teams.', props: { channel: { type: 'string' }, text: { type: 'string' } } },
  { name: 'zoom', label: 'Create Zoom meeting', logo: '/logos/zoom.svg', desc: 'Creates/looks up Zoom meetings.', props: { topic: { type: 'string' } } },
  { name: 'workday', label: 'Workday HR lookup', logo: '/logos/workday.svg', desc: 'Looks up Workday HR data.', props: { employee: { type: 'string' } } },
  { name: 'sap', label: 'SAP ERP lookup', logo: '/logos/sap.svg', desc: 'Looks up SAP ERP data.', props: { module: { type: 'string' } } },
];

const TileLogo = ({ tool }) => (
  tool.mono
    ? <span className="tool-mono">{tool.mono}</span>
    : <img className={`tool-tile-logo${tool.dummy ? ' dummy-logo' : ''}`} src={tool.logo || toolLogo(tool.name)} alt="" loading="lazy" />
);

export default function ToolsView({ connected }) {
  const { t } = useI18n();
  const [tools, setTools] = useState([]);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [args, setArgs] = useState({});
  const [running, setRunning] = useState(null);
  const [results, setResults] = useState({});

  async function load() {
    if (!connected) return;
    setLoading(true); setError(null);
    try { const r = await api.listTools(); setTools(r.tools || []); setUrl(r.url || ''); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [connected]);

  const setArg = (tool, prop, val) => setArgs((a) => ({ ...a, [tool]: { ...(a[tool] || {}), [prop]: val } }));

  async function run(sel) {
    const tool = sel.name;
    setRunning(tool); setResults((r) => ({ ...r, [tool]: null }));
    // Dummies do not connect externally; they return a demo-only mock response
    if (sel.dummy) {
      await new Promise((res) => setTimeout(res, 500));
      const input = JSON.stringify(args[tool] || {}, null, 2);
      setResults((r) => ({ ...r, [tool]: { ok: true, dummy: true, text: `${t('demoMockResp')}\n${t('demoCalled')} ${sel.label}.\n* ${t('demoNoConnect')} ${sel.label.split(' ')[0]}${t('demoNoConnect2')}\n\n${t('demoRequestInput')}\n${input}` } }));
      setRunning(null);
      return;
    }
    const props = sel.props;
    const raw = args[tool] || {};
    const coerced = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v === '' || v == null) continue;
      const ty = props[k]?.type;
      coerced[k] = ty === 'number' || ty === 'integer' ? Number(v)
        : ty === 'boolean' ? (v === true || v === 'true')
          : (ty === 'array' || ty === 'object') ? safeJson(v) : v;
    }
    try { const res = await api.callTool(tool, coerced); setResults((r) => ({ ...r, [tool]: { ok: true, text: res.result } })); }
    catch (e) { setResults((r) => ({ ...r, [tool]: { ok: false, text: e.message } })); }
    finally { setRunning(null); }
  }

  if (!connected) return <div className="pane"><div className="notice">{t('notConnected')}</div></div>;

  // Hide only Glean-native/internal tools; show all third-party integration tools (newly added ones appear automatically).
  const GLEAN_NATIVE = /^(enterprise_search|read_document|user_activity|memory|memory_schema|create_artifact|create_image|edit_artifact|edit_image|share_artifact|find_skills|read_skill_files|run_tool|knowledge_graph_query|knowledge_graph_schema)$/i;
  const live = tools.filter((tl) => !GLEAN_NATIVE.test(tl.name)).map((tl) => ({
    name: tl.name, label: displayName(tl.name), desc: toolDescriptionJa(tl.name) || tl.description,
    props: tl.inputSchema?.properties || {}, required: tl.inputSchema?.required || [], dummy: false,
  }));
  const dummies = DUMMY_TOOLS.map((d) => ({ ...d, desc: d.desc, required: [], dummy: true }));

  // Currently selected tool
  const sel = [...live, ...dummies].find((x) => x.name === open);

  return (
    <div className="pane">
      <div className="pane-head">
        <div>
          <h2>🔧 {t('toolsTab')}<span className="tools-count">{live.length + dummies.length}</span></h2>
          <p className="pane-sub">
            {t('toolsPaneSub')}
          </p>
        </div>
        <button className="reload" onClick={load} disabled={loading}>{loading ? t('loading') : t('reload')}</button>
      </div>

      {error && <div className="banner warn" style={{ borderRadius: 10 }}>tools: {error}</div>}

      <div className="tool-grid2">
        {[...live, ...dummies].map((tool) => (
          <button key={tool.name} className={`tool-tile${tool.dummy ? ' dummy' : ''}${open === tool.name ? ' on' : ''}`} title={tool.desc} onClick={() => setOpen(open === tool.name ? null : tool.name)}>
            {tool.dummy && <span className="tool-badge">DEMO</span>}
            <TileLogo tool={tool} />
            <span className="tool-tile-name">{tool.label}</span>
          </button>
        ))}
        {!loading && !live.length && !dummies.length && <div className="notice">{t('noThirdPartyTools')}</div>}
      </div>

      {sel && (() => {
        const props = sel.props || {};
        const required = sel.required || [];
        const result = results[sel.name];
        return (
          <div className="tool-panel">
            <div className="tool-panel-head">
              <TileLogo tool={sel} />
              <div>
                <div className="tool-panel-name">{sel.label}{sel.dummy && <span className="tool-badge inline">DEMO</span>}</div>
                <code className="tool-panel-id">{sel.name}</code>
              </div>
              <button className="link" onClick={() => setOpen(null)}>{t('close')}</button>
            </div>
            <p className="tool-panel-desc">{sel.desc}</p>
            {sel.dummy && <div className="opts-hint">{t('dummyToolNote')}</div>}
            <div className="tool-test">
              {Object.keys(props).length === 0 && <div className="opts-hint">{t('noParams')}</div>}
              {Object.entries(props).map(([name, spec]) => (
                <label key={name} className="tool-field">
                  <span className="tool-field-label">{name}{required.includes(name) ? ' *' : ''} <em>{spec.type || ''}</em></span>
                  {spec.type === 'boolean' ? (
                    <input type="checkbox" checked={!!(args[sel.name]?.[name])} onChange={(e) => setArg(sel.name, name, e.target.checked)} />
                  ) : (spec.type === 'object' || spec.type === 'array') ? (
                    <textarea rows={2} placeholder={spec.description || 'JSON'} value={args[sel.name]?.[name] || ''} onChange={(e) => setArg(sel.name, name, e.target.value)} />
                  ) : (
                    <input type={spec.type === 'number' || spec.type === 'integer' ? 'number' : 'text'} placeholder={spec.description || ''} value={args[sel.name]?.[name] || ''} onChange={(e) => setArg(sel.name, name, e.target.value)} />
                  )}
                </label>
              ))}
              <button className="run-tool" onClick={() => run(sel)} disabled={running === sel.name}>
                {running === sel.name ? t('runningState') : t('run')}
              </button>
              {result && <pre className={result.ok ? 'tool-result' : 'tool-result err'}>{String(result.text).slice(0, 4000)}</pre>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
