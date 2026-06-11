"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChipPicker } from "./JobView";
import type { LibraryExercise, Taxonomy } from "@/lib/types";

export function ExerciseView({ id }: { id: string }) {
  const router = useRouter();
  const [exercise, setExercise] = useState<LibraryExercise | null>(null);
  const [draft, setDraft] = useState<LibraryExercise | null>(null);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "wger" | "delete" | null>(null);
  const [wgerNotice, setWgerNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/exercises/${id}`)
      .then(async (res) => {
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setExercise(data);
        setDraft(data);
      })
      .catch((err) => setError(String(err)));
    fetch("/api/taxonomy")
      .then((r) => r.json())
      .then(setTaxonomy)
      .catch(() => {});
  }, [id]);

  if (notFound) {
    return <p className="text-sm text-zinc-400">This exercise doesn&apos;t exist (anymore).</p>;
  }
  if (!exercise || !draft) {
    return <p className="text-sm text-zinc-400">{error ?? "Loading…"}</p>;
  }

  const dirty =
    JSON.stringify({
      name: draft.name,
      description: draft.description,
      category: draft.category,
      primaryMuscles: draft.primaryMuscles,
      secondaryMuscles: draft.secondaryMuscles,
      equipment: draft.equipment,
    }) !==
    JSON.stringify({
      name: exercise.name,
      description: exercise.description,
      category: exercise.category,
      primaryMuscles: exercise.primaryMuscles,
      secondaryMuscles: exercise.secondaryMuscles,
      equipment: exercise.equipment,
    });

  const set = <K extends keyof LibraryExercise>(key: K, value: LibraryExercise[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const toggleIn = (list: string[], value: string) =>
    list.some((s) => s.toLowerCase() === value.toLowerCase())
      ? list.filter((s) => s.toLowerCase() !== value.toLowerCase())
      : [...list, value];

  async function patch(body: Partial<LibraryExercise>): Promise<LibraryExercise | null> {
    const res = await fetch(`/api/exercises/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? `Request failed (${res.status})`);
      return null;
    }
    return data;
  }

  async function saveChanges() {
    if (!draft) return;
    setBusy("save");
    setError(null);
    const updated = await patch({
      name: draft.name,
      description: draft.description,
      category: draft.category,
      primaryMuscles: draft.primaryMuscles,
      secondaryMuscles: draft.secondaryMuscles,
      equipment: draft.equipment,
    });
    if (updated) {
      setExercise(updated);
      setDraft(updated);
    }
    setBusy(null);
  }

  async function toggleFavorite() {
    if (!exercise) return;
    const updated = await patch({ favorite: !exercise.favorite });
    if (updated) {
      setExercise(updated);
      setDraft((d) => (d ? { ...d, favorite: updated.favorite } : d));
    }
  }

  async function sendToWger() {
    setBusy("wger");
    setError(null);
    setWgerNotice(null);
    try {
      const res = await fetch(`/api/exercises/${id}/wger`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Export failed (${res.status})`);
        return;
      }
      setExercise(data);
      setDraft((d) => (d ? { ...d, wgerId: data.wgerId, wgerUrl: data.wgerUrl } : d));
      setWgerNotice(
        data.videoUploaded
          ? "Exported to wger with the video clip."
          : "Exported to wger (no video clip attached)."
      );
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${exercise!.name}" and its video clip from your library?`)) return;
    setBusy("delete");
    const res = await fetch(`/api/exercises/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `Delete failed (${res.status})`);
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          className="flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-2xl font-bold tracking-tight hover:border-zinc-700 focus:border-sky-500 focus:bg-zinc-950 focus:outline-none"
        />
        <button
          type="button"
          onClick={toggleFavorite}
          title={exercise.favorite ? "Remove from favorites" : "Add to favorites"}
          className={`text-2xl ${exercise.favorite ? "text-amber-400" : "text-zinc-600 hover:text-zinc-400"}`}
        >
          {exercise.favorite ? "★" : "☆"}
        </button>
      </div>

      {exercise.clipFile ? (
        <video
          src={`/api/exercises/${id}/video`}
          controls
          loop
          className="max-h-[28rem] w-full rounded-lg border border-zinc-800 bg-black"
        />
      ) : exercise.images.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {exercise.images.map((_, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={`/api/exercises/${id}/image/${i}`}
              alt={`${exercise.name} — position ${i + 1}`}
              className="w-full rounded-lg border border-zinc-800 bg-white object-contain"
            />
          ))}
        </div>
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-500">
          No video clip for this exercise
        </div>
      )}

      <div className="text-xs text-zinc-500">
        Source:{" "}
        <a
          href={exercise.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-zinc-400 hover:underline"
        >
          {exercise.sourceTitle || exercise.sourceUrl}
        </a>
        {exercise.sourceUploader && <> by {exercise.sourceUploader}</>} ·{" "}
        {new Date(exercise.createdAt).toLocaleDateString()}
        {exercise.aliases.length > 0 && <> · also known as: {exercise.aliases.join(", ")}</>}
        {exercise.license && (
          <>
            {" "}
            · {exercise.licenseAuthor ? `${exercise.licenseAuthor}, ` : ""}
            {exercise.license}
          </>
        )}
      </div>

      <label className="block text-xs text-zinc-400">
        How to perform
        <textarea
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          rows={5}
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-sky-500 focus:outline-none"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs text-zinc-400">
          Category
          <select
            value={draft.category}
            onChange={(e) => set("category", e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 focus:border-sky-500 focus:outline-none"
          >
            {taxonomy &&
              !taxonomy.categories.some(
                (c) => c.toLowerCase() === draft.category.toLowerCase()
              ) && <option value={draft.category}>{draft.category || "—"} (?)</option>}
            {taxonomy?.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {taxonomy && (
        <div className="space-y-2">
          <ChipPicker
            label="Primary muscles"
            options={taxonomy.muscles.map((m) => ({
              value: m.name,
              label: m.nameEn,
              active: draft.primaryMuscles.some(
                (s) => s.toLowerCase() === m.name.toLowerCase()
              ),
            }))}
            onToggle={(v) => set("primaryMuscles", toggleIn(draft.primaryMuscles, v))}
            activeClass="bg-sky-700 border-sky-600 text-white"
          />
          <ChipPicker
            label="Secondary muscles"
            options={taxonomy.muscles.map((m) => ({
              value: m.name,
              label: m.nameEn,
              active: draft.secondaryMuscles.some(
                (s) => s.toLowerCase() === m.name.toLowerCase()
              ),
            }))}
            onToggle={(v) => set("secondaryMuscles", toggleIn(draft.secondaryMuscles, v))}
            activeClass="bg-violet-700 border-violet-600 text-white"
          />
          <ChipPicker
            label="Equipment"
            options={taxonomy.equipment.map((e) => ({
              value: e,
              label: e,
              active: draft.equipment.some((s) => s.toLowerCase() === e.toLowerCase()),
            }))}
            onToggle={(v) => set("equipment", toggleIn(draft.equipment, v))}
            activeClass="bg-emerald-700 border-emerald-600 text-white"
          />
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      {wgerNotice && <p className="text-sm text-emerald-400">{wgerNotice}</p>}

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-4">
        <button
          type="button"
          onClick={saveChanges}
          disabled={!dirty || busy !== null}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
        >
          {busy === "save" ? "Saving…" : "Save changes"}
        </button>

        {exercise.wgerUrl ? (
          <a
            href={exercise.wgerUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500"
          >
            View on wger ↗
          </a>
        ) : (
          taxonomy?.wgerConfigured && (
            <button
              type="button"
              onClick={sendToWger}
              disabled={busy !== null}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 disabled:opacity-40"
            >
              {busy === "wger" ? "Exporting…" : "Send to wger"}
            </button>
          )
        )}

        <div className="flex-1" />
        <button
          type="button"
          onClick={remove}
          disabled={busy !== null}
          className="rounded-lg border border-red-900 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-950 disabled:opacity-40"
        >
          {busy === "delete" ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}
