import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { EventEmitter } from "events";
import { rm } from "fs/promises";
import path from "path";

export interface WaState {
  connected: boolean;
  qr: string | null;
  phone: string | null;
  pairingCode: string | null;
}

// Resolve auth dir relative to workspace root (works in both dev and prod)
const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();
const AUTH_DIR = path.resolve(workspaceRoot, "auth_info_baileys");

class WhatsAppManager extends EventEmitter {
  private sock: WASocket | null = null;
  private state: WaState = { connected: false, qr: null, phone: null, pairingCode: null };
  private connecting = false;
  private preventReconnect = false;

  getState(): WaState {
    return { ...this.state };
  }

  private killSocket() {
    if (this.sock) {
      try { this.sock.end(undefined); } catch { /* ignore */ }
      this.sock = null;
    }
  }

  async connect() {
    if (this.connecting || this.state.connected) return;
    this.connecting = true;
    this.preventReconnect = false;

    try {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }) as any,
      });

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.state = { ...this.state, qr, pairingCode: null };
          this.emit("state", this.state);
        }

        if (connection === "open") {
          const phone = sock.user?.id?.split(":")[0] ?? null;
          this.state = { connected: true, qr: null, phone, pairingCode: null };
          this.connecting = false;
          this.emit("state", this.state);
        }

        if (connection === "close") {
          this.state = { connected: false, qr: null, phone: null, pairingCode: null };
          this.connecting = false;
          this.emit("state", this.state);

          if (!this.preventReconnect) {
            const code = (lastDisconnect?.error as any)?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
              setTimeout(() => this.connect(), 3000);
            }
          }
        }
      });

      this.sock = sock;
    } catch (err) {
      this.connecting = false;
    }
  }

  async requestPairingCode(phoneNumber: string): Promise<string> {
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, "");
    if (!cleanPhone || cleanPhone.length < 7) {
      throw new Error("Valid phone number required");
    }

    if (this.state.connected) {
      throw new Error("WhatsApp already connected. Pehle disconnect karein.");
    }

    // Stop any existing socket and prevent auto-reconnect
    this.preventReconnect = true;
    this.killSocket();
    this.connecting = false;
    this.state = { connected: false, qr: null, phone: null, pairingCode: null };

    // Clear stale auth credentials so we get a fresh pairing session
    try {
      await rm(AUTH_DIR, { recursive: true, force: true });
    } catch { /* ignore */ }

    // Small pause to ensure clean state
    await new Promise((r) => setTimeout(r, 500));
    this.preventReconnect = false;

    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Pairing code timeout — dobara try karein"));
      }, 30000);

      try {
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

        const sock = makeWASocket({
          auth: state,
          printQRInTerminal: false,
          logger: pino({ level: "silent" }) as any,
        });

        sock.ev.on("creds.update", saveCreds);

        let pairingRequested = false;

        sock.ev.on("connection.update", async (update) => {
          const { connection, lastDisconnect } = update;

          if (connection === "open") {
            const phone = sock.user?.id?.split(":")[0] ?? null;
            this.state = { connected: true, qr: null, phone, pairingCode: null };
            this.connecting = false;
            this.emit("state", this.state);
            clearTimeout(timeout);
          }

          // Request pairing code once socket is connecting (not yet open)
          // Baileys fires connection.update with connection=undefined when QR would appear
          if (!pairingRequested && connection !== "open" && connection !== "close") {
            pairingRequested = true;
            try {
              await new Promise((r) => setTimeout(r, 1500));
              const code = await sock.requestPairingCode(cleanPhone);
              const formatted = code?.match(/.{1,4}/g)?.join("-") ?? code;
              this.state = { ...this.state, pairingCode: formatted ?? null };
              this.emit("state", this.state);
              clearTimeout(timeout);
              resolve(formatted ?? code);
            } catch (e: any) {
              clearTimeout(timeout);
              reject(new Error(e?.message ?? "Code generate nahi hua"));
            }
          }

          if (connection === "close") {
            this.state = { connected: false, qr: null, phone: null, pairingCode: null };
            this.connecting = false;
            this.emit("state", this.state);

            if (!this.preventReconnect) {
              const code = (lastDisconnect?.error as any)?.output?.statusCode;
              if (code !== DisconnectReason.loggedOut) {
                setTimeout(() => this.connect(), 3000);
              }
            }

            if (!pairingRequested) {
              clearTimeout(timeout);
              reject(new Error("Connection closed before pairing code could be generated. Dobara try karein."));
            }
          }
        });

        this.sock = sock;
      } catch (err: any) {
        clearTimeout(timeout);
        reject(new Error(err?.message ?? "Socket create nahi ho saka"));
      }
    });
  }

  async disconnect() {
    this.preventReconnect = true;
    if (this.sock) {
      try { await this.sock.logout(); } catch { /* ignore */ }
      this.killSocket();
    }
    this.state = { connected: false, qr: null, phone: null, pairingCode: null };
    this.connecting = false;
    this.preventReconnect = false;
    this.emit("state", this.state);
  }

  async verifyNumber(rawNumber: string): Promise<{ status: "active" | "deleted" | "error"; reason: string }> {
    if (!this.sock || !this.state.connected) {
      return { status: "error", reason: "WhatsApp connect nahi hai. Pehle login karein." };
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
        return { status: "deleted", reason: "Not on WhatsApp / Does not exist" };
      }

      return { status: "active", reason: "Number is Active on WhatsApp" };
    } catch (error: any) {
      if (error?.message?.includes("banned") || error?.output?.statusCode === 403) {
        return { status: "deleted", reason: "Banned by WhatsApp" };
      }
      return { status: "error", reason: "Verification failed" };
    }
  }
}

export const waManager = new WhatsAppManager();
waManager.connect();
