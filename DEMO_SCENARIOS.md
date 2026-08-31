# AI Buddy Demo Scenario Collection

A structure that shows "the elements that matter" built up in 3 stages. The higher the category, the more information is used to make decisions.

- **① Department alone (the "department" in the header) changes routing / permissions**
- **② ① + Personal Memory (Glean personal memory) makes "your context" take effect**
- **③ ② + agent reliability signals (rating ★ / execution success rate / permission) decide "which one to use"**
- **④ Tools (Slack / Gmail / Jira / GitHub) "act" on external systems**
- **⑤ Combining ①–④: consult an agent → execute with Tools, end to end (the main event)**

> How to operate: The highlight is switching the **department** selector at the top-right of the header, then sending the same prompt and watching the behavior change.
> The basis for routing (owning department, platform, permission decision, rating ★, execution success rate) appears in the chat's "🤔 Thinking" and "Routing" traces.

---

## ① Scenarios where department matters

Show that for the same question, **changing the department changes the routing target, the answer content, and whether it's allowed**. Personal Memory is not used (questions decided by department no matter who asks).

### 1-A. Expense reimbursement limits and approval flow
Prompt:
```
Tell me the limits and approval flow for travel and equipment expense reimbursement
```
- Send as **Sales** → consolidates the company-wide expense policy + **Sales expenses** (entertainment, client meetings, travel)
- Send as **Engineering** → consolidates the company-wide expense policy + **Engineer expenses** (equipment, cloud, learning support)

### 1-B. How bonuses are decided
Prompt:
```
How are this term's bonuses decided?
```
- **Sales** → company-wide compensation policy + **Sales incentives** (commission/SPIFF)
- **Engineering** → company-wide compensation policy + **Engineer compensation** (grade/RSU, tied to OKRs)
- **Executive** → company-wide compensation policy + **manager/executive compensation** (performance-linked coefficient/LTI)

### 1-C. Work systems (overtime, flextime)
Prompt:
```
Tell me how overtime and flextime work
```
- Depending on the department, it differentiates company-wide work rules + **role-specific work systems** (overtime treatment for supervisory/managerial staff / discretionary labor / on-call allowance)

