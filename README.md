# AI Buddy Demo

A custom demo implementing the internally-proposed **AI Buddy** (a personalized in-house AI assistant) with **Glean as the backend**. It brings ideas ② and ③ from the handwritten concept notes to life in a "working form."

- **② Routing / Registry experience** — AI Buddy grasps the intent of a question and routes across departments to the appropriate specialist agent (Legal / HR / Research / Sales / IT). The A2A registry holds each agent's `description / permission / metadata / rating / execution rating`.
- **③ Personalization (proactive suggestions)** — On startup, it fetches **Glean MCP personal memory** live to present a work-context greeting plus proactive suggestions.

## Architecture

```
[AI Buddy custom UI]  ──/api──▶  [backend (Express)]  ──▶  Glean
 React + Vite :5273            :3000                     ├─ MCP Gateway (personal memory / tools)
                                                          ├─ LLM Gateway (orchestrator model: routing/summarization)
                                                          └─ OAuth (Authorization Code + PKCE)
                                            │
                                            └─ A2A(message/send) ─▶ [per-department mock agents :5601-5605]
                                                                     Legal/HR/Research/Sales/IT (providers distributed)
```

The Glean-integrated "live layer" (MCP client / A2A / LLM Gateway / OAuth) is reused from `a2a_demo`. The UI and AI Buddy orchestration (`backend/src/lib/buddy.js` / `memory.js`) are newly built for this demo.

## Setup from scratch (for first-timers)

If this is your first time running the demo, just follow the steps top to bottom and it will work.

