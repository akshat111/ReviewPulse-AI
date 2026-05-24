# Plan 2 — Unique Feature Proposals for Weekly Pulse Agent

> **Goal**: Add distinctive capabilities that differentiate this agent from basic review scrapers.
> Each feature includes effort estimate, complexity, and implementation approach.

---

## 1. Competitor Benchmarking 📊

**What**: Track Groww + 3 competitor apps (Zerodha/Kite, AngelOne, Upstox) in a single run. Compare sentiment, themes, and ratings across platforms.

**Why unique**: No other review agent does cross-app competitive benchmarking. Gives product teams direct competitive intelligence.

**Effort**: Medium (2-3 days)
**Complexity**: Medium

**Implementation**:
- `config/apps.json`: List of competitor apps with App Store IDs + Play Store package names
- `fetch-reviews.ts`: Accept `appId` parameter, loop over configured apps
- `analyze-themes.ts`: Extract themes per app, then cross-compare
- Frontend: Add competitor comparison tab with side-by-side charts

```
config/apps.json:
[
  { "name": "Groww", "appleId": 1404871703, "playId": "com.groww.in" },
  { "name": "Zerodha Kite", "appleId": 1445074477, "playId": "com.zerodha.kite3" },
  ...
]
```

---

## 2. Review Reply Drafting ✍️

**What**: For negative reviews (rating ≤ 2), LLM auto-generates a draft reply that the support team can use. Stores drafts in a JSON file per week.

**Why unique**: Goes beyond analysis into action — directly helps customer support teams respond faster.

**Effort**: Small (1 day)
**Complexity**: Low

**Implementation**:
- New tool: `draft_replies(reviewIds?)` 
- Calls LLM with prompt: "Write a professional, empathetic response to this negative review for Groww"
- Stores in `session.replyDrafts`
- `render-report.ts`: Adds "Suggested Replies" section
- Frontend: Show reply drafts with copy-to-clipboard button

---

## 3. Anomaly Detection & Alerts 🚨

**What**: Detect sudden drops in rating, spikes in negative sentiment, or emergence of new crisis themes. Alerts via Slack/Email when anomalies are detected compared to rolling 4-week average.

**Why unique**: Proactive alerting — catches issues before they escalate. No other review tool does automated weekly anomaly detection.

**Effort**: Medium (2-3 days)
**Complexity**: High

**Implementation**:
- New tool: `detect_anomalies()`
- Retrieves last 4-8 weeks from Mem0
- Compares current week vs rolling average:
  - Rating drop > 0.5σ → 🔴 alert
  - Negative sentiment ratio > 2× average → 🔴 alert
  - New theme not seen in last 4 weeks → 🟡 alert
- `send-report.ts`: Include anomaly section in Slack/Email
- Frontend: Alert dashboard with timeline

---

## 4. Theme Trend Prediction 🔮

**What**: Uses historical Mem0 data (8+ weeks) to predict which themes are likely to emerge or intensify next week using simple pattern analysis (frequency acceleration, seasonal patterns).

**Why unique**: Predictive analytics — most tools only report what happened, not what might happen.

**Effort**: Medium (2-3 days)
**Complexity**: High

**Implementation**:
- New tool: `predict_trends()`
- Analyzes Mem0 theme history:
  - Themes appearing 3+ weeks → "persistent"
  - Themes with increasing frequency → "rising"
  - Themes gap for 2+ weeks then returning → "cyclical"
- Output: `{ predictions: [{ theme, confidence, trend }] }`
- Frontend: Add "Next Week Predictions" card

---

## 5. Multi-Language Review Support 🌐

**What**: Detect non-English reviews via language detection API, translate to English before LLM analysis, and show original language tag in report.

**Why unique**: Indian apps have significant non-English user base (Hindi, Tamil, Telugu). Most review tools ignore these voices entirely.

**Effort**: Small (1 day)  
**Complexity**: Low

**Implementation**:
- Use `@tolgee/detect-language` or `franc-min` for language detection
- Use Google Translate API (free tier) or `translate-npm` for translation
- Store original + translated text in Review model
- Frontend: Show language badge per review

---

## 6. Automated Weekly Scheduler ⏰

**What**: Built-in cron that runs the agent automatically every Monday 9 AM IST. Generates report, saves to Mem0, and sends via configured channels.

**Why unique**: Turns a CLI tool into a fully autonomous system. No human needs to trigger it.

**Effort**: Small (0.5 day)
**Complexity**: Low

**Implementation**:
- Add `node-cron` dependency
- `server/scheduler.ts`: Register cron job
- `config/schedule.json`: `{ enabled: true, day: "Monday", time: "09:00", timezone: "Asia/Kolkata" }`
- Frontend: Schedule settings toggle in delivery config panel

---

## 7. Interactive Report History (Timeline View) 📅

**What**: Visual timeline of all past reports with theme evolution, rating history, and key events. Users can click any past week to see its full report.

