# 🚀 Groww Weekly Pulse Agent — Project Analysis & Feature Proposals

Yeh document project ko detail mein samjhata hai aur batata hai ki isme aur kya-kya unique features add kar sakte hain.

---

## 📌 Project Ka Quick Summary

**Groww Weekly Pulse Agent** ek AI-powered autonomous agent hai jo:
1. Apple App Store se **Groww app ke real user reviews scrape** karta hai
2. AI (LLM) se reviews analyze karke **top 3 themes** nikalta hai (har theme ke saath ek real user quote + action item)
3. **Mem0** (long-term semantic memory) mein themes store karta hai
4. Pichle hafton ke themes se **compare** karta hai — kaunsa issue persist kar raha, kaunsa naya aaya, kaunsa fade ho gaya
5. Ek clean **Markdown report** generate karta hai
6. **React web dashboard** se visual analysis dikhata hai

---

## 🏗️ Current Architecture (Kaise Kaam Karta Hai)

```
User (Browser / CLI)
      │
      ▼
┌─────────────────────┐
│  Express Server     │ ← Port 3000
│  POST /api/run      │
└────────┬────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│  Agent Loop (loop.ts) — Max 12 turns        │
│  ┌─────────────────────────────────────┐    │
│  │ LLM decides kaunsa tool call karna  │    │
│  │ hai — yeh HARD-CODED order nahi hai │    │
│  └────────────┬────────────────────────┘    │
│               │                              │
│    ┌──────────┼──────────┬──────────┐       │
│    ▼          ▼          ▼          ▼       │
│  fetch    recall     analyze    save        │
│  reviews  past_pulse themes     pulse       │
│  (Apple)  (Mem0)     (LLM)     (Mem0)      │
│               │                              │
│               ▼                              │
│         render_report                        │
│         (Markdown)                           │
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────┐
│  React Frontend     │ ← Port 5173/5174
│  Dashboard + Charts │
└─────────────────────┘
```

### Key Files:

