# Edge Cases — Weekly Review Pulse Agent

Living document covering corner cases, failure modes, and boundary conditions.

---

## Status Key
- ✅ Implemented
- ⚠️ Partially implemented
- ❌ Not implemented yet

---

## 1. CLI / Configuration

| Edge Case | Expected Behavior | Status |
|-----------|------------------|--------|
| `--week` missing | Commander error, exit 2 | ✅ (requiredOption) |
| `--week` format wrong | Validation fails, exit 2 with message | ✅ |
| `--limit` is 0 or negative | Clamped to 1-500 by tool | ✅ |
| `--limit` extremely large | Capped at 500; warn | ✅ |
| Missing `.env` file | dotenv runs silently; API key check catches missing keys | ✅ |
| Missing LLM API key | Check at startup, exit 2 | ✅ |
| Missing Mem0 API key | Warning only — agent runs without memory | ✅ |
| `--verbose` and `--quiet` both set | Not implemented — only --verbose exists | ⚠️ (no quiet flag) |

## 2. Review Fetch (web scrape from apps.apple.com)

| Edge Case | Expected Behavior | Status |
|-----------|------------------|--------|
| Page returns 404/500 | Retry once, then return error JSON | ✅ |
| Page returns 429 (rate limit) | Retry with 3s delay once | ✅ |
| Request times out (>15s) | AbortController with retry | ✅ |
| Page returns empty/malformed | JSON parse error caught | ✅ |
| Missing serialized-server-data | Return error JSON with `count: 0` | ✅ |
| Unexpected JSON structure | Guarded access with optional chaining | ✅ |
| Less reviews than limit | Return whatever is available | ✅ |
| Zero reviews total | Return empty list | ✅ |
| Network disconnected | try/catch returns error JSON with retry | ✅ |
| HTML error page returned as 200 | `serialized-server-data` regex won't match → error | ⚠️ (would fail gracefully) |

## 3. LLM / AI Analysis

| Edge Case | Expected Behavior | Status |
|-----------|------------------|--------|
| LLM returns invalid JSON | Retry once with same prompt; if still fails → error | ✅ (up to 2 retries) |
| LLM returns fewer than 3 themes | Retry; if persists → error | ⚠️ (retries but no placeholder padding) |
| LLM returns more than 3 themes | Truncate to first 3 | ✅ |
| LLM returns empty/missing `name` | Reject that attempt; retry | ✅ |
| LLM returns empty `quote` | Allowed (empty string) | ✅ |
| LLM returns empty `action` | Allowed (empty string) | ✅ |
| LLM API key expires / quota exhausted | 401/429 → caught, retried with backoff | ✅ |
| LLM API is slow (>30s) | AbortController timeout with retry | ✅ |
| LLM context window exceeded | Reviews truncated to 20 items | ⚠️ (individual long reviews not truncated) |
| LLM hallucinates quotes not in reviews | Prompt instructs real quotes; can't fully prevent | ⚠️ |
| LLM responds in non-English | Prompt instructs English; no enforcement | ❌ |
| Review text contains PII | No redaction logic | ❌ |

## 4. Mem0 Memory

| Edge Case | Expected Behavior | Status |
|-----------|------------------|--------|
| Mem0 API key invalid | Empty results; agent proceeds without memory | ✅ |
| Mem0 API returns 429 (rate limit) | No retry; returns empty results | ❌ |
| Mem0 API is down / unreachable | try/catch returns empty results | ✅ |
| `search()` returns no results (first run) | Empty arrays; all themes marked `new` | ✅ |
| `add()` fails after analysis | Returns empty IDs; agent proceeds | ✅ |
| Same week run twice | Creates duplicate memories (no dedup) | ❌ |
| Stale/irrelevant memories from other apps | Fixed user_id prevents cross-app pollution | ✅ |

## 5. Theme Comparison

| Edge Case | Expected Behavior | Status |
|-----------|------------------|--------|
| No prior memories (first run) | All 3 themes marked `new` | ✅ |
| All 3 themes match prior run | All `persisting` | ✅ |
| All 3 themes completely different | All `new`; prior themes `faded` | ✅ |
| Partial overlap (1 persists) | Correctly classify each | ✅ |
| Same theme different wording | Exact match fails → false split | ⚠️ (no fuzzy matching) |
| Special characters in names | Normalization strips punctuation | ✅ |
| Case sensitivity | Lowercased during normalization | ✅ |
| Leading/trailing whitespace | Trimmed during normalization | ✅ |
| Prior run had 2 themes stored | Adapts correctly | ✅ |

## 6. Agent Loop

| Edge Case | Expected Behavior | Status |
|-----------|------------------|--------|
| LLM calls `renderReport` multiple times | Guardrail stops loop after first call | ✅ |
| LLM never calls `renderReport` | Auto-render at loop end | ✅ |
| LLM calls `savePulse` before `fetchReviews` | Error: "No themes to save" | ✅ |
| LLM calls `analyzeThemes` before `fetchReviews` | Error: "No reviews to analyze" | ✅ |
| LLM calls tools in nonsensical order | Allowed; tools validate preconditions | ✅ |
| Max turns (12) exceeded | Loop ends; guardrail auto-renders | ✅ |
| Same tool called repeatedly | Allowed but wasteful; session stores results | ⚠️ (not prevented) |
| Message history too large for LLM context | No pruning logic | ❌ |
| Tool returns very large JSON | Passed to LLM as-is (10 reviews is fine) | ⚠️ (no truncation for large payloads) |

## 7. Output / Report

| Edge Case | Expected Behavior | Status |
|-----------|------------------|--------|
| stdout piped or redirected | Works without TTY | ✅ |
| Multi-line quotes in report | Blockquote formatting | ✅ |
| Non-ASCII / Unicode text | Node.js UTF-8 | ✅ |

## 8. Cross-Platform

| Edge Case | Expected Behavior | Status |
|-----------|------------------|--------|
| Windows newlines in review text | No normalization | ❌ |
| File path separators | Not applicable (no file output) | ✅ |
| Unicode/emoji in review titles | JSON.stringify safely encodes | ✅ |

## Known Gaps (Future Work)
1. **PII redaction** in review content before LLM processing
2. **Fuzzy theme matching** via embedding similarity for better comparison
3. **Duplicate week detection** before writing to Mem0
4. **Message pruning** for very long agent conversations
5. **More than 10 reviews** — currently limited by Apple's `see-all=reviews` page
