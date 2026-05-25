import type { Review, Theme, MemoryHit, SentimentData } from "./models.js";

export class AgentSession {
  week: string;
  app = "groww";
  appleId?: string;
  googleId?: string;
  appleReviews: Review[] | null = null;
  googleReviews: Review[] | null = null;
  recalledMemories: MemoryHit[] | null = null;
  sentiment: SentimentData | null = null;
  themes: Theme[] | null = null;
  pulseSaved = false;
  reportRendered = false;
  reportMarkdown = "";

  constructor(week: string) {
    this.week = week;
  }

  get reviews(): Review[] {
    return [
      ...(this.appleReviews || []),
      ...(this.googleReviews || []),
    ];
  }
}
