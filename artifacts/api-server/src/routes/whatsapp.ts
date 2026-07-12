import { Router } from "express";
import QRCode from "qrcode";
import { waManager } from "../lib/whatsapp";
import { VerifyNumberBody } from "@workspace/api-zod";

const router = Router();

router.get("/wa/status", async (req, res) => {
  const state = waManager.getState();

  if (state.qr) {
    try {
      const qrDataUrl = await QRCode.toDataURL(state.qr);
      res.json({ connected: state.connected, qr: qrDataUrl, phone: state.phone, pairingCode: state.pairingCode });
    } catch {
      res.json({ connected: state.connected, qr: null, phone: state.phone, pairingCode: state.pairingCode });
    }
  } else {
    res.json({ connected: state.connected, qr: null, phone: state.phone, pairingCode: state.pairingCode });
  }
});

router.post("/wa/disconnect", async (req, res) => {
  try {
    await waManager.disconnect();
    res.json({ success: true, message: "Disconnected successfully" });
  } catch {
    res.json({ success: false, message: "Failed to disconnect" });
  }
});

router.post("/wa/pairing-code", async (req, res) => {
  const phone = req.body?.phone;
  if (!phone || typeof phone !== "string" || phone.replace(/[^0-9]/g, "").length < 7) {
    res.status(400).json({ success: false, code: null, message: "Phone number required (e.g. 923001234567)" });
    return;
  }

  try {
    const code = await waManager.requestPairingCode(phone);
    res.json({ success: true, code, message: "Pairing code generated" });
  } catch (err: any) {
    res.status(500).json({ success: false, code: null, message: err?.message ?? "Failed to generate pairing code" });
  }
});

router.post("/wa/verify-number", async (req, res) => {
  const parsed = VerifyNumberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ status: "error", reason: "Invalid request body", number: "" });
    return;
  }

  const { number } = parsed.data;
  const result = await waManager.verifyNumber(number);
  res.json({ ...result, number: number.replace(/[^0-9]/g, "") });
});

export default router;
