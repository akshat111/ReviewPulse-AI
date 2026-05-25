import type { AgentSession } from "../session.js";
import type { ToolDefinition, ToolHandler } from "../models.js";
import { schemas } from "./schemas.js";
import { fetchReviews } from "./fetch-reviews.js";
import { recallPastPulse } from "./recall-past-pulse.js";
import { analyzeSentiment } from "./analyze-sentiment.js";
import { analyzeThemes } from "./analyze-themes.js";
import { savePulse } from "./save-pulse.js";
import { renderReport } from "./render-report.js";
import { sendReport } from "./send-report.js";

export class ToolRegistry {
  private handlers = new Map<string, ToolHandler>();
  private schemaList: ToolDefinition[];

  constructor(mem0Client: import("../memory.js").Mem0Client, llmClient: import("../llm.js").LLMClient) {
    this.schemaList = schemas();
    this.register("fetch_reviews", (args, session) => {
      const fullArgs = {
        ...args,
        appleId: (args as any).appleId || session.appleId,
        googleId: (args as any).googleId || session.googleId,
      };
      return fetchReviews(fullArgs as { platform: string; limit: number; appleId?: string; googleId?: string }, session);
    });
    this.register("recall_past_pulse", (args, session) => recallPastPulse(args as { query?: string }, session, mem0Client));
    this.register("analyze_sentiment", (args, session) => analyzeSentiment(args, session));
    this.register("analyze_themes", (_args, session) => analyzeThemes(session, llmClient));
    this.register("save_pulse", (_args, session) => savePulse(session, mem0Client));
    this.register("render_report", (_args, session) => renderReport(session));
    this.register("send_report", (_args, session) => sendReport(session));
  }

  register(name: string, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  async execute(name: string, args: Record<string, unknown>, session: AgentSession): Promise<string> {
    const handler = this.handlers.get(name);
    if (!handler) {
      return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
    try {
      return await handler(args, session);
    } catch (err) {
      return JSON.stringify({ error: `Tool ${name} failed: ${(err as Error).message}` });
    }
  }

  getSchemas(): ToolDefinition[] {
    return this.schemaList;
  }
}
