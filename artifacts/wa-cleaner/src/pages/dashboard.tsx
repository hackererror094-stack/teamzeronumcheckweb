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
  Square, Download, PlayCircle, Plus, X, Bot, Zap, Send,
  RefreshCw, List, AlertCircle, LayoutList, ChevronRight,
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const queryClient = useQueryClient();

  const [mainTab, setMainTab] = useState<"scanner" | "bot">("scanner");
  const [workspaces, setWorkspaces] = useState<Workspace[]>(loadWorkspaces);
  const [activeWsId, setActiveWsId] = useState<string>(() => loadWorkspaces()[0]?.id ?? "ws1");

  // Numbers sidebar state
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarFilter, setSidebarFilter] = useState<"all" | "active" | "deleted" | "error">("all");
  const [excludedNums, setExcludedNums] = useState<Set<string>>(new Set());
  const prevJobIdRef = useRef<string | null>(null);

  // WA connect state
  const [phoneInput, setPhoneInput] = useState("");
  const [pairingError, setPairingError] = useState("");
  const [copied, setCopied] = useState(false);

  // Bot state
  const [botTokenInput, setBotTokenInput] = useState("");
  const [botError, setBotError] = useState("");

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
      setSidebarFilter("all");
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
  };

  // Numbers sidebar — exclude/restore individual numbers
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
    a.download = `active_numbers_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRemoveBad = () => {
    if (!activeWs) return;
    updateWs(activeWs.id, { numbers: visibleActiveNumbers.join("\n") });
  };

  // Workspace management
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

  // Bot handlers
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

  // Sidebar filtered results
  const sidebarResults = results.filter((r) => {
    if (sidebarFilter === "all") return true;
    return r.status === sidebarFilter;
  });

  const remainingCount = isStopped && scanJob ? scanJob.numbers.length - scanJob.currentIndex : 0;

  // Bot uptime string
  const botUptime = botStatus?.startedAt
    ? (() => {
        const sec = Math.floor((Date.now() - new Date(botStatus.startedAt).getTime()) / 1000);
        if (sec < 60) return `${sec}s`;
        if (sec < 3600) return `${Math.floor(sec / 60)}m`;
        return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
      })()
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* ── Header ── */}
      <header className="border-b border-border bg-card shrink-0">
        <div className="w-full flex items-center justify-between px-4 py-3 gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight hidden sm:block">WA Cleaner</h1>
          </div>

          {/* Main tabs */}
          <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1">
            <button onClick={() => setMainTab("scanner")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mainTab === "scanner" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <Zap className="h-3.5 w-3.5 inline mr-1.5" />Scanner
            </button>
            <button onClick={() => setMainTab("bot")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors relative ${mainTab === "bot" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <Bot className="h-3.5 w-3.5 inline mr-1.5" />Bot
              {botStatus?.connected && <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />}
            </button>
          </div>

          {/* WA status */}
          <div className="flex items-center gap-3 text-sm shrink-0">
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
                  <LogOut className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Disconnect</span>
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2 text-amber-400 text-sm">
                <Activity className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">WA connected nahi</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── SCANNER TAB ── */}
      {mainTab === "scanner" && (
        <main className="flex-1 flex overflow-hidden">

          {/* Left sidebar — numbers list */}
          <div className={`border-r border-border bg-card flex flex-col transition-all duration-200 shrink-0 ${showSidebar ? "w-[280px]" : "w-0 overflow-hidden"}`}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <LayoutList className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Numbers List</span>
                {results.length > 0 && (
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">{results.length}</span>
                )}
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex border-b border-border shrink-0">
              {(["all", "active", "deleted", "error"] as const).map((f) => {
                const count = f === "all" ? results.length
                  : results.filter((r) => r.status === f).length;
                return (
                  <button key={f} onClick={() => setSidebarFilter(f)}
                    className={`flex-1 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-colors ${
                      sidebarFilter === f
                        ? f === "active" ? "text-emerald-400 border-b-2 border-emerald-500"
                          : f === "deleted" ? "text-rose-400 border-b-2 border-rose-500"
                          : f === "error" ? "text-amber-400 border-b-2 border-amber-500"
                          : "text-foreground border-b-2 border-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}>
                    {f} {count > 0 && <span className="opacity-70">({count})</span>}
                  </button>
                );
              })}
            </div>

            {/* Bulk actions */}
            {results.length > 0 && (
              <div className="flex gap-1 px-2 py-1.5 border-b border-border shrink-0">
                {stats.deleted > 0 && (
                  <button onClick={() => handleExcludeAll("deleted")}
                    className="text-[10px] text-rose-400/80 hover:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded transition-colors">
                    Remove all deleted
                  </button>
                )}
                {stats.error > 0 && (
                  <button onClick={() => handleExcludeAll("error")}
                    className="text-[10px] text-amber-400/80 hover:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded transition-colors">
                    Remove all errors
                  </button>
                )}
              </div>
            )}

            {/* Numbers list */}
            <div className="flex-1 overflow-y-auto">
              {sidebarResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground/40 p-4">
                  <List className="h-8 w-8" />
                  <p className="text-xs text-center">
                    {results.length === 0 ? "Scan karo — numbers yahan dikhenge" : "Koi number nahi mila"}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {sidebarResults.map((r, i) => {
                    const isExcluded = excludedNums.has(r.number);
                    return (
                      <div key={i}
                        className={`flex items-center gap-2 px-3 py-2 group transition-colors hover:bg-muted/20 ${isExcluded ? "opacity-40" : ""}`}>
                        <span className={`h-2 w-2 rounded-full shrink-0 ${
                          r.status === "active" ? "bg-emerald-500"
                            : r.status === "deleted" ? "bg-rose-500" : "bg-amber-500"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-mono font-medium ${isExcluded ? "line-through" : ""}`}>{r.number}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{r.reason}</p>
                        </div>
                        <button
                          onClick={() => isExcluded ? handleRestore(r.number) : handleExclude(r.number)}
                          className={`opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center rounded transition-all shrink-0 ${
                            isExcluded ? "text-emerald-400 hover:bg-emerald-500/20" : "text-rose-400 hover:bg-rose-500/20"
                          }`}
                          title={isExcluded ? "Restore" : "Delete"}>
                          {isExcluded ? <Plus className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Excluded count */}
            {stats.excludedCount > 0 && (
              <div className="px-3 py-2 border-t border-border shrink-0 text-xs text-muted-foreground bg-muted/20">
                {stats.excludedCount} numbers excluded from copy/download
              </div>
            )}
          </div>

          {/* Toggle sidebar button */}
          <button
            onClick={() => setShowSidebar((v) => !v)}
            className="shrink-0 self-stretch w-4 border-r border-border bg-card hover:bg-muted/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors group"
            title={showSidebar ? "Hide list" : "Show numbers list"}>
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showSidebar ? "rotate-180" : ""}`} />
          </button>

          {/* Main area */}
          <div className="flex-1 overflow-auto">
            <div className="p-4 flex flex-col gap-4 min-h-full max-w-[1200px]">

              {/* WA Connect card */}
              {!isConnected && (
                <Card className="border-amber-500/20 bg-amber-500/5 shadow-sm">
                  <CardHeader className="pb-3 border-b border-amber-500/20 flex flex-row items-center gap-2">
                    <Link2 className="h-4 w-4 text-amber-400" />
                    <CardTitle className="text-sm font-medium text-amber-400">WhatsApp Connect Karein</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    {waStatus?.pairingCode ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="bg-[#0d1117] border border-primary/30 rounded-xl px-6 py-3 text-center">
                          <span className="text-3xl font-bold font-mono tracking-[0.3em] text-primary">{waStatus.pairingCode}</span>
                        </div>
                        <p className="text-xs text-muted-foreground text-center">
                          WhatsApp → <b>3 dots</b> → <b>Linked Devices</b> → <b>Link with Phone Number</b>
                        </p>
                        <p className="text-xs text-amber-400">Code 60 seconds mein expire hota hai</p>
                      </div>
                    ) : (
                      <div className="flex gap-3 items-start">
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
              <div className="flex items-center gap-1 border-b border-border overflow-x-auto shrink-0">
                {workspaces.map((ws) => {
                  const wsJob = ws.id === activeWsId ? scanJob : null;
                  const wsRunning = wsJob?.status === "running";
                  return (
                    <div key={ws.id}
                      className={`group flex items-center gap-1.5 px-3 py-2 border-b-2 cursor-pointer text-sm font-medium transition-colors whitespace-nowrap ${
                        ws.id === activeWsId ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setActiveWsId(ws.id)}>
                      {ws.jobId && (
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${wsRunning ? "bg-emerald-500 animate-pulse" : ws.id === activeWsId && isDone ? "bg-blue-500" : "bg-amber-500"}`} />
                      )}
                      {ws.name}
                      {workspaces.length > 1 && (
                        <button onClick={(e) => { e.stopPropagation(); removeWorkspace(ws.id); }}
                          className="opacity-0 group-hover:opacity-100 h-4 w-4 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-all">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
                <button onClick={addWorkspace}
                  className="flex items-center gap-1 px-2 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors ml-1 shrink-0">
                  <Plus className="h-3.5 w-3.5" />Add
                </button>
              </div>

              {/* Input + Log grid */}
              {activeWs && (
                <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">

                  {/* Input card */}
                  <Card className="border-border bg-card shadow-sm flex flex-col">
                    <CardHeader className="pb-2 border-b border-border">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium">{activeWs.name}</CardTitle>
                        <select value={activeWs.speed}
                          onChange={(e) => updateWs(activeWs.id, { speed: Number(e.target.value) })}
                          disabled={isRunning}
                          className="text-xs bg-background border border-border rounded px-2 py-1 focus:outline-none focus:border-primary/60 text-muted-foreground">
                          {SPEED_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <p className="text-xs text-muted-foreground">Har number nayi line mein (923xxxxxxxxx)</p>
                    </CardHeader>
                    <CardContent className="p-3 flex flex-col gap-3">
                      <Textarea
                        placeholder={"923001234567\n923119876543"}
                        className="min-h-[200px] font-mono text-sm bg-background border-border resize-none focus-visible:ring-1 focus-visible:ring-primary/50"
                        value={activeWs.numbers}
                        onChange={(e) => updateWs(activeWs.id, { numbers: e.target.value })}
                        disabled={isRunning}
                      />

                      {isStopped && remainingCount > 0 && (
                        <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                          <PlayCircle className="h-3.5 w-3.5 shrink-0" />
                          <span>Ruka — <strong>{remainingCount}</strong> baaki. Resume dabao</span>
                        </div>
                      )}

                      {!isConnected && (
                        <p className="text-xs text-amber-400 text-center">⚠️ Pehle WhatsApp connect karein</p>
                      )}

                      <div className="flex gap-2">
                        <Button onClick={handleStart}
                          disabled={!isConnected || isRunning || !activeWs.numbers.trim() || startScanMutation.isPending}
                          className="flex-1 font-medium" size="lg">
                          {startScanMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Starting...</>
                            : isRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{scanJob!.currentIndex} / {scanJob!.numbers.length}</>
                            : isStopped ? <><PlayCircle className="mr-2 h-4 w-4" />Resume Scan</>
                            : "Start Verification"}
                        </Button>
                        {isRunning && (
                          <Button onClick={handleStop} variant="outline" size="lg"
                            className="border-rose-500/50 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500 px-4"
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
                              <div className="flex gap-2">
                                <Button onClick={handleCopyActive} variant="outline" size="sm"
                                  className="flex-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10">
                                  {copied ? <><Check className="mr-2 h-3.5 w-3.5" />Copied!</> : <><Copy className="mr-2 h-3.5 w-3.5" />Copy</>}
                                </Button>
                                <Button onClick={handleDownloadActive} variant="outline" size="sm"
                                  className="flex-1 border-blue-500/40 text-blue-400 hover:bg-blue-500/10">
                                  <Download className="mr-2 h-3.5 w-3.5" />Download
                                </Button>
                              </div>
                              <Button onClick={handleRemoveBad} variant="outline" size="sm"
                                className="w-full border-rose-500/40 text-rose-400 hover:bg-rose-500/10">
                                <Trash2 className="mr-2 h-3.5 w-3.5" />Remove Bad ({stats.deleted + stats.error})
                              </Button>
                            </>
                          )}
                          <Button onClick={handleClearJob} variant="ghost" size="sm"
                            className="w-full text-muted-foreground text-xs">
                            <X className="mr-1.5 h-3 w-3" />Clear / Naya Scan
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Stats + Live Log */}
                  <div className="flex flex-col gap-4">
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3 shrink-0">
                      <Card className="border-border bg-card shadow-sm">
                        <CardContent className="p-4">
                          <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Total</p>
                          <h3 className="text-3xl font-semibold text-blue-500 font-mono">{stats.total}</h3>
                          {hasJob && scanJob && (
                            <div className="mt-2 h-1 bg-border rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 transition-all duration-500 rounded-full"
                                style={{ width: `${(scanJob.currentIndex / scanJob.numbers.length) * 100}%` }} />
                            </div>
                          )}
                        </CardContent>
                      </Card>
                      <Card className="border-border bg-card shadow-sm">
                        <CardContent className="p-4">
                          <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Active</p>
                          <h3 className="text-3xl font-semibold text-emerald-500 font-mono">{stats.active}</h3>
                        </CardContent>
                      </Card>
                      <Card className="border-border bg-card shadow-sm">
                        <CardContent className="p-4">
                          <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Deleted</p>
                          <h3 className="text-3xl font-semibold text-rose-500 font-mono">{stats.deleted}</h3>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Live log */}
                    <Card className="border-border bg-card shadow-sm flex flex-col" style={{ minHeight: "320px" }}>
                      <CardHeader className="py-3 px-4 border-b border-border bg-muted/30 flex flex-row items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                          <TerminalSquare className="h-4 w-4 text-muted-foreground" />
                          <CardTitle className="text-sm font-medium text-muted-foreground">Live Log</CardTitle>
                          {isRunning && <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full animate-pulse">Running</span>}
                        </div>
                        {results.length > 0 && (
                          <div className="flex items-center gap-3 text-xs font-mono">
                            <span className="text-emerald-400">{stats.active} Active</span>
                            <span className="text-rose-400">{stats.deleted} Del</span>
                            {stats.error > 0 && <span className="text-amber-400">{stats.error} Err</span>}
                          </div>
                        )}
                      </CardHeader>
                      <div className="relative flex-1 bg-[#0d1117] overflow-hidden" style={{ minHeight: "240px" }}>
                        <div ref={logScrollRef} className="absolute inset-0 overflow-auto p-4 space-y-1 font-mono text-[13px] leading-relaxed">
                          {results.length === 0 ? (
                            <div className="text-muted-foreground/50 h-full flex items-center justify-center italic text-sm">
                              {isRunning ? "Scan chal raha hai..." : "Awaiting execution..."}
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
                                <span className={`text-[11px] shrink-0 w-[80px] font-bold tracking-wider mt-[2px] uppercase ${
                                  log.status === "active" ? "text-emerald-300" : log.status === "deleted" ? "text-rose-300" : "text-amber-300"
                                }`}>
                                  {log.status === "active" ? "[ACTIVE]" : log.status === "deleted" ? "[DELETED]" : "[ERROR]"}
                                </span>
                                <span className="opacity-70 break-all text-xs">{log.reason}</span>
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
                              ⏸ Ruka — {stats.active} active ab tak. Resume dabao ya results copy/download karo.
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      )}

      {/* ── BOT TAB ── */}
      {mainTab === "bot" && (
        <main className="flex-1 overflow-auto">
          <div className="max-w-[750px] mx-auto p-4 flex flex-col gap-4">

            {/* Bot Status Card */}
            <Card className="border-border bg-card shadow-sm">
              <CardHeader className="border-b border-border">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-primary" />
                    Telegram Bot
                  </CardTitle>
                  {/* 24/7 toggle */}
                  <button onClick={handleToggleAutoRestart}
                    disabled={setAutoRestartMutation.isPending}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      botStatus?.autoRestart
                        ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                        : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                    }`}>
                    <span className={`h-2 w-2 rounded-full ${botStatus?.autoRestart ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
                    24/7 Auto-Restart {botStatus?.autoRestart ? "ON" : "OFF"}
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-4 flex flex-col gap-4">

                {/* Connected state */}
                {botStatus?.connected ? (
                  <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <Bot className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-emerald-400">@{botStatus.username}</p>
                        <p className="text-xs text-muted-foreground">
                          Connected {botUptime ? `· Uptime: ${botUptime}` : ""}
                          {botStatus.autoRestart && " · 24/7 mode on"}
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
                        {stopBotMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Square className="mr-1.5 h-3.5 w-3.5 fill-rose-400" />Stop</>}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Error badge */}
                    {botStatus?.error && (
                      <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 text-xs text-rose-400">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {botStatus.error}
                        {botStatus.autoRestart && <span className="ml-auto text-amber-400">Auto-reconnect karега 15s mein...</span>}
                      </div>
                    )}

                    {/* Connect form */}
                    <div className="flex flex-col gap-2">
                      <label className="text-xs text-muted-foreground font-medium">Bot Token (BotFather se milega):</label>
                      <div className="flex gap-2">
                        <input type="text" placeholder="1234567890:AAF..."
                          value={botTokenInput}
                          onChange={(e) => { setBotTokenInput(e.target.value); setBotError(""); }}
                          onKeyDown={(e) => e.key === "Enter" && handleBotSetup()}
                          className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/40" />
                        <Button onClick={handleBotSetup} disabled={setupBotMutation.isPending}>
                          {setupBotMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-2 h-4 w-4" />Connect</>}
                        </Button>
                      </div>
                      {botError && <p className="text-xs text-rose-400">{botError}</p>}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* 24/7 info */}
            <Card className="border-border bg-card shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-3 flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs">?</span>
                  24/7 Mode kya hai?
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2"><span className="text-emerald-400 shrink-0">✓</span> Bot disconnect ho jaye ya error aaye → automatically 15 seconds mein reconnect ho jata hai</li>
                  <li className="flex gap-2"><span className="text-emerald-400 shrink-0">✓</span> Server band hone par bhi yahi token save rehta hai</li>
                  <li className="flex gap-2"><span className="text-emerald-400 shrink-0">✓</span> Upar wala toggle ON karo → bot khud restart hota rehta hai</li>
                </ul>
              </CardContent>
            </Card>

            {/* Usage instructions */}
            <Card className="border-border bg-card shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-3">Bot use karne ka tarika:</p>
                <ol className="space-y-3 text-sm text-muted-foreground">
                  {[
                    ["BotFather se token lo", "@BotFather → /newbot → token copy karo"],
                    ["Token daalo → Connect", "Upar form mein token paste karo, Connect dabao"],
                    ["Numbers bhejo", "Telegram par apne bot ko open karo → numbers paste karo ya .txt file upload karo"],
                    ["Clean list milegi", "Bot verify karega → banned/invalid delete → active numbers ki .txt file wapas bhejega"],
                  ].map(([title, desc], i) => (
                    <li key={i} className="flex gap-3">
                      <span className="h-5 w-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">{i + 1}</span>
                      <div>
                        <p className="text-foreground font-medium text-xs mb-0.5">{title}</p>
                        <p className="text-xs">{desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            <div className="text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              ⚠️ Bot ke liye Scanner tab mein WhatsApp connected hona zaroori hai
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
