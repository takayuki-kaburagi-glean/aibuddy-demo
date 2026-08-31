// Starts the department-specific domain agents (mock A2A servers) all together.
//   node examples/agents/domain.mjs
// Each agent serves an Agent Card + message/send + message/stream at http://localhost:560X.
// Responses are fixed demo templates (no real LLM needed). provider/platform are deliberately varied.
import { createA2AAgent } from './lib.mjs';
import { DOMAIN_AGENTS } from './domainSpecs.mjs';

// Fixed per-department responses (echo the question while replying like a plausible domain expert agent)
const RESPONDERS = {
  legal: (q) =>
`[Legal Agent / Microsoft Copilot Studio platform]
Responding to your inquiry "${q}".
- We recommend using our standard NDA template (v3.2). If the counterparty proposes edits, a legal review is required.
- Ownership of IP arising from joint research must be aligned with the Research Division before the contract is signed.
- The final decision on individual cases is confirmed only after review by the assigned attorney.
(Note: this is a demo mock response)`,
  hr: (q) =>
`[HR Agent / Low-code platform]
Responding to your question "${q}".
- Annual paid leave is granted six months after joining, and you can hold up to 40 days including carryover for the current year.
- The evaluation cycle is semi-annual (April/October). Goals are finalized in a 1-on-1 with your manager.
- For details, please refer to the work rules on the HR portal.
(Note: this is a demo mock response)`,
  research: (q) =>
`[Research Agent / Dify platform]
Responding to your inquiry "${q}".
- I can search across internal and external literature and patents, and present summaries with citations.
- For assay protocols, tell me the target, endpoint, and control conditions, and I'll propose a design.
- Because sensitive information is involved, responses are limited to what the Research Division has approved.
(Note: this is a demo mock response)`,
  sales: (q) =>
`[Sales Agent / Glean Agent platform]
Responding to your question "${q}".
- I can look up deal status and results in your territory via the SFA integration.
- I'll organize and present product indications, dosage, and available information materials (for MRs).
- Medical information is provided within the scope of the proper-use guidelines.
(Note: this is a demo mock response)`,
  it: (q) =>
`[IT Helpdesk Agent / Copilot Studio platform]
Responding to your request "${q}".
- Password resets can be done immediately via self-service on the internal portal.
- For VPN/device/software issues, please file a ticket with the symptom and device ID.
- Folder/system access permissions are granted after manager approval following the request flow.
(Note: this is a demo mock response)`,
  cicd: (q) =>
`[CI/CD & GitHub Agent / GitHub Actions platform]
Responding to your request "${q}".
- I'll summarize the diff of the target PR and organize review criteria (test coverage, breaking changes, naming).
- For failed Actions jobs, I'll extract the failing step and the relevant log lines and propose likely causes.
- I can check whether pre-merge checks (required statuses, review count) are satisfied.
(Note: this is a demo mock response)`,
  qa: (q) =>
`[Test Automation & QA Agent / Dify platform]
Responding to your request "${q}".
- I'll propose regression tests and pass/fail criteria for the target agent/workflow.
- I'll review evaluation-query coverage (happy path, error path, boundaries).
- I'll organize and share recent validation results and reproduction steps.
(Note: this is a demo mock response)`,
  reliability: (q) =>
`[Agent Reliability (SRE) Agent / in-house platform]
Responding to your request "${q}".
- I'll isolate the error type, timestamp, and dependencies of the failed run.
- For scheduled trigger failures, I'll present the recent execution history and whether a re-run is possible.
- I'll propose the impact scope and interim measures (retry/disable).
(Note: this is a demo mock response)`,
  integrations: (q) =>
`[Integrations Agent / Low-code platform]
Responding to your request "${q}".
- I'll check the state of Coupler.io dataflows / datasets and isolate empty or error cases.
- I'll guide you through configuring task creation and syncing to ClickUp and similar tools.
- I'll present steps to verify Webhook / API connectivity and credentials.
(Note: this is a demo mock response)`,
  data: (q) =>
`[Data/BI Agent / in-house platform]
Responding to your request "${q}".
- I'll organize the reconciliation points between Looker metric definitions and actual values.
- I'll check the consistency of structured data (missing values, duplicates, types).
- I'll provide the SQL / metric templates you need.
(Note: this is a demo mock response)`,
  platform: (q) =>
`[Glean Platform/MCP Agent / in-house platform]
Responding to your request "${q}".
- I'll search across the Glean Product Docs and present the relevant sections with citations.
- I can check the list of MCP tools and their input/output schemas.
- I'll organize the current state of collection/permission settings and the testing criteria.
(Note: this is a demo mock response)`,
  secops: (q) =>
`[Security Operations (SecOps) Agent / Copilot Studio platform]
Responding to your request "${q}".
- I perform production access permission changes, grants, and revocations (Security department permission required).
- I'll guide you through the initial incident response and evidence collection.
(Note: this is a demo mock response)`,
  release_approval: (q) =>
`[Production Release Approval Agent / in-house platform]
Responding to your request "${q}".
- I decide on gate approvals for production deployments and change freezes (SRE lead/Executive permission required).
(Note: this is a demo mock response)`,
  finance: (q) =>
`[Finance Agent / Copilot Studio platform]
Responding to your request "${q}".
- I look up departmental budgets, execution status, and allocation of SaaS/cloud costs (Finance and Executive only).
(Note: this is a demo mock response)`,
  exec: (q) =>
`[Executive Dashboard Agent / in-house platform]
Responding to your request "${q}".
- I look up company-wide KPIs and executive reports (Executive only).
(Note: this is a demo mock response)`,
  comp_all: (q) =>
`[Company-wide Compensation & Bonus Policy Agent / in-house platform] * Company-wide baseline
Regarding your question "${q}", here is the company-wide policy.
- Bonuses are reviewed semi-annually (April/October) and paid in June/December.
- Base amount = base salary × company performance coefficient (recently 0.9–1.1) × individual evaluation coefficient.
- Compensation bands are revised once a year.
(Note: this is a demo mock response)`,
  comp_sales: (q) =>
`[Sales Incentive Agent / in-house platform] * Differences for sales roles
- Sales is commission-based, tied to quarterly revenue/pipeline attainment (standard at 100% attainment, accelerated rate above).
- SPIFFs (spot incentives) are granted on an ad-hoc basis.
(Note: this is a demo mock response)`,
  comp_eng: (q) =>
`[Engineer Compensation & Evaluation Agent / in-house platform] * Differences for engineering roles
- Bands by grade (L3–L7). Bonuses are determined by OKR attainment × technical evaluation.
- Eligible for an annual stock refresh (RSU).
(Note: this is a demo mock response)`,
  comp_mgr: (q) =>
`[Manager & Executive Compensation Agent / in-house platform] * Differences for managers/executives
- Performance-linked bonus coefficients are larger (tied to attainment of organizational goals).
- Eligible for LTI (long-term incentives).
(Note: this is a demo mock response)`,
  hr_policy_all: (q) =>
`[Company-wide HR Policy & Work Rules Agent / Low-code platform] * Company-wide baseline
Regarding your question "${q}", here are the company-wide rules.
- Annual paid leave is granted six months after joining; up to 40 days held including carryover.
- Flextime (core hours 10:00-15:00). Evaluations run on a semi-annual cycle.
(Note: this is a demo mock response)`,
  hr_policy_role: (q) =>
`[Role-based Work Arrangements Agent / Low-code platform] * Differences by role/category
- Managers/supervisors (section manager and above) are exempt from overtime pay and on a discretionary work system.
- On-call staff (SRE etc.) receive an on-call allowance.
- Reduced hours and flextime exceptions apply depending on category.
(Note: this is a demo mock response)`,
  expense_all: (q) =>
`[Company-wide Expense & Reimbursement Policy Agent / in-house platform] * Company-wide baseline
Regarding your question "${q}", here are the company-wide rules.
- Items over 10,000 yen require pre-approval; over 50,000 yen require department-head approval. Cutoff is month-end, submit by the 10th of the next month.
- Receipts (invoice requirements) are mandatory. IC-card history is recommended for transportation costs.
(Note: this is a demo mock response)`,
  expense_sales: (q) =>
`[Sales Expense Agent / in-house platform] * Differences for sales roles
- Entertainment/hospitality requires pre-application plus a record of attendees/purpose (per-person limit applies).
- Travel expenses for customer visits use the standard allowance, expandable for distant travel with manager approval.
(Note: this is a demo mock response)`,
  expense_eng: (q) =>
`[Engineer Expense Agent / in-house platform] * Differences for engineering roles
- Development equipment and peripherals can be purchased at your discretion within the annual support budget.
- Cloud/SaaS usage comes from the project budget, with a support budget for learning, books, and conference attendance.
(Note: this is a demo mock response)`,
  lib_action_items: (q) =>
`[Action Item Extraction / Glean]
Collected your open action items (where you are the owner) from each connector.
- High-confidence: review PR #80/#81, investigate the Agent SC-2 failure
- Ambiguous: initial triage of the scheduled trigger failure (related but owner undetermined)
(Note: this is a demo mock response)`,
  lib_daily_brief: (q) =>
`[Daily Prep / Glean]
Here is today's focus.
- Focus: release reliability (investigating failed runs) and clearing PR reviews
- Meeting prep: 11:00 platform sync (review of previous action items)
- Suggested focus block: 14:00-16:00
(Note: this is a demo mock response)`,
  lib_accomplishments: (q) =>
`[Weekly Accomplishments / Glean]
Key contributions over the past week (by project):
- GitHub automation: workflow cleanup and PR reviews
- Agent validation: added regression tests, identified the SC-2 root cause
- Data/BI: verified Looker metrics
(Note: this is a demo mock response)`,
  lib_eng_onboarding: (q) =>
`[Engineering Onboarding / Glean]
Regarding your request "${q}", here are the key points of the target project.
- Links to key docs, READMEs, and design notes
- Owners/reviewers and contacts
- Summary of dependencies and local startup steps
(Note: this is a demo mock response)`,
  lib_deep_research: (q) =>
`[Deep Research / Glean]
Regarding "${q}", I researched across multiple internal and external sources.
- Key points and evidence (with citations)
- Related internal documents / past cases
- Unconfirmed points and next research steps
(Note: this is a demo mock response)`,
  lib_pr_review: (q) =>
`[PR Review / Glean]
I reviewed the diff for your request "${q}".
- Summary of key changes and review criteria (test coverage, breaking changes, naming, error handling)
- Risk callouts: missing exception handling, impact on backward compatibility
- Improvement suggestions and a pre-merge checklist
(Note: this is a demo mock response)`,
  lib_eng_standup: (q) =>
`[Engineering Standup / Glean]
Here is your standup draft for today.
- Yesterday: reviewed PR #80/#81, investigated the Agent SC-2 root cause
- Today: fix the scheduled trigger failure, add regression tests
- Blockers: waiting on some cloud permissions
(Note: this is a demo mock response)`,
  lib_spec_to_pr: (q) =>
`[Spec-to-PR / Glean]
From your request "${q}", I created an implementation approach and PR draft.
- Change scope and design approach (affected modules, interfaces)
- Implementation steps and testing criteria
- PR draft (title/description/checklist)
(Note: this is a demo mock response)`,
  lib_resolve_jira: (q) =>
`[Jira Ticket Resolution / Glean]
I investigated the ticket for your request "${q}".
- Summary of the issue and reproduction conditions, related past tickets/documents
- Proposed resolution (candidate causes and response approach)
- Next actions and an assignment proposal
(Note: this is a demo mock response)`,
  ci_legacy: (q) =>
`[Jenkins CI/CD Agent (Legacy) / Jenkins platform]
Responding to your request "${q}".
- I can run builds/deploys on the legacy Jenkins jobs, but we are migrating to the GitHub Actions version.
- The execution success rate has been lower recently (unstable nodes, old plugins), so re-runs may be needed.
(Note: this is a demo mock response)`,
  deploy_beta: (q) =>
`[Next-gen Deploy Agent (Beta) / in-house platform]
Responding to your request "${q}".
- I automate everything from build to production rollout and canary releases.
- Being newly introduced, it is highly rated but has little execution track record and an immature success rate (Beta). For critical releases, a proven platform is recommended.
(Note: this is a demo mock response)`,
  lib_reminders: (q) =>
`[Intelligent Reminders / Glean]
I detected important deadlines and commitments from context.
- By end of today: reply to the review of PR #81
- Tomorrow: confirm the deploy of the scheduled trigger fix
- This week: submit the weekly report
(Note: this is a demo mock response)`,
};

const servers = [];
for (const spec of DOMAIN_AGENTS) {
  const respond = RESPONDERS[spec.key] || ((q) => `Received "${q}" (${spec.name}, mock).`);
  const { server } = createA2AAgent({
    port: spec.port,
    name: spec.name,
    description: spec.description,
    organization: spec.provider.organization,
    orgUrl: spec.provider.url,
    skills: spec.skills,
    respond,
  });
  server.listen(spec.port, () => {
    console.log(`▶ ${spec.name.padEnd(24)} http://localhost:${spec.port}/.well-known/agent-card.json  [${spec.platform}]`);
  });
  servers.push(server);
}

console.log(`\n✅ Started ${servers.length} domain agents (press Ctrl+C to stop).`);

process.on('SIGINT', () => {
  console.log('\nStopping…');
  for (const s of servers) s.close();
  process.exit(0);
});
