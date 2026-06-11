"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Workout } from "@/lib/types";

interface TodayData {
  workout: Workout | null;
  needsProfile: boolean;
  poolSize: number;
}

export default function TodayPage() {
  const [data, setData] = useState<TodayData | null>(null);
  const [history, setHistory] = useState<Workout[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [todayRes, historyRes] = await Promise.all([
        fetch("/api/today"),
        fetch("/api/workouts"),
      ]);
      if (todayRes.ok) setData(await todayRes.json());
      if (historyRes.ok) setHistory(await historyRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patchWorkout(id: string, body: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    setError(null);
    try {
      const res = await fetch(`/api/workouts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const updated = await res.json();
      if (!res.ok) {
        setError(updated.error ?? `Request failed (${res.status})`);
        return;
      }
      if (body.action === "status") {
        await load(); // a new "next" workout may have been rolled
      } else {
        setData((d) => (d ? { ...d, workout: updated } : d));
      }
    } finally {
      setBusy(null);
    }
  }

  async function regenerate() {
    setBusy("regen");
    setError(null);
    try {
      const res = await fetch("/api/today/regenerate", { method: "POST" });
      if (res.ok) setData(await res.json());
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return <p className="text-sm text-zinc-400">{error ?? "Loading…"}</p>;
  }

  if (data.needsProfile) {
    return (
      <EmptyCard
        text="Tell the coach your goal, schedule and equipment to start getting daily workouts."
        cta="Set up your training profile"
        href="/settings"
      />
    );
  }

  if (!data.workout) {
    return (
      <EmptyCard
        text={`Your library has ${data.poolSize} exercises — not enough variety to build good workouts yet. Import an exercise catalog (takes a minute) or add more videos.`}
        cta="Import an exercise catalog"
        href="/settings"
      />
    );
  }

  const w = data.workout;
  const doneCount = w.items.filter((i) => i.done).length;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Today: {w.dayLabel}</h1>
            <div className="mt-1 flex flex-wrap gap-1">
              {w.focusGroups.map((g) => (
                <span
                  key={g}
                  className="rounded-full bg-sky-900/60 px-2 py-0.5 text-xs text-sky-200"
                >
                  {g}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={regenerate}
            disabled={busy !== null}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
            title="Roll a different selection of exercises"
          >
            {busy === "regen" ? "Rolling…" : "🎲 Reshuffle"}
          </button>
        </div>

        <ul className="space-y-2">
          {w.items.map((item, i) => (
            <li
              key={`${item.exerciseId}-${i}`}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                item.done ? "border-emerald-900 bg-emerald-950/40" : "border-zinc-800 bg-zinc-900"
              }`}
            >
              <input
                type="checkbox"
                checked={item.done}
                onChange={(e) =>
                  patchWorkout(w.id, { action: "toggle", itemIndex: i, done: e.target.checked }, `t${i}`)
                }
                className="h-5 w-5 accent-emerald-500"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/exercises/${item.exerciseId}/thumb`}
                alt=""
                className="h-12 w-16 rounded-md border border-zinc-800 bg-white object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.visibility = "hidden";
                }}
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/exercises/${item.exerciseId}`}
                  className={`block truncate text-sm font-medium hover:underline ${
                    item.done ? "text-zinc-400 line-through" : ""
                  }`}
                >
                  {item.name}
                </Link>
                <p className="text-xs text-zinc-400">
                  {item.sets} × {item.repsMin}–{item.repsMax} reps · rest{" "}
                  {item.restSec >= 60
                    ? `${Math.round(item.restSec / 60)}min`
                    : `${item.restSec}s`}{" "}
                  · stop {item.rir} reps shy of failure
                </p>
              </div>
              <span className="hidden text-xs text-zinc-500 sm:block">{item.groups[0]}</span>
              <button
                type="button"
                onClick={() => patchWorkout(w.id, { action: "swap", itemIndex: i }, `s${i}`)}
                disabled={busy !== null || item.done}
                title="Swap for a different exercise"
                className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-zinc-500 disabled:opacity-40"
              >
                {busy === `s${i}` ? "…" : "↻"}
              </button>
            </li>
          ))}
        </ul>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => patchWorkout(w.id, { action: "status", status: "completed" }, "done")}
            disabled={busy !== null}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy === "done"
              ? "Saving…"
              : doneCount > 0
                ? `Finish workout (${doneCount}/${w.items.length} done)`
                : "Finish workout"}
          </button>
          <button
            type="button"
            onClick={() => patchWorkout(w.id, { action: "status", status: "skipped" }, "skip")}
            disabled={busy !== null}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:border-zinc-500 disabled:opacity-50"
          >
            Skip this one
          </button>
        </div>

        <p className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs leading-relaxed text-zinc-400">
          <span className="font-semibold text-zinc-300">Why this workout: </span>
          {w.rationale}
        </p>
      </section>

      {history.filter((h) => h.status !== "planned").length > 0 && (
        <section className="space-y-3 border-t border-zinc-800 pt-6">
          <h2 className="text-lg font-semibold">History</h2>
          <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {history
              .filter((h) => h.status !== "planned")
              .map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{h.dayLabel}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {h.items.map((i) => i.name).join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 whitespace-nowrap text-xs">
                    <span
                      className={`rounded-full px-2 py-0.5 ${
                        h.status === "completed"
                          ? "bg-emerald-900 text-emerald-200"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {h.status === "completed" ? "Completed" : "Skipped"}
                    </span>
                    <span className="text-zinc-500">
                      {new Date(h.completedAt ?? h.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function EmptyCard({ text, cta, href }: { text: string; cta: string; href: string }) {
  return (
    <div className="mx-auto max-w-xl rounded-lg border border-dashed border-zinc-700 px-6 py-16 text-center">
      <p className="text-zinc-400">{text}</p>
      <Link
        href={href}
        className="mt-4 inline-block rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
      >
        {cta}
      </Link>
    </div>
  );
}
