import type { AgentSession } from "../session.js";

export async function analyzeSentiment(_args: Record<string, unknown>, session: AgentSession): Promise<string> {
  const reviews = session.reviews;
  if (!reviews || reviews.length === 0) {
    return JSON.stringify({ error: "No reviews to analyze. Call fetch_reviews first." });
  }

  let positive = 0;
  let neutral = 0;
  let negative = 0;
  const ratings = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  for (const r of reviews) {
    const rating = Math.min(Math.max(1, Math.round(r.rating)), 5) as 1 | 2 | 3 | 4 | 5;
    ratings[rating]++;
    
    if (rating >= 4) {
      positive++;
    } else if (rating === 3) {
      neutral++;
    } else {
      negative++;
    }
  }

  const averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

  session.sentiment = {
    positive,
    neutral,
    negative,
    ratings,
    averageRating: Number(averageRating.toFixed(2)),
  };

  return JSON.stringify(session.sentiment);
}
