# Evaluation Criteria — Weekly Review Pulse Agent

Phase-by-phase evaluation criteria to verify correctness, autonomy, and the Mem0 memory contrast.

---

## Phase 0: Project Scaffolding

| # | Criterion | Pass/Fail | Notes |
|---|-----------|-----------|-------|
| 0.1 | `agent/` and `agent/tools/` directories exist | | |
| 0.2 | `package.json` has required dependencies | | openai, dotenv, commander, zod |
| 0.3 | `tsconfig.json` with strict mode enabled | | |
| 0.4 | `npm run typecheck` passes (no TS errors) | | `tsc --noEmit` exits 0 |
| 0.5 | `.env.example` has all required variables documented | | OPENAI_API_KEY, MEM0_API_KEY, MEM0_USER_ID |
| 0.6 | `.gitignore` covers Node artifacts | | `node_modules`, `.env`, `dist` |

---

## Phase 1: Core Infrastructure

### 1.1 Models
| # | Criterion | Pass/Fail |
|---|-----------|-----------|
| 1.1.1 | `Review` interface has all 5 fields with correct types | |
| 1.1.2 | `Theme` interface has `name`, `quote`, `action` as strings | |
| 1.1.3 | `Pulse` interface has `week`, `themes`, `generatedAt` | |
| 1.1.4 | `ThemeHistory` has `persisting`, `new`, `faded` | |
| 1.1.5 | `MemoryHit` has `memory`, `score`, `metadata` | |

### 1.2 Session
| # | Criterion | Pass/Fail |
|---|-----------|-----------|
| 1.2.1 | `AgentSession` initializes with `week` | |
| 1.2.2 | All fields default to `undefined` except `week` | |
| 1.2.3 | Session fields are mutable (can be set after init) | |

### 1.3 LLM Client
| # | Criterion | Pass/Fail |
|---|-----------|-----------|
| 1.3.1 | `ToolCall` interface has `id`, `name`, `arguments` | |
| 1.3.2 | `AssistantMessage` has `content` and `toolCalls` | |
| 1.3.3 | `LLMClient.complete()` accepts `messages` and `tools` | |
| 1.3.4 | Returns `AssistantMessage` with parsed tool calls | |
| 1.3.5 | Handles empty toolCalls (model chose not to call tools) | |
| 1.3.6 | Normalizes provider-specific formats to internal types | |

### 1.4 Memory Wrapper
| # | Criterion | Pass/Fail |
|---|-----------|-----------|
| 1.4.1 | `Mem0Client` initializes with `MEM0_API_KEY` and `MEM0_BASE_URL` from env | |
| 1.4.2 | `recall(query)` calls Mem0 search endpoint and returns list | |
| 1.4.3 | `storePulse(week, themes, metadata)` POSTs with correct payload | |
| 1.4.4 | `listAll()` returns all memories for user_id | |
| 1.4.5 | Graceful fallback when Mem0 is unavailable | |

### 1.5 Prompts
| # | Criterion | Pass/Fail |
|---|-----------|-----------|
| 1.5.1 | System prompt describes agent role as Groww analyst | |
| 1.5.2 | System prompt lists all 5 tools with usage hints | |
| 1.5.3 | System prompt mentions memory comparison (persisting/new/faded) | |
| 1.5.4 | System prompt specifies success criteria (save + render) | |
| 1.5.5 | Theme extraction prompt requests exactly 3 themes | |
| 1.5.6 | Theme extraction prompt defines JSON schema (name, quote, action) | |

---

## Phase 2: Tool Layer

### 2.1 Tool Schemas
| # | Criterion | Pass/Fail |
|---|-----------|-----------|
| 2.1.1 | Schemas exist for all 5 tools | |
| 2.1.2 | Each schema has `name`, `description`, `parameters` | |
| 2.1.3 | Parameters have correct types and descriptions | |
| 2.1.4 | `getToolSchemas()` returns array of all 5 schemas | |

### 2.2 Tool Registry
| # | Criterion | Pass/Fail |
|---|-----------|-----------|
| 2.2.1 | `ToolRegistry.register(name, handler, schema)` works | |
| 2.2.2 | `ToolRegistry.execute(name, args, session)` dispatches correctly | |
| 2.2.3 | Unknown tool name returns error JSON | |
| 2.2.4 | Handler receives `(args, session)` | |
| 2.2.5 | Handler exceptions caught and returned as error JSON | |

