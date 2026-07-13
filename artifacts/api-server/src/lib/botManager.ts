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
}

class BotManager {
  private bot: TelegramBot | null = null;
  private token: string | null = null;
  private autoRestartFlag = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private state: BotState = {
    connected: false,
    username: null,
    error: null,
    autoRestart: false,
    startedAt: null,
  };

  getState(): BotState {
    return { ...this.state };
  }

  setAutoRestart(enabled: boolean): void {
    this.autoRestartFlag = enabled;
    this.state.autoRestart = enabled;
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
    };

    bot.on("message", async (msg) => {
      const chatId = msg.chat.id;
      if (msg.document) {
        await this.handleDocument(chatId, msg.document);
      } else if (msg.text === "/start") {
        bot.sendMessage(chatId, "WA Number Cleaner Bot ready! ✅\n\nNumbers bhejo (ek line mein ek) ya .txt file upload karo — clean list wapas milegi.").catch(() => {});
      } else if (msg.text && !msg.text.startsWith("/")) {
        const numbers = msg.text
          .split("\n")
          .map((n) => n.trim())
          .filter((n) => /^[0-9]{10,15}$/.test(n));
        if (numbers.length > 0) {
          await this.runAndReply(chatId, numbers);
        } else {
          bot.sendMessage(chatId, "Numbers bhejo — ek line mein ek number (e.g. 923001234567), ya .txt file upload karo").catch(() => {});
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
    this.state = { connected: false, username: null, error: null, autoRestart: false, startedAt: null };
  }

  private async handleDocument(chatId: number, doc: TgDocument): Promise<void> {
    if (!this.bot || !this.token) return;
    try {
      await this.bot.sendMessage(chatId, "File mil gayi, parse kar raha hoon...");
      const fileInfo = await this.bot.getFile(doc.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${this.token}/${fileInfo.file_path}`;
      const content = await this.downloadText(fileUrl);
      const numbers = content.split("\n").map((n) => n.trim()).filter((n) => /^[0-9]{10,15}$/.test(n));
      if (numbers.length === 0) {
        await this.bot.sendMessage(chatId, "File mein valid numbers nahi mile (format: 923001234567)");
        return;
      }
      await this.runAndReply(chatId, numbers);
    } catch (err: any) {
      this.bot?.sendMessage(chatId, `Error: ${err?.message ?? "File process nahi ho saki"}`).catch(() => {});
    }
  }

  private async runAndReply(chatId: number, numbers: string[]): Promise<void> {
    if (!this.bot) return;
    await this.bot.sendMessage(chatId, `${numbers.length} numbers ka scan shuru ⏳`);

    const job = scanManager.createJob(numbers, "bot", 400);
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
      `✅ Scan complete!\n\n📊 Total: ${done.results.length}\n🟢 Active: ${active.length}\n🔴 Deleted/Invalid: ${deleted}\n\nClean file neeche 👇`
    );

    if (active.length > 0) {
      const buf = Buffer.from(active.join("\n"), "utf-8");
      await this.bot.sendDocument(chatId, buf, {}, { filename: `active_${Date.now()}.txt`, contentType: "text/plain" });
    } else {
      await this.bot.sendMessage(chatId, "Koi active number nahi mila.");
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