**Why unique**: Most dashboards show only current or single-week data. A clickable timeline of 10+ weeks of theme evolution is rare.

**Effort**: Medium (2 days)
**Complexity**: Medium

**Implementation**:
- Backend: `GET /api/history?weeks=12` — aggregates Mem0 data for last N weeks
- Frontend: Timeline component with:
  - SVG line chart of ratings over time
  - Theme cards per week (collapsible)
  - Filter by theme name
  - Animate transitions between weeks

---

## 8. GitHub Issue Auto-Creation 🐙

**What**: When a new negative theme emerges (marked `[new]` with average rating < 3), auto-create a GitHub issue in a configured repo with the theme details, quote, and action suggestion.

**Why unique**: Bridges analysis → engineering workflow. No other review tool integrates with GitHub issue tracking.

**Effort**: Small (1 day)
**Complexity**: Low

**Implementation**:
- New tool: `create_issues()`
- Uses GitHub REST API (`octokit`)
- Config: `GITHUB_TOKEN`, `GITHUB_REPO` in `.env`
- Only creates issues for themes with action severity > threshold
- Frontend: Show linked GitHub issue URLs

---

## 9. Local Ollama LLM Support 🦙

**What**: Support running LLM locally via Ollama (e.g., `llama3`, `mistral`) for privacy-sensitive deployments or zero-cost operation.

**Why unique**: Makes the agent fully air-gapped capable. No external API dependencies needed.

**Effort**: Small (0.5 day)
**Complexity**: Low

**Implementation**:
- `llm.ts`: Detect `OLLAMA_BASE_URL` env var, use `http://localhost:11434/v1`
- Auto-detect model availability
- Fallback chain: Ollama → Groq → error
- `.env.example`: Document OLLAMA configuration

---

## 10. Word Cloud + Review Explorer ☁️

**What**: Generate a word cloud from review text. Interactive review browser with search, filter by rating, and sort.

**Why unique**: Visual word cloud gives instant intuition about review topics. Combined with searchable review explorer, it's powerful for qualitative analysis.

**Effort**: Medium (2 days)
**Complexity**: Medium

**Implementation**:
- Backend: `GET /api/wordcloud?week=2026-W22` — returns word frequency data
- Frontend: Use `d3-cloud` or canvas-based word cloud rendering
- Review explorer: Search bar + filter chips (rating, platform, date) + sortable table
- Click word → filter reviews containing that word

---

## 11. Report Export (PDF / CSV) 📄

**What**: Download report as PDF (styled) or CSV (themes + metrics as rows).

**Why unique**: Enables sharing with stakeholders who don't use the dashboard.

**Effort**: Small (1 day)
**Complexity**: Low

**Implementation**:
- PDF: Use `puppeteer` or `jsPDF` to render markdown as PDF
- CSV: Generate CSV from themes + sentiment data
- Frontend: Download buttons in report section

---

## 12. Multi-Workspace / Team Mode 👥

**What**: Support multiple teams with different apps, configs, and delivery channels. Each workspace has its own config file.

**Why unique**: Transforms a single-app tool into a platform that can serve multiple products/teams.

**Effort**: Large (4-5 days)
**Complexity**: High

**Implementation**:
- `config/workspaces/`: Directory with per-workspace JSON configs
- `--workspace` CLI flag
- Server routes scoped by workspace ID
- Frontend: Workspace selector + per-workspace settings

---

## Priority Matrix

| Feature | User Value | Implementation Effort | Uniqueness | Priority |
|---------|-----------|---------------------|------------|----------|
| Competitor Benchmarking | ⭐⭐⭐⭐⭐ | Medium | Very High | 🥇 |
| Anomaly Detection & Alerts | ⭐⭐⭐⭐⭐ | Medium | Very High | 🥇 |
| Theme Trend Prediction | ⭐⭐⭐⭐ | Medium | Very High | 🥇 |
| Multi-Language Support | ⭐⭐⭐⭐ | Small | High | 🥈 |
| Review Reply Drafting | ⭐⭐⭐⭐ | Small | Medium | 🥈 |
| Automated Scheduler | ⭐⭐⭐ | Small | Medium | 🥈 |
| GitHub Issue Creation | ⭐⭐⭐⭐ | Small | High | 🥈 |
| Interactive Timeline | ⭐⭐⭐ | Medium | Medium | 🥉 |
| Word Cloud + Explorer | ⭐⭐⭐ | Medium | Medium | 🥉 |
| Local Ollama Support | ⭐⭐ | Small | Medium | 🥉 |
| PDF/CSV Export | ⭐⭐⭐ | Small | Low | 🥉 |
| Multi-Workspace Mode | ⭐⭐⭐⭐ | Large | High | 🥉 |

---

## Recommended First 3 (Highest Impact)

1. **Competitor Benchmarking** — Most unique, highest user value for product teams
2. **Anomaly Detection & Alerts** — Proactive, catches issues early, automates monitoring
3. **Automated Scheduler** — Makes the system truly autonomous, frees the team from manual runs
