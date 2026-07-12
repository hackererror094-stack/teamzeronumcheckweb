import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { EventEmitter } from "events";

export interface WaState {
  connected: boolean;
  qr: string | null;
  phone: string | null;
}

class WhatsAppManager extends EventEmitter {
  private sock: WASocket | null = null;
  private state: WaState = { connected: false, qr: null, phone: null };
  private connecting = false;

  getState(): WaState {
    return { ...this.state };
  }

  async connect() {
    if (this.connecting || this.state.connected) return;
    this.connecting = true;

    try {
      const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }) as any,
      });

      this.sock.ev.on("creds.update", saveCreds);

      this.sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.state = { connected: false, qr, phone: null };
          this.emit("state", this.state);
        }

        if (connection === "close") {
          this.state = { connected: false, qr: null, phone: null };
          this.connecting = false;
          this.emit("state", this.state);

          const code = (lastDisconnect?.error as any)?.output?.statusCode;
          const shouldReconnect = code !== DisconnectReason.loggedOut;
          if (shouldReconnect) {
            setTimeout(() => this.connect(), 3000);
          }
        } else if (connection === "open") {
          const phone = this.sock?.user?.id?.split(":")[0] ?? null;
          this.state = { connected: true, qr: null, phone };
          this.connecting = false;
          this.emit("state", this.state);
        }
      });
    } catch (err) {
      this.connecting = false;
      this.state = { connected: false, qr: null, phone: null };
    }
  }

  async disconnect() {
    if (!this.sock) return;
    try {
      await this.sock.logout();
    } catch {
      // ignore
    }
    this.sock = null;
    this.state = { connected: false, qr: null, phone: null };
    this.connecting = false;
    this.emit("state", this.state);
  }

  async verifyNumber(rawNumber: string): Promise<{ status: "active" | "deleted" | "error"; reason: string }> {
    if (!this.sock || !this.state.connected) {
      return { status: "error", reason: "WhatsApp bot abhi connect nahi hai. Pehle QR scan karein." };
    }

    const number = rawNumber.replace(/[^0-9]/g, "");
    if (!number) {
      return { status: "error", reason: "Invalid number format" };
    }

    try {
      const jid = `${number}@s.whatsapp.net`;
      const results = await this.sock.onWhatsApp(jid);
      const result = results?.[0];

      if (!result || !result.exists) {
        return { status: "deleted", reason: "Not Verified / Does not exist on WhatsApp" };
      }

      return { status: "active", reason: "Number is Safe & Active on WhatsApp" };
    } catch (error: any) {
      if (error?.message?.includes("banned") || error?.output?.statusCode === 403) {
        return { status: "deleted", reason: "Number is Banned by WhatsApp" };
      }
      return { status: "error", reason: "Verification failed" };
    }
  }
}

export const waManager = new WhatsAppManager();
waManager.connect();
