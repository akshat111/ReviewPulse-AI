import { useState, useEffect, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";

interface Theme {
  name: string;
  quote: string;
  action: string;
}

interface Review {
  id: string;
  title: string;
  content: string;
  rating: number;
  updated: string;
  source?: string;
}

interface SentimentData {
  positive: number;
  neutral: number;
  negative: number;
  ratings: { 1: number; 2: number; 3: number; 4: number; 5: number };
  averageRating: number;
}

interface WeeklyTrend {
  week: string;
  themes: string[];
  averageRating: number;
  positive: number;
  neutral: number;
  negative: number;
}

interface ThemePersistence {
  name: string;
  count: number;
}

interface RunResult {
  markdown: string;
  themes: Theme[];
  week: string;
  appleReviews?: Review[];
  googleReviews?: Review[];
  sentiment?: SentimentData;
}

interface ProgressStep {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  details?: string;
}

const INITIAL_STEPS: ProgressStep[] = [
  { id: "init", label: "Agent Session Setup", status: "pending" },
  { id: "fetch_reviews", label: "Fetching App Store & Play Store Reviews", status: "pending" },
  { id: "analyze_sentiment", label: "Analyzing Sentiment & App Health", status: "pending" },
  { id: "recall_past_pulse", label: "Recalling Past Themes from Mem0", status: "pending" },
  { id: "analyze_themes", label: "Extracting Key Themes via LLM", status: "pending" },
  { id: "save_pulse", label: "Saving Current Pulse to Mem0", status: "pending" },
  { id: "render_report", label: "Generating Final Report Markdown", status: "pending" },
  { id: "send_report", label: "Dispatching Report (Slack, Email)", status: "pending" },
];

export default function App() {
  const [week, setWeek] = useState("2026-W20");
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState("");
  const [app, setApp] = useState("groww");

  // Feature 2: Trends State
  const [activeTab, setActiveTab] = useState<"analysis" | "trends">("analysis");
  const [trendsData, setTrendsData] = useState<WeeklyTrend[] | null>(null);
  const [themePersistence, setThemePersistence] = useState<ThemePersistence[] | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsError, setTrendsError] = useState("");

  // Feature 3: Live Progress State
  const [progress, setProgress] = useState<ProgressStep[]>(INITIAL_STEPS);

  // Feature 5: Delivery State
  const [deliveryStatus, setDeliveryStatus] = useState<{
    slack: boolean;
    email: boolean;
    config?: {
      slackUrl: string;
      smtpHost: string;
      smtpPort: string;
      smtpUser: string;
      smtpPass: string;
      emailTo: string;
      emailFrom: string;
    };
  }>({ slack: false, email: false });

  const [slackUrl, setSlackUrl] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [emailFrom, setEmailFrom] = useState("groww-pulse@groww.in");

  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingDelivery, setTestingDelivery] = useState(false);
  const [deliveryTestResult, setDeliveryTestResult] = useState<string | null>(null);
  const [showSlackConfig, setShowSlackConfig] = useState(false);
  const [showEmailConfig, setShowEmailConfig] = useState(false);

  useEffect(() => {
    async function fetchDeliveryStatus() {
      try {
        const res = await fetch("/api/delivery-status");
        if (res.ok) {
          const data = await res.json();
          setDeliveryStatus(data);
          if (data.config) {
            setSlackUrl(data.config.slackUrl || "");
            setSmtpHost(data.config.smtpHost || "");
            setSmtpPort(data.config.smtpPort || "587");
            setSmtpUser(data.config.smtpUser || "");
            setSmtpPass(data.config.smtpPass || "");
            setEmailTo(data.config.emailTo || "");
            setEmailFrom(data.config.emailFrom || "groww-pulse@groww.in");
          }
        }
      } catch (err) {
        console.error("Failed to fetch delivery status:", err);
      }
    }
    fetchDeliveryStatus();
  }, []);

  async function handleSaveConfig(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch("/api/delivery-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slackUrl,
          smtpHost,
          smtpPort,
          smtpUser,
          smtpPass,
          emailTo,
          emailFrom
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSaveStatus("Settings saved successfully! ✅");
        const statusRes = await fetch("/api/delivery-status");
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setDeliveryStatus(statusData);
        }
      } else {
        setSaveStatus(`Failed to save: ${data.error || "Unknown error"} ❌`);
      }
    } catch (err) {
      setSaveStatus(`Error: ${(err as Error).message} ❌`);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestDelivery() {
    setTestingDelivery(true);
    setDeliveryTestResult(null);
    try {
      const res = await fetch("/api/test-delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const slackStatus = data.result.slack.sent ? "Slack: Sent ✅" : `Slack: Failed ❌ (${data.result.slack.error})`;
        const emailStatus = data.result.email.sent ? "Email: Sent ✅" : `Email: Failed ❌ (${data.result.email.error})`;
        setDeliveryTestResult(`Test results: ${slackStatus} | ${emailStatus}`);
      } else {
        setDeliveryTestResult(`Failed to test: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      setDeliveryTestResult(`Error: ${(err as Error).message}`);
    } finally {
      setTestingDelivery(false);
    }
  }

  async function fetchTrends(overrideApp?: string) {
    const targetApp = overrideApp || app;
    setTrendsLoading(true);
    setTrendsError("");
    try {
      const res = await fetch(`/api/trends?app=${encodeURIComponent(targetApp)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch trends");
      setTrendsData(data.trends);
      setThemePersistence(data.themePersistence);
    } catch (err) {
      setTrendsError((err as Error).message);
    } finally {
      setTrendsLoading(false);
    }
  }

  async function handleRun(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    setProgress(INITIAL_STEPS.map((s) => ({ ...s, status: "pending", details: undefined })));

    const eventSource = new EventSource(`/api/run-stream?week=${encodeURIComponent(week)}&limit=${limit}&app=${encodeURIComponent(app)}`);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { step, status, message, data } = payload;

        if (step === "complete" && status === "done") {
          setResult(data);
          setProgress((prev) =>
            prev.map((s) => (s.status === "running" ? { ...s, status: "done" } : s))
          );
          eventSource.close();
          setLoading(false);
          return;
        }

        if (step === "error" || status === "error") {
          setError(message || "An error occurred during agent run");
          setProgress((prev) =>
            prev.map((s) => (s.status === "running" ? { ...s, status: "error", details: message } : s))
          );
          eventSource.close();
          setLoading(false);
          return;
        }

        setProgress((prev) =>
          prev.map((s) => {
            if (s.id === step) {
              let details = message;
              if (status === "done" && data) {
                if (step === "fetch_reviews") {
                  details = `Scraped Apple: ${data.appleCount || 0} reviews, Google: ${data.googleCount || 0} reviews`;
                } else if (step === "analyze_sentiment" && data.sentiment) {
                  details = `App Health: ${data.sentiment.averageRating.toFixed(2)} ★ Average Rating`;
                } else if (step === "analyze_themes" && data.themes) {
                  details = `Identified: ${data.themes.map((t: any) => t.name).join(", ")}`;
                }
              }
              return { ...s, status, details };
            }
            return s;
          })
        );
      } catch (err) {
        console.error("Failed to parse SSE message:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("EventSource error:", err);
      setError("Connection to agent stream lost or failed.");
      eventSource.close();
      setLoading(false);
    };
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-4 flex-wrap">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                  {app === "groww" ? "Groww Pulse" : app === "zerodha" ? "Zerodha Pulse" : "Angel One Pulse"}
                </h1>
                <select
                  value={app}
                  onChange={(e) => {
                    const nextApp = e.target.value;
                    setApp(nextApp);
                    if (activeTab === "trends") {
                      fetchTrends(nextApp);
                    }
                  }}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer transition no-print"
                >
                  <option value="groww">Groww</option>
                  <option value="zerodha">Zerodha</option>
                  <option value="angelone">Angel One</option>
                </select>
              </div>
              <p className="text-slate-400 mt-1 text-sm">Weekly app store review analysis powered by AI</p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>Mem0 Memory</p>
              <p>LLM Analysis</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Tab Navigation */}
        <div className="flex gap-6 border-b border-slate-700 mb-8 no-print">
          <button
            onClick={() => setActiveTab("analysis")}
            className={`pb-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
              activeTab === "analysis"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            📊 Weekly Analysis
          </button>
          <button
            onClick={() => {
              setActiveTab("trends");
              fetchTrends(app);
            }}
            className={`pb-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
              activeTab === "trends"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            📈 History & Trends
          </button>
        </div>

        {activeTab === "analysis" ? (
          <>
            {/* Control Panel */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-8 shadow-lg no-print">
              <form onSubmit={handleRun} className="flex gap-4 items-end flex-wrap">
                <div className="flex-1 min-w-max">
                  <label className="block text-sm font-medium text-slate-300 mb-2">ISO Week</label>
                  <input
                    value={week}
                    onChange={(e) => setWeek(e.target.value)}
                    placeholder="2026-W20"
                    className="bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 w-full transition"
                  />
                  <p className="text-xs text-slate-500 mt-1">Format: YYYY-Www (e.g., 2026-W20)</p>
                </div>
                <div className="flex-1 min-w-max">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Review Limit</label>
                  <input
                    type="number"
                    value={limit}
                    onChange={(e) => setLimit(Math.max(1, Math.min(500, Number(e.target.value))))}
                    className="bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 w-full transition"
                  />
                  <p className="text-xs text-slate-500 mt-1">Max 500 reviews</p>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-semibold px-8 py-2.5 rounded-lg transition transform hover:scale-105 active:scale-95 shadow-lg disabled:shadow-none text-sm"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Analyzing...
                    </span>
                  ) : (
                    "Generate Pulse"
                  )}
                </button>
              </form>
            </div>

            {/* Delivery Channels Status & Config Panel */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-8 shadow-lg no-print">
              <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-700 pb-4 mb-4">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    📢 Automatic Report Delivery Settings
                  </h3>
                  <p className="text-slate-400 text-xs mt-1">Configure active notification channels for weekly review pulses</p>
                </div>
                
                <button
                  onClick={handleTestDelivery}
                  disabled={testingDelivery}
                  className="bg-slate-900 border border-slate-700 text-slate-300 hover:text-white disabled:text-slate-600 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition hover:border-slate-500 shadow"
                >
                  {testingDelivery ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Testing dispatches...
                    </>
                  ) : (
                    "Test Integrations Delivery"
                  )}
                </button>
              </div>

              {/* Status details / results */}
              {deliveryTestResult && (
                <div className="mb-4 text-xs bg-slate-900/60 border border-slate-700/60 rounded-lg px-4 py-2.5 font-mono text-emerald-400">
                  {deliveryTestResult}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {/* Slack channel card button */}
                <div 
                  onClick={() => setShowSlackConfig(!showSlackConfig)}
                  className={`bg-slate-900/40 border rounded-lg p-4 flex items-center justify-between transition cursor-pointer hover:bg-slate-900/60 hover:border-slate-500/50 ${
                    showSlackConfig ? 'border-emerald-500/80 bg-slate-900/60 ring-2 ring-emerald-500/10' : 'border-slate-700/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">💬</span>
                    <div>
                      <div className="text-xs font-semibold text-white">Slack Webhook</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Click to configure slack alerts</div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded border ${
                    deliveryStatus.slack
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-slate-800 text-slate-500 border-slate-700'
                  }`}>
                    {deliveryStatus.slack ? "Active" : "Unconfigured"}
                  </span>
                </div>

                {/* Email (SMTP) card button */}
                <div 
                  onClick={() => setShowEmailConfig(!showEmailConfig)}
                  className={`bg-slate-900/40 border rounded-lg p-4 flex items-center justify-between transition cursor-pointer hover:bg-slate-900/60 hover:border-slate-500/50 ${
                    showEmailConfig ? 'border-emerald-500/80 bg-slate-900/60 ring-2 ring-emerald-500/10' : 'border-slate-700/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📧</span>
                    <div>
                      <div className="text-xs font-semibold text-white">SMTP Email Dispatch</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Click to configure email alerts</div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded border ${
                    deliveryStatus.email
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-slate-800 text-slate-500 border-slate-700'
                  }`}>
                    {deliveryStatus.email ? "Active" : "Unconfigured"}
                  </span>
                </div>
              </div>

              {/* Settings Form */}
              {(showSlackConfig || showEmailConfig) && (
                <form onSubmit={handleSaveConfig} className="border-t border-slate-700/50 pt-6 space-y-6">
                  <div>
                    <h4 className="text-sm font-bold text-slate-300 mb-4 uppercase tracking-wider">Configure Integration Parameters</h4>
                    
                    {/* Slack Configuration */}
                    {showSlackConfig && (
                      <div className="bg-slate-900/20 border border-slate-700/50 rounded-lg p-4 mb-4">
                        <h5 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> Slack Webhook Settings
                        </h5>
                        <div>
                          <label className="block text-slate-400 text-xs mb-1.5">Slack Webhook URL</label>
                          <input
                            type="text"
                            value={slackUrl}
                            onChange={(e) => setSlackUrl(e.target.value)}
                            placeholder="https://hooks.slack.com/services/..."
                            className="bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 w-full font-mono"
                          />
                        </div>
                      </div>
                    )}

                    {/* Email Configuration */}
                    {showEmailConfig && (
                      <div className="bg-slate-900/20 border border-slate-700/50 rounded-lg p-4">
                        <h5 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> SMTP Email Server Settings
                        </h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="block text-slate-400 text-xs mb-1.5">SMTP Host</label>
                            <input
                              type="text"
                              value={smtpHost}
                              onChange={(e) => setSmtpHost(e.target.value)}
                              placeholder="smtp.gmail.com"
                              className="bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-400 text-xs mb-1.5">SMTP Port</label>
                            <input
                              type="text"
                              value={smtpPort}
                              onChange={(e) => setSmtpPort(e.target.value)}
                              placeholder="587"
                              className="bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 w-full"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="block text-slate-400 text-xs mb-1.5">SMTP Username</label>
                            <input
                              type="text"
                              value={smtpUser}
                              onChange={(e) => setSmtpUser(e.target.value)}
                              placeholder="user@gmail.com"
                              className="bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-400 text-xs mb-1.5">SMTP Password</label>
                            <input
                              type="password"
                              value={smtpPass}
                              onChange={(e) => setSmtpPass(e.target.value)}
                              placeholder="SMTP password"
                              className="bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 w-full"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-slate-400 text-xs mb-1.5">Recipient Email (To)</label>
                            <input
                              type="text"
                              value={emailTo}
                              onChange={(e) => setEmailTo(e.target.value)}
                              placeholder="pm@groww.in"
                              className="bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 w-full font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-400 text-xs mb-1.5">Sender Email (From)</label>
                            <input
                              type="text"
                              value={emailFrom}
                              onChange={(e) => setEmailFrom(e.target.value)}
                              placeholder="groww-pulse@groww.in"
                              className="bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 w-full font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Save action status message */}
                  {saveStatus && (
                    <div className="text-xs bg-slate-900/60 border border-slate-700/60 rounded px-4 py-2 font-mono text-center text-slate-200">
                      {saveStatus}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-2 rounded-lg text-xs transition disabled:bg-slate-700 disabled:text-slate-400 shadow-md cursor-pointer"
                    >
                      {saving ? "Saving settings..." : "Save Configuration Settings"}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Loading / Stepper State */}
            {loading && (
              <div className="mb-8 bg-slate-800/80 border border-slate-700/80 rounded-lg p-6 shadow-xl backdrop-blur-sm">
                <div className="flex items-center justify-between mb-6 border-b border-slate-700/50 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-3.5 h-3.5 bg-emerald-500 rounded-full animate-ping absolute" />
                      <div className="w-3.5 h-3.5 bg-emerald-500 rounded-full relative" />
                    </div>
                    <span className="text-sm font-bold text-slate-200 tracking-wide uppercase">
                      Agent Execution Pipeline
                    </span>
                  </div>
                  <span className="text-xs font-semibold bg-slate-900 border border-slate-700/60 rounded px-2.5 py-1 text-slate-400">
                    Week: {week}
                  </span>
                </div>

                <div className="relative border-l border-slate-700 ml-3.5 pl-6 space-y-6">
                  {progress.map((step) => {
                    const isPending = step.status === "pending";
                    const isRunning = step.status === "running";
                    const isDone = step.status === "done";
                    const isError = step.status === "error";

                    return (
                      <div key={step.id} className="relative flex flex-col items-start transition-all duration-300">
                        {/* Step Marker Indicator */}
                        <div className="absolute -left-[31px] top-1 flex items-center justify-center">
                          {isPending && (
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-600 bg-slate-800" />
                          )}
                          {isRunning && (
                            <div className="relative flex items-center justify-center">
                              <span className="animate-ping absolute inline-flex h-4 w-4 rounded-full bg-emerald-400 opacity-75"></span>
                              <div className="w-3.5 h-3.5 rounded-full bg-emerald-500" />
                            </div>
                          )}
                          {isDone && (
                            <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950 text-[10px] font-bold">
                              ✓
                            </div>
                          )}
                          {isError && (
                            <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white text-[10px] font-bold">
                              !
                            </div>
                          )}
                        </div>

                        {/* Step Details */}
                        <div className="flex flex-col">
                          <span
                            className={`text-sm font-semibold transition-colors duration-200 ${
                              isRunning
                                ? "text-emerald-400"
                                : isDone
                                ? "text-slate-200"
                                : isError
                                ? "text-red-400"
                                : "text-slate-500"
                            }`}
                          >
                            {step.label}
                          </span>
                          
                          {/* Details Metadata */}
                          {step.details && (
                            <span className="text-xs text-slate-400 mt-1 font-mono bg-slate-900/60 border border-slate-800 rounded px-2 py-1 leading-normal max-w-lg">
                              {step.details}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="mb-8 bg-red-900/20 border border-red-700/50 rounded-lg p-6">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-red-300 font-medium">Error</p>
                    <p className="text-red-200 text-sm mt-1">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="space-y-8">
                {/* Export Controls Bar */}
                <div className="flex justify-end gap-3 no-print">
                  <button
                    onClick={() => window.print()}
                    className="bg-slate-800 border border-slate-700 hover:border-slate-650 hover:text-white text-slate-300 font-bold px-4 py-2.5 rounded-lg text-xs flex items-center gap-2 transition cursor-pointer shadow"
                  >
                    <span>📄</span> Export Report (PDF)
                  </button>
                  <a
                    href={`/api/export/csv?app=${encodeURIComponent(app)}`}
                    download
                    className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold px-4 py-2.5 rounded-lg text-xs flex items-center gap-2 transition shadow cursor-pointer"
                  >
                    <span>📥</span> Export Historical Trends (CSV)
                  </a>
                </div>
                {/* Sentiment Dashboard Section */}
                {result.sentiment && (
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                      <span className="w-1 h-8 bg-gradient-to-b from-teal-400 to-indigo-400 rounded-full" />
                      Sentiment & App Health Dashboard
                    </h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Card 1: Sentiment Breakdown */}
                      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 shadow-lg flex flex-col justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Sentiment Distribution</h3>
                          
                          {/* Percentages */}
                          {(() => {
                            const total = (result.sentiment.positive || 0) + (result.sentiment.neutral || 0) + (result.sentiment.negative || 0) || 1;
                            const posPct = Math.round((result.sentiment.positive / total) * 100);
                            const neuPct = Math.round((result.sentiment.neutral / total) * 100);
                            const negPct = 100 - posPct - neuPct; // Ensure sum is exactly 100%
                            
                            return (
                              <div>
                                <div className="flex items-baseline gap-2 mb-3">
                                  <span className="text-3xl font-extrabold text-emerald-400">{posPct}%</span>
                                  <span className="text-xs text-slate-400">Positive</span>
                                </div>

                                {/* Stacked Sentiment Bar */}
                                <div className="flex h-3.5 w-full rounded-full overflow-hidden bg-slate-700 mb-6">
                                  <div style={{ width: `${posPct}%` }} className="bg-emerald-500 h-full transition-all duration-500" title={`Positive: ${posPct}%`} />
                                  <div style={{ width: `${neuPct}%` }} className="bg-amber-500 h-full transition-all duration-500" title={`Neutral: ${neuPct}%`} />
                                  <div style={{ width: `${negPct}%` }} className="bg-red-500 h-full transition-all duration-500" title={`Negative: ${negPct}%`} />
                                </div>

                                {/* Metrics List */}
                                <div className="space-y-2 text-xs">
                                  <div className="flex justify-between items-center text-slate-300">
                                    <span className="flex items-center gap-2">
                                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Positive Reviews
                                    </span>
                                    <span className="font-semibold">{result.sentiment.positive} ({posPct}%)</span>
                                  </div>
                                  <div className="flex justify-between items-center text-slate-300">
                                    <span className="flex items-center gap-2">
                                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Neutral Reviews
                                    </span>
                                    <span className="font-semibold">{result.sentiment.neutral} ({neuPct}%)</span>
                                  </div>
                                  <div className="flex justify-between items-center text-slate-300">
                                    <span className="flex items-center gap-2">
                                      <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Negative Reviews
                                    </span>
                                    <span className="font-semibold">{result.sentiment.negative} ({negPct}%)</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Card 2: Rating Score & App Health */}
                      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 shadow-lg flex flex-col justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Average App Rating</h3>
                          
                          <div className="flex items-center gap-4 mb-4">
                            <div className="text-5xl font-black text-white">{result.sentiment.averageRating.toFixed(2)}</div>
                            <div>
                              <div className="text-slate-400 text-xs uppercase font-medium">Out of 5.0</div>
                              {/* Stars */}
                              <div className="flex text-amber-400 text-sm mt-0.5">
                                {Array.from({ length: 5 }).map((_, idx) => {
                                  const starVal = idx + 1;
                                  const rating = result.sentiment!.averageRating;
                                  if (rating >= starVal) {
                                    return <span key={idx}>★</span>;
                                  } else if (rating >= starVal - 0.5) {
                                    return <span key={idx} className="relative text-slate-600">★<span className="absolute left-0 top-0 overflow-hidden w-1/2 text-amber-400">★</span></span>;
                                  } else {
                                    return <span key={idx} className="text-slate-600">★</span>;
                                  }
                                })}
                              </div>
                            </div>
                          </div>

                          {/* Status Descriptor Card */}
                          {(() => {
                            const score = result.sentiment.averageRating;
                            let label = "Moderate Health";
                            let colorClasses = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                            let desc = "Users are reporting moderate satisfaction. App performance & key flows are mostly stable.";
                            
                            if (score >= 4.0) {
                              label = "Excellent Health";
                              colorClasses = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                              desc = "High customer satisfaction score. Highly functional and optimized app performance.";
                            } else if (score < 3.0) {
                              label = "Critical Status";
                              colorClasses = "bg-red-500/10 text-red-400 border-red-500/20";
                              desc = "Significant user friction detected. High volume of complaints regarding bugs or crashes.";
                            }

                            return (
                              <div className={`mt-4 rounded-lg p-4 border ${colorClasses}`}>
                                <div className="text-sm font-bold uppercase tracking-wider mb-1">{label}</div>
                                <div className="text-xs opacity-90 leading-relaxed">{desc}</div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Card 3: Rating Distribution Histogram */}
                      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 shadow-lg">
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Rating Breakdown</h3>
                        
                        <div className="space-y-3">
                          {([5, 4, 3, 2, 1] as const).map((star) => {
                            const count = result.sentiment!.ratings[star] || 0;
                            const total = Object.values(result.sentiment!.ratings).reduce((a, b) => a + b, 0) || 1;
                            const pct = Math.round((count / total) * 100);
                            
                            return (
                              <div key={star} className="flex items-center gap-3 text-xs">
                                <span className="w-8 text-slate-400 font-medium text-right flex items-center justify-end gap-0.5">
                                  {star} <span className="text-amber-500 text-[10px]">★</span>
                                </span>
                                <div className="flex-1 h-2 rounded-full bg-slate-700 overflow-hidden">
                                  <div 
                                    style={{ width: `${pct}%` }} 
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      star >= 4 ? 'bg-emerald-500' : star === 3 ? 'bg-amber-500' : 'bg-red-500'
                                    }`} 
                                  />
                                </div>
                                <span className="w-12 text-slate-400 text-right font-medium">
                                  {count} ({pct}%)
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {/* Themes Section */}
                {result.themes && result.themes.length > 0 && (
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                      <span className="w-1 h-8 bg-gradient-to-b from-emerald-400 to-cyan-400 rounded-full" />
                      Key Themes
                    </h2>
                    <div className="grid gap-4">
                      {result.themes.map((theme, i) => (
                        <div
                          key={i}
                          className="group bg-gradient-to-br from-slate-800 to-slate-800/50 border border-slate-700 hover:border-emerald-500/50 rounded-lg p-6 transition hover:shadow-xl hover:shadow-emerald-500/10"
                        >
                          <div className="flex items-start gap-4">
                            <div className="flex-shrink-0">
                              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 text-slate-900 font-bold text-lg">
                                {i + 1}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-lg font-semibold text-white group-hover:text-emerald-300 transition">
                                {theme.name}
                              </h3>
                              {theme.quote && (
                                <blockquote className="border-l-2 border-emerald-500/30 pl-4 mt-3 text-slate-300 italic text-sm leading-relaxed">
                                  "{theme.quote}"
                                </blockquote>
                              )}
                              {theme.action && (
                                <div className="mt-4 flex items-start gap-2">
                                  <span className="text-emerald-400 font-bold mt-0.5 flex-shrink-0">→</span>
                                  <p className="text-slate-300 text-sm">{theme.action}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Analyzed Reviews Section */}
                {((result.appleReviews && result.appleReviews.length > 0) || 
                  (result.googleReviews && result.googleReviews.length > 0)) && (
                  <section>
                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                      <span className="w-1 h-8 bg-gradient-to-b from-indigo-400 to-cyan-400 rounded-full" />
                      Analyzed Reviews ({(result.appleReviews?.length || 0) + (result.googleReviews?.length || 0)})
                    </h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Apple App Store Reviews */}
                      <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden shadow-lg flex flex-col">
                        <div className="bg-slate-800/80 border-b border-slate-700 px-4 py-3 flex items-center gap-2">
                          <span className="text-slate-400 text-lg font-bold">🍎</span>
                          <h3 className="text-sm font-semibold text-white">Apple App Store ({result.appleReviews?.length || 0})</h3>
                        </div>
                        <div className="max-h-96 overflow-y-auto divide-y divide-slate-800/60 flex-1">
                          {result.appleReviews && result.appleReviews.length > 0 ? (
                            result.appleReviews.map((review, i) => (
                              <div key={review.id || i} className="p-4 hover:bg-slate-800/40 transition">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                                      review.rating >= 4 
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                        : review.rating <= 2 
                                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    }`}>
                                      {review.rating} ★
                                    </span>
                                    <h4 className="text-sm font-semibold text-white truncate max-w-[180px]">
                                      {review.title || "(No Title)"}
                                    </h4>
                                  </div>
                                  <span className="text-[10px] text-slate-500">{review.updated}</span>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">
                                  {review.content}
                                </p>
                              </div>
                            ))
                          ) : (
                            <div className="p-8 text-center text-xs text-slate-500">No Apple App Store reviews found.</div>
                          )}
                        </div>
                      </div>

                      {/* Google Play Store Reviews */}
                      <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden shadow-lg flex flex-col">
                        <div className="bg-slate-800/80 border-b border-slate-700 px-4 py-3 flex items-center gap-2">
                          <span className="text-cyan-400 text-lg font-bold">🤖</span>
                          <h3 className="text-sm font-semibold text-white">Google Play Store ({result.googleReviews?.length || 0})</h3>
                        </div>
                        <div className="max-h-96 overflow-y-auto divide-y divide-slate-800/60 flex-1">
                          {result.googleReviews && result.googleReviews.length > 0 ? (
                            result.googleReviews.map((review, i) => (
                              <div key={review.id || i} className="p-4 hover:bg-slate-800/40 transition">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                                      review.rating >= 4 
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                        : review.rating <= 2 
                                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    }`}>
                                      {review.rating} ★
                                    </span>
                                    <h4 className="text-sm font-semibold text-white truncate max-w-[180px]">
                                      {review.title || "(No Title)"}
                                    </h4>
                                  </div>
                                  <span className="text-[10px] text-slate-500">{review.updated}</span>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">
                                  {review.content}
                                </p>
                              </div>
                            ))
                          ) : (
                            <div className="p-8 text-center text-xs text-slate-500">No Google Play Store reviews found.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {/* Full Report Section */}
                <section>
                  <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                    <span className="w-1 h-8 bg-gradient-to-b from-cyan-400 to-emerald-400 rounded-full" />
                    Full Report
                  </h2>
                  <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden shadow-lg">
                    <div className="bg-slate-800/50 border-b border-slate-700 px-6 py-3">
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Week {result.week}
                      </p>
                    </div>
                    <div className="prose prose-invert max-w-none p-6">
                      <div className="text-slate-300 prose-headings:text-white prose-headings:font-bold prose-strong:text-emerald-300 prose-code:text-cyan-300">
                        <ReactMarkdown>{result.markdown}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* Empty State */}
            {!loading && !result && !error && (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400/10 to-cyan-400/10 border border-emerald-500/20 mb-6">
                  <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="text-slate-400 text-lg font-medium mb-2">Ready to analyze</p>
                <p className="text-slate-500 text-sm">Select a week and click "Generate Pulse" to get started</p>
              </div>
            )}
          </>
        ) : (
          /* Feature 2: Trends Dashboard View */
          <div className="space-y-8">
            {trendsLoading && (
              <div className="bg-emerald-900/20 border border-emerald-700/50 rounded-lg p-6">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-emerald-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <p className="text-emerald-300 font-medium">Fetching historical trends from Mem0...</p>
                </div>
              </div>
            )}

            {trendsError && (
              <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-6">
                <p className="text-red-300 font-medium">Error loading trends: {trendsError}</p>
              </div>
            )}

            {trendsData && trendsData.length > 0 && (
              <>
                {/* Export CSV Bar */}
                <div className="flex justify-end mb-6 no-print">
                  <a
                    href={`/api/export/csv?app=${encodeURIComponent(app)}`}
                    download
                    className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold px-4 py-2.5 rounded-lg text-xs flex items-center gap-2 transition shadow cursor-pointer"
                  >
                    <span>📥</span> Export Timeline Trends (CSV)
                  </a>
                </div>
                {/* 2-Column Layout for Charts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Rating Trend Line Chart Card */}
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 shadow-lg">
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Weekly Average Rating Trend</h3>
                    
                    {(() => {
                      const width = 500;
                      const height = 240;
                      const paddingLeft = 40;
                      const paddingRight = 20;
                      const paddingTop = 20;
                      const paddingBottom = 40;
                      
                      const chartWidth = width - paddingLeft - paddingRight;
                      const chartHeight = height - paddingTop - paddingBottom;
                      
                      const points = trendsData.map((d, idx) => {
                        const x = paddingLeft + (idx / Math.max(1, trendsData.length - 1)) * chartWidth;
                        const y = paddingTop + (1 - (d.averageRating - 1) / 4) * chartHeight;
                        return `${x},${y}`;
                      }).join(" ");

                      return (
                        <div className="relative">
                          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
                            {/* Grid Lines */}
                            {[1, 2, 3, 4, 5].map((val) => {
                              const y = paddingTop + (1 - (val - 1) / 4) * chartHeight;
                              return (
                                <g key={val}>
                                  <line 
                                    x1={paddingLeft} 
                                    y1={y} 
                                    x2={width - paddingRight} 
                                    y2={y} 
                                    className="stroke-slate-700/50" 
                                    strokeWidth="1" 
                                    strokeDasharray="4 4" 
                                  />
                                  <text 
                                    x={paddingLeft - 10} 
                                    y={y + 4} 
                                    className="fill-slate-500 text-[10px] text-right font-medium"
                                    textAnchor="end"
                                  >
                                    {val.toFixed(1)}
                                  </text>
                                </g>
                              );
                            })}

                            <defs>
                              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
                                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                              </linearGradient>
                              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="3" result="blur" />
                                <feComposite in="SourceGraphic" in2="blur" operator="over" />
                              </filter>
                            </defs>

                            {trendsData.length > 1 && (
                              <path
                                d={`M ${paddingLeft},${height - paddingBottom} 
                                    L ${points.split(" ").join(" L ")} 
                                    L ${paddingLeft + chartWidth},${height - paddingBottom} Z`}
                                fill="url(#chartGrad)"
                              />
                            )}

                            {trendsData.length > 1 && (
                              <polyline
                                fill="none"
                                stroke="#10b981"
                                strokeWidth="3"
                                filter="url(#glow)"
                                points={points}
                              />
                            )}

                            {trendsData.map((d, idx) => {
                              const x = paddingLeft + (idx / Math.max(1, trendsData.length - 1)) * chartWidth;
                              const y = paddingTop + (1 - (d.averageRating - 1) / 4) * chartHeight;
                              return (
                                <g key={idx} className="group cursor-pointer">
                                  <circle
                                    cx={x}
                                    cy={y}
                                    r="5"
                                    className="fill-emerald-400 stroke-slate-900 stroke-2 hover:r-7 transition-all duration-200"
                                  />
                                  <title>{`${d.week}: ${d.averageRating.toFixed(2)} ★`}</title>
                                  <text
                                    x={x}
                                    y={height - paddingBottom + 18}
                                    className="fill-slate-400 text-[9px] font-semibold text-center"
                                    textAnchor="middle"
                                  >
                                    {d.week.replace(/^\d{4}-/, "")}
                                  </text>
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Sentiment Stacked Bar Chart Card */}
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 shadow-lg flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6">Sentiment Ratio Progression</h3>
                      
                      <div className="flex justify-around items-end h-48 px-4 pb-2 border-b border-slate-700/60">
                        {trendsData.map((d, idx) => {
                          const total = (d.positive || 0) + (d.neutral || 0) + (d.negative || 0) || 1;
                          const posPct = Math.round((d.positive / total) * 100);
                          const neuPct = Math.round((d.neutral / total) * 100);
                          const negPct = 100 - posPct - neuPct;

                          return (
                            <div key={idx} className="flex flex-col items-center gap-2 group cursor-pointer w-8">
                              <div className="w-5 h-36 rounded bg-slate-700 overflow-hidden flex flex-col-reverse relative shadow-inner">
                                <div style={{ height: `${posPct}%` }} className="bg-emerald-500 w-full transition-all duration-500 hover:brightness-110" title={`Positive: ${posPct}%`} />
                                <div style={{ height: `${neuPct}%` }} className="bg-amber-500 w-full transition-all duration-500 hover:brightness-110" title={`Neutral: ${neuPct}%`} />
                                <div style={{ height: `${negPct}%` }} className="bg-red-500 w-full transition-all duration-500 hover:brightness-110" title={`Negative: ${negPct}%`} />
                              </div>
                              <span className="text-[9px] text-slate-400 font-semibold">{d.week.replace(/^\d{4}-/, "")}</span>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex gap-4 justify-center text-xs mt-4">
                        <span className="flex items-center gap-1.5 text-slate-300">
                          <span className="w-2.5 h-2.5 rounded bg-emerald-500" /> Positive
                        </span>
                        <span className="flex items-center gap-1.5 text-slate-300">
                          <span className="w-2.5 h-2.5 rounded bg-amber-500" /> Neutral
                        </span>
                        <span className="flex items-center gap-1.5 text-slate-300">
                          <span className="w-2.5 h-2.5 rounded bg-red-500" /> Negative
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Theme Persistence Tracker Card */}
                {themePersistence && themePersistence.length > 0 && (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 shadow-lg">
                    <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                      <span className="w-1 h-6 bg-gradient-to-b from-amber-400 to-red-400 rounded-full" />
                      Persistent Issues & Hotspots
                    </h2>
                    <p className="text-slate-400 text-xs mb-4">
                      Ranked by recurrence frequency in your {app === "groww" ? "Groww" : app === "zerodha" ? "Zerodha" : "Angel One"} App review history pulled from Mem0 long-term memory.
                    </p>

                    <div className="divide-y divide-slate-700/60">
                      {themePersistence.map((tp, idx) => {
                        const maxCount = Math.max(...themePersistence.map(t => t.count)) || 1;
                        const barPct = Math.round((tp.count / maxCount) * 100);

                        return (
                          <div key={idx} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                                <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold ${
                                  idx === 0 
                                    ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                                    : idx === 1 
                                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                }`}>
                                  #{idx + 1}
                                </span>
                                {tp.name}
                              </h4>
                              <div className="w-full md:w-80 h-1.5 rounded-full bg-slate-700 mt-2 overflow-hidden">
                                <div 
                                  style={{ width: `${barPct}%` }} 
                                  className={`h-full rounded-full ${
                                    idx === 0 ? 'bg-red-500' : idx === 1 ? 'bg-orange-500' : 'bg-amber-500'
                                  }`} 
                                />
                              </div>
                            </div>
                            <div className="flex-shrink-0 flex items-center gap-3">
                              <span className="text-xs bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 font-semibold text-slate-300">
                                Recurred in {tp.count} {tp.count === 1 ? 'week' : 'weeks'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700 bg-slate-900/50 mt-16 py-6 no-print">
        <div className="max-w-6xl mx-auto px-6 text-center text-slate-500 text-xs">
          <p>{app === "groww" ? "Groww" : app === "zerodha" ? "Zerodha" : "Angel One"} Weekly Pulse • AI-powered review analysis with persistent memory</p>
        </div>
      </footer>
    </div>
  );
}
