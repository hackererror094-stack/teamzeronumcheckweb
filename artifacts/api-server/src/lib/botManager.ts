import TelegramBot, { type Document as TgDocument } from "node-telegram-bot-api";
import https from "https";
import http from "http";
import { scanManager } from "./scanManager";
import { logger } from "./logger";

export interface BotState {
  connected: boolean;
  username: string | null;
  error: string | null;
  autoRestart: boolean;
  startedAt: string | null;
  scanDelay: number;
}

// Parse any format: +923001234567, 923001234567, 92-300-1234567, etc.
function parseNumbers(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.replace(/[^0-9]/g, "").trim())
    .filter((n) => n.length >= 10 && n.length <= 15);
}

const SPEED_MAP: Record<string, number> = {
  turbo: 200,
  fast: 400,
  normal: 800,
  safe: 1500,
};

class BotManager {
  private bot: TelegramBot | null = null;
  private token: string | null = null;
  private autoRestartFlag = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private scanDelay = 400;
  private state: BotState = {
    connected: false,
    username: null,
    error: null,
    autoRestart: false,
    startedAt: null,
    scanDelay: 400,
  };

  getState(): BotState {
    return { ...this.state };
  }

  setAutoRestart(enabled: boolean): void {
    this.autoRestartFlag = enabled;
    this.state.autoRestart = enabled;
  }

  setScanDelay(delay: number): void {
    this.scanDelay = delay;
    this.state.scanDelay = delay;
  }

  async setup(token: string): Promise<void> {
    await this.stopInternal();
    this.token = token;

    const bot = new TelegramBot(token, { polling: true });
    const me = await bot.getMe();

    this.bot = bot;
    this.state = {
      connected: true,
      username: me.username ?? null,
      error: null,
      autoRestart: this.autoRestartFlag,
      startedAt: new Date().toISOString(),
      scanDelay: this.scanDelay,
    };

    bot.on("message", async (msg) => {
      const chatId = msg.chat.id;

      if (msg.document) {
        await this.handleDocument(chatId, msg.document);
        return;
      }

      if (!msg.text) return;

      if (msg.text === "/start") {
        bot.sendMessage(
          chatId,
          `*WA Number Cleaner Bot* ✅\n\nNumbers bhejo (ek line mein ek) ya .txt file upload karo.\n\n*Commands:*\n/speed — current speed dekho\n/speed turbo — 200ms\n/speed fast — 400ms _(default)_\n/speed normal — 800ms\n/speed safe — 1500ms\n/help — madad`,
          { parse_mode: "Markdown" }
        ).catch(() => {});
        return;
      }

      if (msg.text === "/help") {
        bot.sendMessage(
          chatId,
          `*Kaise use karein:*\n\n1. Numbers paste karo (ek line = ek number)\n2. Ya .txt file upload karo\n3. Bot scan karega aur clean list bhejega\n\n*Number formats supported:*\n• 923001234567\n• +923001234567\n• 58412123456 _(Venezuela etc)_\n\n*Speed set karo:*\n/speed fast, /speed safe, etc`,
          { parse_mode: "Markdown" }
        ).catch(() => {});
        return;
      }

      if (msg.text.startsWith("/speed")) {
        const parts = msg.text.trim().split(/\s+/);
        if (parts.length === 1) {
          const cur = Object.entries(SPEED_MAP).find(([, v]) => v === this.scanDelay)?.[0] ?? `${this.scanDelay}ms`;
          bot.sendMessage(chatId, `Current speed: *${cur}* (${this.scanDelay}ms)\n\nChange karne ke liye:\n/speed turbo — 200ms\n/speed fast — 400ms\n/speed normal — 800ms\n/speed safe — 1500ms`, { parse_mode: "Markdown" }).catch(() => {});
          return;
        }
        const key = parts[1].toLowerCase();
        if (SPEED_MAP[key] !== undefined) {
          this.setScanDelay(SPEED_MAP[key]);
          bot.sendMessage(chatId, `✅ Speed set: *${key}* (${SPEED_MAP[key]}ms)`, { parse_mode: "Markdown" }).catch(() => {});
        } else if (/^\d+$/.test(parts[1])) {
          const ms = Math.min(5000, Math.max(100, parseInt(parts[1])));
          this.setScanDelay(ms);
          bot.sendMessage(chatId, `✅ Speed set: *${ms}ms*`, { parse_mode: "Markdown" }).catch(() => {});
        } else {
          bot.sendMessage(chatId, "Galat speed. Use: /speed turbo | fast | normal | safe").catch(() => {});
        }
        return;
      }

      if (!msg.text.startsWith("/")) {
        const numbers = parseNumbers(msg.text);
        if (numbers.length > 0) {
          await this.runAndReply(chatId, numbers);
        } else {
          bot.sendMessage(chatId, "Valid numbers nahi mile.\n\nFormat: ek line mein ek number\n• 923001234567\n• +58412123456\n\nYa /help dekho").catch(() => {});
        }
      }
    });

    bot.on("polling_error", (err) => {
      logger.error({ err: err.message }, "Telegram bot polling error");
      this.state.connected = false;
      this.state.error = err.message;

      if (this.autoRestartFlag && this.token) {
        logger.info("Auto-restart enabled — reconnecting bot in 15s");
        if (this.restartTimer) clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(async () => {
          if (this.autoRestartFlag && this.token) {
            try {
              await this.setup(this.token);
              logger.info("Bot auto-restarted successfully");
            } catch (e: any) {
              logger.error({ err: e?.message }, "Bot auto-restart failed");
            }
          }
        }, 15000);
      }
    });

    logger.info({ username: me.username }, "Telegram bot connected");
  }

