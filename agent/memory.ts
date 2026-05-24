import type { Theme, MemoryHit } from "./models.js";

const MEM0_BASE = (process.env.MEM0_BASE_URL || "https://api.mem0.ai/v3").replace(/\/+$/, "");

interface Mem0SearchItem {
  id: string;
  memory: string;
  score?: number;
  metadata?: Record<string, unknown>;
  categories?: string[];
  created_at?: string;
  updated_at?: string;
}

export class Mem0Client {
  private apiKey: string;
  private userId: string;
  private app: string;
  private enabled: boolean;

  constructor(app = "groww") {
    this.apiKey = process.env.MEM0_API_KEY || "";
    this.app = app;
    this.userId = `${process.env.MEM0_USER_ID || "groww-weekly-pulse"}-${app}`;
    this.enabled = !!this.apiKey;
  }

  private authHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Token ${this.apiKey}`,
    };
  }

  async recall(query: string, limit = 5): Promise<MemoryHit[]> {
    if (!this.enabled) return [];
    try {
      const res = await fetch(`${MEM0_BASE}/memories/search/`, {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify({
          query,
          filters: { user_id: this.userId },
          top_k: limit,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[mem0] recall error ${res.status}: ${text.slice(0, 100)}`);
        return [];
      }
      const data = (await res.json()) as { results?: Mem0SearchItem[] };
      return (data.results || []).map((r) => ({
        memory: r.memory,
        score: r.score ?? 0,
        metadata: r.metadata ?? {},
      }));
    } catch (err) {
      console.error(`[mem0] recall exception: ${(err as Error).message}`);
      return [];
    }
  }

  async storePulse(week: string, _themes: Theme[], metadata: Record<string, unknown>): Promise<string[]> {
    if (!this.enabled) return [];
    try {
      const themeInfo = (metadata.themes as string[])?.join(", ") || "none";
      const res = await fetch(`${MEM0_BASE}/memories/add/`, {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify({
          user_id: this.userId,
          messages: [{ role: "user", content: `Weekly pulse for ${week}: themes are ${themeInfo}.` }],
          metadata: { week, ...metadata, app: this.app, source: "app_store_rss" },
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[mem0] store error ${res.status}: ${text.slice(0, 100)}`);
        return [];
      }
      const data = (await res.json()) as { event_id?: string; status?: string };
      return data.event_id ? [data.event_id] : [];
    } catch (err) {
      console.error(`[mem0] store exception: ${(err as Error).message}`);
      return [];
    }
  }

  async listAll(): Promise<MemoryHit[]> {
    if (!this.enabled) return [];
    try {
      const res = await fetch(`${MEM0_BASE}/memories/?page_size=200`, {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify({ filters: { user_id: this.userId } }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[mem0] list error ${res.status}: ${text.slice(0, 100)}`);
        return [];
      }
      const data = (await res.json()) as { results?: Mem0SearchItem[] };
      return (data.results || []).map((r) => ({
        memory: r.memory,
        score: 0,
        metadata: r.metadata ?? {},
      }));
    } catch (err) {
      console.error(`[mem0] list exception: ${(err as Error).message}`);
      return [];
    }
  }
}
