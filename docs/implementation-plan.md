# Implementation Plan — Weekly Review Pulse Agent

Phase-wise breakdown for building the autonomous CLI agent with Mem0 long-term memory in Node.js/TypeScript.

---

## Phase 0: Project Scaffolding & Configuration

**Goal**: Set up the TypeScript project skeleton, environment, and dependencies.

| # | Task | Details | Files |
|---|------|---------|-------|
| 0.1 | Create project structure | Create `agent/`, `agent/tools/`, `docs/` directories | (folder structure) |
| 0.2 | Initialize npm project | `npm init -y` | `package.json` |
| 0.3 | Configure TypeScript | `tsconfig.json` with `target: ES2022`, `module: NodeNext`, `strict: true` | `tsconfig.json` |
| 0.4 | Install dependencies | `npm install openai dotenv commander zod` | `package.json` |
| 0.5 | Install dev dependencies | `npm install -D typescript tsx @types/node vitest` | `package.json` |
| 0.6 | Create environment template | Write `.env.example` with OPENAI_API_KEY, ANTHROPIC_API_KEY, MEM0_API_KEY | `.env.example` |
| 0.7 | Create `.gitignore` | Node gitignore (node_modules, .env, dist, *.tsbuildinfo) | `.gitignore` |
| 0.8 | Add npm scripts | `"start": "tsx agent/index.ts"`, `"test": "vitest"`, `"typecheck": "tsc --noEmit"` | `package.json` |

**Verification**: `npx tsx -e "import './agent/models'"` succeeds.

---

## Phase 1: Data Models & Core Infrastructure

**Goal**: Define all shared data types, session state, LLM client, and Mem0 wrapper.

### 1.1 Models (`agent/models.ts`)
| Task | Details |
|------|---------|
| Define `Review` interface | Fields: `id: string`, `title: string`, `content: string`, `rating: number`, `updated: string` |
| Define `Theme` interface | Fields: `name: string`, `quote: string`, `action: string` |
| Define `Pulse` interface | Fields: `week: string`, `themes: Theme[]`, `generatedAt: Date` |
| Define `ThemeHistory` interface | Fields: `persisting: [string, string][]`, `new: string[]`, `faded: [string, string][]` |
| Define `ToolResult` type | `{ success: boolean; data?: any; error?: string }` |
| Define `MemoryHit` interface | Fields: `memory: string`, `score: number`, `metadata: Record<string, any>` |

### 1.2 Session (`agent/session.ts`)
| Task | Details |
|------|---------|
| Define `AgentSession` class | Fields: `week`, `reviews`, `recalledMemories`, `themes`, `pulseSaved`, `reportRendered` |
| Constructor `constructor(week: string)` | Initialize with week string, all others as `undefined`/`null` |
| All fields are public | Simple mutable state object |

### 1.3 LLM Client (`agent/llm.ts`)
| Task | Details |
|------|---------|
| Define `ToolCall` interface | Fields: `id: string`, `name: string`, `arguments: Record<string, any>` |
| Define `AssistantMessage` interface | Fields: `content: string | null`, `toolCalls: ToolCall[]` |
| Implement `LLMClient` class | Constructor takes `model: string`, `apiKey: string`, `provider: 'openai' | 'anthropic'` |
| Implement `complete(messages, tools)` | Calls OpenAI/Anthropic chat completions API with tool schemas |
| Normalize provider response | Convert provider-specific tool call format to internal `ToolCall` type |
| No streaming | Simple async response for class |

**Verification**: Unit test with mock API response.

### 1.4 Memory Wrapper (`agent/memory.ts`)
| Task | Details |
|------|---------|
| Implement `Mem0Client` class | Constructor reads `MEM0_API_KEY`, `MEM0_BASE_URL` from env |
| Implement `recall(query, limit=5)` | `GET /api/v1/memories/search/?q=...&user_id=...` returns `MemoryHit[]` |
| Implement `storePulse(week, themes, metadata)` | `POST /api/v1/memories/` with JSON body |
| Implement `listAll()` | `GET /api/v1/memories/?user_id=...` for debugging |
| Handle Mem0 unavailability | Graceful error; return empty results |
| Use native `fetch` | Node 20+ has built-in fetch; no axios needed |

