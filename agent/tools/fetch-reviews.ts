import type { Review } from "../models.js";
import type { AgentSession } from "../session.js";
import gplay from "google-play-scraper";

const APP_CONFIGS: Record<string, { appleUrl: string; googleId: string }> = {
  groww: {
    appleUrl: "https://apps.apple.com/in/app/groww-stocks-mutual-fund-ipo/id1404871703?see-all=reviews",
    googleId: "com.nextbillion.groww",
  },
  zerodha: {
    appleUrl: "https://apps.apple.com/in/app/kite-trade-share-invest/id1449453802?see-all=reviews",
    googleId: "com.zerodha.kite",
  },
  angelone: {
    appleUrl: "https://apps.apple.com/in/app/angel-one-by-angel-broking/id1442105151?see-all=reviews",
    googleId: "com.msf.angeloneltd",
  },
};

interface AppleReview {
  id: string;
  title: string;
  contents: string;
  rating: number;
  date: string;
  name?: string;
  nickname?: string;
}

export async function fetchReviews(
  args: { platform: string; limit: number; app?: string; appleId?: string; googleId?: string },
  session?: AgentSession
): Promise<string> {
  const platform = args.platform || "apple";
  const limit = Math.min(Math.max(1, args.limit || 50), 500);

  const rawApp = args.app || session?.app || "groww";
  const normalizedApp = rawApp.toLowerCase().replace(/[^a-z]/g, "");

  const appleId = args.appleId || session?.appleId;
  const googleId = args.googleId || session?.googleId;

  let config: { appleUrl: string; googleId: string };
  if (appleId && googleId) {
    config = {
      appleUrl: `https://apps.apple.com/in/app/id${appleId}?see-all=reviews`,
      googleId: googleId,
    };
  } else {
    config = APP_CONFIGS[normalizedApp] || APP_CONFIGS.groww;
  }

  if (platform === "apple") {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(config.appleUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });
        clearTimeout(timer);

        if (res.status === 429 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }

        if (!res.ok) {
          return JSON.stringify({ error: `Apple page returned ${res.status}`, reviews: [], count: 0, source: "apple" });
        }

        const html = await res.text();
        const match = html.match(/<script type="application\/json" id="serialized-server-data">(.+?)<\/script>/);

        if (!match) {
          return JSON.stringify({ error: "No review data found on page", reviews: [], count: 0, source: "apple" });
        }

        const raw = JSON.parse(match[1]);
        const shelfItems = raw?.data?.[0]?.data?.shelfMapping?.allProductReviews?.items;

        if (!Array.isArray(shelfItems)) {
          return JSON.stringify({ error: "Unexpected data structure", reviews: [], count: 0, source: "apple" });
        }

        const appleReviews: AppleReview[] = shelfItems
          .filter((item: Record<string, unknown>) => item?.review)
          .map((item: Record<string, unknown>) => {
            const r = item.review as Record<string, unknown>;
            return {
              id: String(r.id ?? ""),
              title: String(r.title ?? ""),
              contents: String(r.contents ?? ""),
              rating: Number(r.rating ?? 0),
              date: String(r.date ?? ""),
            };
          });

        const reviews: Review[] = appleReviews.slice(0, limit).map((r) => ({
          id: r.id,
          title: r.title,
          content: r.contents,
          rating: r.rating,
          updated: r.date.split("T")[0] || r.date,
          source: "apple" as const,
        }));

        if (session) session.appleReviews = reviews;
        return JSON.stringify({ success: true, count: reviews.length, source: "apple", message: `Successfully fetched and stored ${reviews.length} reviews for ${normalizedApp} from Apple App Store.` });
      } catch (err) {
        if (attempt === 0) {
          console.error(`[fetchReviews apple] Retry after error: ${(err as Error).message}`);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        return JSON.stringify({ error: `Fetch failed: ${(err as Error).message}`, reviews: [], count: 0, source: "apple" });
      }
    }
    return JSON.stringify({ error: "Fetch failed after retries", reviews: [], count: 0, source: "apple" });
  } else if (platform === "google") {
    const gp = gplay as any;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const rawReviews: any = await gp.reviews({
          appId: config.googleId,
          sort: gp.sort?.NEWEST ?? 0,
          num: limit,
          lang: "en",
          country: "in",
        });

        const reviews: Review[] = (rawReviews?.data || []).map((r: any) => ({
          id: String(r.id ?? ""),
          title: String(r.title ?? ""),
          content: String(r.text ?? ""),
          rating: Number(r.score ?? 0),
          updated: r.date ? new Date(r.date).toISOString().split("T")[0] : "",
          source: "google" as const,
        }));

        if (session) session.googleReviews = reviews;
        return JSON.stringify({ success: true, count: reviews.length, source: "google", message: `Successfully fetched and stored ${reviews.length} reviews for ${normalizedApp} from Google Play Store.` });
      } catch (err) {
        if (attempt === 0) {
          console.error(`[fetchReviews google] Retry after error: ${(err as Error).message}`);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        return JSON.stringify({ error: `Google Play Fetch failed: ${(err as Error).message}`, reviews: [], count: 0, source: "google" });
      }
    }
    return JSON.stringify({ error: "Google Play Fetch failed after retries", reviews: [], count: 0, source: "google" });
  }

  return JSON.stringify({ error: `Unsupported platform: ${platform}`, reviews: [], count: 0 });
}
