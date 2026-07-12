import { useState, useRef, useEffect } from "react";
import {
  useGetWaStatus,
  useDisconnectWa,
  useVerifyNumber,
  useRequestPairingCode,
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
} from "lucide-react";

type LogEntry = {
  id: string;
  number: string;
  status: "active" | "deleted" | "error";
  reason: string;
  timestamp: Date;
};

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [numbersInput, setNumbersInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [pairingError, setPairingError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldRunRef = useRef(false);

  const { data: waStatus } = useGetWaStatus({
    query: { refetchInterval: 2000 },
  });

  const disconnectMutation = useDisconnectWa();
  const verifyMutation = useVerifyNumber();
  const pairingMutation = useRequestPairingCode();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleDisconnect = async () => {
    await disconnectMutation.mutateAsync();
    queryClient.invalidateQueries({ queryKey: getGetWaStatusQueryKey() });
  };

  const handleRequestPairingCode = async () => {
    setPairingError("");
    const phone = phoneInput.replace(/[^0-9]/g, "");
    if (phone.length < 10) {
      setPairingError("Apna WhatsApp number daalo (e.g. 923001234567)");
      return;
    }
    try {
      await pairingMutation.mutateAsync({ data: { phone } });
      queryClient.invalidateQueries({ queryKey: getGetWaStatusQueryKey() });
    } catch (err: any) {
      setPairingError(err?.message || "Code generate nahi hua, dobara try karein");
    }
  };

  const handleStart = async () => {
    if (!waStatus?.connected) return;

    const lines = numbersInput
      .split("\n")
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    if (lines.length === 0) return;

    setIsProcessing(true);
    setDone(false);
    setLogs([]);
    setProgress({ current: 0, total: lines.length });
    shouldRunRef.current = true;

    const newLogs: LogEntry[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (!shouldRunRef.current) break;

      const num = lines[i];
      try {
        const res = await verifyMutation.mutateAsync({ data: { number: num } });
        const entry: LogEntry = {
          id: `${Date.now()}-${i}`,
          number: num,
          status: res.status,
          reason: res.reason,
          timestamp: new Date(),
        };
        newLogs.push(entry);
        setLogs([...newLogs]);
      } catch (err: any) {
        const entry: LogEntry = {
          id: `${Date.now()}-${i}`,
          number: num,
          status: "error",
          reason: err?.message || "Verification Failed",
          timestamp: new Date(),
        };
        newLogs.push(entry);
        setLogs([...newLogs]);
      }

      setProgress({ current: i + 1, total: lines.length });

      // Small delay between checks to avoid WhatsApp throttling / ban risk
      if (i < lines.length - 1) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    setIsProcessing(false);
    setDone(true);
  };

  const handleRemoveBad = () => {
    const activeNumbers = logs
      .filter((l) => l.status === "active")
      .map((l) => l.number);
    setNumbersInput(activeNumbers.join("\n"));
  };

  const handleCopyActive = async () => {
    const activeNumbers = logs
      .filter((l) => l.status === "active")
      .map((l) => l.number)
      .join("\n");
    await navigator.clipboard.writeText(activeNumbers);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const stats = {
    total: logs.length,
    active: logs.filter((l) => l.status === "active").length,
    deleted: logs.filter((l) => l.status === "deleted").length,
    error: logs.filter((l) => l.status === "error").length,
  };

  const isConnected = waStatus?.connected === true;
  const pairingCode = waStatus?.pairingCode;
  const showPairingForm = !isConnected;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">WA Number Cleaner</h1>
          </div>

          <div className="flex items-center gap-4 text-sm">
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnectMutation.isPending}
                  className="border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2 text-amber-400 text-sm">
                <Activity className="h-4 w-4" />
                <span>WhatsApp connected nahi hai</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto p-4 grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 items-start">
        {/* Left Column */}
        <div className="flex flex-col gap-4">

          {/* Pairing Code Login Card */}
          {showPairingForm && (
            <Card className="border-border bg-card shadow-sm">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  WhatsApp Connect Karein
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Apna WhatsApp number daalo, ek code milega — us code ko WhatsApp mein enter karo
                </p>
              </CardHeader>
              <CardContent className="p-4 flex flex-col gap-3">

                {/* Pairing code display */}
                {pairingCode ? (
                  <div className="flex flex-col items-center gap-3 py-2">
                    <p className="text-xs text-muted-foreground text-center">
                      Yeh code WhatsApp mein enter karein:
                    </p>
                    <div className="bg-[#0d1117] border border-primary/30 rounded-xl px-6 py-4 text-center">
                      <span className="text-4xl font-bold font-mono tracking-[0.3em] text-primary">
                        {pairingCode}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground text-center space-y-1">
                      <p>WhatsApp kholo → <span className="text-foreground font-medium">3 dots</span> → <span className="text-foreground font-medium">Linked Devices</span></p>
                      <p>→ <span className="text-foreground font-medium">Link with Phone Number</span> → code enter karein</p>
                    </div>
                    <p className="text-xs text-amber-400 text-center">Code 60 seconds mein expire ho jata hai</p>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        placeholder="923001234567"
                        value={phoneInput}
                        onChange={(e) => {
                          setPhoneInput(e.target.value);
                          setPairingError("");
                        }}
                        onKeyDown={(e) => e.key === "Enter" && handleRequestPairingCode()}
                        className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-colors placeholder:text-muted-foreground/50"
                      />
                      <Button
                        onClick={handleRequestPairingCode}
                        disabled={pairingMutation.isPending}
                        size="sm"
                        className="shrink-0"
                      >
                        {pairingMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Get Code"
                        )}
                      </Button>
                    </div>
                    {pairingError && (
                      <p className="text-xs text-rose-400">{pairingError}</p>
                    )}
                    <p className="text-xs text-muted-foreground/60">
                      Country code ke saath daalo — e.g. Pakistan: 923xxxxxxxxx
                    </p>
                  </>
                )}

                {/* QR fallback */}
                {waStatus?.qr && !pairingCode && (
                  <div className="border-t border-border pt-3 mt-1">
                    <p className="text-xs text-muted-foreground text-center mb-3">Ya QR code scan karein:</p>
                    <div className="flex justify-center">
                      <div className="bg-white p-3 rounded-xl">
                        <img src={waStatus.qr} alt="QR" className="w-36 h-36" />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Numbers input */}
          <Card className="border-border bg-card shadow-sm flex-1 flex flex-col">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-sm font-medium">Target Numbers</CardTitle>
              <p className="text-xs text-muted-foreground">
                Har number nayi line mein (Format: 923xxxxxxxx)
              </p>
            </CardHeader>
            <CardContent className="p-4 flex-1 flex flex-col gap-3">
              <Textarea
                placeholder={"923001234567\n923119876543"}
                className="flex-1 min-h-[220px] font-mono text-sm bg-background border-border resize-none focus-visible:ring-1 focus-visible:ring-primary/50"
                value={numbersInput}
                onChange={(e) => setNumbersInput(e.target.value)}
                disabled={isProcessing}
              />

              {!isConnected && (
                <p className="text-xs text-amber-400 text-center py-1">
                  Pehle upar se WhatsApp connect karein
                </p>
              )}

              <Button
                onClick={handleStart}
                disabled={!isConnected || isProcessing || !numbersInput.trim()}
                className="w-full font-medium"
                size="lg"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing... {progress.current} / {progress.total}
                  </>
                ) : (
                  "Start Verification"
                )}
              </Button>

              {done && logs.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={handleCopyActive}
                    variant="outline"
                    className="w-full font-medium border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/60"
                    size="lg"
                  >
                    {copied ? (
                      <><Check className="mr-2 h-4 w-4" /> Copied!</>
                    ) : (
                      <><Copy className="mr-2 h-4 w-4" /> Copy Active Numbers ({stats.active})</>
                    )}
                  </Button>
                  <Button
                    onClick={handleRemoveBad}
                    variant="outline"
                    className="w-full font-medium border-rose-500/40 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/60"
                    size="lg"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove Bad Numbers ({stats.deleted + stats.error})
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-6 h-full min-h-[600px]">
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-border bg-card shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Total Scanned</p>
                <div className="flex items-end justify-between">
                  <h3 className="text-3xl font-semibold text-blue-500 font-mono">{stats.total}</h3>
                  <Activity className="h-5 w-5 text-blue-500/50 mb-1" />
                </div>
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

          <Card className="border-border bg-card shadow-sm flex-1 flex flex-col overflow-hidden">
            <CardHeader className="py-3 px-4 border-b border-border bg-muted/30 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <TerminalSquare className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium text-muted-foreground">Live Execution Log</CardTitle>
              </div>
              {done && logs.length > 0 && (
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-emerald-400">{stats.active} Active</span>
                  <span className="text-rose-400">{stats.deleted} Deleted</span>
                  {stats.error > 0 && <span className="text-amber-400">{stats.error} Error</span>}
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0 flex-1 relative bg-[#0d1117]">
              <div
                ref={scrollRef}
                className="absolute inset-0 overflow-auto p-4 space-y-1 font-mono text-[13px] leading-relaxed"
              >
                {logs.length === 0 ? (
                  <div className="text-muted-foreground/50 h-full flex items-center justify-center italic">
                    Awaiting execution...
                  </div>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className={`flex items-start gap-3 px-2 py-1 rounded ${
                        log.status === "active"
                          ? "text-emerald-400 bg-emerald-500/5"
                          : log.status === "deleted"
                            ? "text-rose-400 bg-rose-500/5"
                            : "text-amber-400 bg-amber-500/5"
                      }`}
                    >
                      <span className="text-muted-foreground/50 whitespace-nowrap shrink-0">
                        {log.timestamp.toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
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
                {done && logs.length > 0 && (
                  <div className="text-slate-400 px-2 py-2 mt-2 border-t border-slate-700/50 text-xs">
                    Done — {stats.active} active, {stats.deleted} deleted/invalid{stats.error > 0 ? `, ${stats.error} errors` : ""}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
