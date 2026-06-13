"use client";

import { useCallback, useEffect, useState } from "react";
import { ChipPicker } from "@/components/JobView";
import type { CatalogProgress, Profile, Taxonomy } from "@/lib/types";

interface CatalogState {
  "free-exercise-db": CatalogProgress;
  wger: CatalogProgress;
  counts: Record<string, number>;
}

const DEFAULT_PROFILE: Omit<Profile, "updatedAt"> = {
  goal: "hypertrophy",
  level: "beginner",
  daysPerWeek: 3,
  sessionMinutes: 60,
  equipment: [],
};

export default function SettingsPage() {
  const [profile, setProfile] = useState<Omit<Profile, "updatedAt">>(DEFAULT_PROFILE);
  const [hasProfile, setHasProfile] = useState(false);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogState | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p: Profile | null) => {
        if (p) {
          setProfile(p);
          setHasProfile(true);
        }
      })
      .catch(() => {});
    fetch("/api/taxonomy")
      .then((r) => r.json())
      .then(setTaxonomy)
      .catch(() => {});
  }, []);

  const loadCatalog = useCallback(async () => {
    try {
      const res = await fetch("/api/catalog/import");
      if (res.ok) setCatalog(await res.json());
    } catch {
      // transient
    }
  }, []);

  useEffect(() => {
    loadCatalog();
    const t = setInterval(loadCatalog, 2000);
    return () => clearInterval(t);
  }, [loadCatalog]);

  async function saveProfile() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setHasProfile(true);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function startImport(source: "free-exercise-db" | "wger") {
    setError(null);
    await fetch("/api/catalog/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    }).catch(() => {});
    loadCatalog();
  }

  const selectClass =
    "mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 focus:border-sky-500 focus:outline-none";

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <section className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Training profile</h1>
          <p className="mt-1 text-sm text-zinc-400">
            The routine generator uses this to pick your split, exercises, sets and reps.
            {!hasProfile && " No profile yet — set one up to unlock the Today page."}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-xs text-zinc-400">
            Goal
            <select
              value={profile.goal}
              onChange={(e) => setProfile({ ...profile, goal: e.target.value as Profile["goal"] })}
              className={selectClass}
            >
              <option value="strength">Strength (heavy, low reps)</option>
              <option value="hypertrophy">Muscle growth (hypertrophy)</option>
              <option value="endurance">Muscular endurance</option>
              <option value="general">General fitness</option>
            </select>
          </label>
          <label className="block text-xs text-zinc-400">
            Experience level
            <select
              value={profile.level}
              onChange={(e) =>
                setProfile({ ...profile, level: e.target.value as Profile["level"] })
              }
              className={selectClass}
            >
              <option value="beginner">Beginner (&lt; 1 year)</option>
              <option value="intermediate">Intermediate (1–3 years)</option>
              <option value="advanced">Advanced (3+ years)</option>
            </select>
          </label>
          <label className="block text-xs text-zinc-400">
            Workout days per week
            <select
              value={profile.daysPerWeek}
              onChange={(e) => setProfile({ ...profile, daysPerWeek: Number(e.target.value) })}
              className={selectClass}
            >
              <option value={2}>2 — full body</option>
              <option value={3}>3 — full body</option>
              <option value={4}>4 — upper / lower</option>
              <option value={5}>5 — push / pull / legs + upper / lower</option>
              <option value={6}>6 — push / pull / legs ×2</option>
            </select>
          </label>
          <label className="block text-xs text-zinc-400">
            Session length (minutes)
            <input
              type="number"
              min={15}
              max={240}
              value={profile.sessionMinutes}
              onChange={(e) =>
                setProfile({ ...profile, sessionMinutes: Number(e.target.value) })
              }
              className={selectClass}
            />
          </label>
        </div>

        {taxonomy && (
          <ChipPicker
            label="Equipment you have access to (bodyweight is always included)"
            options={taxonomy.equipment.map((e) => ({
              value: e,
              label: e,
              active: profile.equipment.includes(e),
            }))}
            onToggle={(value) =>
              setProfile({
                ...profile,
                equipment: profile.equipment.includes(value)
                  ? profile.equipment.filter((x) => x !== value)
                  : [...profile.equipment, value],
              })
            }
            activeClass="bg-emerald-700 border-emerald-600 text-white"
          />
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={saveProfile}
            disabled={saving}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
          {savedAt && Date.now() - savedAt < 4000 && (
            <span className="text-sm text-emerald-400">Saved ✓</span>
          )}
        </div>
      </section>

      <section className="space-y-4 border-t border-zinc-800 pt-8">
        <div>
          <h2 className="text-xl font-semibold">Exercise catalogs</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Seed your library with ready-made exercises (with diagrams and instructions) so the
            routine generator has plenty to choose from. Imports are safe to re-run — existing
            exercises are skipped.
          </p>
        </div>

        {catalog && (
          <p className="text-sm text-zinc-300">
            Library:{" "}
            <span className="font-semibold">{catalog.counts["video"] ?? 0}</span> from videos ·{" "}
            <span className="font-semibold">{catalog.counts["free-exercise-db"] ?? 0}</span> from
            free-exercise-db ·{" "}
            <span className="font-semibold">{catalog.counts["wger"] ?? 0}</span> from wger.de
          </p>
        )}

        <CatalogCard
          title="free-exercise-db"
          subtitle="~870 exercises, 2 demo photos + step-by-step instructions each. Public domain. ~80 MB of images."
          progress={catalog?.["free-exercise-db"]}
          onStart={() => startImport("free-exercise-db")}
        />
        <CatalogCard
          title="wger.de community database"
          subtitle="~1000 exercises from the wger project. CC-BY-SA 4.0 — attribution is stored and shown on each exercise."
          progress={catalog?.wger}
          onStart={() => startImport("wger")}
        />
      </section>
    </div>
  );
}

function CatalogCard({
  title,
  subtitle,
  progress,
  onStart,
}: {
  title: string;
  subtitle: string;
  progress?: CatalogProgress;
  onStart: () => void;
}) {
  const running = progress?.status === "running";
  const pct =
    running && progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  return (
    <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-xs text-zinc-400">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onStart}
          disabled={running}
          className="whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {running ? "Importing…" : progress?.status === "done" ? "Re-run import" : "Import"}
        </button>
      </div>
      {running && progress && (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            {progress.done}/{progress.total} processed · {progress.imported} imported ·{" "}
            {progress.skipped} skipped
          </p>
        </div>
      )}
      {progress?.status === "done" && (
        <p className="text-xs text-emerald-400">
          Done — {progress.imported} imported, {progress.skipped} skipped
          {(progress.removed ?? 0) > 0 && `, ${progress.removed} low-quality entries removed`}
          {(progress.fixed ?? 0) > 0 && `, ${progress.fixed} entries repaired`}
          {progress.errors.length > 0 && `, ${progress.errors.length} errors`}
          {progress.finishedAt && ` (${new Date(progress.finishedAt).toLocaleString()})`}
        </p>
      )}
      {progress?.status === "error" && (
        <p className="text-xs text-red-400">Failed: {progress.errors.at(-1)}</p>
      )}
    </div>
  );
}