### 0. Prerequisites (what to prepare)
- **Node.js 18 or later** (check with `node -v`; if missing, install from https://nodejs.org)
- **A Glean tenant** (`https://<tenant>-be.glean.com`) with admin access to it
- A browser (for OAuth login)

### 1. Clone & install dependencies
```bash
cd /Users/kabu/aibuddy_demo      # go to where the project lives
npm run install:all              # install root + backend + frontend together
```

### 2. Prepare the Glean side (admin console)
Prepare the following and note down the values.
1. **Issue an OAuth static client** (Client ID / Client Secret).
   - **Be sure to register `http://localhost:3000/oauth/callback` as a redirect_uri** (login fails without this).
   - Scopes: `openid offline_access SEARCH CHAT AGENTS DOCUMENTS ENTITIES TOOLS MCP LLM_PROXY`
2. **Create an MCP server** and note its name (e.g., `my-mcp-server`). The URL is `https://<tenant>-be.glean.com/mcp/<name>`.
   - Since it uses personal memory and 3rd-party tools (Slack/Gmail/Jira/GitHub, etc.), **enable memory and the tools you want to use** on this MCP server in advance.

### 3. Create `.env`
```bash
cp .env.example .env
```
Open `.env` and replace `<tenant>` / the OAuth ID & Secret / the MCP server name with your own values.
(See the comments in `.env.example` for what each line means. Make `GLEAN_OAUTH_REDIRECT_URI` match the value you registered above.)

### 4. Start
```bash
./dev.sh
```
This brings up `agents (:5601–) + backend (:3000) + frontend (:5273)` all at once.

### 5. Connect and start the demo
1. Open **http://localhost:5273** in your browser.
2. Top-right **"Connect to Glean"** → OAuth login (in the browser).
3. Once connected, success is when the home screen shows a **personalized greeting plus proactive suggestions**.
4. (Optional) In the **Registry tab**, search for and add real Glean agents → AI Buddy runs them via routing.

> **If you get stuck**
> - `redirect_uri` error on login → check that `http://localhost:3000/oauth/callback` is registered on the static client.
> - memory fetch error / tools don't appear → check the server name in `GLEAN_MCP_URL` and that memory/tools are enabled on that server.
> - Repeated `fetch failed` → see the **Socket Firewall** section below (are you starting via `./dev.sh`?).

### Keeping it running (don't stop it when you step away or the machine sleeps)
```bash
# keep running even after closing the terminal, with sleep suppressed
nohup caffeinate -ism ./dev.sh > /tmp/aibuddy-demo.log 2>&1 < /dev/null & disown
# stop
npm run stop
```
(A laptop is force-slept on battery when the lid is closed. Connecting the power adapter is recommended.)

---

## Setup (key points only)

```bash
npm run install:all    # root + backend + frontend at once
cp .env.example .env   # replace values with your own Glean tenant/OAuth/MCP
./dev.sh               # start → http://localhost:5273
```

> ⚠️ **The backend is fixed to port 3000** (to match the OAuth redirect_uri). **Do not run it at the same time as another app that uses the same port 3000.**

## Start

```bash
./dev.sh           # recommended. Starts agents+backend+frontend at once, with Socket Firewall bypass
# or
npm run dev        # same as above (SFW_BYPASS=1 is baked into the backend)
```

Open **http://localhost:5273** in your browser and log in via OAuth with top-right **"Connect to Glean"**.

> **⚠ About Socket Firewall (sfw)**
> In this environment, `npm` is wrapped as `sfw npm`, which **blocks the app's communication with the Glean tenant**
> (symptoms: cannot fetch memory / LLM Gateway returns "all 404s" / OAuth "cannot resolve authorize/token").
> Starting via `./dev.sh` (= `SFW_BYPASS=1`) avoids this. In environments without sfw, it is simply ignored.

> If you want to start just the mock agents on their own, use `npm run agents`.

### OAuth endpoints (official Glean values)
Already specified explicitly in `.env`. They match the canonical values indicated by the tenant's `/.well-known/oauth-authorization-server` and the Agent Card's `securitySchemes.oauth2`.
- `GLEAN_OAUTH_AUTHORIZE_URL` = `https://<tenant>-be.glean.com/oauth/authorize`
- `GLEAN_OAUTH_TOKEN_URL` = `https://<tenant>-be.glean.com/oauth/token`
- Model list: `GET /rest/api/v1/{openai|anthropic|gemini}/v1/models` (aggregated because each surface has a different lineup)
- Inference calls: Claude=`POST /rest/api/v1/anthropic/v1/messages` / GPT=`POST /rest/api/v1/openai/v1/responses` (Bearer=OAuth token, requires `LLM_PROXY` scope)

## Demo flow

1. Log in via OAuth with top-right **"Connect to Glean"** (in the browser).
2. **③ Personalization**: After connecting, AI Buddy fetches Glean personal memory live and shows a greeting informed by in-progress projects plus **proactive suggestion cards**.
3. **② Routing**: Set your department to "Sales" and ask
   > "I want to check with Legal about the NDA for a new joint research project."
   → It shows a **routing trace** (Legal agent = built on Copilot Studio / permission decision / rating / execution success rate) and **calls the Legal mock via A2A** to answer. Finally it suggests the **next step**.
4. In the top tab **"Agent Registry"**, agents scattered across multiple platforms (Glean/Copilot/Dify/Low-code) are presented as a unified catalog with `description, permission, metadata, rating, execution rating`.
5. **"Personal Memory"** tab — Visualizes what the `memory` tool returns (categories, parsed results, raw samples). You can inspect the exact structure AI Buddy uses for personalization. The raw return can be simultaneously interpreted by the Glean LLM Gateway via the **"🌐 Translate to English"** button (original text toggle available).
6. **"LLM Gateway"** tab — Lists the lineup of models the Glean LLM Gateway provides. "Test & Enable" hits it once for real, and if there's a response, it's added as a candidate orchestrator model for AI Buddy.

### Example of checking governance (permission)
- Set your department to **IT** and ask a research question → the Research agent (available to: Research, Legal) returns **no permission**, and AI Buddy suggests an alternative.

## Recommended demo scenario collection (added to over time)

The department is basically "Engineering" (matching the persona in Personal Memory). The parentheses indicate a department switch.

### A. Core experience
1. **Personalized startup** — On connecting, "in-progress projects + proactive suggestions" from memory appear on the splash screen. Click a suggestion card to begin. The top-left logo resets to the top anytime.
2. **Route to a matching agent** — "Review PR #80" → to the **PR Review / CI/CD/GitHub** agent (permission OK, rating shown).
3. **Cross-department routing** (switch to Sales) — "I want to check the NDA for a new joint research project with Legal" → the Legal agent (built on Copilot Studio).
4. **Permission block (governance)** — "Look up literature on drug discovery research" → the Research agent is **permission NG**. "I want to change access permissions" → SecOps is also blocked.

### B. Company-wide common + role-dependent questions (run multiple agents → merge)
5. **Bonus (compensation)** — "Tell me the bonus payout metrics, and if they differ by role, the differences too" → runs company-wide compensation + Sales + Engineer + Manager simultaneously and consolidates into ① company-wide baseline → ② your role → ③ differences for other roles.
6. **HR regulations** — "Tell me the latest HR regulations" → consolidates company-wide work rules + role-specific work systems (e.g., overtime treatment for supervisory/managerial staff).
7. **Expense reimbursement** — "Tell me the rules for expense reimbursement" → consolidates company-wide expenses + Sales expenses + Engineer expenses.

### C. For engineers (in-house mocks)
8. **CI/CD/PR** — "Review PR #80" → the **CI/CD/GitHub agent** (built on GitHub Actions).
9. **QA / Verification** — "Give me the regression test angles for this agent" → the **Test Automation/QA agent** (built on Dify).
10. **Integration / Reliability** — "Check the Coupler.io dataflow" → the **Integration agent** (Low-code) / "Investigate the failed run" → the **Agent Reliability (SRE) agent** (In-house).

### D. Platform features
11. **Personal Memory tab** — Displayed in English by default (translated only on first load → **cached**, instant thereafter). Use "original" to **fetch the raw MCP data live**.
12. **LLM Gateway tab** — "Test & Enable" any model → it is **dynamically reflected** in the dropdown next to the input field (switch the orchestrator model).
13. **History tab** — Executed questions, routing, and answers are recorded, with detail view / deletion available.
14. **Agent Registry** — 23 mocks (per department = Copilot Studio/Dify/Low-code/GitHub Actions/In-house) shown as a unified catalog with `description/permission/metadata/rating/execution rating`. **The mocks never claim to be "Glean."**

### E. Search for and add real Glean agents (★ the real thing)
From **"🔎 Search for and add real Glean agents"** at the top of the registry, you can search for and add actual agents that exist in your tenant (platform badge = **Glean**). Once added, when an agent is routed to, it is actually executed via Glean's `runs/stream` API with streaming (a real answer, not a mock's canned response). **Added agents are retained across restarts.**

