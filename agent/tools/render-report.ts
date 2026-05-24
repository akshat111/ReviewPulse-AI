import type { AgentSession } from "../session.js";
import { compareThemes } from "./compare.js";

function getAppDisplayName(app: string): string {
  const map: Record<string, string> = {
    groww: "Groww",
    zerodha: "Zerodha",
    angelone: "Angel One",
  };
  const normalized = (app || "").toLowerCase().replace(/[^a-z]/g, "");
  return map[normalized] || "Groww";
}

export function renderReport(session: AgentSession): string {
  const week = session.week;
  const themes = session.themes;
  const history = session.recalledMemories
    ? compareThemes(themes || [], session.recalledMemories)
    : null;

  const lines: string[] = [];

  const appDisplayName = getAppDisplayName(session.app);
  lines.push(`# ${appDisplayName} — Weekly Review Pulse (Week ${week})`);
  lines.push("");

  if (themes) {
    lines.push("## Themes this week");
    lines.push("");
    themes.forEach((t, i) => {
      lines.push(` ${i + 1}. **${t.name}**`);
      lines.push(`    > "${t.quote}"`);
      lines.push(`    → *Action:* ${t.action}`);
      lines.push("");
    });
  }

  if (history) {
    lines.push("## Memory says");
    lines.push("");

    for (const [name, fromWeek] of history.persisting) {
      lines.push(`- "${name}" persists from ${fromWeek} [persisting]`);
    }
    for (const name of history.new) {
      lines.push(`- "${name}" is new this week [new]`);
    }
    for (const [name, fromWeek] of history.faded) {
      lines.push(`- "${name}" from ${fromWeek} did not surface [faded]`);
    }

    if (history.persisting.length === 0 && history.new.length === 0 && history.faded.length === 0) {
      lines.push("- No prior memory data available.");
    }
  }

  const markdown = lines.join("\n");
  console.log("\n" + markdown);

  session.reportRendered = true;
  session.reportMarkdown = markdown;
  return JSON.stringify({ rendered: true, markdown });
}
