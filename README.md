# Weekly Review Pulse Agent

AI-powered autonomous agent that scrapes App Store & Play Store reviews weekly, performs sentiment and theme extraction, benchmarks against competitors, and maintains long-term memory of insights using Mem0.

---

## 🚀 Key Features

* **Multi-Platform Scrape**: Extracts reviews from both **Apple App Store** and **Google Play Store** (via `google-play-scraper`).
* **Competitor Comparison**: Benchmarks performance between **Groww, Zerodha, and Angel One**.
* **Long-Term Memory Isolation**: Uses Mem0 to persist historical app state, tracking how customer friction points persist, change, or fade week-over-week.
* **Fuzzy Theme Matching**: Implements local Jaro-Winkler string similarity comparison to group duplicate/similar themes.
* **Multi-Channel Dispatch**: Sends reports instantly via **Slack Webhooks** or **SMTP HTML Email**.
* **Critical Friction Alerts**: Flags average rating dips (< 3.3), spike in negativity (> 40%), or key friction keywords ("fraud", "stuck", "loss", "crash", "freeze").
* **Exports**: Download historical trends as a **CSV Spreadsheet** or print beautiful reports to **PDF**.
* **Real-time SSE Streaming**: Emits agent execution step updates in real time to the frontend via Server-Sent Events.

---

## 📋 Repository Structure

```
project/
├── agent/                    # AI Agent logic & orchestration
│   ├── index.ts             # CLI entry point
│   ├── loop.ts              # Agent turn loop (max 12 turns)
│   ├── session.ts           # State container across turns
│   ├── llm.ts               # LLM client (Gemini/Groq/OpenAI)
│   ├── memory.ts            # Mem0 REST client wrapper
│   ├── models.ts            # TypeScript types
│   ├── prompts.ts           # System & extraction prompts
│   ├── types/
│   │   └── google-play-scraper.d.ts # Typings for play scraper
│   └── tools/
│       ├── registry.ts      # Tool execution registry
│       ├── schemas.ts       # LLM tool definition schemas
│       ├── fetch-reviews.ts # Apple App Store & Google Play scraper
│       ├── analyze-sentiment.ts # Sentiment metrics builder
│       ├── recall-past-pulse.ts # Query Mem0 memories
│       ├── analyze-themes.ts # LLM theme extraction
│       ├── save-pulse.ts    # Store pulse in Mem0
│       ├── render-report.ts # Generate markdown report
│       ├── send-report.ts   # Dispatch to Slack/SMTP
│       └── compare.ts       # Theme history comparison & Jaro-Winkler logic
├── server/                   # Express API server
│   └── index.ts             # API endpoints + Static file hosting
├── frontend/                # React UI dashboard
│   ├── src/
│   │   ├── App.tsx          # Dashboard page & configuration forms
│   │   ├── index.css        # Custom CSS + Tailwind CSS v4 setup
│   │   └── main.tsx         # React entry point
│   ├── vite.config.ts       # Vite configuration & dev proxy
│   └── package.json
├── scripts/                  # Utilities & run scripts
│   ├── dev.mjs              # Cross-platform server + frontend runner
│   ├── clean.mjs            # Cross-platform cleanup runner
│   └── appstore-connect-reviews.mjs # Apple connect review experimental tool
├── docs/                    # Specs & Architecture
│   ├── problem-statement.txt # App specifications
│   ├── context.md           # Implementation context & constants
│   ├── architecture.md      # Detailed system architectural design
│   └── plan-2.md            # Future feature proposals
├── delivery-config.json     # User Slack & Email credentials (gitignored)
└── package.json
```

---

## 🔌 API Endpoints

### Run Agent (SSE Stream)
**GET** `/api/run-stream?week=YYYY-Wnn&limit=50&app=groww`

Streams real-time agent execution progress using Server-Sent Events (SSE). Sends progress logs and updates:
```json
data: {"step": "fetch_reviews", "status": "running"}
...
data: {"result": { "markdown": "...", "themes": [...] }}
```

### Run Agent (Blocking JSON)
**POST** `/api/run`

Runs agent synchronously.
Request:
```json
{
  "week": "2026-W20",
  "limit": 50,
  "app": "groww"
}
```

### Export Trends CSV
**GET** `/api/export/csv?app=groww`

Returns a downloadable CSV of all historical memory logs.

### Fetch Trends Timeline
**GET** `/api/trends?app=groww`

Aggregates historical ratings, positive/neutral/negative counts, and themes stored in Mem0.

### Read & Save Delivery Configurations
* **GET** `/api/delivery-status` - Checks which notification channels are enabled.
* **POST** `/api/delivery-config` - Stores Slack Webhook URLs and SMTP authentication parameters to `delivery-config.json`.
* **POST** `/api/delivery-test` - Sends a test message via Slack or Email.

---

## 🔐 Environment Variables

Create a `.env` file at the root:

```bash
# --- LLM Providers (Select One) ---
# Gemini (Preferred)
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-2.5-flash

# OpenAI / Groq (Default Fallback)
OPENAI_API_KEY=gsk_...
OPENAI_BASE_URL=https://api.groq.com/openai/
OPENAI_MODEL=llama-3.3-70b-versatile

# Anthropic (Optional)
ANTHROPIC_API_KEY=sk-ant-...

# --- Mem0 Configuration (Required) ---
MEM0_API_KEY=m0_...
MEM0_BASE_URL=https://api.mem0.ai/v3
MEM0_USER_ID=groww-weekly-pulse

# --- API Configuration ---
PORT=3000

# --- Fallback Delivery Settings ---
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=user@domain.com
SMTP_PASS=password
EMAIL_TO=recipient@domain.com
EMAIL_FROM=groww-pulse@groww.in
```

---

## 🛠 Setup & Run

### Quick Start (Dev Mode)
Run both the Express backend and React frontend concurrently:
```bash
npm install
npm --prefix frontend install
npm run dev
```
Open **http://localhost:5173** to view the app.

### Run CLI Agent Standalone
To execute the agent directly in terminal:
```bash
npm run start -- --week 2026-W20 --limit 50 --verbose --app zerodha
```

### Clean Build Folders
```bash
npm run clean
```

### Production Deploy
Build the backend and frontend client, then start the server:
```bash
# Complete build (compiles TS backend to dist/ and builds frontend client)
npm run build:all

# Start production server
NODE_ENV=production npm run server
```

For cloud hosting (e.g. Render, Railway):
* **Build Command**: `npm install && npm --prefix frontend install && npm run build:all`
* **Start Command**: `npm run server`
* **Environment Variable**: `NODE_ENV=production`

---

## 📦 Dependencies

**Backend**:
* `express` — API server routes
* `cors` — Cross-origin requests
* `commander` — CLI interface parsing
* `dotenv` — Environmental variables
* `google-play-scraper` — Play Store reviews scraper
* `nodemailer` — SMTP email sending client
* `tsx` — TypeScript loader script execution

**Frontend**:
* `react` — Reactive UI elements
* `vite` — Bundler and development host
* `tailwindcss` — Style engine (using `@tailwindcss/vite` v4 import setup)
* `react-markdown` — Markdown parsing

---

## 📝 License

ISC
