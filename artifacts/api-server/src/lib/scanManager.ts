import { randomUUID } from "crypto";
import { waManager } from "./whatsapp";
import { logger } from "./logger";

export type ScanStatus = "running" | "stopped" | "done";

export interface ScanResult {
  number: string;
  status: "active" | "deleted" | "error";
  reason: string;
  timestamp: string;
}

export interface ScanJob {
  id: string;
  workspaceId: string;
  numbers: string[];
  currentIndex: number;
  results: ScanResult[];
  status: ScanStatus;
  delay: number;
  startedAt: string;
  stoppedAt: string | null;
}

class ScanManager {
  private jobs = new Map<string, ScanJob>();

  createJob(numbers: string[], workspaceId = "default", delay = 400): ScanJob {
    const job: ScanJob = {
      id: randomUUID(),
      workspaceId,
      numbers,
      currentIndex: 0,
      results: [],
      status: "running",
      delay,
      startedAt: new Date().toISOString(),
      stoppedAt: null,
    };
    this.jobs.set(job.id, job);
    void this.runJob(job.id);
    return job;
  }

  getJob(jobId: string): ScanJob | undefined {
    return this.jobs.get(jobId);
  }

  stopJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job && job.status === "running") {
      job.status = "stopped";
      job.stoppedAt = new Date().toISOString();
    }
  }

  deleteJob(jobId: string): void {
    this.jobs.delete(jobId);
  }

  private async runJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    for (let i = job.currentIndex; i < job.numbers.length; i++) {
      const current = this.jobs.get(jobId);
      if (!current || current.status !== "running") {
        if (current) current.currentIndex = i;
        return;
      }

      const num = current.numbers[i];
      try {
        const result = await waManager.verifyNumber(num);
        current.results.push({
          number: num,
          status: result.status,
          reason: result.reason,
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        current.results.push({
          number: num,
          status: "error",
          reason: err?.message || "Verification failed",
          timestamp: new Date().toISOString(),
        });
      }

      current.currentIndex = i + 1;

      if (i < current.numbers.length - 1 && current.status === "running") {
        await new Promise((r) => setTimeout(r, current.delay));
      }
    }

    const final = this.jobs.get(jobId);
    if (final && final.status === "running") {
      final.status = "done";
      logger.info({ jobId, total: final.numbers.length, active: final.results.filter(r => r.status === "active").length }, "Scan job done");
    }
  }
}

export const scanManager = new ScanManager();