**Verification**: Unit test with mocked fetch.

### 1.5 Prompts (`agent/prompts.ts`)
| Task | Details |
|------|---------|
| Export `SYSTEM_PROMPT` constant | Agent role (Groww analyst), tool descriptions, success criteria, memory comparison expectation |
| Export `THEME_EXTRACTION_PROMPT` constant | Instructions for analyzing reviews and returning exactly 3 themes with quote + action in JSON |

---

## Phase 2: Tool Layer

**Goal**: Implement all five tools as standalone async functions with JSON I/O.

### 2.1 Tool Schemas (`agent/tools/schemas.ts`)
| Task | Details |
|------|---------|
| Export `getToolSchemas()` | Returns array of OpenAI-compatible function schemas for all 5 tools |
| Each schema includes | `name`, `description`, `parameters` with typed properties |
| Reusable helper | `toolParam(name, type, description, required)` pattern |

### 2.2 Tool Registry (`agent/tools/registry.ts`)
| Task | Details |
|------|---------|
| Define `ToolRegistry` class | Maps `name → { handler, schema }` |
| `register(name, handler, schema)` | Adds tool to registry |
| `execute(name, args, session)` | Dispatches call; returns JSON string |
| `getSchemas()` | Returns all schemas for LLM |
| Error handling | Catch JSON parse errors, validation errors, runtime errors → structured error JSON |

### 2.3 Fetch Reviews (`agent/tools/fetch-reviews.ts`)
| Task | Details |
|------|---------|
| Implement `fetchReviews(limit=50, session?)` | |
| Build RSS URL | `https://itunes.apple.com/in/rss/customerreviews/id=1404871703/sortby=mostrecent/json` |
| Handle pagination | Append `/page/{n}/` when limit > 50 |
| Parse JSON response | Extract Review objects from RSS feed entry |
| Skip first non-review entry | RSS sometimes has a non-review first element |
| Field mapping | `id.label` → id, `title.label` → title, etc. |
| Error handling | Timeout, retry once on 5xx, return structured error |
| Truncate results | Respect the `limit` parameter |
| Store in session | `session.reviews = result` |

**Verification**: `npx tsx -e "import { fetchReviews } from './agent/tools/fetch-reviews'; console.log(await fetchReviews(5))"`

### 2.4 Recall Past Pulse (`agent/tools/recall-past-pulse.ts`)
| Task | Details |
|------|---------|
| Implement `recallPastPulse(query?, session?)` | |
| Default query | "Groww weekly review pulse themes prior weeks" |
| Call `mem0.search(query)` | Internal through Mem0Client |
| Format output | List of memories with score, text, metadata |
| Store in session | `session.recalledMemories = result` |
| Handle empty results | Return `{ memories: [], weeksFound: [] }` |

### 2.5 Analyze Themes (`agent/tools/analyze-themes.ts`)
| Task | Details |
|------|---------|
| Implement `analyzeThemes(reviews?, session?)` | |
| Get reviews | From argument or from `session.reviews` |
| Call LLM | Separate chat completion with `THEME_EXTRACTION_PROMPT` + JSON mode |
| Validate output | Parse JSON with Zod schema; verify exactly 3 themes with all fields |
| Handle invalid JSON | Retry once with "fix the JSON" instruction |
| Store in session | `session.themes = result` |
| Return `{ themes: [...] }` | Structured result |