15. **Search and add** — e.g., search for `data` / `jira` / `planner` / `incident`, etc. → **＋Add** promising agents (e.g., Data Analyst / Day Planner / Incident Triage / Salesforce Pipeline Monitor).
16. **Route to the real thing** — Ask a question that fits the added agent's purpose, and AI Buddy picks it so that **the real Glean agent answers** (the answer is shown incrementally via streaming).
    - Search filters on name/description on the client side. **If an agent's name is in Japanese, search with Japanese keywords** (e.g., "release" / "summary" in Japanese).
17. **Delete** — Use the ✕ on the card to remove it from the registry.

> On test-type tenants there are many draft/test agents, so the search excludes noise such as `test/regress/draft/preview` and prioritizes usable ones that have descriptions.

## Implementation notes / caveats

- **rating / execution rating** are concepts that don't exist in standard Glean features, so they are **demo synthetic metadata** on the registry (`examples/agents/domainSpecs.mjs`). This is clearly labeled as "synthetic metadata" in the UI as well.
- **personal memory** is fetched live from the connected user's Glean Personal Graph (`backend/src/lib/memory.js`). The tenant's MCP server must expose the `memory` tool (if not exposed, an error is shown when fetching the profile).
- The mock agents are **A2A-compliant** (`/.well-known/agent-card.json` + `message/send`). In real operation, the assumption is to bring Copilot Studio / Dify, etc. into A2A compliance, or stand up an A2A wrapper.

## Key files

| Role | Path |
|------|------|
| AI Buddy orchestration | `backend/src/lib/buddy.js` |
| Live personal memory fetch | `backend/src/lib/memory.js` |
| Buddy routes (SSE / profile / glean) | `backend/src/routes/buddy.js` |
| Registry listing | `backend/src/routes/agents.js` |
| Startup / seeding | `backend/src/index.js` |
| Per-department agent definitions | `examples/agents/domainSpecs.mjs` |
| Mock A2A server | `examples/agents/domain.mjs` |
| Frontend (Buddy chat / registry) | `frontend/src/components/*` |
