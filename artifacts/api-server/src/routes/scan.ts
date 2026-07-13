import { Router } from "express";
import { scanManager } from "../lib/scanManager";

const router = Router();

router.post("/scan/start", (req, res) => {
  const { numbers, workspaceId, delay } = req.body as { numbers?: unknown; workspaceId?: unknown; delay?: unknown };

  if (!Array.isArray(numbers) || numbers.length === 0) {
    res.status(400).json({ error: "numbers array required" });
    return;
  }

  const clean = (numbers as string[]).map((n) => String(n).trim()).filter((n) => n.length > 0);
  const delayMs = typeof delay === "number" && delay >= 100 ? delay : 400;
  const wsId = typeof workspaceId === "string" ? workspaceId : "default";

  const job = scanManager.createJob(clean, wsId, delayMs);
  res.json({ jobId: job.id, total: clean.length });
});

router.get("/scan/:jobId", (req, res) => {
  const job = scanManager.getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

router.post("/scan/:jobId/stop", (req, res) => {
  scanManager.stopJob(req.params.jobId);
  res.json({ success: true });
});

router.delete("/scan/:jobId", (req, res) => {
  scanManager.deleteJob(req.params.jobId);
  res.json({ success: true });
});

export default router;