### 2.6 Save Pulse (`agent/tools/save-pulse.ts`)
| Task | Details |
|------|---------|
| Implement `savePulse(week?, themes?, session?)` | |
| Get data | From arguments or from `session.week` and `session.themes` |
| Build memory text | Human-readable summary: "Weekly pulse for {week}: themes were {names}..." |
| Build metadata | `{ week, themes: themeNames, app: "groww", source: "app_store_rss" }` |
| Call `mem0.add(text, userId, metadata)` | Through Mem0Client |
| Mark session | `session.pulseSaved = true` |
| Return `{ stored: true, memoryIds: [...] }` | |

### 2.7 Render Report (`agent/tools/render-report.ts`)
| Task | Details |
|------|---------|
| Implement `renderReport(week?, themes?, session?)` | |
| Get data | From arguments or from session |
| Build `ThemeHistory` | Call `compareThemes(currentThemes, recalledMemories)` |
| Format Markdown | Header + theme list (name, quote, action) + "Memory says:" block |
| Print to stdout | `console.log(markdown)` |
| Mark session | `session.reportRendered = true` |
| Return `{ rendered: true, markdown: "..." }` | |

### 2.8 Theme Comparison (`agent/tools/compare.ts`)
| Task | Details |
|------|---------|
| Implement `compareThemes(currentThemes, recalledMemories)` | |
| Extract prior themes | From `metadata.themes` in each MemoryHit |
| Normalize names | Lowercase, strip punctuation, collapse whitespace |
| Match algorithm | Exact match first; optional fuzzy fallback |
| Build `ThemeHistory` | Tuple of `[themeName, fromWeek]` for persisting/faded, strings for new |
| Return `ThemeHistory` | |

**Verification**: Unit test with known current and prior theme lists.

---

## Phase 3: Agent Loop

**Goal**: Implement the autonomous orchestration loop that ties everything together.

### 3.1 Agent Loop (`agent/loop.ts`)
| Task | Details |
|------|---------|
| Implement `createInitialMessages(week)` | Build system + user message for the LLM |
| Implement `runAgent(week, limit=50)` | Main async orchestration function |
| Initialize `AgentSession(week)` | |
| Initialize `ToolRegistry` | Register all 5 tools |
| Initialize `LLMClient` | From env config |
| Loop (max 20 turns) | |
| Call LLM | `await llm.complete(messages, toolSchemas)` |
| Check for toolCalls | If none → break |
| Execute each tool call | `toolRegistry.execute(name, args, session)` |
| Append tool results | `messages.push({ role: "tool", ... })` |
| Handle max turns exceeded | Log warning, exit gracefully |
| Guardrail check | If `session.reportRendered` is false after loop → auto-render |
| Wrap in try/catch | Catch and report top-level errors |

### 3.2 Message History Management
| Task | Details |
|------|---------|
| Message append pattern | Append assistant message + tool messages as separate entries |
| Tool result format | `JSON.stringify()` for each tool call response |
| Context window management | Optional: summarize old turns if exceeded (stretch) |

**Verification**: Integration test with mocked tools that return well-known data; verify the loop stops after render.

---

## Phase 4: CLI Entry Point

**Goal**: Wire up the CLI to invoke the agent.

### 4.1 CLI (`agent/index.ts`)
| Task | Details |
|------|---------|
| Set up `commander` | `--week` (required), `--limit` (optional, default 50), `--verbose` (optional) |
| Validate week format | Regex: `^\d{4}-W\d{2}$` |
| Load `.env` | `dotenv.config()` at startup |
| Check required env vars | OPENAI_API_KEY or ANTHROPIC_API_KEY, MEM0_API_KEY; exit 2 if missing |
| Call `runAgent(week, limit)` | |
| Handle exceptions | Map to exit codes (1 = runtime error, 2 = config/arg error) |
| Entry point | `main().catch(...)` |

**Verification**: `npx tsx agent/index.ts --week 2026-W20` runs end-to-end (will fail at API calls without keys, but arg parsing works).

---

## Phase 5: Theme Comparison & Memory Demonstration

**Goal**: Make the "aha" moment work — run twice and see different output.

