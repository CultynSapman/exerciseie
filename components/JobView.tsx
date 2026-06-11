"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { StatusChip } from "./StatusChip";
import type { ExtractedExercise, Job, Taxonomy } from "@/lib/types";

const ACTIVE_STATUSES = new Set(["queued", "downloading", "extracting", "saving"]);

export function JobView({ id }: { id: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [exercises, setExercises] = useState<ExtractedExercise[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const editing = useRef(false);

  const poll = useCallback(async () => {
    const res = await fetch(`/api/jobs/${id}`);
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    if (!res.ok) return;
    const data: Job = await res.json();
    setJob(data);
    // Seed the editable copy once; don't clobber in-progress edits on poll
    if (data.status === "awaiting_review" && data.exercises && !editing.current) {
      setExercises(data.exercises);
      editing.current = true;
    }
  }, [id]);

  useEffect(() => {
    poll();
    const t = setInterval(() => {
      if (!job || ACTIVE_STATUSES.has(job.status)) poll();
    }, 1500);
    return () => clearInterval(t);
  }, [poll, job]);

  useEffect(() => {
    fetch("/api/taxonomy")
      .then((r) => r.json())
      .then(setTaxonomy)
      .catch(() => {});
  }, []);

  async function saveToLibrary() {
    if (!exercises) return;
    setSaveBusy(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/jobs/${id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exercises }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      editing.current = false;
      setJob(data);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaveBusy(false);
    }
  }

  if (notFound) {
    return <p className="text-sm text-zinc-400">This import doesn&apos;t exist.</p>;
  }
  if (!job) {
    return <p className="text-sm text-zinc-400">Loading…</p>;
  }

  const showVideo = job.videoFile != null;
  const includedCount = exercises?.filter((e) => e.include).length ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="truncate text-xl font-semibold">
            {job.metadata?.title || job.url}
          </h1>
          <StatusChip status={job.status} />
        </div>
        <p className="mt-1 truncate text-xs text-zinc-500">
          <a href={job.url} target="_blank" rel="noreferrer" className="hover:underline">
            {job.url}
          </a>
        </p>
      </div>

      {ACTIVE_STATUSES.has(job.status) && (
        <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
          <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-sky-500" />
          {job.status === "downloading" && "Downloading the video with yt-dlp…"}
          {job.status === "extracting" && "Gemini is watching the video and extracting exercises…"}
          {job.status === "saving" && "Cutting clips and saving to your library…"}
          {job.status === "queued" && "Waiting to start…"}
        </div>
      )}

      {job.status === "error" && (
        <div className="rounded-lg border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-200">
          <p className="font-semibold">Import failed</p>
          <pre className="mt-1 whitespace-pre-wrap break-words font-sans">{job.error}</pre>
        </div>
      )}

      {showVideo && job.status !== "done" && (
        <video
          src={`/api/jobs/${id}/video`}
          controls
          className="max-h-96 w-full rounded-lg border border-zinc-800 bg-black"
        />
      )}

      {job.status === "awaiting_review" && exercises && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">
            Review extracted exercises ({exercises.length})
          </h2>
          {exercises.map((ex, i) => (
            <ExerciseCard
              key={i}
              exercise={ex}
              taxonomy={taxonomy}
              onChange={(next) =>
                setExercises((prev) =>
                  prev ? prev.map((p, j) => (j === i ? next : p)) : prev
                )
              }
            />
          ))}
          {saveError && <p className="text-sm text-red-400">{saveError}</p>}
          <button
            onClick={saveToLibrary}
            disabled={saveBusy || includedCount === 0}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {saveBusy
              ? "Saving…"
              : `Save ${includedCount} exercise${includedCount === 1 ? "" : "s"} to library`}
          </button>
        </section>
      )}

      {job.status === "done" && job.results && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Saved to your library</h2>
          <ul className="space-y-2">
            {job.results.map((r, i) => (
              <li
                key={i}
                className={`rounded-lg border px-4 py-3 text-sm ${
                  r.status === "saved"
                    ? "border-emerald-900 bg-emerald-950"
                    : "border-red-900 bg-red-950"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{r.name}</span>
                  {r.status === "saved" && r.exerciseId && (
                    <Link
                      href={`/exercises/${r.exerciseId}`}
                      className="text-emerald-300 hover:underline"
                    >
                      View in library →
                    </Link>
                  )}
                </div>
                {r.error && <p className="mt-1 text-xs text-red-300">{r.error}</p>}
              </li>
            ))}
          </ul>
          <Link href="/" className="inline-block text-sm text-sky-400 hover:underline">
            ← Back to library
          </Link>
        </section>
      )}
    </div>
  );
}

function ExerciseCard({
  exercise,
  taxonomy,
  onChange,
}: {
  exercise: ExtractedExercise;
  taxonomy: Taxonomy | null;
  onChange: (next: ExtractedExercise) => void;
}) {
  const set = <K extends keyof ExtractedExercise>(key: K, value: ExtractedExercise[K]) =>
    onChange({ ...exercise, [key]: value });

  // Muscle names may appear as either the latin or the English variant, in
  // any casing — selection and toggling both need to match every variant.
  const matchesAny = (s: string, ...variants: string[]) =>
    variants.some((v) => v && s.toLowerCase() === v.toLowerCase());

  const toggleVariants = (list: string[], canonical: string, ...variants: string[]) =>
    list.some((s) => matchesAny(s, canonical, ...variants))
      ? list.filter((s) => !matchesAny(s, canonical, ...variants))
      : [...list, canonical];

  const muscleSelected = (selected: string[], name: string, nameEn: string) =>
    selected.some((s) => matchesAny(s, name, nameEn));

  const libraryMatches = exercise.matches.filter((m) => m.source === "library");
  const wgerMatches = exercise.matches.filter((m) => m.source === "wger");

  return (
    <div
      className={`space-y-3 rounded-lg border p-4 ${
        exercise.include ? "border-zinc-700 bg-zinc-900" : "border-zinc-800 bg-zinc-950 opacity-60"
      }`}
    >
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={exercise.include}
          onChange={(e) => set("include", e.target.checked)}
          className="h-4 w-4 accent-emerald-500"
          title="Include this exercise when saving"
        />
        <input
          type="text"
          value={exercise.name}
          onChange={(e) => set("name", e.target.value)}
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm font-semibold focus:border-sky-500 focus:outline-none"
        />
        <span className="whitespace-nowrap text-xs text-zinc-500">
          {exercise.startSec.toFixed(0)}s – {exercise.endSec.toFixed(0)}s
        </span>
      </div>

      {(libraryMatches.length > 0 || wgerMatches.length > 0) && (
        <p className="rounded-md border border-amber-900 bg-amber-950 px-3 py-2 text-xs text-amber-200">
          ⚠ Possible duplicate:{" "}
          {libraryMatches.map((m, i) => (
            <span key={m.id}>
              {i > 0 && ", "}
              <Link href={`/exercises/${m.id}`} className="font-medium underline">
                {m.name}
              </Link>{" "}
              (in your library)
            </span>
          ))}
          {libraryMatches.length > 0 && wgerMatches.length > 0 && ", "}
          {wgerMatches.map((m, i) => (
            <span key={m.id}>
              {i > 0 && ", "}
              <span className="font-medium">{m.name}</span> (wger)
            </span>
          ))}
          {" — "}uncheck this card to skip it.
        </p>
      )}

      <textarea
        value={exercise.description}
        onChange={(e) => set("description", e.target.value)}
        rows={3}
        className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none"
        placeholder="How to perform the exercise…"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block text-xs text-zinc-400">
          Category
          {taxonomy ? (
            <select
              value={exercise.category}
              onChange={(e) => set("category", e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 focus:border-sky-500 focus:outline-none"
            >
              {!taxonomy.categories.some(
                (c) => c.toLowerCase() === exercise.category.toLowerCase()
              ) && <option value={exercise.category}>{exercise.category || "—"} (?)</option>}
              {taxonomy.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={exercise.category}
              onChange={(e) => set("category", e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 focus:border-sky-500 focus:outline-none"
            />
          )}
        </label>
        <label className="block text-xs text-zinc-400">
          Clip start (s)
          <input
            type="number"
            min={0}
            value={exercise.startSec}
            onChange={(e) => set("startSec", Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 focus:border-sky-500 focus:outline-none"
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Clip end (s)
          <input
            type="number"
            min={0}
            value={exercise.endSec}
            onChange={(e) => set("endSec", Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 focus:border-sky-500 focus:outline-none"
          />
        </label>
      </div>

      {taxonomy && (
        <div className="space-y-2">
          <ChipPicker
            label="Primary muscles"
            options={taxonomy.muscles.map((m) => ({
              value: m.name,
              label: m.nameEn,
              active: muscleSelected(exercise.primaryMuscles, m.name, m.nameEn),
            }))}
            onToggle={(value) => {
              const m = taxonomy.muscles.find((x) => x.name === value);
              set(
                "primaryMuscles",
                toggleVariants(exercise.primaryMuscles, value, m?.nameEn ?? "")
              );
            }}
            activeClass="bg-sky-700 border-sky-600 text-white"
          />
          <ChipPicker
            label="Secondary muscles"
            options={taxonomy.muscles.map((m) => ({
              value: m.name,
              label: m.nameEn,
              active: muscleSelected(exercise.secondaryMuscles, m.name, m.nameEn),
            }))}
            onToggle={(value) => {
              const m = taxonomy.muscles.find((x) => x.name === value);
              set(
                "secondaryMuscles",
                toggleVariants(exercise.secondaryMuscles, value, m?.nameEn ?? "")
              );
            }}
            activeClass="bg-violet-700 border-violet-600 text-white"
          />
          <ChipPicker
            label="Equipment"
            options={taxonomy.equipment.map((e) => ({
              value: e,
              label: e,
              active: exercise.equipment.some((s) => s.toLowerCase() === e.toLowerCase()),
            }))}
            onToggle={(value) => set("equipment", toggleVariants(exercise.equipment, value))}
            activeClass="bg-emerald-700 border-emerald-600 text-white"
          />
        </div>
      )}
    </div>
  );
}

export function ChipPicker({
  label,
  options,
  onToggle,
  activeClass,
}: {
  label: string;
  options: { value: string; label: string; active: boolean }[];
  onToggle: (value: string) => void;
  activeClass: string;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-zinc-400">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
              o.active
                ? activeClass
                : "border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-500"
            }`}
            title={o.value}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
