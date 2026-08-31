// Japanese translations for the seeded mock agents, keyed by their English name.
// Used by AgentCard to localize the registry card title / description / skill tags
// when the UI language is Japanese. Agents not in this map (e.g. real Glean agents
// added at runtime) fall back to their original English fields.

const AGENT_JA = {
  'Legal Agent': {
    name: '法務エージェント',
    description: '契約・NDA・コンプライアンス・規制対応に関する社内相談に回答。営業や研究からの契約確認も受け付ける。',
    skills: { 'Contract Review': '契約レビュー', 'Compliance Consultation': 'コンプライアンス相談' },
  },
  'HR Agent': {
    name: '人事エージェント',
    description: '就業規則・休暇・評価制度・福利厚生など全社員向けの人事Q&A。',
    skills: { 'HR Policy Q&A': '人事制度Q&A', 'Onboarding Support': 'オンボーディング支援' },
  },
  'Research Agent': {
    name: '研究エージェント',
    description: '創薬研究・論文・実験プロトコル・化合物データに関する専門相談（機微情報のため利用部署を限定）。',
    skills: { 'Literature Review': '文献調査', 'Experimental Protocols': '実験プロトコル' },
  },
  'Sales Agent': {
    name: '営業エージェント',
    description: 'MR活動・医薬品情報提供・案件管理・売上分析に関する営業支援。',
    skills: { 'Product Information Lookup': '製品情報照会', 'Deal & Revenue Analysis': '案件・売上分析' },
  },
  'IT Helpdesk Agent': {
    name: 'ITヘルプデスクエージェント',
    description: 'アカウント・端末・社内システム・アクセス権限などITサポート全般（全社員向け）。',
    skills: { 'IT Support': 'ITサポート', 'Access Permission Requests': 'アクセス権限申請' },
  },
  'CI/CD & GitHub Agent': {
    name: 'CI/CD・GitHub エージェント',
    description: 'PR レビュー・ビルド/デプロイ・GitHub Actions ワークフローの失敗調査を支援。PR #80/#81/#82 のようなドラフトのレビュー依頼にも対応。',
    skills: { 'PR Review': 'PR レビュー', 'Workflow Failure Investigation': 'ワークフロー失敗調査' },
  },
  'Test Automation & QA Agent': {
    name: 'テスト自動化・QA エージェント',
    description: 'エージェント/ワークフローの検証・回帰テスト・評価クエリの作成を支援。Agent や workflow の validation に対応。',
    skills: { 'Agent Validation': 'エージェント検証', 'Evaluation Query Design': '評価クエリ設計' },
  },
  'Agent Reliability (SRE) Agent': {
    name: 'エージェント信頼性(SRE) エージェント',
    description: '失敗した run / スケジュールトリガー障害 / エージェント稼働の調査と復旧を支援。Agent SC-2 のような失敗の原因調査に対応。',
    skills: { 'Failed Run Investigation': '失敗run調査', 'Trigger Health': 'トリガー健全性' },
  },
  'Integrations Agent': {
    name: 'インテグレーション エージェント',
    description: 'Coupler.io / ClickUp / Webhook などの外部連携設定とデータフロー調査を支援。integration・ticket のテストにも対応。',
    skills: { 'Data Flow Investigation': 'データフロー調査', 'Ticket Integration': 'チケット連携' },
  },
  'Data/BI Agent': {
    name: 'データ/BI エージェント',
    description: 'Looker のメトリクス検証・構造化データの整合性確認・SQL/指標の相談を支援。Looker metric verification に対応。',
    skills: { 'Metric Verification': 'メトリクス検証', 'SQL/Data Consistency': 'SQL/データ整合' },
  },
  'Jenkins CI/CD Agent (Legacy)': {
    name: 'Jenkins CI/CD エージェント（旧）',
    description: 'レガシー Jenkins パイプラインでビルド/デプロイ・PR チェックを実行。CI/CD・GitHub エージェントと機能が重複するが、GitHub Actions 版へ移行中で実行成功率が低め。',
    skills: { 'Pipeline Execution': 'パイプライン実行', 'Legacy Deploy': 'レガシーデプロイ' },
  },
  'Next-gen Deploy Agent (Beta)': {
    name: '次世代デプロイ エージェント（Beta）',
    description: '新しいデプロイ基盤でビルド〜本番反映を自動化。CI/CD・GitHub エージェントと機能が重複。評価は高いが新設で実行実績が少なく成功率は未成熟（Beta）。',
    skills: { 'Automated Deploy': '自動デプロイ', 'Canary Release': 'カナリアリリース' },
  },
  'Security Operations (SecOps) Agent': {
    name: 'セキュリティ運用(SecOps) エージェント',
    description: '権限監査・インシデント対応・本番アクセス制御の変更を実施。※権限テストに関わる人でも、実際の変更はセキュリティ部のみ利用可。',
    skills: { 'Access Control Change': 'アクセス制御変更', 'Permission Audit': '権限監査' },
  },
  'Production Release Approval Agent': {
    name: '本番リリース承認 エージェント',
    description: '本番デプロイの最終承認・変更凍結の判断を実施。※リリース作業に関わる人でも、承認権限は SRE リード/経営のみ。',
    skills: { 'Production Release Approval': '本番リリース承認', 'Change Freeze Decision': '変更凍結判断' },
  },
  'Finance Agent': {
    name: '財務(Finance) エージェント',
    description: '予算・請求・コスト配賦の照会。※クラウド/ツールのコストに関わる人でも、財務データは財務・経営のみ利用可。',
    skills: { 'Budget Inquiry': '予算照会', 'Billing/Cost Allocation': '請求/コスト配賦' },
  },
  'Executive Dashboard Agent': {
    name: '経営ダッシュボード エージェント',
    description: '全社 KPI・役員向けレポートの照会。※経営層のみ利用可。',
    skills: { 'Company-wide KPIs': '全社KPI', 'Executive Reports': '役員レポート' },
  },
  'Company-wide Compensation & Bonus Policy Agent': {
    name: '全社報酬・ボーナスポリシー エージェント',
    description: '会社全体の報酬体系・ボーナス支給の基本方針（査定期間・支給時期・共通係数）。役職共通のベースライン。',
    skills: { 'Bonus Basic Policy': 'ボーナス基本方針', 'Compensation Bands': '報酬レンジ' },
  },
  'Sales Incentive Agent': {
    name: '営業インセンティブ エージェント',
    description: '営業職の報酬差分（コミッション・SPIFF・達成率連動）。ボーナスは売上/パイプライン達成に連動。',
    skills: { 'Commission/SPIFF': 'コミッション/SPIFF' },
  },
  'Engineer Compensation & Evaluation Agent': {
    name: 'エンジニア報酬・評価 エージェント',
    description: 'エンジニア職の報酬差分（グレード/等級・株式リフレッシュ・技術評価）。ボーナスは OKR と評価連動。',
    skills: { 'Grade/RSU': 'グレード/RSU' },
  },
  'Manager & Executive Compensation Agent': {
    name: '管理職・幹部報酬 エージェント',
    description: '管理職・幹部の報酬差分（業績連動ボーナス係数・組織目標達成・LTI）。',
    skills: { 'Performance-linked/LTI': '業績連動/LTI' },
  },
  'Company-wide HR Policy & Work Rules Agent': {
    name: '全社人事規程・就業規則 エージェント',
    description: '全社共通の就業規則・休暇・勤務制度・評価サイクルの最新規程。役職共通のベースライン。',
    skills: { 'Work Rules': '就業規則' },
  },
  'Role-based Work Arrangements Agent': {
    name: '役職別勤務制度 エージェント',
    description: '役職・雇用区分別の勤務制度差分（管理監督者の時間外扱い・裁量労働/フレックス・オンコール手当・時短）。',
    skills: { 'Role-based Differences': '役職別差分' },
  },
  'Company-wide Expense & Reimbursement Policy Agent': {
    name: '全社経費・精算ポリシー エージェント',
    description: '全社共通の経費精算ルール（上限・承認フロー・締め日・領収書要件）。役職共通のベースライン。',
    skills: { 'Reimbursement Rules': '精算ルール' },
  },
  'Sales Expense Agent': {
    name: '営業経費 エージェント',
    description: '営業職の経費差分（交際費・接待・出張費の上限や事前承認、顧客訪問の扱い）。',
    skills: { 'Entertainment/Travel': '交際費/出張' },
  },
  'Engineer Expense Agent': {
    name: 'エンジニア経費 エージェント',
    description: 'エンジニア職の経費差分（機材・クラウド利用・学習/書籍・カンファレンス参加の支援枠）。',
    skills: { 'Equipment/Learning Support': '機材/学習支援' },
  },
};

/** Localize an agent's display fields for the given language. */
export function localizeAgent(agent, lang) {
  if (lang !== 'ja') return { name: agent.name, description: agent.description, skillName: (s) => s };
  const tr = AGENT_JA[agent.name];
  if (!tr) return { name: agent.name, description: agent.description, skillName: (s) => s };
  return {
    name: tr.name || agent.name,
    description: tr.description || agent.description,
    skillName: (s) => (tr.skills && tr.skills[s]) || s,
  };
}