### 2.3 fetch_reviews
| # | Criterion | Pass/Fail |
|---|-----------|-----------|
| 2.3.1 | Fetches reviews from correct RSS URL | |
| 2.3.2 | Handles pagination correctly (`/page/{n}/` URL pattern) | |
| 2.3.3 | Skips first non-review RSS entry | |
| 2.3.4 | Returns correctly typed Review objects | |
| 2.3.5 | Respects `limit` parameter (returns ≤ limit reviews) | |
| 2.3.6 | Deduplicates by review id | |
| 2.3.7 | Stores result in `session.reviews` | |
| 2.3.8 | Returns structured JSON with `reviews`, `count`, `source` | |
| 2.3.9 | Returns error JSON on network/timeout failure | |
| 2.3.10 | Retries once on 5xx status | |

### 2.4 recall_past_pulse
| # | Criterion | Pass/Fail |
|---|-----------|-----------|
| 2.4.1 | Calls Mem0 search endpoint with correct user_id | |
| 2.4.2 | Returns structured JSON with `memories` and `weeksFound` | |
| 2.4.3 | Stores result in `session.recalledMemories` | |
| 2.4.4 | Returns empty result gracefully when no prior memory | |
| 2.4.5 | Handles Mem0 API errors gracefully | |

### 2.5 analyze_themes
| # | Criterion | Pass/Fail |
|---|-----------|-----------|
| 2.5.1 | Uses reviews from argument or `session.reviews` | |
| 2.5.2 | Calls LLM with theme extraction prompt | |
| 2.5.3 | Uses JSON response format | |
| 2.5.4 | Returns exactly 3 themes | |
| 2.5.5 | Each theme has `name`, `quote`, `action` | |
| 2.5.6 | Retries once on invalid JSON | |
| 2.5.7 | Stores result in `session.themes` | |
| 2.5.8 | Returns structured JSON with `themes` array | |
| 2.5.9 | Errors returned as structured JSON (not thrown) | |

### 2.6 save_pulse
| # | Criterion | Pass/Fail |
|---|-----------|-----------|
| 2.6.1 | Uses week/themes from arguments or session | |
| 2.6.2 | POSTs to Mem0 with text and metadata | |
| 2.6.3 | Metadata includes `week`, `themes`, `app`, `source` | |
| 2.6.4 | Sets `session.pulseSaved = true` on success | |
| 2.6.5 | Returns `{ stored: true, memoryIds: [...] }` | |
| 2.6.6 | Returns error JSON on Mem0 failure | |

### 2.7 render_report
| # | Criterion | Pass/Fail |
|---|-----------|-----------|
| 2.7.1 | Uses data from arguments or session | |
| 2.7.2 | Calls `compareThemes()` to build ThemeHistory | |
| 2.7.3 | Prints valid Markdown to stdout | |
| 2.7.4 | Output matches expected format (header + themes + memory) | |
| 2.7.5 | Sets `session.reportRendered = true` | |
| 2.7.6 | Returns `{ rendered: true, markdown: "..." }` | |
| 2.7.7 | Handles empty history (no prior memories) | |

### 2.8 compare_themes
| # | Criterion | Pass/Fail |
|---|-----------|-----------|
| 2.8.1 | Accepts `currentThemes` and `recalledMemories` | |
| 2.8.2 | Extracts prior themes from `metadata.themes` | |
| 2.8.3 | Falls back to regex extraction from memory text | |
| 2.8.4 | Normalizes names (lowercase, strip punctuation) | |
| 2.8.5 | Exact match identifies persisting themes | |
| 2.8.6 | Unmatched current themes marked `new` | |
| 2.8.7 | Unmatched prior themes marked `faded` | |
| 2.8.8 | Returns `ThemeHistory` with correct classifications | |
| 2.8.9 | Empty recalled → all current = new, no persisting/faded | |
| 2.8.10 | All match → all persisting, no new/faded | |

---

## Phase 3: Agent Loop

