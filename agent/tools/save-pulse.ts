import type { AgentSession } from "../session.js";
import type { Mem0Client } from "../memory.js";

export async function savePulse(session: AgentSession, mem0: Mem0Client): Promise<string> {
  if (!session.themes) {
    return JSON.stringify({ error: "No themes to save. Run analyze_themes first." });
  }

  const themeNames = session.themes.map((t) => t.name);
  const metadata: Record<string, any> = {
    themes: themeNames,
  };

  if (session.sentiment) {
    metadata.averageRating = session.sentiment.averageRating;
    metadata.positive = session.sentiment.positive;
    metadata.neutral = session.sentiment.neutral;
    metadata.negative = session.sentiment.negative;
  }

  const memoryIds = await mem0.storePulse(session.week, session.themes, metadata);

  session.pulseSaved = true;
  return JSON.stringify({ stored: memoryIds.length > 0, memoryIds });
}