  async restart(): Promise<void> {
    if (!this.token) throw new Error("No token set — pehle setup karo");
    await this.setup(this.token);
  }

  private async stopInternal(): Promise<void> {
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    if (this.bot) {
      try { await this.bot.stopPolling(); } catch { /* ignore */ }
      this.bot = null;
    }
    this.state.connected = false;
    this.state.startedAt = null;
  }

  async stop(): Promise<void> {
    this.token = null;
    this.autoRestartFlag = false;
    await this.stopInternal();
    this.state = { connected: false, username: null, error: null, autoRestart: false, startedAt: null, scanDelay: this.scanDelay };
  }

  private async handleDocument(chatId: number, doc: TgDocument): Promise<void> {
    if (!this.bot || !this.token) return;
    try {
      await this.bot.sendMessage(chatId, "📄 File mil gayi, parse kar raha hoon...");
      const fileInfo = await this.bot.getFile(doc.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${this.token}/${fileInfo.file_path}`;
      const content = await this.downloadText(fileUrl);
      const numbers = parseNumbers(content);

      if (numbers.length === 0) {
        await this.bot.sendMessage(chatId, "❌ File mein valid numbers nahi mile.\n\nSupported formats:\n• 923001234567\n• +923001234567\n• +58412123456 (any country)\n\nHar line mein sirf ek number hona chahiye.");
        return;
      }

      await this.runAndReply(chatId, numbers);
    } catch (err: any) {
      this.bot?.sendMessage(chatId, `❌ Error: ${err?.message ?? "File process nahi ho saki"}`).catch(() => {});
    }
  }

  private async runAndReply(chatId: number, numbers: string[]): Promise<void> {
    if (!this.bot) return;
    const speedName = Object.entries(SPEED_MAP).find(([, v]) => v === this.scanDelay)?.[0] ?? `${this.scanDelay}ms`;
    await this.bot.sendMessage(chatId, `⏳ *${numbers.length} numbers* ka scan shuru...\nSpeed: ${speedName} (${this.scanDelay}ms)\nEst. time: ~${Math.round((numbers.length * this.scanDelay) / 60000)} min`, { parse_mode: "Markdown" });

    const job = scanManager.createJob(numbers, "bot", this.scanDelay);

    await new Promise<void>((resolve) => {
      const iv = setInterval(() => {
        const j = scanManager.getJob(job.id);
        if (!j || j.status !== "running") { clearInterval(iv); resolve(); }
      }, 2000);
    });

    const done = scanManager.getJob(job.id);
    if (!done) return;

    const active = done.results.filter((r) => r.status === "active").map((r) => r.number);
    const deleted = done.results.filter((r) => r.status !== "active").length;

    await this.bot.sendMessage(
      chatId,
      `✅ *Scan complete!*\n\n📊 Total: ${done.results.length}\n🟢 Active: ${active.length}\n🔴 Deleted/Invalid: ${deleted}\n\nClean file neeche 👇`,
      { parse_mode: "Markdown" }
    );

    if (active.length > 0) {
      const buf = Buffer.from(active.join("\n"), "utf-8");
      await this.bot.sendDocument(chatId, buf, {}, { filename: `active_${Date.now()}.txt`, contentType: "text/plain" });
    } else {
      await this.bot.sendMessage(chatId, "😕 Koi active number nahi mila.");
    }

    scanManager.deleteJob(job.id);
  }

  private downloadText(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith("https") ? https : http;
      let data = "";
      const req = client.get(url, (res) => {
        res.on("data", (c: Buffer) => { data += c.toString(); });
        res.on("end", () => resolve(data));
        res.on("error", reject);
      });
      req.on("error", reject);
    });
  }
}

export const botManager = new BotManager();