| File | Kya Karta Hai |
|------|--------------|
| [loop.ts](file:///e:/opencode/project/agent/loop.ts) | Agent ka brain — LLM se baat karta hai, tools call karta hai |
| [llm.ts](file:///e:/opencode/project/agent/llm.ts) | Groq/OpenAI API client with retry logic |
| [memory.ts](file:///e:/opencode/project/agent/memory.ts) | Mem0 REST API wrapper (store + search) |
| [fetch-reviews.ts](file:///e:/opencode/project/agent/tools/fetch-reviews.ts) | Apple App Store se reviews scrape karta hai |
| [analyze-themes.ts](file:///e:/opencode/project/agent/tools/analyze-themes.ts) | LLM se 3 themes extract karta hai |
| [compare.ts](file:///e:/opencode/project/agent/tools/compare.ts) | Current vs past themes comparison |
| [render-report.ts](file:///e:/opencode/project/agent/tools/render-report.ts) | Final Markdown report generator |
| [save-pulse.ts](file:///e:/opencode/project/agent/tools/save-pulse.ts) | Mem0 mein themes persist karta hai |
| [App.tsx](file:///e:/opencode/project/frontend/src/App.tsx) | React dashboard UI |
| [server/index.ts](file:///e:/opencode/project/server/index.ts) | Express API server |

---

## ⚠️ Current Limitations (Abhi Kya Missing Hai)

| # | Gap | Impact |
|---|-----|--------|
| 1 | **Sirf Apple App Store** — Google Play Store ka data nahi aata | 50%+ Indian users Android pe hain, unki feedback miss ho rahi hai |
| 2 | **Sirf ~10 reviews** fetch hote hain per page (Apple limitation) | Analysis ka scope limited hai |
| 3 | **No Sentiment Score** — positive/negative ka ratio nahi dikhta | Overall app health ka snapshot missing |
| 4 | **No Historical Trend Charts** — weekly data toh Mem0 mein hai but visualize nahi ho raha | Week-over-week trend samajhna mushkil |
| 5 | **No Notifications** — report sirf tab dikhta hai jab manually run karo | Team ko proactively inform nahi hota |
| 6 | **Exact Theme Matching** — fuzzy/semantic matching nahi hai | "App crashes" aur "Application freezing" alag themes dikhte hain |
| 7 | **No Export** — report ko PDF/Slack/Email bhej nahi sakte | Sharing ke liye manually copy karna padta hai |
| 8 | **No Multi-App Support** — sirf Groww ke liye hardcoded | Agar aur apps bhi track karne ho toh code change karna padega |
| 9 | **No Review Filtering** — date range, rating filter nahi hai | Specific period ka analysis nahi ho sakta |
| 10 | **Duplicate Week Runs** — same week dobara run karein toh Mem0 mein duplicate memory ban jaati hai | Data pollution |
| 11 | **No Real-Time/SSE Progress** — frontend pe sirf spinner dikhta hai, koi step-by-step progress nahi | User ko 30-60 sec wait karna padta hai blindly |
| 12 | **No Authentication** — koi bhi API access kar sakta hai | Security concern |

---

## 🌟 Proposed New Features (Priority-Wise)

---

### 🔴 HIGH PRIORITY (Immediate Impact)

---

#### Feature 1: 📊 Sentiment Analysis Dashboard

**Kya Hai:** Har review ka sentiment score calculate karna (positive/negative/neutral) aur frontend pe ek visual pie chart + sentiment trend line dikhana.

**Kyun Zaroori Hai:** Abhi sirf themes dikhte hain. Agar 50 reviews mein se 40 negative hain, toh woh urgency immediately dikhni chahiye. Ek sentiment score yeh batata hai ki app ka overall health kaisa hai.

**Kaise Implement Karein:**
- Naya tool `analyze_sentiment` banao jo reviews ka sentiment score calculate kare (LLM ya simple rule-based)
- Return kare: `{ positive: 15, negative: 30, neutral: 5, avgRating: 2.8 }`
- Frontend mein donut/pie chart add karo (Canvas API ya lightweight chart library)
- Rating distribution histogram bhi dikhao (1★ kitne, 2★ kitne, etc.)

**Touch Points:** New tool file, [session.ts](file:///e:/opencode/project/agent/session.ts) mein new field, [App.tsx](file:///e:/opencode/project/frontend/src/App.tsx) mein chart component

---

#### Feature 2: 📈 Week-Over-Week Trend Visualization

**Kya Hai:** Mem0 se saare past weeks ka data pull karke ek timeline graph dikhana — themes kaise evolve hue over time, ratings ka trend, kaunsa issue kitne weeks se persist kar raha hai.

**Kyun Zaroori Hai:** Abhi sirf "persisting/new/faded" text dikhta hai. Ek visual line chart dikhaye ki "App Crashes" issue 6 weeks se chal raha hai aur improve nahi ho raha — yeh zyada impactful hai.

**Kaise Implement Karein:**
- New API endpoint: `GET /api/history` jo Mem0 ke `listAll()` se saare memories fetch kare
- Parse karke week-wise theme data nikalo
- Frontend mein line chart banao: X-axis = weeks, Y-axis = theme recurrence count
- Ek "heat map" bhi bana sakte hain: weeks × themes matrix with color intensity

**Touch Points:** [server/index.ts](file:///e:/opencode/project/server/index.ts) mein new route, [memory.ts](file:///e:/opencode/project/agent/memory.ts) ka `listAll()`, new frontend component

---

#### Feature 3: 🔄 Real-Time Progress Streaming (SSE)

**Kya Hai:** Jab agent run ho raha hai, toh frontend pe real-time step-by-step progress dikhana — "Fetching reviews... ✅", "Recalling past memories... ✅", "Analyzing themes... 🔄", etc.

**Kyun Zaroori Hai:** Abhi user 30-60 seconds blindly wait karta hai spinner dekhte hue. Koi idea nahi ki agent kahan tak pahuncha. Real-time feedback se UX drastically improve hoga.

**Kaise Implement Karein:**
- Server-Sent Events (SSE) use karo — `/api/run` ko `text/event-stream` response type se replace karo
- Agent loop mein har tool call se pehle/baad event emit karo:
  ```
  data: {"step": "fetch_reviews", "status": "running"}
  data: {"step": "fetch_reviews", "status": "done", "reviewCount": 10}
  data: {"step": "analyze_themes", "status": "running"}
  ```
- Frontend mein `EventSource` API use karke live updates render karo
- Ek stepper/progress bar UI component banao

**Touch Points:** [server/index.ts](file:///e:/opencode/project/server/index.ts), [loop.ts](file:///e:/opencode/project/agent/loop.ts) mein event callbacks, [App.tsx](file:///e:/opencode/project/frontend/src/App.tsx) mein stepper component

---

#### Feature 4: 🤖 Google Play Store Reviews Integration

**Kya Hai:** Apple App Store ke saath-saath Google Play Store ke reviews bhi fetch karke combined analysis dena.

**Kyun Zaroori Hai:** India mein ~95% smartphone users Android pe hain. Sirf iOS reviews se analysis karna ek incomplete picture deta hai. Play Store reviews add karke complete user voice capture hogi.

**Kaise Implement Karein:**
- Naya tool `fetch_play_reviews` banao
- Google Play Store reviews ke liye public data source use karo (web scraping ya community API)
- Reviews ko same `Review` interface mein normalize karo with `source: "play_store" | "apple_store"` field
- Agent ko option do ki dono sources se fetch kare
- Frontend mein reviews ke sath source badge dikhao

**Touch Points:** New tool file, [schemas.ts](file:///e:/opencode/project/agent/tools/schemas.ts), [registry.ts](file:///e:/opencode/project/agent/tools/registry.ts), [models.ts](file:///e:/opencode/project/agent/models.ts) mein Review interface update

---

### 🟡 MEDIUM PRIORITY (Strong Value Add)

---

#### Feature 5: 📧 Automated Report Delivery (Slack/Email/Webhook)

**Kya Hai:** Report generate hone ke baad automatically Slack channel, email, ya custom webhook pe bhej dena.

**Kyun Zaroori Hai:** Product managers ko manually dashboard check nahi karna chahiye. Har Monday subah unke Slack mein report aa jaaye — yeh real workflow integration hai.

**Kaise Implement Karein:**
- New tool: `send_report` — Slack Webhook, Email (Nodemailer/SendGrid), ya generic webhook
- Config mein `SLACK_WEBHOOK_URL`, `EMAIL_TO` jaise variables add karo
- Agent ka system prompt update karo ki wo report render karne ke baad `send_report` bhi call kare
- Frontend mein delivery settings UI banao

---

#### Feature 6: 🔍 Semantic (Fuzzy) Theme Matching

**Kya Hai:** Abhi theme comparison exact string match (normalized) se hoti hai. Isko embedding-based semantic similarity se replace karna.

**Kyun Zaroori Hai:** "App crashes during trading" aur "Application freezes at market open" same issue hain but exact match fail hota hai. Semantic matching se zyada accurate "persisting" classification milegi.

**Kaise Implement Karein:**
- [compare.ts](file:///e:/opencode/project/agent/tools/compare.ts) mein cosine similarity add karo
- Theme names ko embed karo (LLM embedding API ya local model)
- Threshold set karo (e.g., 0.85 similarity = match)
- Fallback: LLM se puchho — "Are these two themes referring to the same issue?"

---

#### Feature 7: 📅 Automated Weekly Scheduling (Cron Job)

**Kya Hai:** Agent ko manually run karne ki zaroorat na ho — ek cron scheduler set karo jo har Monday automatically pulse generate kare.

**Kyun Zaroori Hai:** True automation — "set it and forget it". Product team ko bina kuch kiye har week ka report mil jaaye.

**Kaise Implement Karein:**
- `node-cron` package use karo
- Server mein schedule endpoint add karo: `POST /api/schedule` — `{ cron: "0 9 * * 1", week: "auto" }`
- "auto" week = current ISO week calculate karo
- Schedule status dashboard mein dikhao
- Run history maintain karo

---

#### Feature 8: 📑 PDF/CSV Export

**Kya Hai:** Generated report ko ek click mein PDF download ya CSV export kar sako.

**Kyun Zaroori Hai:** Stakeholders ko share karne ke liye professional PDF chahiye. Data analysis ke liye CSV useful hai.

**Kaise Implement Karein:**
- PDF: `puppeteer` ya `jspdf` se Markdown → PDF conversion
- CSV: Reviews + themes + sentiment data ko structured CSV mein dump karo
- Frontend mein "Download PDF" aur "Export CSV" buttons add karo
- API endpoints: `GET /api/export/pdf?week=2026-W20`, `GET /api/export/csv?week=2026-W20`

---

#### Feature 9: 🏷️ Smart Review Categorization & Tagging

**Kya Hai:** Har review ko automatically categorize karna — "Bug Report", "Feature Request", "Praise", "UX Complaint", "Payment Issue", etc.

**Kyun Zaroori Hai:** Sirf 3 themes kaafi nahi — engineering teams ko specific categories chahiye taaki wo apne respective area ke issues filter kar sakein.

**Kaise Implement Karein:**
- `analyze_themes` tool ko extend karo ya naya `categorize_reviews` tool banao
- LLM se har review ko predefined categories mein classify karao
- Frontend mein filterable tag chips dikhao
- Category-wise review count bar chart

---

#### Feature 10: 🔐 Authentication & Multi-User Support

**Kya Hai:** Dashboard pe login system — different teams ke liye different apps track karna, user-specific settings.

**Kyun Zaroori Hai:** Abhi koi bhi API hit kar sakta hai. Production mein security zaroori hai. Aur agar multiple teams different apps track karein toh multi-tenancy chahiye.

**Kaise Implement Karein:**
- Simple JWT-based auth (or OAuth with Google)
- User model: `{ id, email, apps: ["groww", "zerodha"], preferences }`
- Mem0 `user_id` ko per-user scope karo
- Protected API routes with middleware

---

### 🟢 NICE-TO-HAVE (Polish & Delight)

---

#### Feature 11: 💬 Interactive Chat with Reviews

**Kya Hai:** Dashboard pe ek AI chatbot jisse user apne reviews ke baare mein sawal puch sake — "What are users saying about mutual funds?", "Show me all 1-star reviews about OTP issues"

**Kyun Zaroori Hai:** Static report ke alawa, product managers ko ad-hoc queries karne ki freedom milegi. Yeh RAG (Retrieval Augmented Generation) pattern hai — very powerful.

**Kaise Implement Karein:**
- New API endpoint: `POST /api/chat` — `{ question: "...", week: "2026-W20" }`
- Session mein stored reviews ko context ke roop mein LLM ko do
- Conversational memory maintain karo per chat session
- Frontend mein chat UI component (message bubbles, input field)

---

#### Feature 12: 🏆 Competitor Comparison

**Kya Hai:** Sirf Groww nahi, Zerodha, Angel One, Paytm Money jaise competitors ke bhi reviews fetch karke side-by-side comparison report dena.

**Kyun Zaroori Hai:** Product strategy ke liye competitors ki strengths aur weaknesses jaanna zaroori hai. "Zerodha users are praising fast execution, while Groww users complain about freezes" — yeh insight gold hai.

**Kaise Implement Karein:**
- App IDs configurable banao (environment ya frontend se)
- `fetch_reviews` ko parameterize karo with app ID
- Parallel fetch for multiple apps
- Side-by-side theme comparison report
- Frontend mein comparison table/view

---

#### Feature 13: 🌐 Multi-Language Review Support

**Kya Hai:** Hindi, Tamil, Telugu, aur other Indian language reviews ko bhi analyze karna (translate → analyze).

**Kyun Zaroori Hai:** Bahut saare users regional languages mein review likhte hain. Un reviews ko skip karna matlab valuable feedback miss karna.

**Kaise Implement Karein:**
- LLM naturally multilingual hai — prompt mein instruction do ki non-English reviews ko bhi consider kare
- Optional: reviews ko pehle translate karke phir analyze karo
- Language detection add karo aur dashboard pe language distribution dikhao

---

#### Feature 14: 🔔 Alert System for Critical Issues

**Kya Hai:** Agar kisi week mein sudden spike aaye negative reviews mein, ya koi critical keyword detect ho (like "money lost", "account hacked"), toh instant alert trigger ho.

**Kyun Zaroori Hai:** Weekly report mein 7 din ka delay hai. Critical issues ke liye immediate notification chahiye.

**Kaise Implement Karein:**
- Threshold rules define karo: `if (negativePercent > 70%) → alert`
- Critical keyword list: `["money lost", "fraud", "account hacked", "data breach"]`
- Alert channels: Slack webhook, email, browser push notification
- Dashboard mein alert history section

---

#### Feature 15: 📊 Rating Prediction Model

**Kya Hai:** Past weeks ke data se predict karna ki agar current issues fix nahi hue toh next week ka expected average rating kya hoga.

**Kyun Zaroori Hai:** Predictive insights decision-making mein bahut help karte hain. "If crash issues persist, expected rating will drop to 3.2 next week" — yeh actionable intelligence hai.

**Kaise Implement Karein:**
- Historical rating data Mem0 se collect karo
- Simple linear regression ya moving average use karo
- LLM se qualitative prediction generate karao
- Frontend mein prediction card with confidence level

---

## 🗺️ Implementation Priority Matrix

| Priority | Feature | Effort | Impact | Recommendation |
|----------|---------|--------|--------|----------------|
| 🔴 P0 | Sentiment Analysis Dashboard | Medium | 🔥 Very High | **Start Here** |
| 🔴 P0 | Real-Time Progress (SSE) | Medium | 🔥 Very High | Best UX improvement |
| 🔴 P0 | Google Play Store Integration | Medium | 🔥 Very High | Complete picture |
| 🔴 P0 | Week-Over-Week Trends | Medium | 🔥 High | Visual storytelling |
| 🟡 P1 | Slack/Email Delivery | Low | 🔥 High | Quick win |
| 🟡 P1 | Semantic Theme Matching | Medium | 🔥 High | Accuracy boost |
| 🟡 P1 | PDF/CSV Export | Low | 🔥 Medium | Shareability |
| 🟡 P1 | Smart Categorization | Medium | 🔥 Medium | Deep insights |
| 🟡 P1 | Weekly Cron Scheduling | Low | 🔥 Medium | True automation |
| 🟡 P2 | Authentication | High | 🔥 Medium | Production readiness |
| 🟢 P2 | Interactive Chat (RAG) | High | 🔥 High | Very impressive feature |
| 🟢 P2 | Competitor Comparison | High | 🔥 High | Strategic value |
| 🟢 P3 | Multi-Language Support | Low | 🔥 Medium | LLM handles naturally |
| 🟢 P3 | Alert System | Medium | 🔥 Medium | Proactive monitoring |
| 🟢 P3 | Rating Prediction | High | 🔥 Medium | Advanced analytics |

---

## 🎯 Recommended First Sprint (Top 3 Features)

Agar main suggest karun toh pehle yeh 3 features implement karo — maximum impact with reasonable effort:

1. **Sentiment Analysis Dashboard** — Instant visual impact, easy to build
2. **Real-Time Progress Streaming (SSE)** — UX game-changer
3. **Google Play Store Reviews** — Complete the picture

Yeh teeno features mil ke project ko ek **basic review analyzer** se ek **professional product intelligence tool** mein transform kar denge.

> [!TIP]
> Agar koi specific feature implement karna ho toh batao — main uska detailed implementation plan bana dunga with exact code changes!

---

## 🏆 Completed Milestones & Feature Implementation Guide

Humne project ke functional requirements aur priorities ke hisab se niche diye gaye major features ko successfully implement kar liya hai:

### 1. 🔍 Fuzzy Theme Matching (Feature 6)
- **Implementation**: Ek custom, highly optimized local **Jaro-Winkler String Similarity Matcher** algorithm banaya hai in [compare.ts](file:///e:/opencode/project/agent/tools/compare.ts) jiska similarity threshold `>= 0.82` set kiya hai.
- **Benefit**: Yeh semantically close prior themes (jaise "app crash" aur "application freezing") ko match karke persisting issues ko scale pe group karta hai without needing external expensive embedding libraries.

### 2. 🖨️ PDF & CSV Export Controls (Feature 8)
- **PDF Export**: Client-side CSS print media stylesheet rules add kiye hain in [index.css](file:///e:/opencode/project/frontend/src/index.css) jo standard browser print dialogue (`window.print()`) ko invoke karne pe control sidebars, settings aur buttons ko hide kar dete hain aur pure report ko single page printable format mein format karte hain.
- **CSV Export**: Backend Express server par `/api/export/csv` route configure kiya hai jo timeline data ko clean tabular CSV structure mein download ke liye serve karta hai.
- **UI Integrations**: Report aur history segments ke uper active PDF export aur CSV export buttons render kiye hain.

### 3. 🎯 Competitor Comparison (Feature 12)
- **App Parameters**: `fetchReviews` tool aur agent loop ko parameterized kiya hai taaki user dynamically **Groww**, **Zerodha Kite** (Apple: `id1449453802`, Google: `com.zerodha.kite`), aur **Angel One** (Apple: `id1442105151`, Google: `com.msf.angeloneltd`) ke data ko fetch kar sake.
- **Memory Isolation**: Har competitor ka data isolation standard memory namespace scope `groww-weekly-pulse-${app}` ke zariye kiya hai jisse database overlap nahi hota aur competitor charts visual isolation mein load hote hain.

### 4. 🚨 Critical Alerts System (Feature 14)
- **Anomaly Rules**: Agent execution loop ke end mein automated checks lagaye hain jo:
  1. Average rating dips below `3.3`
  2. Negative review sentiment ratio exceeds `40%`
  3. Crash, scam, cheat, freeze, error, server down, login fail aur fraud jaise critical keywords content mein match honge toh flags raise karte hain.
- **Alert Dispatch**: Jab alerts trigger hote hain, toh Slack block payload mein red warning banner append hota hai aur email HTML reports mein aakarshak styling wala red error panel inject hota hai.
