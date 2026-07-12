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
      res.json({ connected: state.connected, qr: qrDataUrl, phone: state.phone });
    } catch {
      res.json({ connected: state.connected, qr: null, phone: state.phone });
    }
  } else {
    res.json({ connected: state.connected, qr: null, phone: state.phone });
  }
});

router.post("/wa/disconnect", async (req, res) => {
  try {
    await waManager.disconnect();
    res.json({ success: true, message: "WhatsApp disconnected successfully" });
  } catch (err) {
    res.json({ success: false, message: "Failed to disconnect" });
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
