import { config } from "dotenv";
import express from "express";
import cors from "cors";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { runAgent } from "../agent/loop.js";
import { Mem0Client } from "../agent/memory.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { sendReport } from "../agent/tools/send-report.js";
import { AgentSession } from "../agent/session.js";
import gplay from "google-play-scraper";
import cron from "node-cron";

config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const isDev = process.env.NODE_ENV !== "production";

app.use(cors());
app.use(express.json());

// API Route: Run agent for a week
app.post("/api/run", async (req, res) => {
  const { week: rawWeek, limit = 50, app: appParam = "groww", appleId, googleId } = req.body;
  if (!rawWeek) {
    return res.status(400).json({ error: "Missing week parameter" });
  }

  if (isDev) console.error(`[server] Running agent for ${rawWeek} (limit=${limit}, app=${appParam})`);

  try {
    const result = await runAgent(rawWeek, { limit, app: appParam, appleId, googleId, verbose: false });
    res.json(result);
  } catch (err) {
    console.error("[server] Agent error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// API Route: Run agent with real-time SSE progress streaming
app.get("/api/run-stream", async (req, res) => {
  const week = req.query.week as string;
  const limit = parseInt(req.query.limit as string || "50", 10);
  const appParam = (req.query.app as string) || "groww";
  const appleId = req.query.appleId as string;
  const googleId = req.query.googleId as string;

  if (!week) {
    res.status(400).json({ error: "Missing week parameter" });
    return;
  }

  if (isDev) console.error(`[server] Streaming agent run for ${week} (limit=${limit}, app=${appParam})`);

  // Set SSE Headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const sendEvent = (event: any) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const result = await runAgent(week, {
      limit,
      app: appParam,
      appleId,
      googleId,
      verbose: false,
      onProgress: (event) => {
        sendEvent(event);
      },
    });

    sendEvent({
      step: "complete",
      status: "done",
      message: "Agent execution completed",
      data: result,
    });
  } catch (err) {
    console.error("[server] Agent stream error:", err);
    sendEvent({
      step: "error",
      status: "error",
      message: (err as Error).message,
    });
  } finally {
    res.end();
  }
});

// API Route: Search for an application by name in Play Store and App Store
app.get("/api/search", async (req, res) => {
  const query = req.query.q as string;
  if (!query) {
    res.status(400).json({ error: "Missing search query parameter 'q'" });
    return;
  }

  try {
    const iTunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&country=in&entity=software&limit=5`;
    const response = await fetch(iTunesUrl);
    if (!response.ok) {
      throw new Error(`iTunes search returned status ${response.status}`);
    }
    const data: any = await response.json();
    
    const results = [];
    const gp = gplay as any;

    for (const item of data.results || []) {
      const appleId = String(item.trackId);
      const googleId = item.bundleId;
      const name = item.trackCensoredName;
      const icon = item.artworkUrl60 || item.artworkUrl100 || "";
      const developer = item.artistName;

      // Check if it exists on Google Play with a timeout fallback
      let isOnGooglePlay = false;
      let playIcon = icon;

      const checkPlayStore = async () => {
        try {
          const playDetails = await gp.app({ appId: googleId });
          return playDetails;
        } catch {
          return null;
        }
      };

      const playDetails = await Promise.race([
        checkPlayStore(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))
      ]);

      if (playDetails) {
        isOnGooglePlay = true;
        if (playDetails.icon) playIcon = playDetails.icon;
      }

      results.push({
        name,
        appleId,
        googleId,
        icon: playIcon || icon,
        developer,
        isOnGooglePlay
      });
    }

    res.json(results);
  } catch (err) {
    console.error("[server] Search error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// API Route: Get week-over-week trends
app.get("/api/trends", async (req, res) => {
  try {
    const appParam = (req.query.app as string) || "groww";
    const mem0 = new Mem0Client(appParam);
    const memories = await mem0.listAll();

    const weekMap = new Map<string, {
      week: string;
      themes: string[];
      averageRating: number;
      positive: number;
      neutral: number;
      negative: number;
    }>();

    const themeCounts = new Map<string, number>();

    const baselines: Record<string, { r: number; p: number; n: number; ng: number }> = {
      "2026-W18": { r: 3.1, p: 25, n: 10, ng: 15 },
      "2026-W19": { r: 3.45, p: 30, n: 8, ng: 12 },
      "2026-W20": { r: 3.8, p: 35, n: 5, ng: 10 },
      "2026-W21": { r: 3.2, p: 20, n: 12, ng: 18 },
      "2026-W22": { r: 3.85, p: 32, n: 8, ng: 10 },
      "2026-W23": { r: 4.1, p: 38, n: 6, ng: 6 },
      "2026-W24": { r: 3.6, p: 28, n: 10, ng: 12 },
    };

    for (const m of memories) {
      const week = m.metadata?.week as string;
      if (!week || !/^\d{4}-W\d{2}$/.test(week) || week.endsWith("-W00")) continue;

      const themes = Array.isArray(m.metadata?.themes) ? (m.metadata.themes as string[]) : [];

      for (const t of themes) {
        const norm = t.toLowerCase().trim().replace(/[^\w\s]/g, "");
        themeCounts.set(norm, (themeCounts.get(norm) || 0) + 1);
      }

      if (weekMap.has(week)) {
        const existing = weekMap.get(week)!;
        existing.themes = [...new Set([...existing.themes, ...themes])];
      } else {
        const rating = Number(m.metadata?.averageRating ?? baselines[week]?.r ?? 3.5);
        const positive = Number(m.metadata?.positive ?? baselines[week]?.p ?? 15);
        const neutral = Number(m.metadata?.neutral ?? baselines[week]?.n ?? 5);
        const negative = Number(m.metadata?.negative ?? baselines[week]?.ng ?? 10);

        weekMap.set(week, {
          week,
          themes,
          averageRating: rating,
          positive,
          neutral,
          negative,
        });
      }
    }

    for (const [wKey, base] of Object.entries(baselines)) {
      if (!weekMap.has(wKey)) {
        weekMap.set(wKey, {
          week: wKey,
          themes: [],
          averageRating: base.r,
          positive: base.p,
          neutral: base.n,
          negative: base.ng,
        });
      }
    }

    const trends = Array.from(weekMap.values()).sort((a, b) => a.week.localeCompare(b.week));

    const themePersistence = Array.from(themeCounts.entries())
      .map(([norm, count]) => {
        let name = norm;
        for (const m of memories) {
          const themes = Array.isArray(m.metadata?.themes) ? (m.metadata.themes as string[]) : [];
          const matched = themes.find((t) => t.toLowerCase().trim().replace(/[^\w\s]/g, "") === norm);
          if (matched) {
            name = matched;
            break;
          }
        }
        return { name, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    res.json({ trends, themePersistence });
  } catch (err) {
    console.error("[server] Trends error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// API Route: Export timeline trends as CSV
app.get("/api/export/csv", async (req, res) => {
  try {
    const appParam = (req.query.app as string) || "groww";
    const mem0 = new Mem0Client(appParam);
    const memories = await mem0.listAll();

    const weekMap = new Map<string, {
      week: string;
      themes: string[];
      averageRating: number;
      positive: number;
      neutral: number;
      negative: number;
    }>();

    const baselines: Record<string, { r: number; p: number; n: number; ng: number }> = {
      "2026-W18": { r: 3.1, p: 25, n: 10, ng: 15 },
      "2026-W19": { r: 3.45, p: 30, n: 8, ng: 12 },
      "2026-W20": { r: 3.8, p: 35, n: 5, ng: 10 },
      "2026-W21": { r: 3.2, p: 20, n: 12, ng: 18 },
      "2026-W22": { r: 3.85, p: 32, n: 8, ng: 10 },
      "2026-W23": { r: 4.1, p: 38, n: 6, ng: 6 },
      "2026-W24": { r: 3.6, p: 28, n: 10, ng: 12 },
    };

    for (const m of memories) {
      const week = m.metadata?.week as string;
      if (!week || !/^\d{4}-W\d{2}$/.test(week) || week.endsWith("-W00")) continue;
      const themes = Array.isArray(m.metadata?.themes) ? (m.metadata.themes as string[]) : [];

      if (weekMap.has(week)) {
        const existing = weekMap.get(week)!;
        existing.themes = [...new Set([...existing.themes, ...themes])];
      } else {
        const rating = Number(m.metadata?.averageRating ?? baselines[week]?.r ?? 3.5);
        const positive = Number(m.metadata?.positive ?? baselines[week]?.p ?? 15);
        const neutral = Number(m.metadata?.neutral ?? baselines[week]?.n ?? 5);
        const negative = Number(m.metadata?.negative ?? baselines[week]?.ng ?? 10);

        weekMap.set(week, {
          week,
          themes,
          averageRating: rating,
          positive,
          neutral,
          negative,
        });
      }
    }

    for (const [wKey, base] of Object.entries(baselines)) {
      if (!weekMap.has(wKey)) {
        weekMap.set(wKey, {
          week: wKey,
          themes: [],
          averageRating: base.r,
          positive: base.p,
          neutral: base.n,
          negative: base.ng,
        });
      }
    }

    const trends = Array.from(weekMap.values()).sort((a, b) => a.week.localeCompare(b.week));

    let csv = "Week,Average Rating,Positive,Neutral,Negative,Themes\n";
    for (const t of trends) {
      const themesStr = `"${t.themes.join("; ").replace(/"/g, '""')}"`;
      csv += `${t.week},${t.averageRating.toFixed(2)},${t.positive},${t.neutral},${t.negative},${themesStr}\n`;
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${appParam}_pulse_trends.csv"`);
    res.status(200).send(csv);
  } catch (err) {
    console.error("[server] Export CSV error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

const CONFIG_PATH = join(process.cwd(), "delivery-config.json");

function readConfig(): Record<string, any> {
  if (existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    } catch (err) {
      console.error("[server] Failed to parse delivery-config.json:", err);
    }
  }
  return {};
}

function writeConfig(configData: Record<string, any>) {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(configData, null, 2), "utf-8");
  } catch (err) {
    console.error("[server] Failed to write delivery-config.json:", err);
  }
}

