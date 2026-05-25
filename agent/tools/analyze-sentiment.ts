import type { AgentSession } from "../session.js";
import { LLMClient } from "../llm.js";

type ReviewCategory = "Bug Report" | "Feature Request" | "Praise" | "UI/UX" | "Payments" | "Other";

function localFallbackClassify(content: string, rating: number): ReviewCategory {
  const text = content.toLowerCase();
  
  if (text.includes("pay") || text.includes("payment") || text.includes("bank") || text.includes("deposit") || text.includes("withdraw") || text.includes("money") || text.includes("transaction") || text.includes("otp") || text.includes("mandate") || text.includes("refund") || text.includes("add money") || text.includes("withdraw money") || text.includes("charges") || text.includes("fee") || text.includes("deduct")) {
    return "Payments";
  }
  
  if (text.includes("bug") || text.includes("crash") || text.includes("freeze") || text.includes("hang") || text.includes("slow") || text.includes("lag") || text.includes("not loading") || text.includes("force close") || text.includes("stuck") || text.includes("error") || text.includes("issue") || text.includes("fail") || text.includes("unable") || text.includes("glitch") || text.includes("black screen") || text.includes("not working")) {
    return "Bug Report";
  }
  
  if (text.includes("ui") || text.includes("ux") || text.includes("design") || text.includes("look") || text.includes("chart") || text.includes("graph") || text.includes("color") || text.includes("dark mode") || text.includes("font") || text.includes("interface") || text.includes("layout") || text.includes("display") || text.includes("screen")) {
    return "UI/UX";
  }
  
  if (text.includes("need") || text.includes("feature") || text.includes("add") || text.includes("request") || text.includes("please update") || text.includes("improve") || text.includes("want") || text.includes("hope") || text.includes("suggest") || text.includes("introduce") || text.includes("option for")) {
    return "Feature Request";
  }
  
  if (rating >= 4) {
    return "Praise";
  }
  
  return "Other";
}

async function batchClassifyReviews(reviews: any[], llm: LLMClient): Promise<Record<string, ReviewCategory>> {
  const categoriesMap: Record<string, ReviewCategory> = {};
  const batchSize = 50;
  
  for (let i = 0; i < reviews.length; i += batchSize) {
    const batch = reviews.slice(i, i + batchSize);
    const listText = batch
      .map(r => `Review ID: ${r.id}\nRating: ${r.rating}\nText: ${r.title ? r.title + " - " : ""}${r.content}`)
      .join("\n---\n");
      
    const systemInstruction = `You are an expert app store review classifier.
Your task is to classify each of the following user reviews into exactly one of these categories:
1. "Bug Report" (crashes, freezing, login failure, otp issues, slow loading, general bugs, glitches, not working)
2. "Feature Request" (missing options, requests for new indicators, improvement requests, wanting features, suggestions)
3. "Praise" (general positive comments, appreciation, satisfaction, love the app)
4. "UI/UX" (navigational complaints, font issues, dark mode problems, layout confusion, charts/graphs feedback, display issues)
5. "Payments" (deposit, withdrawal, money transfer, bank verification, mandate, refund issues, fees, charges, payment failures)
6. "Other" (any review that does not fit the above categories)

You MUST respond with a valid JSON object ONLY. The JSON object should map each Review ID to its assigned category. Do not include any explanation or markdown formatting outside the JSON block.

Example Output:
{
  "some_id_1": "Bug Report",
  "some_id_2": "Praise"
}`;

    try {
      const response = await llm.complete([
        { role: "user", content: systemInstruction + "\n\nReviews to classify:\n" + listText }
      ], undefined, true);
      
      if (response.content) {
        let cleanText = response.content.replace(/```(?:json)?\s*/g, "").replace(/\s*```/g, "").trim();
        const parsed = JSON.parse(cleanText) as Record<string, string>;
        
        for (const [id, cat] of Object.entries(parsed)) {
          const trimmedCat = cat.trim();
          if (["Bug Report", "Feature Request", "Praise", "UI/UX", "Payments", "Other"].includes(trimmedCat)) {
            categoriesMap[id] = trimmedCat as ReviewCategory;
          }
        }
      }
    } catch (err) {
      console.error(`[classifier] Batch classification failed at index ${i}:`, err);
    }
  }
  
  return categoriesMap;
}

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

  // Run LLM review classification
  const llm = new LLMClient();
  let categoriesMap: Record<string, ReviewCategory> = {};
  try {
    categoriesMap = await batchClassifyReviews(reviews, llm);
  } catch (err) {
    console.error("[classifier] Failed to execute batch classification:", err);
  }

  // Apply categories
  for (const r of reviews) {
    r.category = categoriesMap[r.id] || localFallbackClassify(r.content, r.rating);
  }

  session.sentiment = {
    positive,
    neutral,
    negative,
    ratings,
    averageRating: Number(averageRating.toFixed(2)),
  };

  return JSON.stringify(session.sentiment);
}
