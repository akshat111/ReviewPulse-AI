# Weekly Review Pulse Agent — Architecture

Detailed system design for the Groww weekly review pulse agent. Derived from context.md and problem-statement.txt.

## Table of contents
1. [Executive summary](#1-executive-summary)
2. [Design principles](#2-design-principles)
3. [System context](#3-system-context)
4. [Logical architecture](#4-logical-architecture)
5. [Physical / deployment view](#5-physical--deployment-view)
6. [Component reference](#6-component-reference)
7. [Agent loop](#7-agent-loop)
8. [Tool layer](#8-tool-layer)
9. [Memory architecture (Mem0)](#9-memory-architecture-mem0)
10. [Data architecture](#10-data-architecture)
11. [External integrations](#11-external-integrations)
12. [Control flows & sequence diagrams](#12-control-flows--sequence-diagrams)
13. [State & session model](#13-state--session-model)
14. [Error handling & resilience](#14-error-handling--resilience)
15. [Security & configuration](#15-security--configuration)
16. [Observability](#16-observability)
17. [Repository structure](#17-repository-structure)
18. [Anti-patterns](#18-anti-patterns)
19. [Evolution & extensions](#19-evolution--extensions)

## 1. Executive summary
The Weekly Review Pulse Agent is a single-process, CLI-driven autonomous agent. It ingests live public App Store reviews for Groww, synthesizes a structured weekly pulse (themes, quotes, actions), compares that pulse against long-term memory stored in Mem0, persists the new pulse, and prints a Markdown report.

There is no application server, no database (beyond what Mem0 manages), and no orchestration framework. The runtime is:
```
CLI → Agent loop (LLM + tool calling) → { RSS, Mem0, LLM APIs } → stdout
```

Autonomy is achieved by exposing five tools and letting the LLM decide invocation order; the implementation must not encode a fixed ETL pipeline.

## 2. Design principles
| Principle | Implication |
|-----------|------------|
| Autonomy over scripts | No fetch → analyze → save hard-coded chain; only tools + loop |
| Minimal surface area | Five tools, one memory namespace, one stdout artifact |
| Plain TypeScript | No LangChain, CrewAI, AutoGen, etc. — teaches the loop directly |
| Memory as product feature | Mem0 is not a cache; cross-week comparison is first-class output |
| Real data | Reviews come from Apple's public RSS at runtime, not fixtures |
| Structured LLM outputs | Theme extraction returns validated JSON, not free-form prose |
| Separation of concerns | Orchestration (loop), capabilities (tools), persistence (Mem0), presentation (render_report) |

## 3. System context

```
┌──────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│  Analyst /   │     │  Weekly Review       │     │  Apple App Store RSS │
│  Student     │────▶│  Pulse Agent         │────▶│  Public JSON feed    │
│  (CLI)       │     │  Autonomous CLI      │     │  for customer        │
└──────────────┘     │  agent with Mem0     │     │  reviews             │
                     │  memory              │     └──────────────────────┘
                     └──────────────────────┘
                              │
                              ▼
                     ┌──────────────────────┐     ┌──────────────────────┐
                     │  LLM Provider        │     │  Mem0                │
                     │  OpenAI / Anthropic  │     │  Long-term semantic  │
                     │  Chat + tool calling  │     │  memory — add/search │
                     └──────────────────────┘     └──────────────────────┘
```

### Actors
- **Human operator**: supplies ISO week label; reads Markdown on stdout.
- **LLM**: planner and executor selector; also used inside analyze_themes for synthesis.
- **Mem0**: durable, semantic store of prior weekly pulses.
- **Apple RSS**: source of truth for review text (India territory, Groww app).

## 4. Logical architecture
Four layers stack vertically. Dependencies flow downward only (upper layers call lower; tools do not call the agent loop).

```
┌─────────────────────────────────────────────────────────────┐
│ Presentation layer                                          │
│ CLI (index.ts) · render_report tool · stdout                │
├─────────────────────────────────────────────────────────────┤
│ Orchestration layer                                         │
│ Agent loop · system prompt · message history · tool router  │
├─────────────────────────────────────────────────────────────┤
│ Capability layer (tools)                                    │
│ fetch_reviews · recall_past_pulse · analyze_themes ·        │
│ save_pulse · render_report                                  │
├─────────────────────────────────────────────────────────────┤
│ Integration layer                                           │
│ fetch (RSS) · Mem0 REST client · LLM HTTP client            │
└─────────────────────────────────────────────────────────────┘
```

### Layer responsibilities
| Layer | Owns | Must not own |
|-------|------|-------------|
| Presentation | Argument parsing, exit codes, final Markdown layout | Business logic for theme matching |
| Orchestration | Turn-taking, tool schema registration, conversation state | RSS parsing, Mem0 wire format |
| Capabilities | Single-purpose operations with stable JSON I/O | Global agent policy (that's the system prompt + loop) |
| Integrations | HTTP, SDK calls, retries at boundary | Theme comparison rules |

## 5. Physical / deployment view
**Deployment model**: developer laptop or CI job — one Node.js process, outbound HTTPS only.

```
┌──────────────────┐
│ Host machine     │
│ ┌────────────┐   │
│ │ npx tsx    │───┼──► api.openai.com / api.anthropic.com
│ │ agent/     │   │
│ │ index.ts   │   │
│ └────────────┘   │
│       │          │
│       ├──────────┼──► itunes.apple.com (RSS)
│       │          │
│       └──────────┼──► Mem0 cloud REST API
└──────────────────┘
```

| Aspect | Choice |
|--------|--------|
| Process model | Single-threaded async (Node.js event loop) |
| State persistence | Mem0 only; no local SQLite for pulses |
| Config | Environment variables + dotenv |
| Runtime | `tsx` for direct TypeScript execution (no build step) |
| Scaling | N/A — batch CLI, not a service |

## 6. Component reference

### 6.1 CLI (`agent/index.ts`)
**Responsibility**: Parse `--week`, validate ISO week format, bootstrap dependencies, invoke agent loop, map failures to exit codes.

| Input | Validation |
|-------|-----------|
| `--week` | Pattern `^\d{4}-W\d{2}$` (e.g. `2026-W20`) |
| Optional `--limit` | Positive int for review fetch cap (default 50) |

**Outputs**: Markdown on stdout; `process.exit(code)` on unrecoverable errors.

### 6.2 Agent loop (`agent/loop.ts`)
**Responsibility**: Maintain `messages[]`, call LLM with tool definitions, execute tool calls, append tool-role messages until the model returns without tool calls.

**Core dependencies (injected)**:
- `llmClient` — chat with tools
- `toolRegistry` — name → callable + JSON schema
- `maxTurns` — safety cap (e.g. 20) to prevent infinite loops

### 6.3 Models (`agent/models.ts`)
Shared TypeScript interfaces/types: `Review`, `Theme`, `Pulse`, `ThemeHistory`, `MemoryHit`, tool result envelopes.

### 6.4 Tool modules (`agent/tools/*.ts`)
Each tool is a pure capability from the LLM's perspective: JSON in, JSON out (stringified for the conversation). Internal TS types are converted at the boundary.

### 6.5 Prompts (`agent/prompts.ts`)
- **System prompt**: role, Groww context, available tools, success criteria (save + render), memory comparison expectation.
- **Theme extraction prompt**: used only inside `analyze_themes`; JSON schema instructions.

### 6.6 Memory client wrapper (`agent/memory.ts`)
Thin facade over Mem0 REST API:
- Fixed `userId = "groww-weekly-pulse"`
- `recall(query)` → `MemoryHit[]`
- `storePulse(week, themes, metadata)` → add result
- `listAll()` → GET all memories for debugging

### 6.7 LLM client (`agent/llm.ts`)
- `complete(messages, tools)` → `AssistantMessage`
- Normalizes OpenAI vs Anthropic tool-call formats into one internal `ToolCall` type.

## 7. Agent loop

### 7.1 Control flow
```
CLI provides week → Build initial messages → LLM call
                                                │
                                    ┌───────────┴────────────┐
                                    │ tool_calls present?     │
                                    └───────────┬────────────┘
                                           Yes  │  No
                                        ┌──────▼──────┐   ┌──────────┐
                                        │ Execute     │   │ Report   │
                                        │ tools       │──▶│ on stdout│
                                        └──────┬──────┘   └──────────┘
                                               │
                                        ┌──────▼──────┐
                                        │ Append tool  │
                                        │ results      │
                                        └──────┬──────┘
                                               │ turn++
                                               │
                                    ┌──────────▼──────────┐
                                    │ Exceeds maxTurns?    │
                                    └──────────┬──────────┘
                                           Yes  │  No → loop
                                          ┌─────▼─────┐
                                          │ Exit error│
                                          └───────────┘
```

### 7.2 Message contract
| Role | Content |
|------|---------|
| system | Agent policy, tool usage hints, Groww/Mem0 context |
| user | "Produce the weekly pulse for week {week}." |
| assistant | Model text and/or `tool_calls` |
| tool | One message per tool call id, JSON-serialized result |

### 7.3 Autonomy boundary
**In scope for the LLM**: order of fetch_reviews, recall_past_pulse, analyze_themes; whether to recall before or after fetch; when to save and render.

**Out of scope (enforced in code)**:
- Tool implementations (deterministic given args)
- RSS URL and app ID (constants in fetch_reviews)
- Mem0 user_id scoping (constant in memory wrapper)
- JSON schema validation in analyze_themes

**Guardrail**: If the loop ends without `render_report` having run, inject a final user nudge or call render_report with session state.

### 7.4 Pseudocode
```typescript
async function runAgent(week: string, limit = 50): Promise<void> {
  const session = new AgentSession(week);
  const messages = buildInitialMessages(week);
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await llm.complete(messages, TOOL_SCHEMAS);
    messages.push(assistantMessage(response));
    if (!response.toolCalls) break;
    for (const call of response.toolCalls) {
      const result = toolRegistry.execute(call.name, call.arguments, session);
      messages.push(toolMessage(call.id, result));
    }
  }
  if (!session.reportRendered) renderReport(session); // guardrail
}
```

## 8. Tool layer

### 8.1 Tool registry
| Property | Description |
|----------|-------------|
| Registration | Map `toolName` → `(handler, openaiSchema)` at startup |
| Dispatch | Parse JSON arguments; catch validation errors; return structured error JSON to LLM |
| Session | Handlers read/write `AgentSession` for cross-tool data |

### 8.2 Tool specifications

#### fetch_reviews
| Property | Value |
|----------|-------|
| **Purpose** | Retrieve recent Groww App Store reviews |
| **Input** | `{ "limit": number }` |
| **Output** | `{ "reviews": Review[], "count": number, "source": "apple_rss" }` |
| **Integration** | `fetch` / `axios` → Apple RSS JSON |
| **Side effects** | None |

**Implementation notes**:
- Base URL: `https://itunes.apple.com/in/rss/customerreviews/id=1404871703/sortby=mostrecent/json`
- Paginate with `/page/{n}/` when limit > ~50
- Skip non-review first entry if it lacks review fields
- Timeout + single retry on 5xx

#### recall_past_pulse
| Property | Value |
|----------|-------|
| **Purpose** | Semantic recall of prior weekly pulses |
| **Input** | `{}` or optional `{ "query": string }` |
| **Output** | `{ "memories": MemoryHit[], "weeksFound": string[] }` |
| **Integration** | Mem0 REST `GET /api/v1/memories/search/` |
| **Side effects** | None |

Default query: "Groww weekly review pulse themes prior weeks".

#### analyze_themes
| Property | Value |
|----------|-------|
| **Purpose** | LLM synthesis of exactly 3 themes from review corpus |
| **Input** | `{ "reviews": Review[] }` or session-backed reviews |
| **Output** | `{ "themes": Theme[3] }` |
| **Integration** | Separate LLM call with JSON-only response format |
| **Side effects** | Updates `session.themes` |

**Validation**: Parse JSON → Zod schema → reject if `themes.length !== 3`.

#### save_pulse
| Property | Value |
|----------|-------|
| **Purpose** | Persist this week's pulse into Mem0 |
| **Input** | `{ "week": string, "themes": Theme[] }` |
| **Output** | `{ "stored": true, "memoryIds": string[] }` |
| **Integration** | Mem0 REST `POST /api/v1/memories/` |
| **Side effects** | Writes long-term memory |

#### render_report
| Property | Value |
|----------|-------|
| **Purpose** | Format and print final Markdown |
| **Input** | `{ "week", "themes", "history": ThemeHistory }` |
| **Output** | `{ "rendered": true, "markdown": string }` (also prints to stdout) |
| **Integration** | None |
| **Side effects** | stdout write; sets `session.reportRendered` |

### 8.3 Typical tool-call graph (not prescriptive)
```
recall_past_pulse → fetch_reviews → analyze_themes → save_pulse → render_report
```

Alternative valid paths:
- `fetch_reviews` before `recall_past_pulse`
- Multiple `fetch_reviews` (discourage via prompt)

### 8.4 OpenAI tool schema shape (example)
```json
{
  "type": "function",
  "function": {
    "name": "fetch_reviews",
    "description": "Fetch the latest N Groww App Store reviews from Apple's public RSS feed.",
    "parameters": {
      "type": "object",
      "properties": {
        "limit": { "type": "integer", "description": "Max reviews to return", "default": 50 }
      },
      "required": ["limit"]
    }
  }
}
```

## 9. Memory architecture (Mem0)

### 9.1 Why Mem0 (vs. a database)
| Concern | Mem0 | Raw DB |
|---------|------|--------|
| Retrieval | Semantic search over natural-language pulses | Requires exact keys or manual SQL |
| Storage | Extracts/consolidates memory from messages | You store blobs yourself |
| Class goal | Demonstrate agent memory, not CRUD | Under-teaches the contrast |

### 9.2 Memory namespace
Single logical tenant for all weekly pulses:
- `user_id`: `"groww-weekly-pulse"`
- Metadata on every add:
  ```json
  {
    "week": "2026-W20",
    "themes": ["App performance & crashes", "Support response delays", "UX gaps for power users"],
    "app": "groww",
    "source": "app_store_rss"
  }
  ```

### 9.3 Lifecycle
1. **Write**: After analysis, `save_pulse` calls `POST /api/v1/memories/` with human-readable summary + structured metadata.
2. **Read**: `recall_past_pulse` calls `GET /api/v1/memories/search/` with a recall-oriented query; returns top-k hits.
3. **Audit**: `GET /api/v1/memories/` for debugging or `--list-memories` CLI flag (optional).

### 9.4 Theme comparison engine
Used by `render_report` to build `ThemeHistory`:

**Input**: `currentThemes[3]`, `recalledMemories[]`
**Output**: `ThemeHistory { persisting, new, faded }`

**Algorithm**:
1. Extract prior themes from Mem0 hits: parse `metadata.themes` or regex/LLM from memory text.
2. Normalize names: lowercase, strip punctuation, collapse whitespace.
3. Match current ↔ prior:
   - Exact normalized match → persisting (attach `fromWeek` from metadata)
   - No match for current → new
   - Prior theme with no current match → faded
4. Optional: embedding cosine similarity above threshold (e.g. 0.85) for fuzzy match.

| Label | User-facing meaning |
|-------|-------------------|
| persisting | Ongoing pain point across weeks |
| new | Emerged this week |
| faded | Prior theme not seen in current review sample |

## 10. Data architecture

### 10.1 Type definitions
```typescript
interface Review {
  id: string;
  title: string;
  content: string;
  rating: number;
  updated: string;
}

interface Theme {
  name: string;
  quote: string;
  action: string;
}

interface Pulse {
  week: string;
  themes: Theme[];  // length === 3
  generatedAt: Date;
}

interface ThemeHistory {
  persisting: [string, string][];  // [themeName, fromWeek]
  new: string[];
  faded: [string, string][];
}
```

### 10.2 Data flow (artifacts)
| Stage | Artifact | Location |
|-------|----------|----------|
| Fetch | Review[] | Tool result → message history → session |
| Recall | MemoryHit[] | Tool result → message history |
| Analyze | Theme[] | Tool result → session |
| Compare | ThemeHistory | Computed at render |
| Persist | Mem0 memory records | Mem0 store |
| Deliver | Markdown string | stdout |

No intermediate files required; optional `--output report.md` is an extension.

## 11. External integrations

### 11.1 Apple App Store RSS
| Parameter | Value |
|-----------|-------|
| App ID | 1404871703 |
| Territory | in |
| Format | JSON |
| Sort | mostrecent |
| Max depth | ~10 pages × ~50 reviews |

RSS → Review mapping:
| RSS field | Review field |
|-----------|-------------|
| `id.label` | `id` |
| `title.label` | `title` |
| `content.label` | `content` |
| `im:rating.label` | `rating` |
| `updated.label` | `updated` |

### 11.2 LLM provider
| Use case | API feature |
|----------|-------------|
| Agent loop | Chat completions + tools / function calling |
| Theme extraction | Chat with `response_format: json_object` (OpenAI) or equivalent |

**Recommendation**: One provider for both to reduce integration surface; same API key.

### 11.3 Mem0 (via REST API)
| Method | HTTP | Used by |
|--------|------|---------|
| Add | `POST /api/v1/memories/` | `save_pulse` |
| Search | `GET /api/v1/memories/search/` | `recall_past_pulse` |
| List | `GET /api/v1/memories/` | Debug / optional audit |

Configure via env: `MEM0_API_KEY`, `MEM0_BASE_URL` (defaults to `https://api.mem0.ai/v1`).

## 12. Control flows & sequence diagrams

### 12.1 First run (no prior memory)
```
CLI          Agent Loop         recall_past    fetch_reviews   analyze      save_pulse   render
│              │                   │               │             │             │           │
│--week W20----▶                   │               │             │             │           │
│              │--recallPast()-----▶               │             │             │           │
│              │◁--memories=[]-----│               │             │             │           │
│              │--fetchReviews()------------------▶│             │             │           │
│              │◁--reviews[50]--------------------│             │             │           │
│              │--analyzeThemes()----------------------------▶│             │           │
│              │◁--themes[3]--------------------------------─│             │           │
│              │--savePulse()------------------------------------------│----▶           │
│              │--renderReport()----------------------------------------------------▶ │
│◁--report-----│                   │               │             │             │           │
```

### 12.2 Second run (memory contrast)
Week 2026-W21 run:
1. `recallPastPulse` returns week 2026-W20 themes from Mem0.
2. Fresh RSS fetch may surface different review text.
3. `analyzeThemes` produces a new triple.
4. `renderReport` marks persisting / new / faded vs. recalled themes.
5. `savePulse` adds week 2026-W21 without deleting week 2026-W20 memories.

This is the class "aha" moment — behavior changes because of Mem0, not because the prompt changed.

## 13. State & session model

`AgentSession` (in-process only):
| Field | Set by |
|-------|--------|
| `week` | CLI |
| `reviews` | `fetchReviews` |
| `recalledMemories` | `recallPastPulse` |
| `themes` | `analyzeThemes` |
| `pulseSaved` | `savePulse` |
| `reportRendered` | `renderReport` |

The LLM does not see `AgentSession` directly; it only sees tool JSON. Session prevents re-fetching and supports guardrails.

## 14. Error handling & resilience
| Failure | Layer | Behavior |
|---------|-------|----------|
| Invalid `--week` | CLI | Exit 2, stderr message |
| RSS timeout / 5xx | `fetchReviews` | Retry once; return `{ "error": "..." }` to LLM |
| Empty reviews | `fetchReviews` | Return count: 0; LLM may still proceed with weak analysis |
| Mem0 unavailable | `recall` / `save` | Return error JSON; system prompt allows degraded report without memory block |
| Invalid theme JSON | `analyzeThemes` | Retry LLM once with "fix JSON"; else fail turn |
| Max turns exceeded | Loop | Exit 1, stderr |
| Missing API keys | Bootstrap | Exit 2 before loop starts |

**Philosophy**: Tools return errors as structured JSON so the agent can recover or explain; only infrastructure failures abort the CLI.

## 15. Security & configuration
| Secret | Usage |
|--------|-------|
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | LLM |
| `MEM0_API_KEY` | Mem0 cloud |

- Never log full API keys or raw review PII in production logs.
- RSS is public data; no user auth to Apple.
- Mem0 `user_id` is a static project scope — not end-user PII.

**.env.example**:
```
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
MEM0_API_KEY=
MEM0_BASE_URL=https://api.mem0.ai/v1
MEM0_USER_ID=groww-weekly-pulse
```

## 16. Observability
Optional structured stderr logs:
```
[turn=2] tool=fetch_reviews duration_ms=340 reviews=50
[turn=3] tool=analyze_themes themes=3
[turn=4] tool=save_pulse memory_ids=["mem_xxx"]
```

No metrics server required. Optional `--verbose` flag enables tool argument/result redaction-aware dumps.

## 17. Repository structure
```
ai-agent-with-mem0/
├── docs/
│   ├── problem-statement.txt
│   ├── context.md
│   ├── architecture.md           # this document
│   ├── implementation-plan.md
│   ├── edge-case.md
│   └── eval.md
├── agent/
│   ├── index.ts                  # CLI entry
│   ├── loop.ts                   # Agent loop
│   ├── session.ts                # AgentSession
│   ├── llm.ts                    # Provider adapter
│   ├── memory.ts                 # Mem0 REST client
│   ├── models.ts                 # TS interfaces
│   ├── prompts.ts                # System + extraction prompts
│   └── tools/
│       ├── registry.ts           # Tool registry
│       ├── schemas.ts            # OpenAI function JSON schemas
│       ├── fetch-reviews.ts
│       ├── recall-past-pulse.ts
│       ├── analyze-themes.ts
│       ├── save-pulse.ts
│       ├── render-report.ts
│       └── compare.ts            # ThemeHistory logic
├── package.json
├── tsconfig.json
├── .env.example
└── .gitignore
```

### Module dependency rule
```
index.ts → loop → { llm, tools, session }
tools → { memory, llm, models, compare }
memory → fetch (Mem0 REST API)
fetch-reviews.ts → fetch (RSS)
loop must not import RSS or Mem0 directly.
```

## 18. Anti-patterns
| Anti-pattern | Why it violates the architecture |
|--------------|---------------------------------|
| Hard-coded fetch → recall → analyze → save → render in JS | Removes autonomy; defeats the class goal |
| Storing pulses in a JSON file instead of Mem0 | Breaks semantic recall demonstration |
| Passing recalled themes only via system prompt, never calling `recall_past_pulse` | Bypasses the Mem0 tool contract |
| Letting the agent loop parse RSS XML | Blurs layers; belongs in `fetch_reviews` |
| Free-form theme output without JSON validation | Fragile `render_report` and comparisons |
| Multiple memory stores (Redis + Mem0) | Scope creep |
| LangChain / AutoGen agent executor | Forbidden by project constraints |

## 19. Evolution & extensions
Possible post-class extensions without changing the core five-tool design:
| Extension | Touch points |
|-----------|-------------|
| `--output path.md` | CLI + render_report |
| Fuzzy theme matching via embeddings | compare.ts |
| Google Play reviews | New tool `fetch_play_reviews` |
| Slack/email delivery | New tool `send_report` |
| Async parallel fetch + analyze | Integration layer only |
| Week-over-week chart | Separate script reading Mem0 `getAll` |

## Related documents
| Document | Role |
|----------|------|
| `problem-statement.txt` | Original class spec and sample output |
| `context.md` | Implementation context, constants, checklists |
| This file | Structural design, flows, components, boundaries |