### 5.1 Comparison Engine Polish
| Task | Details |
|------|---------|
| Test exact match normalization | Lowercase, punctuation stripping, whitespace collapsing |
| Test edge cases | Empty recalled, empty current, single matching |
| Format output | "Theme name persists from YYYY-Wnn [persisting]" etc. |

### 5.2 Two-Run Testing
| Task | Details |
|------|---------|
| Run 1: `npx tsx agent/index.ts --week 2026-W19` | Observe output, verify saved to Mem0 |
| Run 2: `npx tsx agent/index.ts --week 2026-W20` | Observe persisting/new/faded in report |
| Verify contrast | Memory section shows different classification |

### 5.3 Mem0 Debug Utilities
| Task | Details |
|------|---------|
| Optional `--list-memories` flag | Calls `mem0.listAll()` and prints all stored pulses |
| Optional `--clear-memories` flag | For testing; clear all stored data (use with caution) |

---

## Phase 6: Error Handling, Edge Cases & Polish

**Goal**: Make the agent robust for production-like use.

### 6.1 Error Handling Pass
| Task | Details |
|------|---------|
| Handle RSS feed unavailability | Retry logic, graceful degradation |
| Handle empty review corpus | Agent informed; proceeds with weak analysis |
| Handle Mem0 API failures | Agent proceeds without memory block |
| Handle LLM API failures | Retry once, then fail gracefully |
| Handle invalid tool arguments | Return structured error to LLM, let it correct |
| Handle theme parsing failures | Retry LLM with fix instruction |

### 6.2 Edge Cases
| Task | Details |
|------|---------|
| Very long reviews | Truncate to reasonable length before LLM context window |
| Non-English reviews | Pass through; theme extraction should handle |
| Duplicate reviews | Deduplicate by review `id` in fetch_reviews |
| Special characters in review text | JSON-encode safely |
| Week label edge cases | `2026-W01`, `2026-W52`, boundary checks |
| Multiple sequential runs without prior memory | First run shows no memory; second shows contrast |
| Degraded mode | Agent still produces report even if Mem0 or RSS is down |

### 6.3 Logging & Observability
| Task | Details |
|------|---------|
| Add `--verbose` flag | Print tool call details, durations, turn count |
| Add debug logging | `console.error` structured logs to stderr |
| Print summary at end | Turn count, tools called, timing |

---

## Phase 7: Documentation & Final Polish

### 7.1 Documentation
| Task | Details |
|------|---------|
| Write `edge-case.md` | Corner cases, failure scenarios (this file) |
| Write `eval.md` | Evaluation criteria for each phase |
| Update `README.md` | Project overview, setup, usage, expected output |
| Add JSDoc comments | For all public functions and classes |

### 7.2 Testing
| Task | Details |
|------|---------|
| Unit tests for models | Interface instantiation, type checks |
| Unit tests for compare.ts | All theme matching scenarios |
| Unit tests for fetch-reviews | With mocked fetch responses |
| Unit tests for analyze-themes | With mocked LLM responses |
| Integration test for loop | With mocked tools |
| End-to-end smoke test | Real run with --week (requires API keys) |
| Test runner | `vitest` |

**Verification**: All tests pass; `npm test` exits 0.

---

## Summary Phase Timeline

| Phase | Dependencies | Estimated Effort |
|-------|-------------|-----------------|
| 0: Scaffolding | None | Small |
| 1: Core Infrastructure | Phase 0 | Medium |
| 2: Tool Layer | Phase 1 | Large |
| 3: Agent Loop | Phase 2 | Medium |
| 4: CLI Entry | Phase 3 | Small |
| 5: Memory Contrast | Phase 4 | Small |
| 6: Error Handling | Phase 5 | Medium |
| 7: Documentation | Phase 6 | Medium |

**Total**: ~7 phases, ordered by dependency. Phase 2 is the largest — implementing all 5 tools.
