import type { ChatMessage, ToolDefinition, AssistantMessage, ToolCall } from "./models.js";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10_000;

export class LLMClient {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor() {
    if (process.env.GEMINI_API_KEY) {
      this.apiKey = process.env.GEMINI_API_KEY;
      this.baseUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
      this.model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      console.error(`[llm] Gemini API detected. Using OpenAI-compatible endpoint with model: ${this.model}`);
    } else {
      this.apiKey = process.env.OPENAI_API_KEY || "";
      this.baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
      this.model = process.env.OPENAI_MODEL || "llama-3.3-70b-versatile";
    }
  }

  async complete(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    jsonMode = false
  ): Promise<AssistantMessage> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    };

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);

      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}/chat/completions`, {
          signal: controller.signal,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        });
      } catch (fetchErr) {
        clearTimeout(timer);
        const msg = (fetchErr as Error).message;
        if (msg.includes("aborted") || msg.includes("timeout")) {
          console.error(`[llm] Request timed out after 30s (attempt ${attempt + 1}/${MAX_RETRIES})`);
          if (attempt < MAX_RETRIES - 1) {
            await sleep(RETRY_DELAY_MS);
            continue;
          }
        }
        throw fetchErr;
      }
      clearTimeout(timer);

      if (res.ok) {
        const data = (await res.json()) as {
          choices?: { message?: { content?: string | null; tool_calls?: unknown[] } }[];
        };

        const choice = data.choices?.[0];
        if (!choice?.message) throw new Error("No response from LLM");

        const msg = choice.message;

        const toolCalls: ToolCall[] = (msg.tool_calls || []).map((tc: unknown) => {
          const t = tc as { id: string; function: { name: string; arguments: string } };
          let parsed: Record<string, unknown>;
          try {
            const raw = t.function.arguments || "{}";
            parsed = raw === "null" ? {} : JSON.parse(raw);
          } catch {
            parsed = {};
          }
          return { id: t.id, name: t.function.name, arguments: parsed };
        });

        return { content: msg.content ?? null, toolCalls };
      }

      const errText = await res.text().catch(() => "unknown");

      if (res.status === 429 && attempt < MAX_RETRIES - 1) {
        const delayMs = RETRY_DELAY_MS * (attempt + 1);
        console.error(`[llm] Rate limited (429), retrying in ${delayMs / 1000}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delayMs);
        continue;
      }

      throw new Error(`LLM API error ${res.status}: ${errText.slice(0, 300)}`);
    }

    throw new Error("LLM API failed after max retries");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
