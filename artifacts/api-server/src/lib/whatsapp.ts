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
  pairingCode: string | null;
}

class WhatsAppManager extends EventEmitter {
  private sock: WASocket | null = null;
  private state: WaState = { connected: false, qr: null, phone: null, pairingCode: null };
  private connecting = false;
  private preventReconnect = false;

  getState(): WaState {
    return { ...this.state };
  }

  private async createSocket(pairingPhone?: string) {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }) as any,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && !pairingPhone) {
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
          const shouldReconnect = code !== DisconnectReason.loggedOut;
          if (shouldReconnect) {
            setTimeout(() => this.connect(), 3000);
          }
        }
      }
    });

    return sock;
  }

  async connect(pairingPhone?: string) {
    if (this.connecting || this.state.connected) return;
    this.connecting = true;
    this.preventReconnect = false;

    try {
      this.sock = await this.createSocket(pairingPhone);

      if (pairingPhone) {
        const { state } = await useMultiFileAuthState("auth_info_baileys");
        if (!state.creds.registered) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const cleanPhone = pairingPhone.replace(/[^0-9]/g, "");
            const code = await this.sock.requestPairingCode(cleanPhone);
            const formatted = code?.match(/.{1,4}/g)?.join("-") ?? code;
            this.state = { ...this.state, pairingCode: formatted ?? null };
            this.connecting = false;
            this.emit("state", this.state);
          } catch (e) {
            this.connecting = false;
            throw e;
          }
        } else {
          this.connecting = false;
        }
      }
    } catch (err) {
      this.connecting = false;
      throw err;
    }
  }

  async requestPairingCode(phoneNumber: string): Promise<string> {
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, "");

    // Close any existing unconnected socket cleanly
    if (!this.state.connected && this.sock) {
      this.preventReconnect = true;
      try { this.sock.end(undefined); } catch { /* ignore */ }
      this.sock = null;
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (this.state.connected) {
      throw new Error("WhatsApp already connected. Pehle disconnect karein.");
    }

    this.connecting = false;
    this.preventReconnect = false;
    this.state = { connected: false, qr: null, phone: null, pairingCode: null };

    // Create fresh socket for pairing
    this.connecting = true;
    this.preventReconnect = false;

    try {
      const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

      if (state.creds.registered) {
        // Already registered — just reconnect normally
        this.connecting = false;
        await this.connect();
        throw new Error("Already registered. Refresh the page.");
      }

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }) as any,
      });

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

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

      // Wait for socket to be ready then request pairing code
      await new Promise((r) => setTimeout(r, 2000));

      const code = await sock.requestPairingCode(cleanPhone);
      const formatted = code?.match(/.{1,4}/g)?.join("-") ?? code;

      this.state = { ...this.state, pairingCode: formatted ?? null };
      this.connecting = false;
      this.emit("state", this.state);

      return formatted ?? code;
    } catch (err: any) {
      this.connecting = false;
      throw new Error(err?.message ?? "Pairing code generate nahi hua");
    }
  }

  async disconnect() {
    this.preventReconnect = true;
    if (this.sock) {
      try { await this.sock.logout(); } catch { /* ignore */ }
      try { this.sock.end(undefined); } catch { /* ignore */ }
      this.sock = null;
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
