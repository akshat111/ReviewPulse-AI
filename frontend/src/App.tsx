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

  // Dynamic branding configurations based on the selected application
  const appBranding = {
    groww: {
      title: "Groww Pulse",
      gradient: "from-emerald-400 via-teal-400 to-cyan-400",
      accent: "text-emerald-400",
      glowBg: "bg-emerald-500/10",
      borderGlow: "border-emerald-500/20",
      btnGrad: "from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400",
      ringGlow: "focus:ring-emerald-500/20",
      focusBorder: "focus:border-emerald-500"
    },
    zerodha: {
      title: "Zerodha Pulse",
      gradient: "from-orange-400 via-amber-400 to-yellow-300",
      accent: "text-orange-400",
      glowBg: "bg-orange-500/10",
      borderGlow: "border-orange-500/20",
      btnGrad: "from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400",
      ringGlow: "focus:ring-orange-500/20",
      focusBorder: "focus:border-orange-500"
    },
    angelone: {
      title: "Angel One Pulse",
      gradient: "from-blue-400 via-cyan-400 to-indigo-400",
      accent: "text-blue-400",
      glowBg: "bg-blue-500/10",
      borderGlow: "border-blue-500/20",
      btnGrad: "from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400",
      ringGlow: "focus:ring-blue-500/20",
      focusBorder: "focus:border-blue-500"
    }
  }[app as "groww" | "zerodha" | "angelone"] || {
    title: "ReviewPulse-AI",
    gradient: "from-emerald-400 to-cyan-400",
    accent: "text-emerald-400",
    glowBg: "bg-emerald-500/10",
    borderGlow: "border-emerald-500/20",
    btnGrad: "from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400",
    ringGlow: "focus:ring-emerald-500/20",
    focusBorder: "focus:border-emerald-500"
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 relative overflow-hidden bg-grid-pattern pb-16 antialiased">
      {/* Background ambient lighting effects */}
      <div className="absolute inset-0 ambient-glow-1 pointer-events-none z-0" />
      <div className="absolute inset-0 ambient-glow-2 pointer-events-none z-0" />
      <div className="absolute inset-0 ambient-glow-3 pointer-events-none z-0" />

      {/* Header section with glassmorphic style */}
      <header className="border-b border-white/5 bg-[#0b101c]/30 backdrop-blur-md sticky top-0 z-50 transition-all duration-300 no-print">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              {/* Decorative Brand Logo Icon */}
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0f172a] to-[#1e293b] border border-white/10 flex items-center justify-center shadow-lg shadow-black/40">
                <span className="text-xl">📊</span>
              </div>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className={`text-2xl font-black bg-gradient-to-r ${appBranding.gradient} bg-clip-text text-transparent font-display tracking-tight`}>
                    {appBranding.title}
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
                    className="bg-[#0e1626]/80 border border-white/10 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer hover:bg-[#152037] transition shadow-inner no-print"
                  >
                    <option value="groww">Groww</option>
                    <option value="zerodha">Zerodha</option>
                    <option value="angelone">Angel One</option>
                  </select>
                </div>
                <p className="text-slate-400 mt-0.5 text-xs font-medium">Autonomous agentic intelligence for user reviews</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] uppercase font-bold tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md glow-text-emerald">
                Mem0 Connected
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-md glow-text-cyan">
                Agent Active
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main dashboard body */}
      <main className="max-w-6xl mx-auto px-6 py-8 relative z-10 animate-fade-in-up">
        {/* Navigation tabs */}
        <div className="flex gap-4 border-b border-white/5 mb-8 no-print tabs-container">
          <button
            onClick={() => setActiveTab("analysis")}
            className={`pb-3 text-xs uppercase tracking-widest font-extrabold border-b-2 transition-all duration-300 flex items-center gap-2 ${
              activeTab === "analysis"
                ? `border-emerald-500 text-emerald-400 glow-text-emerald`
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            📋 Weekly Analysis
          </button>
          <button
            onClick={() => {
              setActiveTab("trends");
              fetchTrends(app);
            }}
            className={`pb-3 text-xs uppercase tracking-widest font-extrabold border-b-2 transition-all duration-300 flex items-center gap-2 ${
              activeTab === "trends"
                ? `border-emerald-500 text-emerald-400 glow-text-emerald`
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            📈 History & Trends
          </button>
        </div>

        {activeTab === "analysis" ? (
          <div className="space-y-8">
            {/* Control Form Card */}
            <div className="glass-panel rounded-2xl p-6 shadow-2xl relative overflow-hidden no-print">
              <div className="absolute right-0 top-0 w-24 h-24 bg-white/[0.01] rounded-full blur-xl pointer-events-none" />
              <form onSubmit={handleRun} className="flex gap-6 items-end flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs uppercase tracking-widest font-extrabold text-slate-300 mb-2">Target ISO Week</label>
                  <input
                    value={week}
                    onChange={(e) => setWeek(e.target.value)}
                    placeholder="2026-W20"
                    className={`bg-[#0b101c]/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none ${appBranding.focusBorder} focus:ring-4 ${appBranding.ringGlow} w-full transition duration-200 shadow-inner`}
                  />
                  <p className="text-[10px] text-slate-500 mt-1.5 font-medium">Specify target week (e.g. YYYY-Www)</p>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs uppercase tracking-widest font-extrabold text-slate-300 mb-2">Review Scrape Limit</label>
                  <input
                    type="number"
                    value={limit}
                    onChange={(e) => setLimit(Math.max(1, Math.min(500, Number(e.target.value))))}
                    className={`bg-[#0b101c]/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none ${appBranding.focusBorder} focus:ring-4 ${appBranding.ringGlow} w-full transition duration-200 shadow-inner`}
                  />
                  <p className="text-[10px] text-slate-500 mt-1.5 font-medium">Scrape boundary (1 - 500 reviews)</p>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className={`bg-gradient-to-r ${appBranding.btnGrad} disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-slate-950 font-bold px-8 py-3 rounded-xl transition-all duration-300 transform hover:scale-[1.03] active:scale-[0.97] shadow-xl disabled:shadow-none text-xs uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2`}
                >
                  {loading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin text-slate-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Running Agent...
                    </>
                  ) : (
                    "Launch Agent Analysis"
                  )}
                </button>
              </form>
            </div>

            {/* Notification Integrations Panel */}
            <div className="glass-panel rounded-2xl p-6 shadow-2xl relative no-print">
              <div className="flex items-center justify-between flex-wrap gap-4 border-b border-white/5 pb-4 mb-5">
                <div>
                  <h3 className="text-sm uppercase tracking-widest font-extrabold text-white flex items-center gap-2">
                    📢 Automated Report Delivery Config
                  </h3>
                  <p className="text-slate-400 text-[10px] mt-1 font-medium">Direct dispatch parameters for executive Slack and Email channels</p>
                </div>
                
                <button
                  onClick={handleTestDelivery}
                  disabled={testingDelivery}
                  className="bg-[#0f172a]/60 border border-white/10 hover:border-emerald-500/30 text-slate-300 hover:text-emerald-400 disabled:text-slate-600 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition duration-200 shadow cursor-pointer"
                >
                  {testingDelivery ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Testing Webhooks...
                    </>
                  ) : (
                    "Test Dispatches"
                  )}
                </button>
              </div>

              {/* Status details / results */}
              {deliveryTestResult && (
                <div className="mb-4 text-[10px] bg-[#0c1322] border border-white/5 rounded-xl px-4 py-3 font-mono text-emerald-400 leading-relaxed">
                  {deliveryTestResult}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                {/* Slack Channel config trigger */}
                <div 
                  onClick={() => setShowSlackConfig(!showSlackConfig)}
                  className={`bg-[#0e1626]/40 border rounded-xl p-4 flex items-center justify-between transition duration-300 cursor-pointer hover:bg-[#142038]/60 hover:border-emerald-500/20 ${
                    showSlackConfig ? 'border-emerald-500/30 bg-[#101b30]/60 ring-2 ring-emerald-500/5' : 'border-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/5 flex items-center justify-center border border-emerald-500/10">
                      <span className="text-base">💬</span>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-200">Slack Integration</div>
                      <div className="text-[10px] text-slate-500 mt-0.5 font-medium">Configure slack webhook endpoint</div>
                    </div>
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded border transition duration-300 ${
                    deliveryStatus.slack
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 glow-text-emerald'
                      : 'bg-slate-900 text-slate-500 border-white/5'
                  }`}>
                    {deliveryStatus.slack ? "Active" : "Disabled"}
                  </span>
                </div>

                {/* Email (SMTP) card config trigger */}
                <div 
                  onClick={() => setShowEmailConfig(!showEmailConfig)}
                  className={`bg-[#0e1626]/40 border rounded-xl p-4 flex items-center justify-between transition duration-300 cursor-pointer hover:bg-[#142038]/60 hover:border-emerald-500/20 ${
                    showEmailConfig ? 'border-emerald-500/30 bg-[#101b30]/60 ring-2 ring-emerald-500/5' : 'border-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/5 flex items-center justify-center border border-emerald-500/10">
                      <span className="text-base">📧</span>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-200">Email SMTP Relay</div>
                      <div className="text-[10px] text-slate-500 mt-0.5 font-medium">SMTP authentication & settings</div>
                    </div>
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded border transition duration-300 ${
                    deliveryStatus.email
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 glow-text-emerald'
                      : 'bg-slate-900 text-slate-500 border-white/5'
                  }`}>
                    {deliveryStatus.email ? "Active" : "Disabled"}
                  </span>
                </div>
              </div>

              {/* Settings Configuration Form Drawer */}
              {(showSlackConfig || showEmailConfig) && (
                <form onSubmit={handleSaveConfig} className="border-t border-white/5 pt-5 space-y-6">
                  <div>
                    {/* Slack Form Block */}
                    {showSlackConfig && (
                      <div className="bg-[#0e1626]/20 border border-white/5 rounded-xl p-5 mb-4">
                        <h5 className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-4 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> Slack Hook Setup
                        </h5>
                        <div>
                          <label className="block text-slate-400 text-xs font-medium mb-2">Webhook URL</label>
                          <input
                            type="text"
                            value={slackUrl}
                            onChange={(e) => setSlackUrl(e.target.value)}
                            placeholder="https://hooks.slack.com/services/..."
                            className="bg-[#0b101c]/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 w-full font-mono shadow-inner"
                          />
                        </div>
                      </div>
                    )}

                    {/* Email Form Block */}
                    {showEmailConfig && (
                      <div className="bg-[#0e1626]/20 border border-white/5 rounded-xl p-5">
                        <h5 className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-4 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> SMTP Host Parameters
                        </h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="block text-slate-400 text-xs font-medium mb-2">SMTP Host</label>
                            <input
                              type="text"
                              value={smtpHost}
                              onChange={(e) => setSmtpHost(e.target.value)}
                              placeholder="smtp.gmail.com"
                              className="bg-[#0b101c]/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 w-full shadow-inner"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-400 text-xs font-medium mb-2">SMTP Port</label>
                            <input
                              type="text"
                              value={smtpPort}
                              onChange={(e) => setSmtpPort(e.target.value)}
                              placeholder="587"
                              className="bg-[#0b101c]/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 w-full shadow-inner"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="block text-slate-400 text-xs font-medium mb-2">SMTP Username</label>
                            <input
                              type="text"
                              value={smtpUser}
                              onChange={(e) => setSmtpUser(e.target.value)}
                              placeholder="user@gmail.com"
                              className="bg-[#0b101c]/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 w-full shadow-inner"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-400 text-xs font-medium mb-2">SMTP Password</label>
                            <input
                              type="password"
                              value={smtpPass}
                              onChange={(e) => setSmtpPass(e.target.value)}
                              placeholder="SMTP password"
                              className="bg-[#0b101c]/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 w-full shadow-inner"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-slate-400 text-xs font-medium mb-2">Recipient (To)</label>
                            <input
                              type="text"
                              value={emailTo}
                              onChange={(e) => setEmailTo(e.target.value)}
                              placeholder="product@groww.in"
                              className="bg-[#0b101c]/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 w-full font-mono shadow-inner"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-400 text-xs font-medium mb-2">Sender (From)</label>
                            <input
                              type="text"
                              value={emailFrom}
                              onChange={(e) => setEmailFrom(e.target.value)}
                              placeholder="groww-pulse@groww.in"
                              className="bg-[#0b101c]/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 w-full font-mono shadow-inner"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Settings save indicator message */}
                  {saveStatus && (
                    <div className="text-[10px] bg-[#0c1322] border border-white/5 rounded-lg px-4 py-2 font-mono text-center text-slate-200 max-w-sm mx-auto">
                      {saveStatus}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider transition disabled:bg-slate-800 disabled:text-slate-500 shadow-md cursor-pointer"
                    >
                      {saving ? "Saving Configurations..." : "Apply Config Parameters"}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Stepper Pipeline Stage Renderer */}
            {loading && (
              <div className="glass-panel rounded-2xl p-6 shadow-2xl relative overflow-hidden">
                <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="relative flex items-center justify-center">
                      <div className="w-3.5 h-3.5 bg-emerald-500 rounded-full animate-ping absolute opacity-70" />
                      <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full relative shadow shadow-emerald-500" />
                    </div>
                    <span className="text-xs font-extrabold text-slate-200 tracking-widest uppercase">
                      Agent Analysis Pipeline
                    </span>
                  </div>
                  <span className="text-[10px] font-bold bg-[#0c1322] border border-white/5 rounded-lg px-2.5 py-1 text-slate-400 font-mono">
                    Target: {week}
                  </span>
                </div>

                <div className="relative border-l border-white/5 ml-3 pl-6 space-y-6">
                  {progress.map((step) => {
                    const isPending = step.status === "pending";
                    const isRunning = step.status === "running";
                    const isDone = step.status === "done";
                    const isError = step.status === "error";

                    return (
                      <div key={step.id} className="relative flex flex-col items-start transition-all duration-300">
                        {/* Custom SVG / Pulse Step Markers */}
                        <div className="absolute -left-[32px] top-1 flex items-center justify-center">
                          {isPending && (
                            <div className="w-3 h-3 rounded-full border border-slate-700 bg-slate-950" />
                          )}
                          {isRunning && (
                            <div className="relative flex items-center justify-center">
                              <span className="animate-ping absolute inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500 opacity-75"></span>
                              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow shadow-emerald-400" />
                            </div>
                          )}
                          {isDone && (
                            <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950 text-[9px] font-black border border-emerald-400 shadow shadow-emerald-500/20">
                              ✓
                            </div>
                          )}
                          {isError && (
                            <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white text-[9px] font-black border border-red-400 shadow shadow-red-500/20">
                              !
                            </div>
                          )}
                        </div>

                        {/* Text labels and detail metrics */}
                        <div className="flex flex-col">
                          <span
                            className={`text-xs uppercase tracking-wider font-extrabold transition-colors duration-300 ${
                              isRunning
                                ? "text-emerald-400 glow-text-emerald"
                                : isDone
                                ? "text-slate-200"
                                : isError
                                ? "text-red-400"
                                : "text-slate-500"
                            }`}
                          >
                            {step.label}
                          </span>
                          
                          {/* Inner terminal logs for outputs */}
                          {step.details && (
                            <span className="text-[10px] text-slate-400 mt-2 font-mono bg-[#0c1322]/80 border border-white/5 rounded-lg px-3 py-2 leading-relaxed max-w-xl scrollbar-custom overflow-x-auto shadow-inner">
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

            {/* Error Notifications */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />
                <div className="flex items-start gap-3">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <p className="text-red-400 font-extrabold text-xs uppercase tracking-wider font-display">Execution Error</p>
                    <p className="text-red-200 text-xs mt-1 leading-relaxed">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Output Results Dashboards */}
            {result && (
              <div className="space-y-8 animate-fade-in-up">
                {/* PDF & CSV Exporting Actions */}
                <div className="flex justify-end gap-3 no-print">
                  <button
                    onClick={() => window.print()}
                    className="bg-[#0f172a]/60 border border-white/10 hover:border-emerald-500/20 hover:text-emerald-400 text-slate-300 font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 transition duration-200 shadow cursor-pointer"
                  >
                    <span>📄</span> Export Report (PDF)
                  </button>
                  <a
                    href={`/api/export/csv?app=${encodeURIComponent(app)}`}
                    download
                    className={`bg-gradient-to-r ${appBranding.btnGrad} text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 transition duration-300 shadow-lg cursor-pointer`}
                  >
                    <span>📥</span> Export History (CSV)
                  </a>
                </div>

                {/* Sentiment & Ratings Section */}
                {result.sentiment && (
                  <section>
                    <h2 className="text-lg font-black text-white mb-5 flex items-center gap-2.5 font-display tracking-tight uppercase">
                      <span className="w-1.5 h-6 bg-gradient-to-b from-emerald-400 to-teal-500 rounded-full" />
                      Sentiment & App Health Dashboard
                    </h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Sentiment Distribution Card */}
                      <div className="glass-panel rounded-2xl p-6 shadow-xl flex flex-col justify-between">
                        <div>
                          <h3 className="text-xs uppercase tracking-widest font-extrabold text-slate-400 mb-5">Sentiment Distribution</h3>
                          
                          {(() => {
                            const total = (result.sentiment.positive || 0) + (result.sentiment.neutral || 0) + (result.sentiment.negative || 0) || 1;
                            const posPct = Math.round((result.sentiment.positive / total) * 100);
                            const neuPct = Math.round((result.sentiment.neutral / total) * 100);
                            const negPct = 100 - posPct - neuPct;
                            
                            return (
                              <div>
                                <div className="flex items-baseline gap-2 mb-4">
                                  <span className="text-4xl font-black text-emerald-400 tracking-tight">{posPct}%</span>
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Positive Share</span>
                                </div>

                                {/* Stacked progress capsule */}
                                <div className="flex h-3.5 w-full rounded-full overflow-hidden bg-[#0c1322] border border-white/5 mb-6 shadow-inner">
                                  <div style={{ width: `${posPct}%` }} className="bg-emerald-500 h-full transition-all duration-500 shadow-md" title={`Positive: ${posPct}%`} />
                                  <div style={{ width: `${neuPct}%` }} className="bg-amber-500 h-full transition-all duration-500 shadow-md" title={`Neutral: ${neuPct}%`} />
                                  <div style={{ width: `${negPct}%` }} className="bg-red-500 h-full transition-all duration-500 shadow-md" title={`Negative: ${negPct}%`} />
                                </div>

                                {/* Metric legends */}
                                <div className="space-y-3.5 text-xs">
                                  <div className="flex justify-between items-center text-slate-300">
                                    <span className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-emerald-500 shadow shadow-emerald-500/50" />
                                      <span className="font-semibold text-slate-400">Positive reviews</span>
                                    </span>
                                    <span className="font-bold text-slate-200">{result.sentiment.positive} ({posPct}%)</span>
                                  </div>
                                  <div className="flex justify-between items-center text-slate-300">
                                    <span className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-amber-500 shadow shadow-amber-500/50" />
                                      <span className="font-semibold text-slate-400">Neutral reviews</span>
                                    </span>
                                    <span className="font-bold text-slate-200">{result.sentiment.neutral} ({neuPct}%)</span>
                                  </div>
                                  <div className="flex justify-between items-center text-slate-300">
                                    <span className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-red-500 shadow shadow-red-500/50" />
                                      <span className="font-semibold text-slate-400">Negative reviews</span>
                                    </span>
                                    <span className="font-bold text-slate-200">{result.sentiment.negative} ({negPct}%)</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Average Rating Score Card */}
                      <div className="glass-panel rounded-2xl p-6 shadow-xl flex flex-col justify-between">
                        <div>
                          <h3 className="text-xs uppercase tracking-widest font-extrabold text-slate-400 mb-5">Average App Rating</h3>
                          
                          <div className="flex items-center gap-4 mb-4">
                            <div className="text-5xl font-black text-white font-display tracking-tighter">{result.sentiment.averageRating.toFixed(2)}</div>
                            <div>
                              <div className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">Global Score</div>
                              {/* Star indicator SVG render */}
                              <div className="flex text-amber-400 text-sm mt-0.5">
                                {Array.from({ length: 5 }).map((_, idx) => {
                                  const starVal = idx + 1;
                                  const rating = result.sentiment!.averageRating;
                                  if (rating >= starVal) {
                                    return <span key={idx} className="drop-shadow-glow">★</span>;
                                  } else if (rating >= starVal - 0.5) {
                                    return <span key={idx} className="relative text-slate-600">★<span className="absolute left-0 top-0 overflow-hidden w-1/2 text-amber-400">★</span></span>;
                                  } else {
                                    return <span key={idx} className="text-slate-700">★</span>;
                                  }
                                })}
                              </div>
                            </div>
                          </div>

                          {/* Health condition statement card */}
                          {(() => {
                            const score = result.sentiment.averageRating;
                            let label = "Moderate Health";
                            let borderClass = "border-amber-500/20";
                            let glowBgClass = "bg-amber-500/5";
                            let textClass = "text-amber-400";
                            let desc = "Users are reporting moderate satisfaction. App performance & key flows are mostly stable.";
                            
                            if (score >= 4.0) {
                              label = "Excellent Health";
                              borderClass = "border-emerald-500/20";
                              glowBgClass = "bg-emerald-500/5";
                              textClass = "text-emerald-400";
                              desc = "High customer satisfaction score. Highly functional and optimized app performance.";
                            } else if (score < 3.0) {
                              label = "Critical Status";
                              borderClass = "border-red-500/20";
                              glowBgClass = "bg-red-500/5";
                              textClass = "text-red-400";
                              desc = "Significant user friction detected. High volume of complaints regarding bugs or crashes.";
                            }

                            return (
                              <div className={`mt-4 rounded-xl p-4 border ${borderClass} ${glowBgClass}`}>
                                <div className={`text-xs font-black uppercase tracking-wider mb-1 ${textClass}`}>{label}</div>
                                <div className="text-[10px] text-slate-400 leading-normal font-medium">{desc}</div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Ratings Histogram Progression */}
                      <div className="glass-panel rounded-2xl p-6 shadow-xl">
                        <h3 className="text-xs uppercase tracking-widest font-extrabold text-slate-400 mb-5">Rating Histogram</h3>
                        
                        <div className="space-y-3">
                          {([5, 4, 3, 2, 1] as const).map((star) => {
                            const count = result.sentiment!.ratings[star] || 0;
                            const total = Object.values(result.sentiment!.ratings).reduce((a, b) => a + b, 0) || 1;
                            const pct = Math.round((count / total) * 100);
                            
                            return (
                              <div key={star} className="flex items-center gap-3 text-[10px]">
                                <span className="w-8 text-slate-400 font-semibold text-right flex items-center justify-end gap-0.5">
                                  {star} <span className="text-amber-500 text-[9px]">★</span>
                                </span>
                                <div className="flex-1 h-2 rounded-full bg-[#0c1322] border border-white/5 overflow-hidden">
                                  <div 
                                    style={{ width: `${pct}%` }} 
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      star >= 4 ? 'bg-emerald-500 shadow shadow-emerald-500/50' : star === 3 ? 'bg-amber-500 shadow shadow-amber-500/50' : 'bg-red-500 shadow shadow-red-500/50'
                                    }`} 
                                  />
                                </div>
                                <span className="w-14 text-slate-400 text-right font-mono font-bold">
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

                {/* Key Insights Themes */}
                {result.themes && result.themes.length > 0 && (
                  <section>
                    <h2 className="text-lg font-black text-white mb-5 flex items-center gap-2.5 font-display tracking-tight uppercase">
                      <span className="w-1.5 h-6 bg-gradient-to-b from-teal-400 to-indigo-500 rounded-full" />
                      Key Themes Identified
                    </h2>
                    <div className="grid gap-4">
                      {result.themes.map((theme, i) => (
                        <div
                          key={i}
                          className="glass-panel glass-panel-hover rounded-2xl p-6 relative overflow-hidden"
                        >
                          <div className="absolute right-0 bottom-0 w-24 h-24 bg-emerald-500/[0.01] rounded-full blur-xl pointer-events-none" />
                          <div className="flex items-start gap-4">
                            <div className="flex-shrink-0">
                              {/* Glowing numbering badge */}
                              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#0f172a] border border-emerald-500/20 text-emerald-400 font-extrabold text-sm shadow">
                                0{i + 1}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-extrabold text-slate-100 font-display uppercase tracking-wide">
                                {theme.name}
                              </h3>
                              {theme.quote && (
                                <blockquote className="border-l-2 border-emerald-500/30 pl-4 mt-3 text-slate-300 italic text-xs leading-relaxed font-medium">
                                  "{theme.quote}"
                                </blockquote>
                              )}
                              {theme.action && (
                                <div className="mt-4 flex items-start gap-2 bg-[#0c1322]/50 border border-white/5 rounded-xl p-3">
                                  <span className="text-emerald-400 font-black text-xs flex-shrink-0">Action Items:</span>
                                  <p className="text-slate-300 text-xs font-medium leading-relaxed">{theme.action}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Scraped Raw Review Lists */}
                {((result.appleReviews && result.appleReviews.length > 0) || 
                  (result.googleReviews && result.googleReviews.length > 0)) && (
                  <section>
                    <h2 className="text-lg font-black text-white mb-5 flex items-center gap-2.5 font-display tracking-tight uppercase">
                      <span className="w-1.5 h-6 bg-gradient-to-b from-indigo-400 to-indigo-650 rounded-full" />
                      Analyzed Reviews ({(result.appleReviews?.length || 0) + (result.googleReviews?.length || 0)})
                    </h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Apple Reviews */}
                      <div className="glass-panel rounded-2xl overflow-hidden shadow-xl flex flex-col h-[450px]">
                        <div className="bg-[#0b101c]/80 border-b border-white/5 px-5 py-4 flex items-center gap-2.5">
                          <span className="text-slate-400 text-base">🍎</span>
                          <h3 className="text-xs uppercase tracking-widest font-extrabold text-slate-200">Apple App Store reviews ({result.appleReviews?.length || 0})</h3>
                        </div>
                        <div className="overflow-y-auto divide-y divide-white/5 flex-1 scrollbar-custom bg-[#090e18]/20">
                          {result.appleReviews && result.appleReviews.length > 0 ? (
                            result.appleReviews.map((review, i) => (
                              <div key={review.id || i} className="p-5 hover:bg-white/[0.015] transition duration-200">
                                <div className="flex items-center justify-between gap-3 mb-2.5">
                                  <div className="flex items-center gap-2.5">
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border ${
                                      review.rating >= 4 
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 glow-text-emerald' 
                                        : review.rating <= 2 
                                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    }`}>
                                      {review.rating} ★
                                    </span>
                                    <h4 className="text-xs font-bold text-slate-100 truncate max-w-[200px] font-display">
                                      {review.title || "(No Title)"}
                                    </h4>
                                  </div>
                                  <span className="text-[9px] text-slate-500 font-mono">{review.updated}</span>
                                </div>
                                <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                                  {review.content}
                                </p>
                              </div>
                            ))
                          ) : (
                            <div className="p-8 text-center text-xs text-slate-500">No App Store reviews found.</div>
                          )}
                        </div>
                      </div>

                      {/* Google Reviews */}
                      <div className="glass-panel rounded-2xl overflow-hidden shadow-xl flex flex-col h-[450px]">
                        <div className="bg-[#0b101c]/80 border-b border-white/5 px-5 py-4 flex items-center gap-2.5">
                          <span className="text-cyan-400 text-base">🤖</span>
                          <h3 className="text-xs uppercase tracking-widest font-extrabold text-slate-200">Google Play Store reviews ({result.googleReviews?.length || 0})</h3>
                        </div>
                        <div className="overflow-y-auto divide-y divide-white/5 flex-1 scrollbar-custom bg-[#090e18]/20">
                          {result.googleReviews && result.googleReviews.length > 0 ? (
                            result.googleReviews.map((review, i) => (
                              <div key={review.id || i} className="p-5 hover:bg-white/[0.015] transition duration-200">
                                <div className="flex items-center justify-between gap-3 mb-2.5">
                                  <div className="flex items-center gap-2.5">
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border ${
                                      review.rating >= 4 
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 glow-text-emerald' 
                                        : review.rating <= 2 
                                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    }`}>
                                      {review.rating} ★
                                    </span>
                                    <h4 className="text-xs font-bold text-slate-100 truncate max-w-[200px] font-display">
                                      {review.title || "(No Title)"}
                                    </h4>
                                  </div>
                                  <span className="text-[9px] text-slate-500 font-mono">{review.updated}</span>
                                </div>
                                <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
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

                {/* Final Rendered Report Document */}
                <section>
                  <h2 className="text-lg font-black text-white mb-5 flex items-center gap-2.5 font-display tracking-tight uppercase">
                    <span className="w-1.5 h-6 bg-gradient-to-b from-cyan-400 to-emerald-500 rounded-full" />
                    Full Markdown Executive Report
                  </h2>
                  <div className="glass-panel rounded-2xl overflow-hidden shadow-2xl relative">
                    <div className="absolute right-0 top-0 w-32 h-32 bg-white/[0.005] rounded-full blur-2xl pointer-events-none" />
                    <div className="bg-[#0b101c]/80 border-b border-white/5 px-6 py-4 flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-widest font-black text-slate-400 font-mono">
                        Week Report File / {result.week}
                      </p>
                    </div>
                    {/* Rendered output markdown with high typography styles */}
                    <div className="p-8 max-w-none">
                      <div className="text-slate-300 text-[13px] leading-relaxed font-medium space-y-4 prose-headings:font-display prose-headings:tracking-tight prose-headings:text-white prose-headings:font-black prose-h1:text-xl prose-h2:text-base prose-h3:text-sm prose-strong:text-emerald-400 prose-code:text-cyan-300 prose-ul:list-disc prose-ul:pl-5 prose-li:my-1 prose-blockquote:border-l-2 prose-blockquote:border-emerald-500/20 prose-blockquote:pl-4 prose-blockquote:italic">
                        <ReactMarkdown>{result.markdown}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* Empty landing dashboard state */}
            {!loading && !result && !error && (
              <div className="text-center py-20 bg-[#0e1626]/20 border border-white/5 rounded-2xl p-6 relative overflow-hidden animate-fade-in-up shadow-xl">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.01] to-cyan-500/[0.01] pointer-events-none" />
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0b101c] border border-white/10 mb-6 shadow-lg shadow-black/25">
                  <svg className="w-6 h-6 text-emerald-400 glow-text-emerald" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="text-slate-300 text-sm font-extrabold uppercase tracking-widest font-display mb-1">Pulse Engine Ready</p>
                <p className="text-slate-500 text-xs font-medium max-w-xs mx-auto leading-relaxed">Select targets and dispatch the agent to index, parse, and analyze reviews</p>
              </div>
            )}
          </div>
        ) : (
          /* Historical Trends Panel */
          <div className="space-y-8 animate-fade-in-up">
            {trendsLoading && (
              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-6 shadow shadow-emerald-500/5">
                <div className="flex items-center gap-3">
                  <svg className="w-4 h-4 text-emerald-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <p className="text-emerald-400 font-extrabold text-xs uppercase tracking-wider">Recalling historical timelines from Mem0 client...</p>
                </div>
              </div>
            )}

            {trendsError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
                <p className="text-red-400 font-extrabold text-xs uppercase tracking-wider">Load error: {trendsError}</p>
              </div>
            )}

            {trendsData && trendsData.length > 0 && (
              <div className="space-y-8">
                {/* Timeline CSV Exporter */}
                <div className="flex justify-end mb-4 no-print">
                  <a
                    href={`/api/export/csv?app=${encodeURIComponent(app)}`}
                    download
                    className={`bg-gradient-to-r ${appBranding.btnGrad} text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 transition duration-300 shadow shadow-emerald-500/5 cursor-pointer`}
                  >
                    <span>📥</span> Export Historical Trends (CSV)
                  </a>
                </div>

                {/* Dual Column Chart Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Rating Progression Line Chart Card */}
                  <div className="glass-panel rounded-2xl p-6 shadow-xl relative overflow-hidden">
                    <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/[0.005] rounded-full blur-xl pointer-events-none" />
                    <h3 className="text-xs uppercase tracking-widest font-extrabold text-slate-400 mb-6">Average app rating weekly trend</h3>
                    
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
                            {/* SVG Glowing Line Filters */}
                            <defs>
                              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity="0.15" />
                                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                              </linearGradient>
                              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="4" result="blur" />
                                <feComposite in="SourceGraphic" in2="blur" operator="over" />
                              </filter>
                            </defs>

                            {/* Horizontal Grid lines */}
                            {[1, 2, 3, 4, 5].map((val) => {
                              const y = paddingTop + (1 - (val - 1) / 4) * chartHeight;
                              return (
                                <g key={val}>
                                  <line 
                                    x1={paddingLeft} 
                                    y1={y} 
                                    x2={width - paddingRight} 
                                    y2={y} 
                                    className="stroke-white/[0.04]" 
                                    strokeWidth="1" 
                                    strokeDasharray="4 4" 
                                  />
                                  <text 
                                    x={paddingLeft - 10} 
                                    y={y + 3.5} 
                                    className="fill-slate-500 text-[9px] font-mono font-bold text-right"
                                    textAnchor="end"
                                  >
                                    {val.toFixed(1)}
                                  </text>
                                </g>
                              );
                            })}

                            {/* Filled Area Background */}
                            {trendsData.length > 1 && (
                              <path
                                d={`M ${paddingLeft},${height - paddingBottom} 
                                    L ${points.split(" ").join(" L ")} 
                                    L ${paddingLeft + chartWidth},${height - paddingBottom} Z`}
                                fill="url(#chartGrad)"
                              />
                            )}

                            {/* Glowing line path */}
                            {trendsData.length > 1 && (
                              <polyline
                                fill="none"
                                stroke="#10b981"
                                strokeWidth="3"
                                filter="url(#glow)"
                                points={points}
                                className="drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                              />
                            )}

                            {/* Interactive Data Node Points */}
                            {trendsData.map((d, idx) => {
                              const x = paddingLeft + (idx / Math.max(1, trendsData.length - 1)) * chartWidth;
                              const y = paddingTop + (1 - (d.averageRating - 1) / 4) * chartHeight;
                              return (
                                <g key={idx} className="group cursor-pointer">
                                  <circle
                                    cx={x}
                                    cy={y}
                                    r="4.5"
                                    className="fill-emerald-400 stroke-[#07090e] stroke-[2.5] hover:r-6 transition-all duration-300"
                                  />
                                  <title>{`${d.week}: ${d.averageRating.toFixed(2)} ★`}</title>
                                  <text
                                    x={x}
                                    y={height - paddingBottom + 18}
                                    className="fill-slate-500 text-[8px] font-bold font-mono text-center"
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

                  {/* Sentiment Stacked Bar Progression Chart Card */}
                  <div className="glass-panel rounded-2xl p-6 shadow-xl flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute right-0 top-0 w-24 h-24 bg-indigo-500/[0.005] rounded-full blur-xl pointer-events-none" />
                    <div>
                      <h3 className="text-xs uppercase tracking-widest font-extrabold text-slate-400 mb-6">Sentiment Ratio progression</h3>
                      
                      <div className="flex justify-around items-end h-48 px-4 pb-2 border-b border-white/5">
                        {trendsData.map((d, idx) => {
                          const total = (d.positive || 0) + (d.neutral || 0) + (d.negative || 0) || 1;
                          const posPct = Math.round((d.positive / total) * 100);
                          const neuPct = Math.round((d.neutral / total) * 100);
                          const negPct = 100 - posPct - neuPct;

                          return (
                            <div key={idx} className="flex flex-col items-center gap-2 group cursor-pointer w-8">
                              <div className="w-3.5 h-36 rounded bg-[#0c1322] border border-white/5 overflow-hidden flex flex-col-reverse relative shadow-inner">
                                <div style={{ height: `${posPct}%` }} className="bg-emerald-500 w-full transition-all duration-300 hover:brightness-110" title={`Positive: ${posPct}%`} />
                                <div style={{ height: `${neuPct}%` }} className="bg-amber-500 w-full transition-all duration-300 hover:brightness-110" title={`Neutral: ${neuPct}%`} />
                                <div style={{ height: `${negPct}%` }} className="bg-red-500 w-full transition-all duration-300 hover:brightness-110" title={`Negative: ${negPct}%`} />
                              </div>
                              <span className="text-[8px] text-slate-500 font-bold font-mono">{d.week.replace(/^\d{4}-/, "")}</span>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex gap-4 justify-center text-[10px] mt-4 flex-wrap">
                        <span className="flex items-center gap-1.5 text-slate-400 font-bold uppercase tracking-wider">
                          <span className="w-2 h-2 rounded bg-emerald-500 shadow shadow-emerald-500/50" /> Positive
                        </span>
                        <span className="flex items-center gap-1.5 text-slate-400 font-bold uppercase tracking-wider">
                          <span className="w-2 h-2 rounded bg-amber-500 shadow shadow-amber-500/50" /> Neutral
                        </span>
                        <span className="flex items-center gap-1.5 text-slate-400 font-bold uppercase tracking-wider">
                          <span className="w-2 h-2 rounded bg-red-500 shadow shadow-red-500/50" /> Negative
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Persistent Theme Tracker from Mem0 */}
                {themePersistence && themePersistence.length > 0 && (
                  <div className="glass-panel rounded-2xl p-6 shadow-xl relative overflow-hidden">
                    <div className="absolute right-0 top-0 w-32 h-32 bg-amber-500/[0.005] rounded-full blur-3xl pointer-events-none" />
                    <h2 className="text-lg font-black text-white mb-4 flex items-center gap-2.5 font-display tracking-tight uppercase">
                      <span className="w-1.5 h-6 bg-gradient-to-b from-amber-400 to-red-500 rounded-full" />
                      Persistent Issues & Hotspots
                    </h2>
                    <p className="text-slate-400 text-xs mb-6 font-medium">
                      Ranked by recurrence frequency in your {app === "groww" ? "Groww" : app === "zerodha" ? "Zerodha" : "Angel One"} App review history pulled from Mem0 long-term memory.
                    </p>

                    <div className="divide-y divide-white/5">
                      {themePersistence.map((tp, idx) => {
                        const maxCount = Math.max(...themePersistence.map(t => t.count)) || 1;
                        const barPct = Math.round((tp.count / maxCount) * 100);

                        return (
                          <div key={idx} className="py-4.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs uppercase tracking-wider font-extrabold text-slate-100 flex items-center gap-2.5">
                                <span className={`inline-flex items-center justify-center w-5.5 h-5.5 rounded-lg text-[9px] font-black ${
                                  idx === 0 
                                    ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                                    : idx === 1 
                                      ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                }`}>
                                  #{idx + 1}
                                </span>
                                {tp.name}
                              </h4>
                              {/* Horizontal ratio capsule */}
                              <div className="w-full md:w-80 h-1.5 rounded-full bg-[#0c1322] border border-white/5 mt-3 overflow-hidden">
                                <div 
                                  style={{ width: `${barPct}%` }} 
                                  className={`h-full rounded-full ${
                                    idx === 0 ? 'bg-red-500 shadow shadow-red-500/50' : idx === 1 ? 'bg-orange-500 shadow shadow-orange-500/50' : 'bg-amber-500 shadow shadow-amber-500/50'
                                  }`} 
                                />
                              </div>
                            </div>
                            <div className="flex-shrink-0 flex items-center gap-3">
                              <span className="text-[10px] uppercase font-bold tracking-widest bg-slate-900 border border-white/5 rounded-xl px-3 py-1 text-slate-400 font-mono">
                                Recurred in {tp.count} {tp.count === 1 ? 'week' : 'weeks'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Styled Footer */}
      <footer className="border-t border-white/5 bg-[#0b101c]/10 mt-20 py-8 no-print">
        <div className="max-w-6xl mx-auto px-6 text-center text-slate-500 text-[10px] uppercase tracking-widest font-bold">
          <p>{app === "groww" ? "Groww" : app === "zerodha" ? "Zerodha" : "Angel One"} Weekly Pulse • AI Review Intelligence engine • Mem0 Core Memory</p>
        </div>
      </footer>
    </div>
  );
}
