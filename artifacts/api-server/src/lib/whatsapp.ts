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

  getState(): WaState {
    return { ...this.state };
  }

  async connect(pairingPhone?: string) {
    if (this.connecting || this.state.connected) return;
    this.connecting = true;

    try {
      const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

      const usePairingCode = !!pairingPhone;

      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }) as any,
      });

      this.sock.ev.on("creds.update", saveCreds);

      this.sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !usePairingCode) {
          this.state = { ...this.state, qr, pairingCode: null };
          this.emit("state", this.state);
        }

        if (connection === "open") {
          const phone = this.sock?.user?.id?.split(":")[0] ?? null;
          this.state = { connected: true, qr: null, phone, pairingCode: null };
          this.connecting = false;
          this.emit("state", this.state);
        }

        if (connection === "close") {
          this.state = { connected: false, qr: null, phone: null, pairingCode: null };
          this.connecting = false;
          this.emit("state", this.state);

          const code = (lastDisconnect?.error as any)?.output?.statusCode;
          const shouldReconnect = code !== DisconnectReason.loggedOut;
          if (shouldReconnect) {
            setTimeout(() => this.connect(), 3000);
          }
        }
      });

      // If pairing phone given and not already registered, request pairing code
      if (usePairingCode && !state.creds.registered) {
        // Wait a moment for socket to initialize
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const cleanPhone = pairingPhone.replace(/[^0-9]/g, "");
          const code = await this.sock.requestPairingCode(cleanPhone);
          const formatted = code?.match(/.{1,4}/g)?.join("-") ?? code;
          this.state = { ...this.state, pairingCode: formatted ?? null };
          this.emit("state", this.state);
        } catch (e) {
          this.connecting = false;
          throw e;
        }
      }
    } catch (err) {
      this.connecting = false;
      this.state = { connected: false, qr: null, phone: null, pairingCode: null };
      throw err;
    }
  }

  async requestPairingCode(phoneNumber: string): Promise<string> {
    // Disconnect existing session first (if any unconnected)
    if (!this.state.connected) {
      if (this.sock) {
        try { this.sock.end(undefined); } catch { /* ignore */ }
        this.sock = null;
      }
      this.connecting = false;
      this.state = { connected: false, qr: null, phone: null, pairingCode: null };
    }

    await this.connect(phoneNumber);

    // Wait up to 10s for pairing code
    for (let i = 0; i < 20; i++) {
      if (this.state.pairingCode) return this.state.pairingCode;
      if (this.state.connected) throw new Error("Already connected");
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("Pairing code generate nahi ho saka. Dobara try karein.");
  }

  async disconnect() {
    if (this.sock) {
      try { await this.sock.logout(); } catch { /* ignore */ }
      try { this.sock.end(undefined); } catch { /* ignore */ }
      this.sock = null;
    }
    this.state = { connected: false, qr: null, phone: null, pairingCode: null };
    this.connecting = false;
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
