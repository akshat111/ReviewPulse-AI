import type { AgentOptions, ChatMessage, Theme, Review, SentimentData } from "./models.js";
import { LLMClient } from "./llm.js";
import { Mem0Client } from "./memory.js";
import { AgentSession } from "./session.js";
import { ToolRegistry } from "./tools/registry.js";
import { renderReport } from "./tools/render-report.js";
import { SYSTEM_PROMPT } from "./prompts.js";

const MAX_TURNS = 12;
const TOOL_CALL_RE = /^\{\s*"tool"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{.*?\})\s*\}/ms;

export async function runAgent(week: string, options: AgentOptions): Promise<{ markdown: string; themes: Theme[]; week: string; appleReviews: Review[]; googleReviews: Review[]; sentiment?: SentimentData }> {
  const app = options.app || "groww";
  const session = new AgentSession(week);
  session.app = app;
  session.appleId = options.appleId;
  session.googleId = options.googleId;
  const llm = new LLMClient();
  const mem0 = new Mem0Client(app);
  const registry = new ToolRegistry(mem0, llm);

  console.error(`[agent] Starting pulse for ${week} (app=${app}, limit=${options.limit}, verbose=${options.verbose})`);

  if (options.onProgress) {
    options.onProgress({
      step: "init",
      status: "done",
      message: `Agent initialized for week ${week} (app: ${app})`,
    });
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Produce the weekly review pulse for week ${week} and competitor app "${app}". Use fetch_reviews for both apple and google with limit ${options.limit} and target app "${app}".` },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (options.verbose) console.error(`[turn ${turn}] Calling LLM...`);

    // Rate-limit delay: Groq free tier allows ~12k TPM
    if (turn > 0) await sleep(2000);

    const response = await llm.complete(messages, undefined, false);

    messages.push({ role: "assistant", content: response.content });

    const toolCall = parseToolCall(response.content);
    if (!toolCall) {
      if (options.verbose) console.error(`[turn ${turn}] No tool call found in response`);
      break;
    }

    const [name, args] = toolCall;
    if (options.verbose) console.error(`[turn ${turn}] Executing: ${name}(${JSON.stringify(args)})`);

    if (options.onProgress) {
      options.onProgress({
        step: name,
        status: "running",
        message: `Agent executing ${name}...`,
        data: args,
      });
    }

    const result = await registry.execute(name, args, session);
    if (options.verbose) console.error(`[turn ${turn}] Result (first 200): ${result.slice(0, 200)}`);

    if (options.onProgress) {
      let customData: any = {};
      if (name === "fetch_reviews") {
        customData = {
          appleCount: session.appleReviews?.length || 0,
          googleCount: session.googleReviews?.length || 0,
        };
      } else if (name === "analyze_sentiment") {
        customData = {
          sentiment: session.sentiment,
        };
      } else if (name === "analyze_themes") {
        customData = {
          themes: session.themes,
        };
      }
      options.onProgress({
        step: name,
        status: "done",
        message: `Successfully executed ${name}`,
        data: customData,
      });
    }

    messages.push({ role: "user", content: `Result of ${name}: ${result}` });

    if (name === "send_report") {
      if (options.verbose) console.error("[agent] send_report called, stopping loop");
      break;
    }
  }

  if (!session.reportRendered) {
    console.error("[agent] Auto-rendering report");
    renderReport(session);
  }

  console.error("[agent] Done");

  return {
    markdown: session.reportMarkdown,
    themes: session.themes || [],
    week: session.week,
    appleReviews: session.appleReviews || [],
    googleReviews: session.googleReviews || [],
    sentiment: session.sentiment || undefined,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseToolCall(content: string | null): [string, Record<string, unknown>] | null {
  if (!content) return null;
  const match = content.match(TOOL_CALL_RE);
  if (!match) return null;
  try {
    const name = match[1];
    const args = JSON.parse(match[2]);
    return [name, args];
  } catch {
    return null;
  }
}