| # | Criterion | Pass/Fail |
|---|-----------|-----------|
| 3.1 | `createInitialMessages(week)` returns system + user message | |
| 3.2 | Agent loop continues while model returns toolCalls | |
| 3.3 | Agent loop breaks when model returns no toolCalls | |
| 3.4 | Each tool call result is appended as tool-role message | |
| 3.5 | Max turns cap (20) is enforced | |
| 3.6 | Guardrail: if `renderReport` never called, auto-render at end | |
| 3.7 | Top-level exceptions are caught and reported | |
| 3.8 | Session state is preserved and passed between turns | |
| 3.9 | Tool errors don't crash the loop (returned as message) | |

**Autonomy test**: Run the loop with all real tools. Verify the LLM decides tool order (observed in verbose logs). The order should differ at least sometimes from a simple linear sequence.

---

## Phase 4: CLI Entry Point

| # | Criterion | Pass/Fail |
|---|-----------|-----------|
| 4.1 | `npx tsx agent/index.ts --week 2026-W20` parses args correctly | |
| 4.2 | `--week` validation rejects `bad-format` | |
| 4.3 | `--limit` defaults to 50 when not provided | |
| 4.4 | Missing required env vars produces exit code 2 | |
| 4.5 | `.env` is loaded automatically | |
| 4.6 | `--help` produces useful usage text | |
| 4.7 | Exit codes: 0 = success, 1 = runtime error, 2 = config error | |

---

## Phase 5: Memory Contrast ("Aha" Moment)

| # | Criterion | Pass/Fail |
|---|-----------|-----------|
| 5.1 | First run with no prior Mem0 data shows empty memory section | |
| 5.2 | After first run, Mem0 has stored pulse with correct metadata | |
| 5.3 | Second run with different week recalls prior pulse | |
| 5.4 | Second run output includes "Memory says:" section | |
| 5.5 | Theme classifications (persisting/new/faded) are semantically correct | |
| 5.6 | Running same week twice shows consistent persisting classification | |
| 5.7 | Report formatting matches spec (no raw JSON leakage) | |

**Critical test**: The contrast must be visible and meaningful — not just "no prior memory" vs "has prior memory". The agent should correctly identify which themes persisted across weeks.

---

## Phase 6: Error Handling & Edge Cases

| # | Criterion | Pass/Fail |
|---|-----------|-----------|
| 6.1 | No tool raises unhandled exception (all return error JSON) | |
| 6.2 | RSS timeout returns graceful error, not crash | |
| 6.3 | Empty RSS feed produces degraded report, not crash | |
| 6.4 | Mem0 failure produces report without memory section | |
| 6.5 | LLM failure in analyze_themes returns error, retries once | |
| 6.6 | Max turns exceeded produces informative error | |
| 6.7 | `--verbose` prints tool call details | |
| 6.8 | Invalid tool arguments return structured error to LLM | |
| 6.9 | System continues even when review count is 0 | |

---

## Phase 7: Documentation & Polish

| # | Criterion | Pass/Fail |
|---|-----------|-----------|
| 7.1 | All public functions have JSDoc comments | |
| 7.2 | `edge-case.md` documents all corner cases | |
| 7.3 | `eval.md` evaluation criteria written | |
| 7.4 | `README.md` has setup, usage, and example output | |
| 7.5 | Unit tests pass for models, compare, fetch-reviews (mocked) | |
| 7.6 | Integration test with mocked tools passes | |

---

## Overall Acceptance Criteria

| # | Criterion | How to Verify |
|---|-----------|-------------|
| A1 | Agent runs from CLI with `--week` | `npx tsx agent/index.ts --week 2026-W20` |
| A2 | Agent produces valid Markdown report on stdout | Check output format matches spec |
| A3 | Report shows 3 themes with quotes + actions | Visual inspection |
| A4 | Report includes "Memory says:" with persisting/new/faded | Visual inspection (second run) |
| A5 | Agent completes without hard-coded tool order | Check verbose logs: tool order varies from linear |
| A6 | Second run with different week shows different memory section | Run `--week 2026-W19` then `--week 2026-W20` |
| A7 | No framework dependencies (no LangChain, etc.) | Check `package.json` dependencies |
| A8 | All 5 tools are called at least once in successful run | Check verbose logs |
| A9 | TypeScript compiles with strict mode, no errors | `npm run typecheck` exits 0 |
