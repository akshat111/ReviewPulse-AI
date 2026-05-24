import type { AgentSession } from "../session.js";
import type { LLMClient } from "../llm.js";
import type { Theme } from "../models.js";
import { THEME_EXTRACTION_PROMPT } from "../prompts.js";

const MAX_RETRIES = 2;

export async function analyzeThemes(session: AgentSession, llm: LLMClient): Promise<string> {
  if (!session.reviews || session.reviews.length === 0) {
    return JSON.stringify({ error: "No reviews to analyze. Call fetch_reviews first." });
  }

  const reviewText = session.reviews
    .slice(0, 20)
    .map((r) => `- [${r.rating}/5] ${r.title}: ${r.content}`)
    .join("\n");

  const messages = [
    { role: "user" as const, content: THEME_EXTRACTION_PROMPT + "\n" + reviewText },
  ];

  const themes = await tryExtract(messages, llm, MAX_RETRIES);
  if (themes) {
    session.themes = themes;
    return JSON.stringify({ themes });
  }

  return JSON.stringify({ error: "Failed to extract themes after retry. Use placeholder themes." });
}

function extractJSON(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/\s*```/g, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function tryExtract(
  messages: { role: "user"; content: string }[],
  llm: LLMClient,
  retries: number
): Promise<Theme[] | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await llm.complete(messages, undefined, false);
    if (!res.content) continue;

    const parsed = extractJSON(res.content);
    if (!parsed) continue;

    const themesRaw = parsed.themes;
    if (!Array.isArray(themesRaw) || themesRaw.length === 0) continue;

    const themes = themesRaw.slice(0, 3).map((t: unknown) => {
      const th = t as { name?: string; quote?: string; action?: string };
      return { name: th.name || "Unknown theme", quote: th.quote || "", action: th.action || "" };
    });

    if (themes.some((t) => !t.name)) continue;
    return themes;
  }

  return null;
}
