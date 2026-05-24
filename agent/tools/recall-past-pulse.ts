import type { AgentSession } from "../session.js";
import type { Mem0Client } from "../memory.js";

export async function recallPastPulse(
  args: { query?: string },
  session: AgentSession,
  mem0: Mem0Client
): Promise<string> {
  const query = args.query || "Groww weekly review pulse themes prior weeks";
  const memories = await mem0.recall(query);

  session.recalledMemories = memories;
  const weeksFound = [...new Set(memories.map((m) => (m.metadata?.week as string) || "").filter(Boolean))];

  return JSON.stringify({ memories, weeksFound });
}
