"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { StatusChip } from "@/components/StatusChip";
import type { Job } from "@/lib/types";

export default function ImportPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      if (res.ok) setJobs(await res.json());
    } catch {
      // transient — the next poll will retry
    }
  }, []);

  useEffect(() => {
    loadJobs();
    const t = setInterval(loadJobs, 5000);
    return () => clearInterval(t);
  }, [loadJobs]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      router.push(`/jobs/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="url" className="block text-sm font-medium text-zinc-300">
          Paste an exercise video link (TikTok, Instagram Reel, YouTube Short, …)
        </label>
        <div className="flex gap-2">
          <input
            id="url"
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/shorts/…"
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm placeholder-zinc-500 focus:border-sky-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {submitting ? "Importing…" : "Import"}
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <p className="text-xs text-zinc-500">
          The video is analyzed by Gemini; you review every exercise before it lands in your
          library.
        </p>
      </form>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent imports</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing imported yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/jobs/${job.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-900"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {job.metadata?.title || job.url}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {job.metadata?.uploader ? `${job.metadata.uploader} · ` : ""}
                      {new Date(job.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <StatusChip status={job.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