### 1-D. Cross-department consultation (cross-boundary routing)
Prompt:
```
I want to check the clauses in our template for an NDA to sign with a client
```
- **Sales / Research / Executive** → cross-boundary routing to the Legal agent (allowed because it's included in permission)
- Emphasizes that even though Legal is out of scope, Buddy relays on your behalf

### 1-E. Blocked by permission (department gate)
Prompt:
```
I want to grant/revoke production environment access permissions
```
- **Security** → the SecOps agent can execute
- **Engineering** → SecOps is permission=Security only → returns a **permission error** with the reason and the correct party to ask

---

## ② Scenarios where ① + Personal Memory matters

Even if you **deliberately keep the prompt vague**, Buddy completes it using your personal memory (in-progress projects, recent work) so it makes sense.
(The header department assumes the default **Engineering**. Memory includes GitHub automation PR #80/#81/#82, Looker verification, Jira AUT-13743, Salesforce case 00013083, release test 11-11, HR Policy Assistant verification, etc.)

### 2-A. Just referring to "that earlier PR" gets through
```
Organize the review angles for the draft PR I made earlier
```
→ Grasps PR #80/#81/#82 from memory → to the **CI/CD/GitHub agent**.

### 2-B. Continuing the Looker verification
```
I want to continue the Looker metrics verification. What metrics should I check next?
```
→ Informed by memory's "ARR by Close Month / Northwind Revenue," etc. → to the **Data/BI agent**.

### 2-C. "That Jira bug"
```
That Jira bug — where does it stand now? What should I do next?
```
→ Identifies **AUT-13743 (cache/latency)** from memory → to the Integration agent.

### 2-D. Proactive (today's to-dos)
```
What should I get done by the end of today?
```
→ Presents memory-derived reminders (e.g., reply to the review on PR #81, confirm the trigger-fix deploy, weekly report).

### 2-E. Gaps in the workflow under verification
```
Point out the missing tests in the workflow I'm verifying
```
→ Informed by memory's "HR Policy Assistant / pragati test," etc. → to the **QA agent**.

> The difference from ①: ① is "decided by department no matter who asks." ② is "**because it's you**, this vague instruction gets through" (memory fills in the subject and object).

---

## ③ Scenarios where ② + agent reliability signals matter

When there are **multiple** candidates that can do the same job, Buddy decides "which one to use" by **rating ★ / execution success rate / permission**.
(Competing agents have been added for this: **CI/CD/GitHub** (★4.8 / 95% success), **Jenkins CI/CD (legacy)** (★3.8 / 63%), **Next-gen Deploy Beta** (★4.9 / 58%))

### 3-A. Choose by track record (avoid low success rates even with high ★)
```
The build for PR #80 is failing. Fix it and deploy all the way to production
```
→ Compares the 3 candidates and selects the **CI/CD/GitHub agent with the highest execution success rate**.
- In the thinking, explicitly excludes them: "Next-gen Deploy Beta has a high ★ but a shallow track record at 58% success" and "Jenkins (legacy) is at 63% success."

### 3-B. Explicitly specify a signal
```
Do the production release in the most reliable way
```
→ Interprets "reliable = execution success rate" and prioritizes the agent with the higher success rate.

### 3-C. User wants the Beta (risk note)
```
I want to release on the new deploy platform (Beta). Is it OK?
```
→ Respects the request while adding a note about the **58%-success-rate risk** (recommending a proven platform for critical releases).

### 3-D. Reliability investigation of a failed run (②'s memory + ③'s reliability)
```
The agent's run for release test 11-11 failed. Investigate the cause and judge whether it can be re-run
```
→ Informed by memory's "release test 11-11 / agent failure" → to **Agent Reliability (SRE)**. Triage from the execution-success-rate angle.

### 3-E. Escalation via permission signal
```
Approve this release and apply it to production
```
→ Production release approval is permission=SRE/Executive. **Engineering** cannot execute → guides an escalation to someone with approval authority (SRE lead) (rating ★ also shown).

---

## ④ Scenarios where Tools (third-party actions) matter

Rather than routing to an agent, these are scenarios where **AI Buddy directly calls the real Glean-integrated tools (Slack / Gmail / Jira / GitHub) to "execute."**
Actually-connected tools appear in the Tools tab and are also called automatically by AI Buddy. (The gray DEMO tools return simulated responses.)

> The difference from ①②③: ①–③ are "which agent to ask (Read / consult)." ④ is "**write to / send to an external system (Write / Action)**."
> **About execution**: These actually call the tools and execute (email sends, Slack posts, and Jira ticket creation are reflected in the real tenant). It's safest to specify **real, test-purpose** recipients/channels/projects (even if unspecified, Buddy executes with a reasonable default).

### 4-A. Create a Jira issue (memory + Tool)
```
Continuing from the earlier Jira bug AUT-13743, file a cache regression investigation task in Jira
```
→ Creates an issue with the `jira` tool. Carries over the AUT-13743 context from memory.

### 4-B. Share to Slack
```
Summarize today's PR review status and post it to the team's Slack
```
→ Sends a message with the `slack` tool. Combines with ②'s memory (PR #80/#81/#82).

### 4-C. Draft/send an email
```
Draft and send a notification email about the release delay to stakeholders
```
→ Sends an email with the `gmail` tool.

### 4-D. GitHub operations (PR/branch/commit)
```
Create a feature/cache-fix branch for a new feature and open a draft PR
```
→ Runs `GitHub Create Branch` → `GitHub Create PR` tools in sequence.

### 4-E. Routing + Tool combined (a ②③④ combo)
```
Investigate the build failure for PR #80, file a summary of the cause in Jira, and notify the assignee on Slack
```
→ ① investigate the cause with the CI/CD/GitHub agent (selected via ③ reliability) → ② fill in PR/assignee from memory → ④ file with `jira` + notify with `slack`, all in one sequence.

> Demo caution: Since this actually writes to external systems, confirm the tenant's permissions and targets (test-purpose channels/projects) in advance. The gray DEMO tools (Salesforce, etc.) return simulated responses without connecting externally even when executed.

---

## ⑤ Composite scenarios using both agents × Tools (the main event)

Within a single request, handle **① consult a specialist agent (Read / decide) → ② execute with real tools (Write / Action)** end to end.
Rather than "consult and done," the value of AI Buddy is carrying it through to "investigate, create, and notify."
(Department defaults to **Engineering**; memory includes PR #80-82 / AUT-13743 / release test 11-11 / HR Policy Assistant, etc.)

### 5-A. Check with Legal → file in Jira → notify on Slack
```
Have Legal check the clauses in the client NDA that deviate from our template, file the points needing fixes in Jira, and notify the sales rep on Slack
```
- **Agent**: Legal agent (cross-boundary routing / permission decision)
- **Tools**: `jira` (create issue) → `slack` (notify the assignee)

### 5-B. Summarize with Research → share by email
```
Have the Research agent summarize the discussion points of last week's experiment protocol, and send an email to research-team@example.com with the subject "Experiment Protocol Discussion Summary"
```
- **Agent**: Research agent (permission=Research/Legal)
- **Tools**: `gmail` (send email)
- Tip: Explicitly stating the recipient and subject means Buddy doesn't stall and executes all the way to sending (it executes with defaults even if unspecified, but specifying a real test-purpose address makes it reliable).

### 5-C. Verification angles with QA → bulk-file test cases in Jira
```
Have the QA agent enumerate the missing test angles for the HR Policy Assistant workflow under verification, and file them directly in Jira as test cases
```
- **Agent**: QA agent (② identifies the target workflow from memory)
- **Tools**: `jira` (create multiple issues)

### 5-D. Reliability investigation (③) → fix branch/PR → notify on Slack
```
Have the SRE agent investigate the cause of the agent failure in release test 11-11, create a prevention branch and draft PR on GitHub, and share with the assignee on Slack
```
- **Agent**: Agent Reliability (SRE) (③ triage from the execution-success-rate angle)
- **Tools**: `GitHub Create Branch` → `GitHub Create PR` → `slack`

### 5-E. Consolidated compensation answer (① multiple agents) → draft email to HR
```
Summarize how my bonus is decided, covering both company-wide and role-specific, and draft an email to HR with the points I want to confirm
```
- **Agent**: company-wide compensation policy + Engineer compensation (consolidating multiple role-specific ones)
- **Tools**: `gmail` (create draft)

### 5-F. Build failure investigation (③ reliability selection) → file in Jira → Slack (④'s comprehensive version)
```
Investigate the build failure for PR #80, file a summary of the cause in Jira, and notify the assignee on Slack
```
- **Agent**: CI/CD/GitHub (selected over Jenkins-legacy/Beta by execution success rate) + ② fill in PR/assignee from memory
- **Tools**: `jira` → `slack`

> How to present: The chat's **continuous trace** of "🤔 Thinking → Routing (agent execution) → 🔧 Glean tools (Jira/Slack/GitHub execution) → final answer" is itself the demo of "automation from consultation to execution."

---

## Added agents (to make ③ work)

| Agent | Department | Platform | Rating ★ | Execution success rate | Role |
|---|---|---|---|---|---|
| Jenkins CI/CD agent (legacy) | Engineering | Jenkins | 3.8 | 63% | A **legacy platform** overlapping in function with CI/CD. Its low success rate creates a "reason to avoid" |
| Next-gen Deploy agent (Beta) | Engineering | In-house | 4.9 | 58% | **High ★ but little track record (Beta)**. Shows "rating ≠ reliability" |

> Making it a three-way contest with the existing CI/CD/GitHub agent (★4.8 / 95% success) lets you feel ③'s "choose by reliability."
> The permission-gate ones (SecOps = Security only, production release approval = SRE/Executive, Finance = Finance/Executive, executive dashboard = Executive) are used as-is from before.

## Startup notes
- The mock agents are started by `examples/agents/domain.mjs` on **ports 5601–5625** (new: Jenkins-legacy=5611, Beta=5625).
- Registry registration and routing are auto-seeded by `backend/src/index.js` from `DOMAIN_AGENTS`.
