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
  useRestartBot,
  useSetAutoRestart,
  getGetWaStatusQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle2, XCircle, Phone, LogOut, Loader2, Activity,
  ShieldCheck, TerminalSquare, Trash2, Link2, Copy, Check,
  Square, Download, PlayCircle, Plus, X, Bot, Zap,
  RefreshCw, List, AlertCircle, LayoutList, ChevronLeft,
  Send, Settings,
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
  { label: "⚡ Turbo 200ms", value: 200 },
  { label: "🏃 Fast 400ms",  value: 400 },
  { label: "🚶 Normal 800ms", value: 800 },
  { label: "🐢 Safe 1500ms",  value: 1500 },
] as const;

const BOT_SPEED_OPTIONS = [
  { label: "⚡ Turbo (200ms)", value: 200 },
  { label: "🏃 Fast (400ms)", value: 400 },
  { label: "🚶 Normal (800ms)", value: 800 },
  { label: "🐢 Safe (1500ms)", value: 1500 },
] as const;

// ─── localStorage helpers ─────────────────────────────────────────────────────

const WC_KEY = "wc_workspaces";

function loadWorkspaces(): Workspace[] {
  try {
    const raw = localStorage.getItem(WC_KEY);
    if (raw) return JSON.parse(raw) as Workspace[];
  } catch { /* ignore */ }
  return [{ id: "ws1", name: "Workspace 1", numbers: "", jobId: null, speed: 400 }];
}

function saveWorkspaces(ws: Workspace[]) {
  localStorage.setItem(WC_KEY, JSON.stringify(ws));
}

// ─── Mobile hook ─────────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return isMobile;
}

// ─── Numbers Drawer ───────────────────────────────────────────────────────────

interface NumbersDrawerProps {
  results: Array<{ number: string; status: string; reason: string; timestamp: string }>;
  excludedNums: Set<string>;
  onExclude: (n: string) => void;
  onRestore: (n: string) => void;
  onExcludeAll: (status: "deleted" | "error") => void;
  onClose: () => void;
  isMobile: boolean;
}

