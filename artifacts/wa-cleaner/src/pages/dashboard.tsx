import { useState, useRef, useEffect, useCallback } from "react";
import {
  useGetWaStatus,
  useDisconnectWa,
  useRequestPairingCode,
  useStartScanJob,
  useGetScanJob,
  useStopScanJob,
  useDeleteScanJob,
  useSetupBot,
  useGetBotStatus,
  useStopBot,
  getGetWaStatusQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle2,
  XCircle,
  Phone,
  LogOut,
  Loader2,
  Activity,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  Link2,
  Copy,
  Check,
  Square,
  Download,
  PlayCircle,
  Plus,
  X,
  Bot,
  Zap,
  Send,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Workspace {
  id: string;
  name: string;
  numbers: string;
  jobId: string | null;
  speed: number;
}

const SPEED_OPTIONS = [
  { label: "⚡ Turbo (200ms)", value: 200 },
  { label: "🏃 Fast (400ms)", value: 400 },
  { label: "🚶 Normal (800ms)", value: 800 },
  { label: "🐢 Safe (1500ms)", value: 1500 },
] as const;

const DEFAULT_SPEED = 400;

// ─── localStorage helpers ────────────────────────────────────────────────────

const WC_KEY = "wc_workspaces";

function loadWorkspaces(): Workspace[] {
  try {
    const raw = localStorage.getItem(WC_KEY);
    if (raw) return JSON.parse(raw) as Workspace[];
  } catch { /* ignore */ }
  return [{ id: "ws1", name: "Workspace 1", numbers: "", jobId: null, speed: DEFAULT_SPEED }];
}

function saveWorkspaces(ws: Workspace[]) {
  localStorage.setItem(WC_KEY, JSON.stringify(ws));
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const queryClient = useQueryClient();

  // Global state
  const [mainTab, setMainTab] = useState<"scanner" | "bot">("scanner");
  const [workspaces, setWorkspaces] = useState<Workspace[]>(loadWorkspaces);
  const [activeWsId, setActiveWsId] = useState<string>(() => {
    const ws = loadWorkspaces();
    return ws[0]?.id ?? "ws1";
  });

  // WA Connect state
  const [phoneInput, setPhoneInput] = useState("");
  const [pairingError, setPairingError] = useState("");
  const [copied, setCopied] = useState(false);

  // Bot state
  const [botTokenInput, setBotTokenInput] = useState("");
  const [botError, setBotError] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Hooks ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: waStatus } = useGetWaStatus({ query: { refetchInterval: 2000 } as any });
  const disconnectMutation = useDisconnectWa();
  const pairingMutation = useRequestPairingCode();
  const startScanMutation = useStartScanJob();
  const stopScanMutation = useStopScanJob();
  const deleteScanMutation = useDeleteScanJob();
  const setupBotMutation = useSetupBot();
  const stopBotMutation = useStopBot();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: botStatus } = useGetBotStatus({ query: { refetchInterval: 3000 } as any });

  // Active workspace
  const activeWs = workspaces.find((w) => w.id === activeWsId) ?? workspaces[0];

  // Poll active workspace job
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: scanJob } = useGetScanJob(activeWs?.jobId ?? "", {
    query: {
      refetchInterval: (query: any) => {
        const data = query.state?.data;
        if (!activeWs?.jobId) return false;
        if (!data || data.status === "running") return 1000;
        return false;
      },
      enabled: !!activeWs?.jobId,
    } as any,
  });

  // Update workspace
  const updateWs = useCallback((id: string, patch: Partial<Workspace>) => {
    setWorkspaces((prev) => {
      const next = prev.map((w) => (w.id === id ? { ...w, ...patch } : w));
      saveWorkspaces(next);
      return next;
    });
  }, []);

  // Scroll log to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [scanJob?.results?.length]);

  // When job finishes (done/stopped), put remaining numbers back
  useEffect(() => {
    if (!activeWs || !scanJob) return;
    if (scanJob.status === "done") {
      updateWs(activeWs.id, { numbers: "" });
    }
    if (scanJob.status === "stopped") {
      const remaining = scanJob.numbers.slice(scanJob.currentIndex);
      updateWs(activeWs.id, { numbers: remaining.join("\n") });
    }
  }, [scanJob?.status]);

  // ── Handlers ──

  const handleDisconnect = async () => {
    await disconnectMutation.mutateAsync();
    queryClient.invalidateQueries({ queryKey: getGetWaStatusQueryKey() });
  };

  const handleRequestPairingCode = async () => {
    setPairingError("");
    const phone = phoneInput.replace(/[^0-9]/g, "");
    if (phone.length < 10) { setPairingError("Apna WhatsApp number daalo (e.g. 923001234567)"); return; }
    try {
      await pairingMutation.mutateAsync({ data: { phone } });
      queryClient.invalidateQueries({ queryKey: getGetWaStatusQueryKey() });
    } catch (err: any) {
      setPairingError(err?.message || "Code generate nahi hua");
    }
  };

  const handleStart = async () => {
    if (!activeWs || !waStatus?.connected) return;
    const lines = activeWs.numbers.split("\n").map((n) => n.trim()).filter((n) => n.length > 0);
    if (lines.length === 0) return;

    // Clear old job
    if (activeWs.jobId) {
      try { await deleteScanMutation.mutateAsync({ jobId: activeWs.jobId }); } catch { /* ignore */ }
    }

    const res = await startScanMutation.mutateAsync({
      data: { numbers: lines, workspaceId: activeWs.id, delay: activeWs.speed },
    });
    updateWs(activeWs.id, { jobId: res.jobId });
  };

  const handleStop = async () => {
    if (!activeWs?.jobId) return;
    await stopScanMutation.mutateAsync({ jobId: activeWs.jobId });
  };

  const handleClearJob = async () => {
    if (!activeWs?.jobId) return;
    try { await deleteScanMutation.mutateAsync({ jobId: activeWs.jobId }); } catch { /* ignore */ }
    updateWs(activeWs.id, { jobId: null });
  };

  const activeNumbers = (scanJob?.results ?? []).filter((r) => r.status === "active").map((r) => r.number);

  const handleCopyActive = async () => {
    await navigator.clipboard.writeText(activeNumbers.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadActive = () => {
    const blob = new Blob([activeNumbers.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `active_numbers_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRemoveBad = () => {
    if (!activeWs) return;
    updateWs(activeWs.id, { numbers: activeNumbers.join("\n") });
  };

  // Workspace management
  const addWorkspace = () => {
    const id = `ws${Date.now()}`;
    const name = `Workspace ${workspaces.length + 1}`;
    const next = [...workspaces, { id, name, numbers: "", jobId: null, speed: DEFAULT_SPEED }];
    setWorkspaces(next);
    saveWorkspaces(next);
    setActiveWsId(id);
  };

  const removeWorkspace = (id: string) => {
    if (workspaces.length <= 1) return;
    const next = workspaces.filter((w) => w.id !== id);
    setWorkspaces(next);
    saveWorkspaces(next);
    if (activeWsId === id) setActiveWsId(next[0].id);
  };

  // Bot setup
  const handleBotSetup = async () => {
    setBotError("");
    if (!botTokenInput.trim()) { setBotError("Bot token daalo"); return; }
    try {
      await setupBotMutation.mutateAsync({ data: { token: botTokenInput.trim() } });
      setBotTokenInput("");
    } catch (err: any) {
      setBotError(err?.message || "Bot connect nahi hua");
    }
  };

  const handleBotStop = async () => {
    await stopBotMutation.mutateAsync();
  };

  // ── Derived ──
  const isConnected = waStatus?.connected === true;
  const isRunning = scanJob?.status === "running";
  const isStopped = scanJob?.status === "stopped";
  const isDone = scanJob?.status === "done";
  const hasJob = !!activeWs?.jobId;
  const results = scanJob?.results ?? [];
  const stats = {
    total: results.length,
    active: activeNumbers.length,
    deleted: results.filter((r) => r.status === "deleted").length,
    error: results.filter((r) => r.status === "error").length,
  };
  const showActions = hasJob && results.length > 0 && !isRunning;
  const showProgress = hasJob && (isRunning || results.length > 0);
  const remainingCount = isStopped && scanJob ? scanJob.numbers.length - scanJob.currentIndex : 0;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* ── Header ── */}
      <header className="border-b border-border bg-card shrink-0">
        <div className="max-w-[1500px] mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">WA Number Cleaner</h1>
            <span className="text-xs text-muted-foreground/60 hidden sm:inline">Team Zero</span>
          </div>

          {/* Main tabs */}
          <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1">
            <button
              onClick={() => setMainTab("scanner")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mainTab === "scanner" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Zap className="h-3.5 w-3.5 inline mr-1.5" />Scanner
            </button>
            <button
              onClick={() => setMainTab("bot")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mainTab === "bot" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Bot className="h-3.5 w-3.5 inline mr-1.5" />Telegram Bot
              {botStatus?.connected && <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />}
            </button>
          </div>

          {/* WA status */}
          <div className="flex items-center gap-3 text-sm">
            {isConnected ? (
              <>
                <div className="flex items-center gap-2 text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-md border border-emerald-500/20">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <Phone className="h-4 w-4" />
                  <span className="font-medium font-mono">{waStatus.phone}</span>
                </div>
                <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnectMutation.isPending}
                  className="border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30">
                  <LogOut className="h-4 w-4 mr-2" />Disconnect
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2 text-amber-400 text-sm">
                <Activity className="h-4 w-4" />
                <span className="hidden sm:inline">WhatsApp connected nahi</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Scanner Tab ── */}
      {mainTab === "scanner" && (
        <main className="flex-1 max-w-[1500px] w-full mx-auto p-4 flex flex-col gap-4 overflow-hidden">

          {/* WA Connect card (when disconnected) */}
          {!isConnected && (
            <Card className="border-amber-500/20 bg-amber-500/5 shadow-sm">
              <CardHeader className="pb-3 border-b border-amber-500/20 flex flex-row items-center gap-2">
                <Link2 className="h-4 w-4 text-amber-400" />
                <CardTitle className="text-sm font-medium text-amber-400">WhatsApp Connect Karein</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {waStatus?.pairingCode ? (
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-xs text-muted-foreground">Yeh code WhatsApp mein enter karein:</p>
                    <div className="bg-[#0d1117] border border-primary/30 rounded-xl px-6 py-3 text-center">
                      <span className="text-3xl font-bold font-mono tracking-[0.3em] text-primary">{waStatus.pairingCode}</span>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      WhatsApp → <b>3 dots</b> → <b>Linked Devices</b> → <b>Link with Phone Number</b>
                    </p>
                    <p className="text-xs text-amber-400">60 seconds mein expire hoga</p>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-3 items-start">
                    <div className="flex gap-2 flex-1">
                      <input type="tel" placeholder="923001234567" value={phoneInput}
                        onChange={(e) => { setPhoneInput(e.target.value); setPairingError(""); }}
                        onKeyDown={(e) => e.key === "Enter" && handleRequestPairingCode()}
                        className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/50" />
                      <Button onClick={handleRequestPairingCode} disabled={pairingMutation.isPending} size="sm">
                        {pairingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get Code"}
                      </Button>
                    </div>
                    {waStatus?.qr && (
                      <div className="bg-white p-2 rounded-lg shrink-0">
                        <img src={waStatus.qr} alt="QR" className="w-20 h-20" />
                      </div>
                    )}
                  </div>
                )}
                {pairingError && <p className="text-xs text-rose-400 mt-2">{pairingError}</p>}
              </CardContent>
            </Card>
          )}

          {/* Workspace tabs */}
          <div className="flex items-center gap-1 border-b border-border pb-0 overflow-x-auto shrink-0">
            {workspaces.map((ws) => (
              <div key={ws.id}
                className={`group flex items-center gap-1.5 px-3 py-2 border-b-2 cursor-pointer text-sm font-medium transition-colors whitespace-nowrap ${
                  ws.id === activeWsId
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveWsId(ws.id)}
              >
                {ws.jobId && (
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    ws.id === activeWsId
                      ? isRunning ? "bg-emerald-500 animate-pulse" : isDone ? "bg-blue-500" : "bg-amber-500"
                      : "bg-primary/50"
                  }`} />
                )}
                {ws.name}
                {workspaces.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeWorkspace(ws.id); }}
                    className="opacity-0 group-hover:opacity-100 h-4 w-4 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            <button onClick={addWorkspace}
              className="flex items-center gap-1 px-2 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors ml-1 shrink-0">
              <Plus className="h-3.5 w-3.5" />Add
            </button>
          </div>

          {/* Main content */}
          {activeWs && (
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 min-h-0">

              {/* Left — input */}
              <div className="flex flex-col gap-3">
                <Card className="border-border bg-card shadow-sm flex flex-col">
                  <CardHeader className="pb-2 border-b border-border">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">Numbers — {activeWs.name}</CardTitle>
                      <select
                        value={activeWs.speed}
                        onChange={(e) => updateWs(activeWs.id, { speed: Number(e.target.value) })}
                        disabled={isRunning}
                        className="text-xs bg-background border border-border rounded px-2 py-1 focus:outline-none focus:border-primary/60 text-muted-foreground"
                      >
                        {SPEED_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <p className="text-xs text-muted-foreground">Har number nayi line mein (Format: 923xxxxxxxx)</p>
                  </CardHeader>
                  <CardContent className="p-3 flex flex-col gap-3">
                    <Textarea
                      placeholder={"923001234567\n923119876543"}
                      className="min-h-[200px] font-mono text-sm bg-background border-border resize-none focus-visible:ring-1 focus-visible:ring-primary/50"
                      value={activeWs.numbers}
                      onChange={(e) => updateWs(activeWs.id, { numbers: e.target.value })}
                      disabled={isRunning}
                    />

                    {/* Resume hint */}
                    {isStopped && remainingCount > 0 && (
                      <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                        <PlayCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>Ruka hua — <strong>{remainingCount}</strong> baaki. Resume dabao</span>
                      </div>
                    )}

                    {/* Start + Stop */}
                    <div className="flex gap-2">
                      <Button
                        onClick={handleStart}
                        disabled={!isConnected || isRunning || !activeWs.numbers.trim() || startScanMutation.isPending}
                        className="flex-1 font-medium"
                        size="lg"
                      >
                        {startScanMutation.isPending ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Starting...</>
                        ) : isRunning ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{scanJob!.currentIndex} / {scanJob!.numbers.length}</>
                        ) : isStopped ? (
                          <><PlayCircle className="mr-2 h-4 w-4" />Resume Scan</>
                        ) : (
                          "Start Verification"
                        )}
                      </Button>
                      {isRunning && (
                        <Button onClick={handleStop} variant="outline" size="lg"
                          className="border-rose-500/50 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500 px-4"
                          disabled={stopScanMutation.isPending}>
                          <Square className="h-4 w-4 fill-rose-400" />
                        </Button>
                      )}
                    </div>

                    {/* Action buttons */}
                    {showActions && stats.active > 0 && (
                      <div className="flex flex-col gap-2 pt-1 border-t border-border/50">
                        <p className="text-xs text-muted-foreground">
                          {stats.active} active numbers {isDone ? "mile" : "ab tak"}:
                        </p>
                        <div className="flex gap-2">
                          <Button onClick={handleCopyActive} variant="outline" size="sm"
                            className="flex-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10">
                            {copied ? <><Check className="mr-2 h-3.5 w-3.5" />Copied!</> : <><Copy className="mr-2 h-3.5 w-3.5" />Copy</>}
                          </Button>
                          <Button onClick={handleDownloadActive} variant="outline" size="sm"
                            className="flex-1 border-blue-500/40 text-blue-400 hover:bg-blue-500/10">
                            <Download className="mr-2 h-3.5 w-3.5" />Download .txt
                          </Button>
                        </div>
                        <Button onClick={handleRemoveBad} variant="outline" size="sm"
                          className="w-full border-rose-500/40 text-rose-400 hover:bg-rose-500/10">
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Remove Bad Numbers ({stats.deleted + stats.error})
                        </Button>
                        {hasJob && (
                          <Button onClick={handleClearJob} variant="ghost" size="sm"
                            className="w-full text-muted-foreground hover:text-foreground text-xs">
                            <X className="mr-1.5 h-3 w-3" />Clear Results / Naya Scan
                          </Button>
                        )}
                      </div>
                    )}
                    {showActions && stats.active === 0 && (
                      <Button onClick={handleClearJob} variant="ghost" size="sm"
                        className="w-full text-muted-foreground text-xs">
                        <X className="mr-1.5 h-3 w-3" />Clear / Naya Scan
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right — stats + log */}
              <div className="flex flex-col gap-4 min-h-0">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 shrink-0">
                  <Card className="border-border bg-card shadow-sm">
                    <CardContent className="p-4">
                      <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Total Scanned</p>
                      <div className="flex items-end justify-between">
                        <h3 className="text-3xl font-semibold text-blue-500 font-mono">{stats.total}</h3>
                        <Activity className="h-5 w-5 text-blue-500/50 mb-1" />
                      </div>
                      {showProgress && (
                        <div className="mt-2 h-1 bg-border rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 transition-all duration-500 rounded-full"
                            style={{ width: scanJob ? `${(scanJob.currentIndex / scanJob.numbers.length) * 100}%` : "0%" }} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <Card className="border-border bg-card shadow-sm">
                    <CardContent className="p-4">
                      <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Active / Safe</p>
                      <div className="flex items-end justify-between">
                        <h3 className="text-3xl font-semibold text-emerald-500 font-mono">{stats.active}</h3>
                        <CheckCircle2 className="h-5 w-5 text-emerald-500/50 mb-1" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-border bg-card shadow-sm">
                    <CardContent className="p-4">
                      <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Deleted / Invalid</p>
                      <div className="flex items-end justify-between">
                        <h3 className="text-3xl font-semibold text-rose-500 font-mono">{stats.deleted}</h3>
                        <XCircle className="h-5 w-5 text-rose-500/50 mb-1" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Live log */}
                <Card className="border-border bg-card shadow-sm flex flex-col min-h-0 flex-1" style={{ minHeight: "300px" }}>
                  <CardHeader className="py-3 px-4 border-b border-border bg-muted/30 flex flex-row items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <TerminalSquare className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-medium text-muted-foreground">Live Execution Log</CardTitle>
                      {isRunning && (
                        <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          Running
                        </span>
                      )}
                    </div>
                    {results.length > 0 && (
                      <div className="flex items-center gap-3 text-xs font-mono">
                        <span className="text-emerald-400">{stats.active} Active</span>
                        <span className="text-rose-400">{stats.deleted} Deleted</span>
                        {stats.error > 0 && <span className="text-amber-400">{stats.error} Error</span>}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="p-0 flex-1 relative bg-[#0d1117] overflow-hidden">
                    <div ref={scrollRef} className="absolute inset-0 overflow-auto p-4 space-y-1 font-mono text-[13px] leading-relaxed">
                      {results.length === 0 ? (
                        <div className="text-muted-foreground/50 h-full flex items-center justify-center italic">
                          {hasJob && isRunning ? "Scan chal raha hai..." : "Awaiting execution..."}
                        </div>
                      ) : (
                        results.map((log, i) => (
                          <div key={i} className={`flex items-start gap-3 px-2 py-1 rounded ${
                            log.status === "active" ? "text-emerald-400 bg-emerald-500/5"
                              : log.status === "deleted" ? "text-rose-400 bg-rose-500/5"
                              : "text-amber-400 bg-amber-500/5"
                          }`}>
                            <span className="text-muted-foreground/50 whitespace-nowrap shrink-0">
                              {new Date(log.timestamp).toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </span>
                            <span className="font-semibold shrink-0 w-[130px] tracking-wider">{log.number}</span>
                            <span className={`text-[11px] shrink-0 w-[90px] font-bold tracking-wider mt-[2px] uppercase ${
                              log.status === "active" ? "text-emerald-300" : log.status === "deleted" ? "text-rose-300" : "text-amber-300"
                            }`}>
                              {log.status === "active" ? "[ACTIVE]" : log.status === "deleted" ? "[DELETED]" : "[ERROR]"}
                            </span>
                            <span className="opacity-80 break-all">{log.reason}</span>
                          </div>
                        ))
                      )}
                      {isDone && (
                        <div className="text-slate-400 px-2 py-2 mt-2 border-t border-slate-700/50 text-xs">
                          ✓ Done — {stats.active} active, {stats.deleted} deleted{stats.error > 0 ? `, ${stats.error} errors` : ""}
                        </div>
                      )}
                      {isStopped && (
                        <div className="text-amber-400/70 px-2 py-2 mt-2 border-t border-slate-700/50 text-xs">
                          ⏸ Ruka — {stats.active} active ab tak. Resume dabao ya Copy/Download karo.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </main>
      )}

      {/* ── Bot Tab ── */}
      {mainTab === "bot" && (
        <main className="flex-1 max-w-[800px] w-full mx-auto p-4 flex flex-col gap-4">
          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                Telegram Bot Setup
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Bot token daalo → bot start hoga → Telegram par bot ko numbers ya .txt file bhejo → clean list wapas milegi
              </p>
            </CardHeader>
            <CardContent className="p-5 flex flex-col gap-4">

              {/* Status */}
              {botStatus?.connected ? (
                <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <div>
                      <p className="text-sm font-medium text-emerald-400">Bot Connected</p>
                      <p className="text-xs text-muted-foreground">@{botStatus.username}</p>
                    </div>
                  </div>
                  <Button onClick={handleBotStop} variant="outline" size="sm"
                    className="border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
                    disabled={stopBotMutation.isPending}>
                    {stopBotMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Square className="mr-2 h-3.5 w-3.5" />Stop Bot</>}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="1234567890:AAF... (BotFather se milega)"
                      value={botTokenInput}
                      onChange={(e) => { setBotTokenInput(e.target.value); setBotError(""); }}
                      onKeyDown={(e) => e.key === "Enter" && handleBotSetup()}
                      className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/40"
                    />
                    <Button onClick={handleBotSetup} disabled={setupBotMutation.isPending}>
                      {setupBotMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-2 h-4 w-4" />Connect</>}
                    </Button>
                  </div>
                  {botError && <p className="text-xs text-rose-400">{botError}</p>}
                </div>
              )}

              {/* Instructions */}
              <div className="border border-border rounded-lg p-4 bg-muted/20">
                <p className="text-sm font-medium mb-3">Bot kaise use karein:</p>
                <ol className="space-y-2.5 text-sm text-muted-foreground">
                  <li className="flex gap-3">
                    <span className="h-5 w-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
                    <span>Telegram par <b className="text-foreground">@BotFather</b> ko message karo → <code className="text-xs bg-muted px-1.5 py-0.5 rounded">/newbot</code> → token copy karo</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="h-5 w-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
                    <span>Upar token paste karo → Connect dabao</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="h-5 w-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
                    <span>Apne bot ko Telegram par open karo → numbers bhejo (ek line mein ek) ya <b className="text-foreground">.txt file upload</b> karo</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="h-5 w-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">4</span>
                    <span>Bot automatically verify karega → <b className="text-foreground">banned/invalid/duplicate numbers delete</b> kar ke clean .txt file wapas bhejega</span>
                  </li>
                </ol>
              </div>

              <div className="text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                ⚠️ Bot ke liye WhatsApp bhi connected hona chahiye (Scanner tab mein connect karo)
              </div>
            </CardContent>
          </Card>
        </main>
      )}
    </div>
  );
}
