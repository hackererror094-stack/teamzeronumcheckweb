import { Router } from "express";
import { botManager } from "../lib/botManager";

const router = Router();

router.post("/bot/setup", async (req, res) => {
  const { token } = req.body as { token?: unknown };
  if (!token || typeof token !== "string" || token.trim().length < 10) {
    res.status(400).json({ success: false, error: "Valid bot token required" });
    return;
  }

  try {
    await botManager.setup(token.trim());
    const state = botManager.getState();
    res.json({ success: true, username: state.username, error: null });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message ?? "Failed to connect bot" });
  }
});

router.get("/bot/status", (_req, res) => {
  res.json(botManager.getState());
});

router.post("/bot/stop", async (_req, res) => {
  await botManager.stop();
  res.json({ success: true });
});

export default router;
