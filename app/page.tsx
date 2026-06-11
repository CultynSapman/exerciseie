"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { LibraryExercise, Taxonomy } from "@/lib/types";

export default function LibraryPage() {
  const [exercises, setExercises] = useState<LibraryExercise[] | null>(null);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [favOnly, setFavOnly] = useState(false);

  useEffect(() => {
    fetch("/api/taxonomy")
      .then((r) => r.json())
      .then(setTaxonomy)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (muscle) params.set("muscle", muscle);
    if (equipment) params.set("equipment", equipment);
    if (favOnly) params.set("favorite", "true");

    // small debounce so typing in search doesn't fire a request per keystroke
    const t = setTimeout(() => {
      fetch(`/api/exercises?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setExercises)
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q, category, muscle, equipment, favOnly]);

  async function toggleFavorite(ex: LibraryExercise) {
    setExercises((prev) =>
      prev ? prev.map((e) => (e.id === ex.id ? { ...e, favorite: !e.favorite } : e)) : prev
    );
    await fetch(`/api/exercises/${ex.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorite: !ex.favorite }),
    }).catch(() => {});
  }

  const selectClass =
    "rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 focus:border-sky-500 focus:outline-none";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search exercises…"
          className="min-w-48 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm placeholder-zinc-500 focus:border-sky-500 focus:outline-none"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
          <option value="">All categories</option>
          {taxonomy?.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={muscle} onChange={(e) => setMuscle(e.target.value)} className={selectClass}>
          <option value="">All muscles</option>
          {taxonomy?.muscles.map((m) => (
            <option key={m.name} value={m.name}>
              {m.nameEn}
            </option>
          ))}
        </select>
        <select
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
          className={selectClass}
        >
          <option value="">All equipment</option>
          {taxonomy?.equipment.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setFavOnly((v) => !v)}
          className={`rounded-lg border px-3 py-1.5 text-sm ${
            favOnly
              ? "border-amber-600 bg-amber-900/40 text-amber-200"
              : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500"
          }`}
        >
          ★ Favorites
        </button>
      </div>

      {exercises === null ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : exercises.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 px-6 py-16 text-center">
          <p className="text-zinc-400">
            {q || category || muscle || equipment || favOnly
              ? "No exercises match these filters."
              : "Your library is empty."}
          </p>
          {!q && !category && !muscle && !equipment && !favOnly && (
            <Link
              href="/import"
              className="mt-4 inline-block rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
            >
              Import your first exercise video
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {exercises.map((ex) => (
            <div
              key={ex.id}
              className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-600"
            >
              <Link href={`/exercises/${ex.id}`} className="block">
                <div className="aspect-video w-full bg-zinc-950">
                  {ex.thumbFile ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/exercises/${ex.id}/thumb`}
                      alt={ex.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl">
                      🏋️
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 p-3">
                  <p className="truncate font-semibold">{ex.name}</p>
                  <div className="flex flex-wrap gap-1">
                    {ex.category && (
                      <span className="rounded-full bg-sky-900/60 px-2 py-0.5 text-xs text-sky-200">
                        {ex.category}
                      </span>
                    )}
                    {ex.primaryMuscles.slice(0, 3).map((m) => (
                      <span
                        key={m}
                        className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
                      >
                        {muscleLabel(m, taxonomy)}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => toggleFavorite(ex)}
                title={ex.favorite ? "Remove from favorites" : "Add to favorites"}
                className={`absolute right-2 top-2 rounded-full bg-zinc-950/70 px-2 py-1 text-sm ${
                  ex.favorite ? "text-amber-400" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {ex.favorite ? "★" : "☆"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function muscleLabel(name: string, taxonomy: Taxonomy | null): string {
  return taxonomy?.muscles.find((m) => m.name === name)?.nameEn ?? name;
}
