import type { AgentSession } from "../session.js";
import nodemailer from "nodemailer";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

function getLLMProvider(): string {
  if (process.env.GEMINI_API_KEY) return "Gemini";
  const baseUrl = process.env.OPENAI_BASE_URL || "";
  const model = process.env.OPENAI_MODEL || "";
  if (baseUrl.includes("groq") || model.includes("llama")) return "Groq";
  return "OpenAI";
}

// Helper to get delivery config
function getDeliveryConfig(session?: AgentSession) {
  const configPath = join(process.cwd(), "delivery-config.json");
  let fileConfig: Record<string, any> = {};
  
  if (existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch (err) {
      console.error("[send-report] Failed to parse delivery-config.json:", err);
    }
  }

  const app = session?.app || "groww";

  return {
    slackUrl: fileConfig.slackUrl || process.env.SLACK_WEBHOOK_URL,
    smtpHost: fileConfig.smtpHost || process.env.SMTP_HOST,
    smtpPort: parseInt(fileConfig.smtpPort || process.env.SMTP_PORT || "587", 10),
    smtpUser: fileConfig.smtpUser || process.env.SMTP_USER,
    smtpPass: fileConfig.smtpPass || process.env.SMTP_PASS,
    emailTo: fileConfig.emailTo || process.env.EMAIL_TO,
    emailFrom: fileConfig.emailFrom || process.env.EMAIL_FROM || `${app}-pulse@${app}.in`
  };
}

function detectAlerts(session: AgentSession): string[] {
  const alerts: string[] = [];
  
  // 1. Average Rating < 3.3
  const avgRating = session.sentiment?.averageRating ?? 5.0;
  if (avgRating < 3.3) {
    alerts.push(`Average Rating dipped below 3.3 (Current: ${avgRating.toFixed(2)} ★)`);
  }
  
  // 2. Negative Ratio > 40%
  const positive = session.sentiment?.positive || 0;
  const neutral = session.sentiment?.neutral || 0;
  const negative = session.sentiment?.negative || 0;
  const total = positive + neutral + negative;
  const negativeRatio = total > 0 ? (negative / total) : 0;
  if (negativeRatio > 0.40) {
    alerts.push(`Negative sentiment ratio exceeded 40% (Current: ${(negativeRatio * 100).toFixed(1)}%)`);
  }
  
  // 3. Crash/Fraud keywords
  const criticalKeywords = ["crash", "fraud", "scam", "cheat", "freeze", "stuck", "error", "server down", "login fail", "hang"];
  const foundKeywords = new Set<string>();
  
  // Check reviews
  const reviews = session.reviews || [];
  for (const r of reviews) {
    const text = `${r.title} ${r.content}`.toLowerCase();
    for (const kw of criticalKeywords) {
      if (text.includes(kw)) {
        foundKeywords.add(kw);
      }
    }
  }
  
  // Check themes
  const themes = session.themes || [];
  for (const t of themes) {
    const text = `${t.name} ${t.quote} ${t.action}`.toLowerCase();
    for (const kw of criticalKeywords) {
      if (text.includes(kw)) {
        foundKeywords.add(kw);
      }
    }
  }
  
  if (foundKeywords.size > 0) {
    alerts.push(`Critical issue keywords detected: ${Array.from(foundKeywords).join(", ")}`);
  }
  
  return alerts;
}

