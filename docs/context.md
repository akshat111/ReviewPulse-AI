# Context — Weekly Review Pulse Agent

## Project Overview
Build a small autonomous CLI agent that produces a weekly "pulse" report for the **Groww** investment app by scraping public App Store reviews, analyzing them with an LLM, and persisting/retrieving results via **Mem0** for cross-week memory comparison.

## Key Requirements (Current Status)

| ID | Requirement | Status |
|----|------------|--------|
| R1 | Accept ISO week label (e.g., `2026-W20`) as CLI input | ✅ Done |
| R2 | Fetch live Groww reviews from Apple App Store (web scrape) | ✅ Done (scrapes `apps.apple.com` — RSS feed returned 0 entries) |
| R3 | Recall prior weekly pulses from Mem0 semantic memory | ✅ Done |
| R4 | Analyze reviews to extract exactly 3 themes with quotes + actions | ✅ Done |
| R5 | Compare new themes against recalled memories (persisting/new/faded) | ✅ Done |
| R6 | Save this week's pulse to Mem0 for future recall | ✅ Done |
| R7 | Render a clean Markdown report to stdout | ✅ Done |
| R8 | Agent must autonomously decide tool invocation order (not hard-coded) | ✅ Done (JSON text protocol: LLM outputs `{"tool":"...","arguments":{}}`) |

## Constraints (Current Status)
- **No frameworks**: No LangChain, CrewAI, AutoGen — plain TypeScript only ✅
- **Five tools only**: fetch_reviews, recall_past_pulse, analyze_themes, save_pulse, render_report ✅
- **Single memory store**: Mem0 only — no SQLite, no JSON files ✅
- **Real data**: Live Apple App Store scraping, no fixtures or mocks ✅ (scrapes `apps.apple.com` page)
- **Structured output**: Theme extraction returns validated JSON ✅

## Tech Stack
| Component | Technology |
|-----------|-----------|
| Language | Node.js 20+ / TypeScript 5+ |
| Runtime | `tsx` (direct TS execution) |
| LLM Provider | Groq (`llama-3.3-70b-versatile`, OpenAI-compatible API) |
| Memory | Mem0 V3 (cloud via REST API, auth: `Token` header) |
| Review Source | Web scrape from `apps.apple.com` (embedded JSON) |
| CLI | `commander` |
| Environment | `.env` with `dotenv` npm |
| Async | Native async/await throughout |
| HTTP | Native `fetch` (Node 20+) |

## External Dependencies (Installed)
- `dotenv`
- `commander`
- `tsx` (dev dependency for TypeScript execution)
- `typescript` (dev dependency)

## Mem0 Usage (V3 API — Adjusted from original context)

| Method | REST Endpoint | Where Used | Purpose |
|--------|--------------|-----------|---------|
| `POST /v3/memories/add/` | Add memory | `save_pulse` | Persist weekly pulse with structured metadata |
| `POST /v3/memories/search/` | Search memories | `recall_past_pulse` | Semantic recall of prior weeks |
| `POST /v3/memories/` | List all | Debug / optional | List all memories for a user_id |

**Auth**: `Authorization: Token <MEM0_API_KEY>` (Bearer token, not Bearer JWT)

## Review Source
- **App ID**: `1404871703`
- **Territory**: `in` (India)
- **Method**: Scrape `https://apps.apple.com/in/app/groww-stocks-mutual-fund-ipo/id1404871703?see-all=reviews`
- **Parsing**: Extract `<script type="application/json" id="serialized-server-data">` → `data[0].data.shelfMapping.allProductReviews.items[*].review`
- **Fields**: `id`, `title`, `contents`, `rating`, `date`
- **Limit**: Returns up to 10 recent reviews per page (Apple limitation without AMP API token)

## Mem0 Configuration
- **user_id**: `groww-weekly-pulse` (static project-wide scope)
- **Agent identifier**: Fixed for all runs so cross-week recall works
- Mem0 REST base: `https://api.mem0.ai/v3`
- **Auth**: `Authorization: Token <key>` (not Bearer, not X-Api-Key)

