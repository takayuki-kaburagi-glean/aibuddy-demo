import React, { createContext, useContext, useState } from 'react';

const LANG_KEY = 'aibuddy.lang';

// UI chrome（ラベル）のみの軽量 i18n。本文（memory / エージェント応答）は原文表示。
const DICT = {
  ja: {
    tagline: 'Powered by Glean — MCP personal memory · A2A ルーティング · LLM Gateway',
    buddy: 'AI Buddy', registry: 'エージェントレジストリ', memoryTab: 'Personal Memory', modelsTab: 'LLM Gateway', toolsTab: 'Tools', historyTab: '履歴',
    connect: 'Glean に接続', connected: '接続済み',
    historyEmpty: 'まだ実行履歴はありません。AI Buddy で質問すると、ここに記録されます。',
    historyClear: '全削除', historyAgents: 'エージェント', historyOpen: '詳細', historyDelete: '削除', historyQuery: '質問',
    reload: '再取得', loading: '読み込み中…', testEnable: 'テスト＆有効化', testing: 'テスト中…', disable: '無効化',
    selected: '選択中', builderOk: '選択可', respondsOk: '実応答OK', emptyResp: '空応答', errorResp: 'エラー',
    memRawLen: '返却サイズ', memCategories: 'カテゴリ', memParsed: 'パース結果（AI Buddy が利用する構造）',
    memRaw: 'memory ツールの生返却（サンプル）', memProjects: '進行中プロジェクト', memThreads: '未処理スレッド',
    memTopics: '最近の話題', memSummaries: 'セッション要約', memPrefs: '仕事の進め方の好み', memCollab: 'コラボレーター',
    translateJa: '🌐 日本語に翻訳', showOriginal: '原文を表示', translating: '翻訳中…', translatedBadge: 'LLM Gateway で翻訳',
    disconnect: '切断', dept: '部署', model: 'モデル', send: '送信', thinking: '考え中…',
    greetingFallback: 'こんにちは。今日はどのようなご用件ですか？',
    suggestionsTitle: '先回り提案', routingTitle: 'ルーティング', permissionOk: '権限OK', permissionNg: '権限なし',
    rating: '評価', execRating: '実行成功率', platform: '基盤', canUse: '利用可能部署',
    memoryLoaded: 'あなたの業務コンテキストを Glean personal memory から取得しました',
    askPlaceholder: '例：営業だけど、新しい共同研究のNDAについて法務に確認したい', notConnected: 'Glean に未接続です。右上から接続してください。',
    projects: '進行中プロジェクト', threads: '未処理スレッド', nextActions: '次の一手',

    // Language toggle
    langLabel: 'EN',

    // BuddyChat
    modeBuddy: 'AI Buddy', modeChat: 'Chat',
    splashHello: 'こんにちは 👋',
    chatSplashSub: '社内ナレッジ全体を横断して回答します。何でも聞いてください。',
    buddySplashSub: '今日はどのようなご用件ですか？あなたの業務コンテキストをもとに、最適なエージェントにおつなぎします。',
    memBadge: 'memory 接続済み',
    chatAssistant: 'アシスタント', chatDefault: 'デフォルト',
    chatSaveHistory: '履歴に保存', chatDataSources: 'データソース',
    chatInclude: '含める', chatExclude: '除外', chatIncludePh: '例：gdrive, slack, jira', chatExcludePh: '例：gmail',
    chatSourcesHint: 'カンマ区切りのデータソースID（含める / 除外）',
    reasoningLabel: '🤔 思考',
    runningLabel: '実行中…',
    sourcesLabel: '出典',
    modelSelectTitle: 'LLM Gateway モデル', fmtTitle: '表示形式', fmtStandard: '標準', fmtHtml: 'HTML',
    askPlaceholderChat: '社内ナレッジに質問…',
    hintChat: 'Chat モード · Enter で送信',
    hintBuddyAskingAs: 'として質問中', hintPressEnter: 'Enter で送信',

    // RegistryView
    registrySub1: '各部署で乱立している Dify / Copilot Studio / Low-code / GitHub Actions / 内製のエージェント（モック）を、単一の A2A レジストリに集約します。',
    registrySub2: '下の検索から実在の Glean エージェントを追加でき、追加したものは実際に runs/wait で動作します。',
    registrySynthNote: '※ 評価 / 実行成功率は、デモ用の合成モックメタデータです（Glean の標準機能ではありません）。',
    gleanSearchTitle: '🔎 実在の Glean エージェントを検索して追加',
    gleanAddedCount: '件追加済み',
    gleanSearchPlaceholder: 'キーワードで検索（例：research / code / data / jira / planner ...）',
    searchBtn: '検索', searching: '検索中…',
    noAgentsFound: '該当するエージェントが見つかりませんでした。',
    added: '追加済み', addBtn: '＋ 追加',
    filterPlaceholder: '🔍 名前や説明で絞り込み',
    department: '部署', platformLabel: 'プラットフォーム', sortBy: '並び順', all: 'すべて',
    sortDepartment: '部署', sortName: '名前', sortRating: '評価', sortExec: '実行成功率', sortPlatform: 'プラットフォーム',
    sortAsc: '▲ 昇順', sortDesc: '▼ 降順', sortDirTitle: '昇順/降順',
    noAgentsMatch: '条件に一致するエージェントはありません。',

    // AgentCard
    inHouse: '内製', delete: '削除', companyWide: '全社',

    // MemoryView
    memPaneSub1: '接続中ユーザーの Glean Personal Graph を memory ツールで即時取得します。日本語は初回のみ翻訳してキャッシュします（毎回翻訳はしません）。',
    memPaneSub2: 'で MCP の生データを取得できます。',
    memTranslatingFirst: '日本語に翻訳中…（初回のみ。以降はキャッシュ）',
    memRawMcp: 'MCP 生データ', memToolLabel: 'ツール', memChars: '文字', memCached: '（キャッシュ）',

    // ModelsView
    modelsCountSuffix: 'モデル',
    modelsPaneSub1: 'Glean LLM Gateway が集約する OpenAI / Anthropic / 統合カタログの全ラインアップ。',
    modelsPaneSub2: 'はモデルを一度実際に呼び出し、応答すれば AI Buddy のオーケストレーターモデル候補になります。',
    modelsAggregated: 'エンドポイントから集約',
    noModels: '利用可能なモデルがありません。',

    // ToolsView
    toolsPaneSub: '接続中の Glean 環境が連携する サードパーティツール。カードにマウスを乗せると説明が表示され、クリックでテスト実行でき、AI Buddy も自動で呼び出します。',
    noThirdPartyTools: '利用可能なサードパーティツールがありません。',
    close: '閉じる', dummyToolNote: '※ これはデモ専用のダミーツールです。実行しても外部サービスには接続しません。',
    noParams: '入力パラメータはありません', run: '▶ 実行', runningState: '実行中…',
    demoMockResp: '（デモ用モック応答）', demoCalled: 'を呼び出しました。',
    demoNoConnect: 'このデモは実際には',
    demoNoConnect2: 'に接続しません。',
    demoRequestInput: 'リクエスト入力：',

    // HistoryView
    historyPaneSub: 'AI Buddy の実行履歴。行をクリックすると詳細（ルーティングと回答）を表示します。個別または全件の削除もできます。',
    noAnswerText: '（回答テキストなし）',

    // SettingsMenu
    settingsTitle: '設定', settingsEmailLabel: 'メール送信先', settingsEmailPh: 'you@example.com',
    settingsHint: 'すべてのメール送信はこの宛先にリダイレクトされます。空にすると上書きを無効化します。',
    save: '保存', saving: '保存中…', savedOk: '✓ 保存しました',

    // HtmlPreview
    htmlPreviewLabel: '🖥 HTML プレビュー', previewBtn: 'プレビュー', codeBtn: 'コード', openNewTab: '新しいタブで開く',

    // App banners
    bannerConnInfo: '接続情報の取得に失敗しました', bannerRegistry: 'レジストリの取得に失敗しました',
    bannerOauthError: 'OAuth エラー', bannerUnknown: '不明',
    bannerAgentNotRegistered: 'Glean エージェントが登録されていません（バックエンドのシードを確認してください）',
    bannerConnStart: '接続の開始に失敗しました', bannerDisconnectFail: '切断に失敗しました',
    bannerModelChangeFail: 'モデルの変更に失敗しました', bannerMemoryFail: 'Personal Memory の取得に失敗しました',
    brandHomeTitle: 'ホームに戻る（会話をリセット）', connectedToGlean: 'Glean に接続済み',
  },
  en: {
    tagline: 'Powered by Glean — MCP personal memory · A2A routing · LLM Gateway',
    buddy: 'AI Buddy', registry: 'Agent Registry', memoryTab: 'Personal Memory', modelsTab: 'LLM Gateway', toolsTab: 'Tools', historyTab: 'History',
    connect: 'Connect Glean', connected: 'Connected',
    historyEmpty: 'No runs yet. Ask AI Buddy and your runs will appear here.',
    historyClear: 'Clear all', historyAgents: 'agents', historyOpen: 'Details', historyDelete: 'Delete', historyQuery: 'Query',
    reload: 'Reload', loading: 'Loading…', testEnable: 'Test & enable', testing: 'Testing…', disable: 'Disable',
    selected: 'selected', builderOk: 'selectable', respondsOk: 'Responds', emptyResp: 'Empty', errorResp: 'Error',
    memRawLen: 'Payload size', memCategories: 'Categories', memParsed: 'Parsed (what AI Buddy uses)',
    memRaw: 'Raw memory tool output (sample)', memProjects: 'Active projects', memThreads: 'Open threads',
    memTopics: 'Recent topics', memSummaries: 'Session summaries', memPrefs: 'Working preferences', memCollab: 'Collaborators',
    translateJa: '🌐 Translate', showOriginal: 'Show original', translating: 'Translating…', translatedBadge: 'Translated via LLM Gateway',
    disconnect: 'Disconnect', dept: 'Department', model: 'Model', send: 'Send', thinking: 'Thinking…',
    greetingFallback: 'Hello. How can I help you today?',
    suggestionsTitle: 'Proactive suggestions', routingTitle: 'Routing', permissionOk: 'Allowed', permissionNg: 'Denied',
    rating: 'Rating', execRating: 'Exec success', platform: 'Platform', canUse: 'Allowed depts',
    memoryLoaded: 'Loaded your work context from Glean personal memory',
    askPlaceholder: 'e.g. I am in Sales — I need Legal to check an NDA for a new collaboration', notConnected: 'Not connected to Glean. Connect from the top right.',
    projects: 'Active projects', threads: 'Open threads', nextActions: 'Next actions',

    // Language toggle
    langLabel: 'JP',

    // BuddyChat
    modeBuddy: 'AI Buddy', modeChat: 'Chat',
    splashHello: 'Hello 👋',
    chatSplashSub: 'I search across your company knowledge to answer. Ask me anything.',
    buddySplashSub: 'How can I help you today? Based on your work context, I will connect you to the best agent for the job.',
    memBadge: 'memory connected',
    chatAssistant: 'Assistant', chatDefault: 'Default',
    chatSaveHistory: 'Save to history', chatDataSources: 'Data sources',
    chatInclude: 'Include', chatExclude: 'Exclude', chatIncludePh: 'e.g. gdrive, slack, jira', chatExcludePh: 'e.g. gmail',
    chatSourcesHint: 'Comma-separated data source IDs (inclusions / exclusions)',
    reasoningLabel: '🤔 Thinking',
    runningLabel: 'Running…',
    sourcesLabel: 'Sources',
    modelSelectTitle: 'LLM Gateway model', fmtTitle: 'Display format', fmtStandard: 'Standard', fmtHtml: 'HTML',
    askPlaceholderChat: 'Ask your company knowledge…',
    hintChat: 'Chat mode · Press Enter to send',
    hintBuddyAskingAs: 'Asking as', hintPressEnter: 'Press Enter to send',

    // RegistryView
    registrySub1: 'Consolidates agents (mocks) that have proliferated per department across Dify / Copilot Studio / Low-code / GitHub Actions / In-house into a single A2A registry.',
    registrySub2: 'Real Glean agents can be added from the search below, and added ones actually run via runs/wait.',
    registrySynthNote: '* rating / execution rating are synthetic demo-only mock metadata (not standard Glean features).',
    gleanSearchTitle: '🔎 Search and add real Glean agents',
    gleanAddedCount: 'added',
    gleanSearchPlaceholder: 'Search by keyword (e.g. research / code / data / jira / planner ...)',
    searchBtn: 'Search', searching: 'Searching…',
    noAgentsFound: 'No matching agents found.',
    added: 'Added', addBtn: '＋ Add',
    filterPlaceholder: '🔍 Filter by name or description',
    department: 'Department', platformLabel: 'Platform', sortBy: 'Sort by', all: 'All',
    sortDepartment: 'Department', sortName: 'Name', sortRating: 'Rating', sortExec: 'Execution success rate', sortPlatform: 'Platform',
    sortAsc: '▲ Ascending', sortDesc: '▼ Descending', sortDirTitle: 'Ascending/Descending',
    noAgentsMatch: 'No agents match the criteria.',

    // AgentCard
    inHouse: 'In-house', delete: 'Delete', companyWide: 'Company-wide',

    // MemoryView
    memPaneSub1: "Live-fetches the connected user's Glean Personal Graph via the memory tool. Japanese is translated and cached only on the first call (not translated every time).",
    memPaneSub2: 'to fetch the raw data from MCP.',
    memTranslatingFirst: 'Translating to Japanese… (first time only; cached afterward)',
    memRawMcp: 'Raw MCP data', memToolLabel: 'tool', memChars: 'chars', memCached: ' (cached)',

    // ModelsView
    modelsCountSuffix: 'models',
    modelsPaneSub1: 'The full lineup of OpenAI / Anthropic / unified catalog aggregated by the Glean LLM Gateway.',
    modelsPaneSub2: 'calls a model once for real, and if it responds it becomes an AI Buddy orchestrator model candidate.',
    modelsAggregated: 'endpoints',
    noModels: 'No models available.',

    // ToolsView
    toolsPaneSub: 'Third-party tools that the connected Glean environment integrates with. Hover a card for a description, click to test-run it, and AI Buddy calls them automatically too.',
    noThirdPartyTools: 'No third-party tools available.',
    close: 'Close', dummyToolNote: '* This is a demo-only dummy tool. Running it does not connect to any external service.',
    noParams: 'No input parameters', run: '▶ Run', runningState: 'Running…',
    demoMockResp: '(Demo mock response)', demoCalled: 'Called',
    demoNoConnect: 'This demo does not actually connect to',
    demoNoConnect2: '.',
    demoRequestInput: 'Request input:',

    // HistoryView
    historyPaneSub: 'AI Buddy run history. Click a row to view details (routing and answer); you can also delete individual or all entries.',
    noAnswerText: '(No answer text)',

    // SettingsMenu
    settingsTitle: 'Settings', settingsEmailLabel: 'Email recipient', settingsEmailPh: 'you@example.com',
    settingsHint: 'All email actions are redirected to this address. Leave empty to disable the override.',
    save: 'Save', saving: 'Saving…', savedOk: '✓ Saved',

    // HtmlPreview
    htmlPreviewLabel: '🖥 HTML preview', previewBtn: 'Preview', codeBtn: 'Code', openNewTab: 'Open in new tab',

    // App banners
    bannerConnInfo: 'Failed to fetch connection info', bannerRegistry: 'Failed to fetch registry',
    bannerOauthError: 'OAuth error', bannerUnknown: 'Unknown',
    bannerAgentNotRegistered: 'Glean agent is not registered (check the backend seed)',
    bannerConnStart: 'Failed to start connection', bannerDisconnectFail: 'Failed to disconnect',
    bannerModelChangeFail: 'Failed to change model', bannerMemoryFail: 'Failed to fetch personal memory',
    brandHomeTitle: 'Back to home (reset conversation)', connectedToGlean: 'Connected to Glean',
  },
};

const I18nCtx = createContext(null);
export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem(LANG_KEY) || 'en'; } catch { return 'en'; }
  });
  const setLang = (l) => {
    setLangState(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* noop */ }
  };
  const t = (k) => DICT[lang][k] ?? DICT.en[k] ?? k;
  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>;
}
export const useI18n = () => useContext(I18nCtx);