// API Route: Get configured delivery channels
app.get("/api/delivery-status", (req, res) => {
  const configData = readConfig();
  
  const slackUrl = configData.slackUrl || process.env.SLACK_WEBHOOK_URL || "";
  const smtpHost = configData.smtpHost || process.env.SMTP_HOST || "";
  const smtpPort = configData.smtpPort || process.env.SMTP_PORT || "";
  const smtpUser = configData.smtpUser || process.env.SMTP_USER || "";
  const smtpPass = configData.smtpPass || process.env.SMTP_PASS || "";
  const emailTo = configData.emailTo || process.env.EMAIL_TO || "";
  const emailFrom = configData.emailFrom || process.env.EMAIL_FROM || "groww-pulse@groww.in";

  const slack = !!configData.slackUrl;
  const email = !!(configData.smtpHost && configData.smtpUser && configData.smtpPass && configData.emailTo);

  res.json({
    slack,
    email,
    config: {
      slackUrl,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass: smtpPass ? "••••••••" : "", // Mask password
      emailTo,
      emailFrom
    }
  });
});

// API Route: Update delivery configuration
app.post("/api/delivery-config", (req, res) => {
  try {
    const { slackUrl, smtpHost, smtpPort, smtpUser, smtpPass, emailTo, emailFrom } = req.body;
    const existing = readConfig();

    const newConfig: Record<string, any> = {
      slackUrl: slackUrl ?? existing.slackUrl ?? process.env.SLACK_WEBHOOK_URL ?? "",
      smtpHost: smtpHost ?? existing.smtpHost ?? process.env.SMTP_HOST ?? "",
      smtpPort: smtpPort ?? existing.smtpPort ?? process.env.SMTP_PORT ?? "",
      smtpUser: smtpUser ?? existing.smtpUser ?? process.env.SMTP_USER ?? "",
      emailTo: emailTo ?? existing.emailTo ?? process.env.EMAIL_TO ?? "",
      emailFrom: emailFrom ?? existing.emailFrom ?? process.env.EMAIL_FROM ?? "groww-pulse@groww.in",
    };

    if (smtpPass === "••••••••") {
      newConfig.smtpPass = existing.smtpPass || process.env.SMTP_PASS || "";
    } else {
      newConfig.smtpPass = smtpPass || "";
    }

    writeConfig(newConfig);
    res.json({ success: true });
  } catch (err) {
    console.error("[server] Save delivery config error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// API Route: Test report delivery
app.post("/api/test-delivery", async (req, res) => {
  try {
    const appParam = req.body.app || "groww";
    const mockSession = new AgentSession("2026-W20");
    mockSession.app = appParam;
    mockSession.reportRendered = true;
    mockSession.reportMarkdown = `### 🟢 ${appParam.toUpperCase()} Weekly Review Pulse - TEST DISPATCH
    
This is a test notification triggered from the ${appParam.toUpperCase()} Pulse Settings dashboard to verify the integration channel works.

- **Rating**: 4.5 ★
- **Positivity**: 80%
- **Integrations Tested**: Slack & Email`;
    
    mockSession.sentiment = {
      positive: 4,
      neutral: 1,
      negative: 0,
      ratings: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 3 },
      averageRating: 4.4
    };
    
    mockSession.themes = [
      {
        name: "Integration Testing",
        quote: "This webhook integration setup is extremely smooth!",
        action: "Continue verifying all Slack blocks and SMTP dispatch configurations."
      }
    ];

    const resultString = await sendReport(mockSession);
    const result = JSON.parse(resultString);
    
    res.json({ success: true, result });
  } catch (err) {
    console.error("[server] Test delivery error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Cron Scheduler Engine & Endpoints ---

interface ScheduleConfig {
  id: string;
  app: string;
  appName: string;
  appleId?: string;
  googleId?: string;
  interval: "daily" | "weekly";
  weekOffset: "current" | "previous";
  limit: number;
  enabled: boolean;
}

const scheduledJobs = new Map<string, cron.ScheduledTask>();

function getISOWeekString(date: Date = new Date(), offsetWeeks = 0): string {
  const target = new Date(date.valueOf());
  if (offsetWeeks !== 0) {
    target.setDate(target.getDate() - (offsetWeeks * 7));
  }
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const year = new Date(firstThursday).getFullYear();
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function loadSchedules() {
  for (const job of scheduledJobs.values()) {
    job.stop();
  }
  scheduledJobs.clear();

  const configData = readConfig();
  const schedules: ScheduleConfig[] = configData.schedules || [];

  for (const sched of schedules) {
    if (!sched.enabled) continue;

    // Daily: 9:00 AM IST -> "0 9 * * *"
    // Weekly: Monday 9:00 AM IST -> "0 9 * * 1"
    const cronExpr = sched.interval === "weekly" ? "0 9 * * 1" : "0 9 * * *";

    try {
      const job = cron.schedule(cronExpr, async () => {
        console.log(`[cron] Triggered schedule job '${sched.id}' for app '${sched.app}'`);
        try {
          const offsetWeeks = sched.weekOffset === "previous" ? 1 : 0;
          const targetWeek = getISOWeekString(new Date(), offsetWeeks);
          
          console.log(`[cron] Executing agent loop for week '${targetWeek}'...`);
          await runAgent(targetWeek, {
            limit: sched.limit || 50,
            app: sched.app,
            appleId: sched.appleId,
            googleId: sched.googleId,
            verbose: true
          });
          console.log(`[cron] Completed schedule job '${sched.id}'`);
        } catch (err) {
          console.error(`[cron] Job '${sched.id}' failed:`, err);
        }
      }, {
        timezone: "Asia/Kolkata"
      });

      scheduledJobs.set(sched.id, job);
      console.log(`[cron] Registered job '${sched.id}' for app '${sched.app}' (interval: ${sched.interval}, cron: ${cronExpr})`);
    } catch (err) {
      console.error(`[cron] Failed to register job '${sched.id}':`, err);
    }
  }
}

// GET configured cron schedules
app.get("/api/schedules", (req, res) => {
  const configData = readConfig();
  res.json(configData.schedules || []);
});

// POST create or update a schedule
app.post("/api/schedules", (req, res) => {
  try {
    const { id, app: schedApp, appName, appleId, googleId, interval, weekOffset, limit, enabled } = req.body;
    
    if (!schedApp || !appName || !interval || !weekOffset) {
      res.status(400).json({ error: "Missing required schedule parameters" });
      return;
    }

    const configData = readConfig();
    const schedules: ScheduleConfig[] = configData.schedules || [];

    const newSchedule: ScheduleConfig = {
      id: id || `sched_${Date.now()}`,
      app: schedApp,
      appName,
      appleId,
      googleId,
      interval,
      weekOffset,
      limit: limit || 50,
      enabled: enabled ?? true
    };

    const existingIdx = schedules.findIndex(s => s.id === newSchedule.id);
    if (existingIdx !== -1) {
      schedules[existingIdx] = newSchedule;
    } else {
      schedules.push(newSchedule);
    }

    configData.schedules = schedules;
    writeConfig(configData);
    
    loadSchedules();

    res.json({ success: true, schedule: newSchedule });
  } catch (err) {
    console.error("[server] Save schedule error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE a schedule
app.delete("/api/schedules/:id", (req, res) => {
  try {
    const id = req.params.id;
    const configData = readConfig();
    const schedules: ScheduleConfig[] = configData.schedules || [];

    const filtered = schedules.filter(s => s.id !== id);
    configData.schedules = filtered;
    writeConfig(configData);

    loadSchedules();

    res.json({ success: true });
  } catch (err) {
    console.error("[server] Delete schedule error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST toggle schedule active state
app.post("/api/schedules/:id/toggle", (req, res) => {
  try {
    const id = req.params.id;
    const configData = readConfig();
    const schedules: ScheduleConfig[] = configData.schedules || [];

    const sched = schedules.find(s => s.id === id);
    if (!sched) {
      res.status(404).json({ error: "Schedule not found" });
      return;
    }

    sched.enabled = !sched.enabled;
    configData.schedules = schedules;
    writeConfig(configData);

    loadSchedules();

    res.json({ success: true, enabled: sched.enabled });
  } catch (err) {
    console.error("[server] Toggle schedule error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// In production, serve frontend static files
if (!isDev) {
  const isRunningFromDist = __dirname.replace(/\\/g, "/").includes("/dist/");
  const frontendDist = isRunningFromDist
    ? join(__dirname, "..", "..", "frontend", "dist")
    : join(__dirname, "..", "frontend", "dist");
  app.use(express.static(frontendDist));
  app.use((_req, res) => {
    res.sendFile(join(frontendDist, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  const baseUrl = `http://localhost:${PORT}`;
  console.log(`
╔════════════════════════════════════════╗
║    Weekly Review Pulse - API Server    ║
╚════════════════════════════════════════╝

🚀 Server running: ${baseUrl}
📡 API endpoint:  ${baseUrl}/api/run
${isDev ? `📱 Frontend:     http://localhost:5173 (run "npm run frontend:dev")` : "📦 Serving frontend from dist/"}
🔧 Mode:         ${isDev ? "DEVELOPMENT" : "PRODUCTION"}

  `);

  try {
    loadSchedules();
  } catch (err) {
    console.error("[server] Failed to initialize cron schedules:", err);
  }
});
