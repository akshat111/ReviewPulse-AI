export interface Review {
  id: string;
  title: string;
  content: string;
  rating: number;
  updated: string;
  source?: "apple" | "google";
}

export interface SentimentData {
  positive: number;
  neutral: number;
  negative: number;
  ratings: { 1: number; 2: number; 3: number; 4: number; 5: number };
  averageRating: number;
}

export interface Theme {
  name: string;
  quote: string;
  action: string;
}

export interface Pulse {
  week: string;
  themes: Theme[];
  generatedAt: Date;
}

export interface ThemeHistory {
  persisting: [string, string][];
  new: string[];
  faded: [string, string][];
}

export interface MemoryHit {
  memory: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AssistantMessage {
  content: string | null;
  toolCalls: ToolCall[];
}

export interface AgentProgressEvent {
  step: string;
  status: "running" | "done" | "info" | "error";
  message?: string;
  data?: any;
}

export interface AgentOptions {
  limit: number;
  verbose: boolean;
  app?: string;
  appleId?: string;
  googleId?: string;
  onProgress?: (event: AgentProgressEvent) => void;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type ToolHandler = (args: Record<string, unknown>, session: import("./session.js").AgentSession) => string | Promise<string>;
