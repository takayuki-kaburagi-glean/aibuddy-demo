# Default Agents

The registry is seeded at startup from `examples/agents/domainSpecs.mjs` (25 mock A2A
agents) plus the real **Glean Assistant** entry. Each mock agent runs as an A2A server on
`localhost:56xx`. `rating` / `exec success` are demo-only synthetic metadata (not a Glean
feature). `permission` is the list of departments allowed to use the agent (`Company-wide`
= everyone); AI Buddy gates cross-department routing on it.

| # | Agent | Port | Dept | Platform | Permission | ★ | Exec |
|---|-------|------|------|----------|------------|---|------|
| 1 | Legal Agent | 5601 | Legal | Copilot Studio | Legal, Sales, Research, Executive | 4.7 | 94% |
| 2 | HR Agent | 5602 | HR | Low-code | Company-wide | 4.5 | 97% |
| 3 | Research Agent | 5603 | Research | Dify | Research, Legal | 4.8 | 91% |
| 4 | Sales Agent | 5604 | Sales | In-house | Sales, Executive | 4.6 | 89% |
| 5 | IT Helpdesk Agent | 5605 | IT | Copilot Studio | Company-wide | 4.4 | 96% |
| 6 | CI/CD & GitHub Agent | 5606 | Engineering | GitHub Actions | Engineering, QA, Platform, Company-wide | 4.8 | 95% |
| 7 | Test Automation & QA Agent | 5607 | QA | Dify | Engineering, QA | 4.7 | 92% |
| 8 | Agent Reliability (SRE) Agent | 5608 | SRE | In-house | Engineering, SRE, QA | 4.6 | 90% |
| 9 | Integrations Agent | 5609 | Engineering | Low-code | Engineering, QA, Data, Company-wide | 4.5 | 93% |
| 10 | Data/BI Agent | 5610 | Data | In-house | Engineering, Data, Company-wide | 4.7 | 91% |
| 11 | Jenkins CI/CD Agent (Legacy) | 5611 | Engineering | Jenkins | Engineering, QA, Platform, Company-wide | 3.8 | 63% |
| 12 | Next-gen Deploy Agent (Beta) | 5625 | Engineering | In-house | Engineering, SRE | 4.9 | 58% |
| 13 | Security Operations (SecOps) Agent | 5612 | Security | Copilot Studio | Security | 4.6 | 93% |
| 14 | Production Release Approval Agent | 5613 | SRE | In-house | SRE, Executive | 4.5 | 96% |
| 15 | Finance Agent | 5614 | Finance | Copilot Studio | Finance, Executive | 4.4 | 96% |
| 16 | Executive Dashboard Agent | 5615 | Executive | In-house | Executive | 4.5 | 97% |
| 17 | Company-wide Compensation & Bonus Policy Agent | 5616 | HR | In-house | Company-wide | 4.7 | 96% |
| 18 | Sales Incentive Agent | 5617 | Sales | In-house | Company-wide | 4.6 | 93% |
| 19 | Engineer Compensation & Evaluation Agent | 5618 | Engineering | In-house | Company-wide | 4.7 | 94% |
| 20 | Manager & Executive Compensation Agent | 5619 | Executive | In-house | Company-wide | 4.5 | 95% |
| 21 | Company-wide HR Policy & Work Rules Agent | 5620 | HR | Copilot Studio | Company-wide | 4.6 | 97% |
| 22 | Role-based Work Arrangements Agent | 5621 | HR | Dify | Company-wide | 4.5 | 94% |
| 23 | Company-wide Expense & Reimbursement Policy Agent | 5622 | Accounting | In-house | Company-wide | 4.6 | 96% |
| 24 | Sales Expense Agent | 5623 | Sales | In-house | Company-wide | 4.5 | 93% |
| 25 | Engineer Expense Agent | 5624 | Engineering | In-house | Company-wide | 4.6 | 95% |

---

## Core department agents (the classic 5)

**1. Legal Agent** — `Legal · Copilot Studio · ★4.7 / 94%`
Answers internal inquiries about contracts, NDAs, compliance, and regulatory matters. Also accepts contract reviews from Sales and Research.

**2. HR Agent** — `HR · Low-code · ★4.5 / 97%`
HR Q&A for all employees, covering work rules, leave, evaluation systems, benefits, and more.

**3. Research Agent** — `Research · Dify · ★4.8 / 91%`
Expert consultation on drug discovery research, papers, experimental protocols, and compound data (access limited to specific departments due to sensitive information).

**4. Sales Agent** — `Sales · In-house · ★4.6 / 89%`
Sales support for MR activities, drug information provision, deal management, and revenue analysis.

**5. IT Helpdesk Agent** — `IT · Copilot Studio · ★4.4 / 96%`
General IT support for accounts, devices, internal systems, access permissions, and more (for all employees).

## Engineering / QA / platform agents (matched to the Personal Memory persona)

**6. CI/CD & GitHub Agent** — `Engineering · GitHub Actions · ★4.8 / 95%`
Supports PR reviews, build/deploy, and investigation of GitHub Actions workflow failures. Also handles review requests for drafts like PR #80/#81/#82.

