import type { ToolDefinition } from "../models.js";

export function schemas(): ToolDefinition[] {
  return [
    {
      type: "function",
      function: {
        name: "fetch_reviews",
        description: "Fetch the latest N reviews from either 'apple' (App Store) or 'google' (Play Store) for a specified competitor app.",
        parameters: {
          type: "object",
          properties: {
            platform: { type: "string", enum: ["apple", "google"], description: "Target platform to fetch reviews from" },
            limit: { type: "integer", description: "Max reviews to fetch (max 500)" },
            app: { type: "string", enum: ["groww", "zerodha", "angelone"], description: "Competitor app name (default: groww)" },
          },
          required: ["platform", "limit"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "recall_past_pulse",
        description: "Recall what we remember about prior weekly pulses from long-term memory",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Optional custom search query" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "analyze_sentiment",
        description: "Analyze already-fetched reviews to calculate sentiment and rating breakdowns. No arguments needed — pass an empty object {}.",
        parameters: {
          type: "object",
          properties: {
            _: { type: "string", description: "ignored" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "analyze_themes",
        description: "Analyze already-fetched App Store reviews to extract 3 themes with quotes and actions. No arguments needed — pass an empty object {}.",
        parameters: {
          type: "object",
          properties: {
            _: { type: "string", description: "ignored" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "save_pulse",
        description: "Save this week's pulse themes to long-term memory. No arguments needed.",
        parameters: {
          type: "object",
          properties: {
            _: { type: "string", description: "ignored" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "render_report",
        description: "Print final Markdown report with themes and memory comparison. No arguments needed.",
        parameters: {
          type: "object",
          properties: {
            _: { type: "string", description: "ignored" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "send_report",
        description: "Dispatch this week's generated report to configured channels (Slack, Email). No arguments needed — pass an empty object {}.",
        parameters: {
          type: "object",
          properties: {
            _: { type: "string", description: "ignored" },
          },
        },
      },
    },
  ];
}
