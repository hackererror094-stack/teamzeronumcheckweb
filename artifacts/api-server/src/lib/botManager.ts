import TelegramBot, { type Document as TgDocument } from "node-telegram-bot-api";
import https from "https";
import http from "http";
import { scanManager } from "./scanManager";
import { logger } from "./logger";

export interface BotState {
  connected: boolean;
  username: string | null;
  error: string | null;
}

class BotManager {
  private bot: TelegramBot | null = null;
  private token: string | null = null;
  private state: BotState = { connected: false, username: null, error: null };

  getState(): BotState {
    return { ...this.state };
  }

  async setup(token: string): Promise<void> {
    await this.stop();

    const bot = new TelegramBot(token, { polling: true });

    const me = await bot.getMe();
    this.bot = bot;
    this.token = token;
    this.state = { connected: true, username: me.username ?? null, error: null };

    bot.on("message", async (msg) => {
      const chatId = msg.chat.id;

      if (msg.document) {
        await this.handleDocument(chatId, msg.document);
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
      } else if (msg.text === "/start") {
        bot.sendMessage(chatId, "WA Number Cleaner Bot ready!\n\nNumbers bhejo (ek line mein ek) ya .txt file upload karo — main check kar ke clean list wapas bhejunga.").catch(() => {});
      }
    });

    bot.on("polling_error", (err) => {
      logger.error({ err: err.message }, "Telegram bot polling error");
      this.state.error = err.message;
    });

    logger.info({ username: me.username }, "Telegram bot connected");
  }

  private async handleDocument(chatId: number, doc: TgDocument): Promise<void> {
    if (!this.bot || !this.token) return;
    try {
      await this.bot.sendMessage(chatId, "File mil gayi, parse kar raha hoon...");

      const fileInfo = await this.bot.getFile(doc.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${this.token}/${fileInfo.file_path}`;
      const content = await this.downloadText(fileUrl);

      const numbers = content
        .split("\n")
        .map((n) => n.trim())
        .filter((n) => /^[0-9]{10,15}$/.test(n));

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

    await this.bot.sendMessage(chatId, `${numbers.length} numbers ka scan shuru ho raha hai... thoda wait karo ⏳`);

    const job = scanManager.createJob(numbers, "bot", 400);

    await new Promise<void>((resolve) => {
      const iv = setInterval(() => {
        const j = scanManager.getJob(job.id);
        if (!j || j.status !== "running") {
          clearInterval(iv);
          resolve();
        }
      }, 2000);
    });

    const done = scanManager.getJob(job.id);
    if (!done) return;

    const active = done.results.filter((r) => r.status === "active").map((r) => r.number);
    const deleted = done.results.filter((r) => r.status !== "active").length;

    await this.bot.sendMessage(
      chatId,
      `✅ Scan complete!\n\n📊 Total: ${done.results.length}\n🟢 Active: ${active.length}\n🔴 Deleted/Invalid: ${deleted}\n\nClean numbers file neeche hai 👇`
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

  async stop(): Promise<void> {
    if (this.bot) {
      try { await this.bot.stopPolling(); } catch { /* ignore */ }
      this.bot = null;
    }
    this.token = null;
    this.state = { connected: false, username: null, error: null };
  }
}

export const botManager = new BotManager();