**7. Test Automation & QA Agent** — `QA · Dify · ★4.7 / 92%`
Supports validation of agents/workflows, regression testing, and authoring evaluation queries.

**8. Agent Reliability (SRE) Agent** — `SRE · In-house · ★4.6 / 90%`
Supports investigation and recovery of failed runs / scheduled trigger failures / agent uptime. Handles root-cause investigation of failures like Agent SC-2.

**9. Integrations Agent** — `Engineering · Low-code · ★4.5 / 93%`
Supports configuring external integrations such as Coupler.io / ClickUp / Webhooks and investigating data flows. Also handles integration and ticket testing.

**10. Data/BI Agent** — `Data · In-house · ★4.7 / 91%`
Supports validating Looker metrics, checking the consistency of structured data, and consulting on SQL/metrics. Handles Looker metric verification.

## Competing agents (same job — routing chosen by reliability signals)

These overlap in capability with the CI/CD & GitHub Agent so the demo can show AI Buddy picking by **exec success rate**, not just rating.

**11. Jenkins CI/CD Agent (Legacy)** — `Engineering · Jenkins · ★3.8 / 63%`
Runs builds/deploys and PR checks on legacy Jenkins pipelines. Overlaps in functionality with the CI/CD & GitHub Agent, but is being migrated to the GitHub Actions version and has a lower execution success rate.

**12. Next-gen Deploy Agent (Beta)** — `Engineering · In-house · ★4.9 / 58%`
Automates build-to-production rollout on a new deployment platform. Overlaps with the CI/CD & GitHub Agent. Highly rated, but newly introduced with little execution track record and an immature success rate (Beta).

## Permission-gated agents (relevant but blocked for most users)

**13. Security Operations (SecOps) Agent** — `Security · Copilot Studio · ★4.6 / 93%`
Performs permission audits, incident response, and changes to production access controls. Note: even people involved in permission testing can only make actual changes if they are in the Security department.

**14. Production Release Approval Agent** — `SRE · In-house · ★4.5 / 96%`
Performs final approval of production deployments and change-freeze decisions. Note: approval authority belongs only to the SRE lead / Executive.

**15. Finance Agent** — `Finance · Copilot Studio · ★4.4 / 96%`
Inquiries about budgets, billing, and cost allocation. Note: financial data can only be used by Finance and Executive.

**16. Executive Dashboard Agent** — `Executive · In-house · ★4.5 / 97%`
Inquiries about company-wide KPIs and executive reports. For Executive use only.

## Company-wide + role-specific clusters (baseline + per-role differences)

All are `permission: Company-wide` (info reference). For these topics AI Buddy runs the "Company-wide" baseline agent together with the relevant role-specific agents and merges the results (baseline → your role → differences from other roles).

### Compensation / bonus
**17. Company-wide Compensation & Bonus Policy Agent** — `HR · In-house · ★4.7 / 96%`
Company-wide basic policy on compensation structure and bonus payouts (review periods, payout timing, common coefficients). The baseline shared across roles.

**18. Sales Incentive Agent** — `Sales · In-house · ★4.6 / 93%`
Compensation differences for sales roles (commissions, SPIFFs, achievement-rate-linked pay). Bonuses tied to revenue/pipeline attainment.

**19. Engineer Compensation & Evaluation Agent** — `Engineering · In-house · ★4.7 / 94%`
Compensation differences for engineering roles (grades/levels, stock refreshes, technical evaluation). Bonuses tied to OKRs and evaluations.

**20. Manager & Executive Compensation Agent** — `Executive · In-house · ★4.5 / 95%`
Compensation differences for managers and executives (performance-linked bonus coefficients, organizational goal attainment, LTI).

### HR policy / work rules
**21. Company-wide HR Policy & Work Rules Agent** — `HR · Copilot Studio · ★4.6 / 97%`
The latest company-wide work rules, leave, work arrangements, and evaluation cycles. The baseline shared across roles.

**22. Role-based Work Arrangements Agent** — `HR · Dify · ★4.5 / 94%`
Differences in work arrangements by role and employment category (overtime treatment for managers/supervisors, discretionary/flextime work, on-call allowances, reduced hours).

### Expense / reimbursement
**23. Company-wide Expense & Reimbursement Policy Agent** — `Accounting · In-house · ★4.6 / 96%`
Company-wide expense reimbursement rules (limits, approval flow, cutoff dates, receipt requirements). The baseline shared across roles.

**24. Sales Expense Agent** — `Sales · In-house · ★4.5 / 93%`
Expense differences for sales roles (limits and pre-approval for entertainment, hospitality, and travel; handling of customer visits).

**25. Engineer Expense Agent** — `Engineering · In-house · ★4.6 / 95%`
Expense differences for engineering roles (equipment, cloud usage, learning/books, conference attendance support budgets).

---

> The platform labels (Copilot Studio / Dify / Low-code / GitHub Actions / Jenkins / In-house)
> are intentionally varied to illustrate the "sprawl of agents across many platforms, unified
> by one A2A registry" story. Source of truth: `examples/agents/domainSpecs.mjs`.
