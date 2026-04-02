import fs from "node:fs";
import { listJobs, readJobFile, resolveJobsDir } from "./state.mjs";

const SESSION_ID_ENV = "OPENCODE_SESSION_ID";
const MAX_PROGRESS_LINES = 6;

export { SESSION_ID_ENV };

export function sortJobsNewestFirst(jobs) {
  return [...jobs].sort((a, b) =>
    String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""))
  );
}

export function filterSessionJobs(jobs, sessionId) {
  if (!sessionId) return jobs;
  return jobs.filter((j) => j.sessionId === sessionId);
}

export function readJobLog(logFile, maxLines = MAX_PROGRESS_LINES) {
  if (!logFile || !fs.existsSync(logFile)) return [];
  const lines = fs.readFileSync(logFile, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean);
  return lines.slice(-maxLines);
}

export function formatElapsed(startIso, endIso = null) {
  const start = Date.parse(startIso ?? "");
  if (!Number.isFinite(start)) return "unknown";
  const end = endIso ? Date.parse(endIso) : Date.now();
  const sec = Math.round((end - start) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
}

export function buildStatusReport(cwd, options = {}) {
  const sessionId = options.sessionId ?? process.env[SESSION_ID_ENV];
  const showAll = options.all ?? false;

  let jobs = listJobs(cwd);
  if (!showAll && sessionId) {
    jobs = filterSessionJobs(jobs, sessionId);
  }
  jobs = sortJobsNewestFirst(jobs);

  if (jobs.length === 0) {
    return { text: "No OpenCode jobs found.", jobs: [] };
  }

  const lines = ["## OpenCode Jobs\n"];
  for (const job of jobs.slice(0, 10)) {
    const elapsed = formatElapsed(job.createdAt, job.completedAt);
    const status = job.status === "done" ? "done" :
                   job.status === "failed" ? "FAILED" :
                   job.status === "running" ? "running..." : job.status;
    lines.push(`- **${job.id.slice(0, 8)}** [${job.kind}] ${status} (${elapsed}) — ${job.model ?? "default"}`);
    if (job.logFile) {
      const preview = readJobLog(job.logFile, 2);
      for (const line of preview) {
        lines.push(`  > ${line.slice(0, 120)}`);
      }
    }
  }

  return { text: lines.join("\n"), jobs };
}

export function buildResultReport(cwd, jobId) {
  const jobs = listJobs(cwd);
  const job = jobId
    ? jobs.find((j) => j.id === jobId || j.id.startsWith(jobId))
    : sortJobsNewestFirst(jobs)[0];

  if (!job) {
    return { text: "No matching job found.", job: null };
  }

  if (job.status === "running" || job.status === "queued") {
    return { text: `Job ${job.id.slice(0, 8)} is still ${job.status}. Use /opencode:status to check progress.`, job };
  }

  const output = job.logFile && fs.existsSync(job.logFile)
    ? fs.readFileSync(job.logFile, "utf8")
    : readJobFile(cwd, job.id, "output.txt");

  if (!output) {
    return { text: `Job ${job.id.slice(0, 8)} completed but no output found.`, job };
  }

  return {
    text: `## OpenCode Result — ${job.kind} (${job.model ?? "default"})\n\n${output}`,
    job,
    output,
  };
}