export async function sendReport(session: AgentSession): Promise<string> {
  const { slackUrl, smtpHost, smtpPort, smtpUser, smtpPass, emailTo, emailFrom } = getDeliveryConfig(session);

  const status: Record<string, any> = {
    slack: { sent: false, error: null },
    email: { sent: false, error: null }
  };

  if (!session.reportRendered || !session.reportMarkdown) {
    return JSON.stringify({ error: "Report has not been rendered yet. Run render_report first." });
  }

  const appName = session.app.toUpperCase();
  const alerts = detectAlerts(session);

  // 1. Send Slack if configured
  if (slackUrl) {
    try {
      const averageRating = session.sentiment?.averageRating?.toFixed(2) || "N/A";
      const positive = session.sentiment?.positive || 0;
      const neutral = session.sentiment?.neutral || 0;
      const negative = session.sentiment?.negative || 0;
      const totalReviews = positive + neutral + negative;

      const themesBlock = (session.themes || []).map((t, idx) => ({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${idx + 1}. ${t.name}*\n> "${t.quote}"\n*Action*: ${t.action}`
        }
      }));

      const headerText = alerts.length > 0 
        ? `🚨 ${appName} Weekly Review Pulse (CRITICAL ALERTS) - Week ${session.week}` 
        : `🟢 ${appName} Weekly Review Pulse - Week ${session.week}`;

      const payload: any = {
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: headerText,
              emoji: true
            }
          }
        ]
      };

      if (alerts.length > 0) {
        payload.blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*🚨 CRITICAL WARNINGS:*\n` + alerts.map(a => `• ${a}`).join("\n")
          }
        });
        payload.blocks.push({ type: "divider" });
      }

      payload.blocks.push(
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Average Rating:*\n⭐ ${averageRating} / 5.0`
            },
            {
              type: "mrkdwn",
              text: `*Sentiment Breakdown:*\n🟢 ${positive} | 🟡 ${neutral} | 🔴 ${negative} (${totalReviews} total)`
            }
          ]
        },
        {
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Key Customer Themes Identified This Week:*"
          }
        },
        ...themesBlock,
        {
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Detailed report is saved in memory. View the full ${session.app} Pulse dashboard for deep comparison.`
          }
        }
      );

      const res = await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Slack API responded with status ${res.status}`);
      }

      status.slack.sent = true;
    } catch (err) {
      status.slack.error = (err as Error).message;
      console.error("[send-report] Slack error:", err);
    }
  } else {
    status.slack.error = "Slack webhook URL not configured";
  }

  // 2. Send Email if SMTP configured
  if (smtpHost && smtpUser && smtpPass && emailTo) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      const averageRating = session.sentiment?.averageRating?.toFixed(2) || "N/A";
      const positive = session.sentiment?.positive || 0;
      const neutral = session.sentiment?.neutral || 0;
      const negative = session.sentiment?.negative || 0;

      const themesHtml = (session.themes || []).map((t, idx) => `
        <div style="margin-bottom: 20px; padding: 15px; background: #1e293b; border-left: 4px solid #10b981; border-radius: 4px; color: #f8fafc;">
          <h4 style="margin: 0 0 10px 0; color: #34d399; font-size: 16px;">${idx + 1}. ${t.name}</h4>
          <blockquote style="margin: 0 0 10px 0; font-style: italic; color: #cbd5e1; border-left: 2px solid #475569; padding-left: 10px;">
            "${t.quote}"
          </blockquote>
          <p style="margin: 0; color: #f8fafc;"><strong style="color: #60a5fa;">Action Item:</strong> ${t.action}</p>
        </div>
      `).join("");

      let alertsHtml = "";
      if (alerts.length > 0) {
        alertsHtml = `
          <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin-bottom: 25px; border-radius: 4px;">
            <h3 style="color: #991b1b; margin: 0 0 10px 0; font-size: 16px; font-weight: bold;">🚨 Critical Alerts Detected</h3>
            <ul style="margin: 0; padding-left: 20px; color: #7f1d1d; font-size: 14px;">
              ${alerts.map(a => `<li style="margin-bottom: 5px;">${a}</li>`).join("")}
            </ul>
          </div>
        `;
      }

      const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0f172a; padding: 30px; max-width: 600px; margin: 0 auto; border-radius: 8px; color: #cbd5e1;">
          <h2 style="color: #34d399; margin: 0 0 5px 0;">${appName} Weekly Review Pulse</h2>
          <p style="color: #64748b; font-size: 14px; margin: 0 0 25px 0;">ISO Week: ${session.week} • Autonomous AI Analysis</p>
          
          ${alertsHtml}
          
          <div style="margin-bottom: 35px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 15px; background: #1e293b; border-radius: 6px; text-align: center; width: 45%;">
                  <span style="display: block; font-size: 12px; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em;">Avg Rating</span>
                  <span style="font-size: 28px; font-weight: bold; color: #f8fafc; display: block; margin-top: 5px;">${averageRating} ★</span>
                </td>
                <td style="width: 10%;"></td>
                <td style="padding: 15px; background: #1e293b; border-radius: 6px; text-align: center; width: 45%;">
                  <span style="display: block; font-size: 12px; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em;">Sentiment</span>
                  <span style="font-size: 14px; display: block; margin-top: 5px; color: #34d399;">🟢 ${positive} Positive</span>
                  <span style="font-size: 14px; display: block; color: #fbbf24;">🟡 ${neutral} Neutral</span>
                  <span style="font-size: 14px; display: block; color: #f87171;">🔴 ${negative} Negative</span>
                </td>
              </tr>
            </table>
          </div>
          
          <h3 style="color: #f8fafc; border-bottom: 1px solid #334155; padding-bottom: 8px; margin-bottom: 20px;">Top Customer Themes</h3>
          ${themesHtml}
          
          <h3 style="color: #f8fafc; border-bottom: 1px solid #334155; padding-bottom: 8px; margin-top: 35px; margin-bottom: 20px;">AI Analysis Summary</h3>
          <div style="background: #1e293b; padding: 15px; border-radius: 6px; color: #cbd5e1; font-size: 14px; line-height: 1.6; white-space: pre-wrap; font-family: monospace;">
${session.reportMarkdown}
          </div>
          
          <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #334155; padding-top: 20px;">
            ${appName} Weekly Pulse Agent • Powered by Mem0 & ${getLLMProvider()}
          </div>
        </div>
      `;

      const subjectLine = `${appName} Weekly Review Pulse - Week ${session.week} (${averageRating} ★)${alerts.length > 0 ? " [ALERT]" : ""}`;

      await transporter.sendMail({
        from: emailFrom,
        to: emailTo,
        subject: subjectLine,
        html: htmlContent
      });

      status.email.sent = true;
    } catch (err) {
      status.email.error = (err as Error).message;
      console.error("[send-report] Email error:", err);
    }
  } else {
    status.email.error = "SMTP credentials or recipient email not configured";
  }

  return JSON.stringify(status);
}