## Agent Loop Contract (Adjusted)
- System message defines agent role, available tools, and workflow
- User message provides the week label
- Assistant responds with text containing `{"tool":"...","arguments":{...}}` JSON on its own line
- Tool results appended as user-role messages (content text)
- Loop ends when LLM returns no tool call JSON
- Safety cap of 12 turns maximum
- 2s delay between turns + auto-retry on Groq 429 rate limits (up to 3 retries with backoff)

## Theme Comparison Rules (Implemented via `agent/tools/compare.ts`)
- **Persisting**: Exact normalized match between current and prior theme names
- **New**: Current theme with no match in recalled themes
- **Faded**: Prior theme with no match in current themes
- Matching is case-insensitive with whitespace normalization and punctuation stripping

## Expected Output Format
```
# Grow — Weekly Review Pulse (Week YYYY-Wnn)

## Themes this week

 1. **Theme name**
    > "Representative quote"
    → *Action:* action description

## Memory says

 - "Theme" persists from YYYY-Wnn [persisting]
 - "Theme" is new this week [new]
 - "Theme" from YYYY-Wnn did not surface [faded]
```

## Repository Structure
```
project/
├── docs/
│   ├── context.md
│   └── problem-statement.txt
├── agent/
│   ├── index.ts                  # CLI entry (commander, week parsing)
│   ├── loop.ts                   # Agent loop (12 turns, tool parsing, rate-limit)
│   ├── session.ts                # AgentSession (state across turns)
│   ├── llm.ts                    # Groq adapter (raw fetch, auto-retry on 429)
│   ├── memory.ts                 # Mem0 V3 REST client (Token auth)
│   ├── models.ts                 # TypeScript interfaces
│   ├── prompts.ts                # System + extraction prompts
│   └── tools/
│       ├── registry.ts           # Tool registry
│       ├── schemas.ts            # (unused — kept for reference)
│       ├── fetch-reviews.ts      # Web scrape from apps.apple.com
│       ├── recall-past-pulse.ts  # Mem0 recall
│       ├── analyze-themes.ts     # LLM-based theme extraction
│       ├── save-pulse.ts         # Mem0 store
│       ├── render-report.ts      # Markdown report
│       └── compare.ts            # ThemeHistory logic
├── package.json
├── tsconfig.json
├── .env
├── .env.example
└── .gitignore
```

## Build Phases (Completed)
| Phase | Focus | Status |
|-------|-------|--------|
| 0 | Project scaffolding, package.json, tsconfig, .env, gitignore | ✅ |
| 1 | Core infra: session, llm, memory client, prompts | ✅ |
| 2 | Tool layer: all 5 tools implemented | ✅ |
| 3 | Agent loop: orchestration, tool calling, turn management | ✅ |
| 4 | Fix data source: RSS -> mock -> web scrape (real data) | ✅ |
| 5 | Fix tool calling: Groq native tools -> JSON text protocol | ✅ |
| 6 | Mem0 integration: V3 API, memory contrast testing | ✅ |
| 7 | Polish: rate-limit retry, error handling | ✅ |

## Key Deviations from Original Design
1. **Review source**: Apple RSS feed returned 0 entries for Groww → switched to web scraping `apps.apple.com`
2. **LLM provider**: OpenAI/Anthropic → Groq (free tier, `llama-3.3-70b-versatile`)
3. **Tool calling**: Native tool_calls API → JSON text protocol (`{"tool":"...","arguments":{...}}`)
4. **Mem0 API**: V1 endpoints (`/api/v1/memories/`) → V3 endpoints (`/v3/memories/`) with `Token` auth
5. **Rate-limit handling**: Added retry with backoff for Groq 429 errors
6. **Max turns**: Reduced from 20 to 12
7. **Package list**: Stripped unused deps (`openai`, `axios`, `zod`, `app-store-scraper`)