function NumbersDrawer({ results, excludedNums, onExclude, onRestore, onExcludeAll, onClose, isMobile }: NumbersDrawerProps) {
  const [filter, setFilter] = useState<"all" | "active" | "deleted" | "error">("all");

  const counts = {
    all: results.length,
    active: results.filter((r) => r.status === "active").length,
    deleted: results.filter((r) => r.status === "deleted").length,
    error: results.filter((r) => r.status === "error").length,
  };

  const filtered = results.filter((r) => filter === "all" || r.status === filter);

  const drawerClass = isMobile
    ? "fixed inset-0 z-50 flex flex-col bg-background"
    : "flex flex-col h-full";

  return (
    <div className={drawerClass}>
      {/* Drawer header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <LayoutList className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-sm">Numbers List</span>
          {results.length > 0 && (
            <span className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full">{results.length}</span>
          )}
        </div>
        <button onClick={onClose}
          className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-border bg-card shrink-0">
        {(["all", "active", "deleted", "error"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              filter === f
                ? f === "active"  ? "text-emerald-400 border-b-2 border-emerald-500 bg-emerald-500/5"
                : f === "deleted" ? "text-rose-400 border-b-2 border-rose-500 bg-rose-500/5"
                : f === "error"   ? "text-amber-400 border-b-2 border-amber-500 bg-amber-500/5"
                : "text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}>
            {f}
            {counts[f] > 0 && <span className="ml-1 opacity-60">({counts[f]})</span>}
          </button>
        ))}
      </div>

      {/* Bulk actions */}
      {(counts.deleted > 0 || counts.error > 0) && (
        <div className="flex gap-2 px-3 py-2 border-b border-border bg-muted/20 shrink-0 overflow-x-auto">
          {counts.deleted > 0 && (
            <button onClick={() => onExcludeAll("deleted")}
              className="text-xs text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
              🗑 Remove {counts.deleted} deleted
            </button>
          )}
          {counts.error > 0 && (
            <button onClick={() => onExcludeAll("error")}
              className="text-xs text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
              ⚠ Remove {counts.error} errors
            </button>
          )}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground/40 p-6">
            <List className="h-10 w-10" />
            <p className="text-sm text-center">
              {results.length === 0 ? "Scan karo — numbers yahan dikhenge" : `Koi ${filter} number nahi`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {filtered.map((r, i) => {
              const isExcluded = excludedNums.has(r.number);
              return (
                <div key={i}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/20 active:bg-muted/30 ${isExcluded ? "opacity-40" : ""}`}>
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                    r.status === "active" ? "bg-emerald-500"
                    : r.status === "deleted" ? "bg-rose-500" : "bg-amber-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-mono font-semibold ${isExcluded ? "line-through text-muted-foreground" : ""}`}>
                      {r.number}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{r.reason}</p>
                  </div>
                  <button
                    onClick={() => isExcluded ? onRestore(r.number) : onExclude(r.number)}
                    className={`h-8 w-8 flex items-center justify-center rounded-lg border transition-colors shrink-0 ${
                      isExcluded
                        ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                        : "border-rose-500/40 text-rose-400 bg-rose-500/10 hover:bg-rose-500/20"
                    }`}
                    title={isExcluded ? "Restore" : "Delete"}>
                    {isExcluded ? <Plus className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Excluded count */}
      {excludedNums.size > 0 && (
        <div className="px-4 py-2.5 border-t border-border bg-muted/20 shrink-0">
          <p className="text-xs text-muted-foreground text-center">
            {excludedNums.size} numbers excluded (copy/download mein nahi aayenge)
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [mainTab, setMainTab] = useState<"scanner" | "bot">("scanner");
  const [workspaces, setWorkspaces] = useState<Workspace[]>(loadWorkspaces);
  const [activeWsId, setActiveWsId] = useState<string>(() => loadWorkspaces()[0]?.id ?? "ws1");

  // Numbers drawer state
  const [showDrawer, setShowDrawer] = useState(false);
  const [excludedNums, setExcludedNums] = useState<Set<string>>(new Set());
  const prevJobIdRef = useRef<string | null>(null);

  // WA connect state
  const [phoneInput, setPhoneInput] = useState("");
  const [pairingError, setPairingError] = useState("");
  const [copied, setCopied] = useState(false);

  // Bot state
  const [botTokenInput, setBotTokenInput] = useState("");
  const [botError, setBotError] = useState("");
  const [botScanDelay, setBotScanDelay] = useState(400);

  const logScrollRef = useRef<HTMLDivElement>(null);

  // ── API Hooks ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: waStatus } = useGetWaStatus({ query: { refetchInterval: 2000 } as any });
  const disconnectMutation = useDisconnectWa();
  const pairingMutation = useRequestPairingCode();
  const startScanMutation = useStartScanJob();
  const stopScanMutation = useStopScanJob();
  const deleteScanMutation = useDeleteScanJob();
  const setupBotMutation = useSetupBot();
  const stopBotMutation = useStopBot();
  const restartBotMutation = useRestartBot();
  const setAutoRestartMutation = useSetAutoRestart();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: botStatus } = useGetBotStatus({ query: { refetchInterval: 3000 } as any });

  const activeWs = workspaces.find((w) => w.id === activeWsId) ?? workspaces[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: scanJob } = useGetScanJob(activeWs?.jobId ?? "", {
    query: {
      refetchInterval: (q: any) => {
        if (!activeWs?.jobId) return false;
        return q.state?.data?.status === "running" ? 1000 : false;
      },
      enabled: !!activeWs?.jobId,
    } as any,
  });

  const updateWs = useCallback((id: string, patch: Partial<Workspace>) => {
    setWorkspaces((prev) => {
      const next = prev.map((w) => (w.id === id ? { ...w, ...patch } : w));
      saveWorkspaces(next);
      return next;
    });
  }, []);

  // Reset excluded numbers when job changes
  useEffect(() => {
    if (activeWs?.jobId !== prevJobIdRef.current) {
      prevJobIdRef.current = activeWs?.jobId ?? null;
      setExcludedNums(new Set());
    }
  }, [activeWs?.jobId]);

  // Scroll log to bottom
  useEffect(() => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [scanJob?.results?.length]);

  // Put remaining numbers back when scan stops
  useEffect(() => {
    if (!activeWs || !scanJob) return;
    if (scanJob.status === "done") updateWs(activeWs.id, { numbers: "" });
    if (scanJob.status === "stopped") {
      const remaining = scanJob.numbers.slice(scanJob.currentIndex);
      updateWs(activeWs.id, { numbers: remaining.join("\n") });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanJob?.status]);

  // Close drawer on mobile when switching tabs
  useEffect(() => {
    if (isMobile) setShowDrawer(false);
  }, [mainTab, isMobile]);

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
    setExcludedNums(new Set());
    setShowDrawer(false);
  };

  const handleExclude = (num: string) => setExcludedNums((prev) => new Set([...prev, num]));
  const handleRestore = (num: string) => setExcludedNums((prev) => { const n = new Set(prev); n.delete(num); return n; });
  const handleExcludeAll = (status: "deleted" | "error") => {
    const nums = (scanJob?.results ?? []).filter((r) => r.status === status).map((r) => r.number);
    setExcludedNums((prev) => new Set([...prev, ...nums]));
  };

  const visibleActiveNumbers = (scanJob?.results ?? [])
    .filter((r) => r.status === "active" && !excludedNums.has(r.number))
    .map((r) => r.number);

  const handleCopyActive = async () => {
    await navigator.clipboard.writeText(visibleActiveNumbers.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadActive = () => {
    const blob = new Blob([visibleActiveNumbers.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `active_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRemoveBad = () => {
    if (!activeWs) return;
    updateWs(activeWs.id, { numbers: visibleActiveNumbers.join("\n") });
  };

  const addWorkspace = () => {
    const id = `ws${Date.now()}`;
    const name = `Workspace ${workspaces.length + 1}`;
    const next = [...workspaces, { id, name, numbers: "", jobId: null, speed: 400 }];
    setWorkspaces(next); saveWorkspaces(next); setActiveWsId(id);
  };

  const removeWorkspace = (id: string) => {
    if (workspaces.length <= 1) return;
    const next = workspaces.filter((w) => w.id !== id);
    setWorkspaces(next); saveWorkspaces(next);
    if (activeWsId === id) setActiveWsId(next[0].id);
  };

  const handleBotSetup = async () => {
    setBotError("");
    if (!botTokenInput.trim()) { setBotError("Bot token daalo"); return; }
    try {
      await setupBotMutation.mutateAsync({ data: { token: botTokenInput.trim() } });
      setBotTokenInput("");
    } catch (err: any) { setBotError(err?.message || "Bot connect nahi hua"); }
  };

  const handleBotRestart = async () => {
    setBotError("");
    try { await restartBotMutation.mutateAsync(); }
    catch (err: any) { setBotError(err?.message || "Restart nahi hua"); }
  };

  const handleToggleAutoRestart = async () => {
    const next = !(botStatus?.autoRestart ?? false);
    await setAutoRestartMutation.mutateAsync({ data: { enabled: next } });
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
    active: visibleActiveNumbers.length,
    deleted: results.filter((r) => r.status === "deleted").length,
    error: results.filter((r) => r.status === "error").length,
    excludedCount: excludedNums.size,
  };

  const showActions = hasJob && results.length > 0 && !isRunning;
  const remainingCount = isStopped && scanJob ? scanJob.numbers.length - scanJob.currentIndex : 0;

  const botUptime = botStatus?.startedAt
    ? (() => {
        const sec = Math.floor((Date.now() - new Date(botStatus.startedAt).getTime()) / 1000);
        if (sec < 60) return `${sec}s`;
        if (sec < 3600) return `${Math.floor(sec / 60)}m`;
        return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
      })()
    : null;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">

      {/* ── Header ── */}
      <header className="border-b border-border bg-card shrink-0 z-40 relative">
        <div className="flex items-center gap-2 px-3 py-2.5">
          {/* Logo */}
          <div className="h-7 w-7 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </div>

          {/* Main tabs */}
          <div className="flex items-center gap-0.5 bg-muted/40 rounded-lg p-0.5">
            <button onClick={() => setMainTab("scanner")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${mainTab === "scanner" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <Zap className="h-3.5 w-3.5" />Scanner
            </button>
            <button onClick={() => setMainTab("bot")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors relative ${mainTab === "bot" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <Bot className="h-3.5 w-3.5" />Bot
              {botStatus?.connected && <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />}
            </button>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Numbers button (mobile: always visible; desktop: when there are results) */}
          {mainTab === "scanner" && (
            <button onClick={() => setShowDrawer(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                results.length > 0
                  ? "border-primary/40 text-primary bg-primary/10 hover:bg-primary/20"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}>
              <LayoutList className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Numbers</span>
              {results.length > 0 && <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">{results.length}</span>}
            </button>
          )}

          {/* WA status */}
          {isConnected ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="hidden sm:flex items-center gap-1.5 text-emerald-500 bg-emerald-500/10 px-2.5 py-1.5 rounded-md border border-emerald-500/20 text-xs font-mono">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                <Phone className="h-3 w-3" />
                <span className="font-medium">{waStatus.phone}</span>
              </div>
              <span className="flex sm:hidden items-center gap-1 text-emerald-500 text-xs">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                WA
              </span>
              <Button variant="outline" size="sm"
                onClick={handleDisconnect}
                disabled={disconnectMutation.isPending}
                className="h-7 px-2 border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 text-xs">
                <LogOut className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-amber-400 text-xs">
              <Activity className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">WA nahi</span>
            </div>
          )}
        </div>
      </header>

      {/* ── SCANNER TAB ── */}
      {mainTab === "scanner" && (
        <main className="flex-1 overflow-auto">

          {/* Numbers drawer overlay (mobile) / sidebar (desktop) */}
          {showDrawer && (
            <>
              {/* Mobile: full-screen overlay */}
              {isMobile ? (
                <NumbersDrawer
                  results={results}
                  excludedNums={excludedNums}
                  onExclude={handleExclude}
                  onRestore={handleRestore}
                  onExcludeAll={handleExcludeAll}
                  onClose={() => setShowDrawer(false)}
                  isMobile={true}
                />
              ) : (
                /* Desktop: slide-in sidebar overlay on the right */
                <div className="fixed top-[52px] right-0 bottom-0 z-40 w-[320px] border-l border-border bg-card shadow-xl flex flex-col">
                  <NumbersDrawer
                    results={results}
                    excludedNums={excludedNums}
                    onExclude={handleExclude}
                    onRestore={handleRestore}
                    onExcludeAll={handleExcludeAll}
                    onClose={() => setShowDrawer(false)}
                    isMobile={false}
                  />
                </div>
              )}
            </>
          )}

          {/* Background overlay for desktop drawer */}
          {showDrawer && !isMobile && (
            <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setShowDrawer(false)} />
          )}

          {/* Content */}
          <div className="p-3 sm:p-4 flex flex-col gap-3 max-w-[1100px] mx-auto">

            {/* WA Connect card */}
            {!isConnected && (
              <Card className="border-amber-500/20 bg-amber-500/5 shadow-sm">
                <CardHeader className="pb-2 border-b border-amber-500/20 flex flex-row items-center gap-2 py-3">
                  <Link2 className="h-4 w-4 text-amber-400 shrink-0" />
                  <CardTitle className="text-sm font-semibold text-amber-400">WhatsApp Connect Karein</CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  {waStatus?.pairingCode ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="bg-[#0d1117] border border-primary/30 rounded-xl px-6 py-3 text-center w-full">
                        <span className="text-3xl font-bold font-mono tracking-[0.3em] text-primary">{waStatus.pairingCode}</span>
                      </div>
                      <p className="text-xs text-muted-foreground text-center">
                        WhatsApp → <b>⋮</b> → <b>Linked Devices</b> → <b>Link with Phone Number</b>
                      </p>
                      <p className="text-xs text-amber-400">Code 60 seconds mein expire hota hai</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <input type="tel" placeholder="923001234567"
                          value={phoneInput}
                          onChange={(e) => { setPhoneInput(e.target.value); setPairingError(""); }}
                          onKeyDown={(e) => e.key === "Enter" && handleRequestPairingCode()}
                          className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/50" />
                        <Button onClick={handleRequestPairingCode} disabled={pairingMutation.isPending} size="sm">
                          {pairingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get Code"}
                        </Button>
                      </div>
                      {waStatus?.qr && (
                        <div className="flex items-center gap-3 mt-1">
                          <div className="bg-white p-2 rounded-lg shrink-0">
                            <img src={waStatus.qr} alt="QR" className="w-16 h-16" />
                          </div>
                          <p className="text-xs text-muted-foreground">Ya QR scan karo (WhatsApp → Linked Devices → Link a Device)</p>
                        </div>
                      )}
                      {pairingError && <p className="text-xs text-rose-400">{pairingError}</p>}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Workspace tabs */}
            <div className="flex items-center gap-0.5 border-b border-border overflow-x-auto shrink-0 -mx-0.5 px-0.5">
              {workspaces.map((ws) => {
                const wsJob = ws.id === activeWsId ? scanJob : null;
                const wsRunning = wsJob?.status === "running";
                const wsDone = wsJob?.status === "done";
                return (
                  <div key={ws.id}
                    className={`group flex items-center gap-1.5 px-3 py-2 border-b-2 cursor-pointer text-xs font-semibold transition-colors whitespace-nowrap ${
                      ws.id === activeWsId ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setActiveWsId(ws.id)}>
                    {ws.jobId && (
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${wsRunning ? "bg-emerald-500 animate-pulse" : wsDone ? "bg-blue-500" : "bg-amber-500"}`} />
                    )}
                    {ws.name}
                    {workspaces.length > 1 && (
                      <button onClick={(e) => { e.stopPropagation(); removeWorkspace(ws.id); }}
                        className="opacity-0 group-hover:opacity-100 h-4 w-4 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                );
              })}
              <button onClick={addWorkspace}
                className="flex items-center gap-1 px-2 py-2 text-xs text-muted-foreground hover:text-foreground ml-1 shrink-0">
                <Plus className="h-3.5 w-3.5" />Add
              </button>
            </div>

            {/* Scanner layout: responsive grid */}
            {activeWs && (
              <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3">

                {/* ── Input Card ── */}
                <Card className="border-border bg-card shadow-sm">
                  <CardHeader className="py-2.5 px-3 border-b border-border">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm font-semibold">{activeWs.name}</CardTitle>
                      <select value={activeWs.speed}
                        onChange={(e) => updateWs(activeWs.id, { speed: Number(e.target.value) })}
                        disabled={isRunning}
                        className="text-xs bg-background border border-border rounded px-2 py-1 focus:outline-none focus:border-primary/60 text-muted-foreground max-w-[120px]">
                        {SPEED_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <p className="text-xs text-muted-foreground">Har number nayi line mein (923xxxxxxxxx)</p>
                  </CardHeader>
                  <CardContent className="p-3 flex flex-col gap-2.5">
                    <Textarea
                      placeholder={"923001234567\n923119876543\n..."}
                      className="min-h-[160px] sm:min-h-[200px] font-mono text-sm bg-background border-border resize-none focus-visible:ring-1 focus-visible:ring-primary/50"
                      value={activeWs.numbers}
                      onChange={(e) => updateWs(activeWs.id, { numbers: e.target.value })}
                      disabled={isRunning}
                    />

                    {isStopped && remainingCount > 0 && (
                      <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                        <PlayCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>Ruka — <b>{remainingCount}</b> baaki. Resume dabao</span>
                      </div>
                    )}

                    {!isConnected && (
                      <p className="text-xs text-amber-400 text-center bg-amber-500/10 border border-amber-500/20 rounded-lg py-2">
                        ⚠️ Pehle WhatsApp connect karein (upar)
                      </p>
                    )}

                    <div className="flex gap-2">
                      <Button onClick={handleStart}
                        disabled={!isConnected || isRunning || !activeWs.numbers.trim() || startScanMutation.isPending}
                        className="flex-1 font-semibold" size="default">
                        {startScanMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Starting...</>
                          : isRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{scanJob!.currentIndex}/{scanJob!.numbers.length}</>
                          : isStopped ? <><PlayCircle className="mr-2 h-4 w-4" />Resume</>
                          : "Start Verification"}
                      </Button>
                      {isRunning && (
                        <Button onClick={handleStop} variant="outline"
                          className="border-rose-500/50 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500 px-3"
                          disabled={stopScanMutation.isPending}>
                          <Square className="h-4 w-4 fill-rose-400" />
                        </Button>
                      )}
                    </div>

                    {showActions && (
                      <div className="flex flex-col gap-2 pt-1 border-t border-border/50">
                        {stats.active > 0 && (
                          <>
                            <p className="text-xs text-muted-foreground">
                              {stats.active} active{stats.excludedCount > 0 ? ` (${stats.excludedCount} excluded)` : ""}:
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <Button onClick={handleCopyActive} variant="outline" size="sm"
                                className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10">
                                {copied ? <><Check className="mr-1.5 h-3.5 w-3.5" />Copied!</> : <><Copy className="mr-1.5 h-3.5 w-3.5" />Copy</>}
                              </Button>
                              <Button onClick={handleDownloadActive} variant="outline" size="sm"
                                className="border-blue-500/40 text-blue-400 hover:bg-blue-500/10">
                                <Download className="mr-1.5 h-3.5 w-3.5" />Download
                              </Button>
                            </div>
                            <Button onClick={handleRemoveBad} variant="outline" size="sm"
                              className="border-rose-500/40 text-rose-400 hover:bg-rose-500/10">
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" />Remove Bad ({stats.deleted + stats.error})
                            </Button>
                          </>
                        )}
                        <Button onClick={handleClearJob} variant="ghost" size="sm"
                          className="text-muted-foreground text-xs">
                          <X className="mr-1.5 h-3 w-3" />Clear / Naya Scan
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* ── Stats + Live Log ── */}
                <div className="flex flex-col gap-3">
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {[
                      { label: "Total", value: stats.total, color: "text-blue-500", bar: true },
                      { label: "Active", value: stats.active, color: "text-emerald-500", bar: false },
                      { label: "Deleted", value: stats.deleted, color: "text-rose-500", bar: false },
                    ].map(({ label, value, color, bar }) => (
                      <Card key={label} className="border-border bg-card shadow-sm">
                        <CardContent className="p-3">
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">{label}</p>
                          <h3 className={`text-2xl sm:text-3xl font-bold font-mono ${color}`}>{value}</h3>
                          {bar && hasJob && scanJob && (
                            <div className="mt-2 h-1 bg-border rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 transition-all duration-500 rounded-full"
                                style={{ width: `${scanJob.numbers.length > 0 ? (scanJob.currentIndex / scanJob.numbers.length) * 100 : 0}%` }} />
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Live log */}
                  <Card className="border-border bg-card shadow-sm flex flex-col">
                    <CardHeader className="py-2.5 px-3 border-b border-border bg-muted/30 flex flex-row items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <TerminalSquare className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-xs font-semibold text-muted-foreground">Live Log</CardTitle>
                        {isRunning && <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full animate-pulse">Running</span>}
                      </div>
                      {results.length > 0 && (
                        <div className="flex items-center gap-2 text-xs font-mono">
                          <span className="text-emerald-400">{stats.active} ✓</span>
                          <span className="text-rose-400">{stats.deleted} ✗</span>
                          {stats.error > 0 && <span className="text-amber-400">{stats.error} !</span>}
                        </div>
                      )}
                    </CardHeader>
                    <div className="relative bg-[#0d1117] overflow-hidden" style={{ minHeight: "220px", maxHeight: "380px" }}>
                      <div ref={logScrollRef} className="absolute inset-0 overflow-auto p-3 space-y-0.5 font-mono text-[11px] sm:text-[12px] leading-relaxed">
                        {results.length === 0 ? (
                          <div className="text-muted-foreground/40 h-full flex items-center justify-center italic text-sm py-12">
                            {isRunning ? "Scan chal raha hai..." : "Awaiting execution..."}
                          </div>
                        ) : (
                          results.map((log, i) => (
                            <div key={i}
                              className={`flex items-start gap-1.5 sm:gap-2 px-1.5 py-0.5 rounded ${
                                log.status === "active"  ? "text-emerald-400 bg-emerald-500/5"
                                : log.status === "deleted" ? "text-rose-400 bg-rose-500/5"
                                : "text-amber-400 bg-amber-500/5"
                              }`}>
                              <span className="text-muted-foreground/40 whitespace-nowrap shrink-0 hidden sm:inline">
                                {new Date(log.timestamp).toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                              </span>
                              <span className="font-semibold shrink-0 tracking-wider">{log.number}</span>
                              <span className={`text-[10px] shrink-0 font-bold uppercase mt-[1px] ${
                                log.status === "active" ? "text-emerald-300" : log.status === "deleted" ? "text-rose-300" : "text-amber-300"
                              }`}>
                                [{log.status === "active" ? "✓" : log.status === "deleted" ? "✗" : "!"}]
                              </span>
                              <span className="opacity-60 break-all text-[10px] hidden sm:inline">{log.reason}</span>
                            </div>
                          ))
                        )}
                        {isDone && (
                          <div className="text-slate-400 px-2 py-2 mt-2 border-t border-slate-700/50 text-xs">
                            ✓ Done — {stats.active} active, {stats.deleted} deleted{stats.error > 0 ? `, ${stats.error} err` : ""}
                          </div>
                        )}
                        {isStopped && (
                          <div className="text-amber-400/70 px-2 py-2 mt-2 border-t border-slate-700/50 text-xs">
                            ⏸ Ruka — Resume karo ya copy/download karo
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            )}
          </div>
        </main>
      )}

      {/* ── BOT TAB ── */}
      {mainTab === "bot" && (
        <main className="flex-1 overflow-auto">
          <div className="max-w-[700px] mx-auto p-3 sm:p-4 flex flex-col gap-3">

            {/* Status + Controls */}
            <Card className="border-border bg-card shadow-sm">
              <CardHeader className="py-3 px-4 border-b border-border">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bot className="h-5 w-5 text-primary" />
                    Telegram Bot
                  </CardTitle>
                  <button onClick={handleToggleAutoRestart}
                    disabled={setAutoRestartMutation.isPending}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      botStatus?.autoRestart
                        ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                        : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                    }`}>
                    <span className={`h-2 w-2 rounded-full ${botStatus?.autoRestart ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
                    24/7 {botStatus?.autoRestart ? "ON" : "OFF"}
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-3 flex flex-col gap-3">

                {botStatus?.connected ? (
                  <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                        <Bot className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-emerald-400">@{botStatus.username}</p>
                        <p className="text-xs text-muted-foreground">
                          {botUptime ? `Uptime: ${botUptime}` : "Connected"}
                          {botStatus.autoRestart && " · 24/7 on"}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleBotRestart} variant="outline" size="sm"
                        className="border-blue-500/40 text-blue-400 hover:bg-blue-500/10"
                        disabled={restartBotMutation.isPending}>
                        {restartBotMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Restart</>}
                      </Button>
                      <Button onClick={() => stopBotMutation.mutateAsync()} variant="outline" size="sm"
                        className="border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
                        disabled={stopBotMutation.isPending}>
                        {stopBotMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Square className="mr-1.5 h-3 w-3 fill-rose-400" />Stop</>}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {botStatus?.error && (
                      <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 text-xs text-rose-400">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          {botStatus.error}
                          {botStatus.autoRestart && <p className="text-amber-400 mt-1">🔄 Auto-reconnect 15s mein...</p>}
                        </div>
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <label className="text-xs text-muted-foreground font-medium">Bot Token (BotFather se milega):</label>
                      <div className="flex gap-2">
                        <input type="text" placeholder="1234567890:AAF..."
                          value={botTokenInput}
                          onChange={(e) => { setBotTokenInput(e.target.value); setBotError(""); }}
                          onKeyDown={(e) => e.key === "Enter" && handleBotSetup()}
                          className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/40 min-w-0" />
                        <Button onClick={handleBotSetup} disabled={setupBotMutation.isPending} className="shrink-0">
                          {setupBotMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-2 h-4 w-4" />Connect</>}
                        </Button>
                      </div>
                      {botError && <p className="text-xs text-rose-400">{botError}</p>}
                    </div>
                  </>
                )}

                {/* Bot Speed Setting */}
                <div className="flex items-center justify-between pt-1 border-t border-border/50 gap-3">
                  <div>
                    <p className="text-xs font-semibold">Bot Scan Speed</p>
                    <p className="text-xs text-muted-foreground">Ya Telegram par /speed bhejo</p>
                  </div>
                  <select value={botScanDelay} onChange={(e) => setBotScanDelay(Number(e.target.value))}
                    className="text-xs bg-background border border-border rounded px-2 py-1.5 focus:outline-none focus:border-primary/60 text-muted-foreground shrink-0">
                    {BOT_SPEED_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Commands reference */}
            <Card className="border-border bg-card shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Bot Commands
                </p>
                <div className="space-y-2">
                  {[
                    ["/start", "Bot ko greet karo"],
                    ["/help", "Madad aur number format guide"],
                    ["/speed", "Current speed dekho"],
                    ["/speed fast", "Speed badlo (turbo/fast/normal/safe ya 200-5000)"],
                  ].map(([cmd, desc]) => (
                    <div key={cmd} className="flex items-start gap-3">
                      <code className="text-xs bg-muted border border-border px-2 py-0.5 rounded font-mono text-primary shrink-0">{cmd}</code>
                      <span className="text-xs text-muted-foreground">{desc}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Number formats supported */}
            <Card className="border-border bg-card shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-semibold mb-3">✅ Supported Number Formats</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {["923001234567", "+923001234567", "584121234567", "+584121234567", "201012345678", "+91 9876543210"].map((n) => (
                    <code key={n} className="bg-muted border border-border px-2 py-1 rounded font-mono text-muted-foreground">{n}</code>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">+ aur spaces/dashes automatically remove ho jaate hain</p>
              </CardContent>
            </Card>

            {/* Instructions */}
            <Card className="border-border bg-card shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-semibold mb-3">Kaise use karein:</p>
                <ol className="space-y-3">
                  {[
                    ["BotFather se token lo", "@BotFather → /newbot → token copy karo"],
                    ["Token daalo → Connect", "Upar form mein paste karo, Connect dabao"],
                    ["WhatsApp connect karo", "Scanner tab mein WA link hona zaroori hai"],
                    ["Numbers ya .txt file bhejo", "Koi bhi country ka number (+58, +92, etc.) chalega"],
                    ["Clean list milegi", "Active numbers ki .txt file bot wapas bhejega"],
                  ].map(([title, desc], i) => (
                    <li key={i} className="flex gap-3">
                      <span className="h-5 w-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">{i + 1}</span>
                      <div>
                        <p className="text-xs font-semibold text-foreground mb-0.5">{title}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
              ⚠️ Bot ke liye Scanner tab mein WhatsApp connected hona zaroori hai
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
