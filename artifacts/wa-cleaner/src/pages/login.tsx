import { useState } from "react";
import { ShieldCheck, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

const PASSWORD = "teamzerousman586";

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input === PASSWORD) {
      localStorage.setItem("wc_auth", "1");
      onLogin();
    } else {
      setError("Galat password — dobara try karein");
      setShake(true);
      setInput("");
      setTimeout(() => setShake(false), 500);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className={`w-full max-w-sm ${shake ? "animate-bounce" : ""}`}>
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">WA Number Cleaner</h1>
            <p className="text-sm text-muted-foreground mt-1">Team Zero Panel</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="password"
              placeholder="Password daalo..."
              value={input}
              onChange={(e) => { setInput(e.target.value); setError(""); }}
              autoFocus
              className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-colors"
            />
          </div>
          {error && <p className="text-xs text-rose-400 text-center">{error}</p>}
          <Button type="submit" size="lg" className="w-full font-medium">
            Panel Kholein
          </Button>
        </form>
      </div>
    </div>
  );
}
