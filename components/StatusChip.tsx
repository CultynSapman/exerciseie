import type { JobStatus } from "@/lib/types";

const STYLES: Record<JobStatus, string> = {
  queued: "bg-zinc-700 text-zinc-200",
  downloading: "bg-sky-900 text-sky-200",
  extracting: "bg-violet-900 text-violet-200",
  awaiting_review: "bg-amber-900 text-amber-200",
  saving: "bg-sky-900 text-sky-200",
  done: "bg-emerald-900 text-emerald-200",
  error: "bg-red-900 text-red-200",
};

const LABELS: Record<JobStatus, string> = {
  queued: "Queued",
  downloading: "Downloading",
  extracting: "Analyzing",
  awaiting_review: "Needs review",
  saving: "Saving to library",
  done: "Done",
  error: "Error",
};

export function StatusChip({ status }: { status: JobStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
