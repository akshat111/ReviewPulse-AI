#!/usr/bin/env node

import { config } from "dotenv";
import { Command } from "commander";
import { runAgent } from "./loop.js";

config();

const program = new Command();

program
  .name("weekly-review-pulse-agent")
  .description("Produce a weekly review pulse for Groww from App Store reviews")
  .requiredOption("--week <week>", "ISO week label (e.g. 2026-W20)")
  .option("--limit <limit>", "Max reviews to fetch", (v) => parseInt(v, 10), 50)
  .option("--verbose", "Print detailed logs to stderr", false);

program.parse();

const { week: rawWeek, limit, verbose } = program.opts() as {
  week: string;
  limit: number;
  verbose: boolean;
};

function parseWeek(input: string): string {
  const now = new Date();
  const currentYear = now.getFullYear().toString();

  // already ISO: 2026-W20
  const isoMatch = input.match(/^(\d{4})-W(\d{1,2})$/i);
  if (isoMatch) return `${isoMatch[1]}-W${isoMatch[2].padStart(2, "0")}`;

  // 2026W20 (no dash)
  const noDash = input.match(/^(\d{4})[Ww](\d{1,2})$/);
  if (noDash) return `${noDash[1]}-W${noDash[2].padStart(2, "0")}`;

  // 2026-20 or 2026_20 (dash/underscore, no W)
  const yearWeek = input.match(/^(\d{4})[-_](\d{1,2})$/);
  if (yearWeek) return `${yearWeek[1]}-W${yearWeek[2].padStart(2, "0")}`;

  // 20-2026 or W20-2026 (reversed)
  const weekYear = input.match(/^[Ww]?(\d{1,2})[-_](\d{4})$/);
  if (weekYear) return `${weekYear[2]}-W${weekYear[1].padStart(2, "0")}`;

  // 20 or W20 (just week, assume current year)
  const justWeek = input.match(/^[Ww]?(\d{1,2})$/);
  if (justWeek) return `${currentYear}-W${justWeek[1].padStart(2, "0")}`;

  console.error(`Cannot parse week: "${input}". Try formats like: 2026-W20, 2026w20, 2026-20, W20, 20`);
  process.exit(2);
}

const week = parseWeek(rawWeek);

async function main() {
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.error("Missing LLM API key. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env");
    process.exit(2);
  }
  if (!process.env.MEM0_API_KEY) {
    console.error("[warn] MEM0_API_KEY not set — agent will run without persistent memory");
  }

  await runAgent(week, { limit, verbose });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
