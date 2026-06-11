import fs from "node:fs/promises";
import { config } from "./config";
import type { ExerciseMatch, LibraryExercise, WgerMeta } from "./types";

// In wger >= 2.4 an exercise is /api/v2/exercise/ with translations at
// /api/v2/exercise-translation/. Older versions call the same objects
// /api/v2/exercisebase/ and /api/v2/exercise/. We detect which shape the
// target instance speaks and use it everywhere.

function authHeaders(): Record<string, string> {
  return { Authorization: `Token ${config.wgerApiKey}` };
}

async function wgerFetch(apiPath: string, init?: RequestInit): Promise<Response> {
  if (!config.wgerUrl) {
    throw new Error("WGER_URL is not configured");
  }
  const res = await fetch(`${config.wgerUrl}${apiPath}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

async function wgerJson<T>(apiPath: string, init?: RequestInit): Promise<T> {
  const res = await wgerFetch(apiPath, init);
  if (!res.ok) {
    const body = (await res.text()).slice(0, 500);
    throw new Error(`wger ${init?.method ?? "GET"} ${apiPath} failed (${res.status}): ${body}`);
  }
  return (await res.json()) as T;
}

interface Paginated<T> {
  results: T[];
  next: string | null;
}

async function fetchAll<T>(apiPath: string): Promise<T[]> {
  const results: T[] = [];
  let page = `${apiPath}?limit=100`;
  for (let i = 0; i < 20 && page; i++) {
    const data = await wgerJson<Paginated<T>>(page);
    results.push(...data.results);
    if (!data.next) break;
    // wger returns absolute URLs in `next`; keep only path + query
    const next = new URL(data.next);
    page = next.pathname + next.search;
  }
  return results;
}

const metaStore = globalThis as unknown as {
  __wgerMeta?: { meta: WgerMeta; fetchedAt: number };
};
const META_TTL_MS = 60 * 60 * 1000;

export async function getWgerMeta(force = false): Promise<WgerMeta> {
  const cached = metaStore.__wgerMeta;
  if (!force && cached && Date.now() - cached.fetchedAt < META_TTL_MS) {
    return cached.meta;
  }

  const [categories, muscles, equipment, languages] = await Promise.all([
    fetchAll<{ id: number; name: string }>("/api/v2/exercisecategory/"),
    fetchAll<{ id: number; name: string; name_en: string }>("/api/v2/muscle/"),
    fetchAll<{ id: number; name: string }>("/api/v2/equipment/"),
    fetchAll<{ id: number; short_name: string }>("/api/v2/language/"),
  ]);

  const english = languages.find((l) => l.short_name === "en");

  // Probe which API generation the instance speaks
  let modern = true;
  const probe = await wgerFetch("/api/v2/exercise-translation/?limit=1");
  if (probe.status === 404) {
    modern = false;
  }

  const meta: WgerMeta = {
    categories,
    muscles: muscles.map((m) => ({ id: m.id, name: m.name, nameEn: m.name_en ?? "" })),
    equipment,
    languageId: english?.id ?? 2,
    modern,
  };
  metaStore.__wgerMeta = { meta, fetchedAt: Date.now() };
  return meta;
}

interface SearchSuggestion {
  value: string;
  data: { id: number; base_id?: number; name: string };
}

export async function searchWgerExercises(term: string): Promise<ExerciseMatch[]> {
  try {
    const data = await wgerJson<{ suggestions: SearchSuggestion[] }>(
      `/api/v2/exercise/search/?term=${encodeURIComponent(term)}&language=en&format=json`
    );
    const seen = new Set<number>();
    const matches: ExerciseMatch[] = [];
    for (const s of data.suggestions ?? []) {
      const id = s.data.base_id ?? s.data.id;
      if (seen.has(id)) continue;
      seen.add(id);
      matches.push({ source: "wger", id: String(id), name: s.data.name ?? s.value });
    }
    return matches.slice(0, 5);
  } catch {
    // search is advisory only — never fail the pipeline over it
    return [];
  }
}

export interface CreateExerciseInput {
  name: string;
  description: string;
  categoryId: number;
  muscleIds: number[];
  secondaryMuscleIds: number[];
  equipmentIds: number[];
}

export async function createExercise(input: CreateExerciseInput): Promise<{ exerciseId: number }> {
  const meta = await getWgerMeta();
  const basePayload = {
    category: input.categoryId,
    muscles: input.muscleIds,
    muscles_secondary: input.secondaryMuscleIds,
    equipment: input.equipmentIds,
  };
  const jsonInit = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (meta.modern) {
    const base = await wgerJson<{ id: number }>("/api/v2/exercise/", jsonInit(basePayload));
    await wgerJson(
      "/api/v2/exercise-translation/",
      jsonInit({
        exercise: base.id,
        language: meta.languageId,
        name: input.name,
        description: input.description,
      })
    );
    return { exerciseId: base.id };
  }

  const base = await wgerJson<{ id: number }>("/api/v2/exercisebase/", jsonInit(basePayload));
  await wgerJson(
    "/api/v2/exercise/",
    jsonInit({
      exercise_base: base.id,
      language: meta.languageId,
      name: input.name,
      description: input.description,
    })
  );
  return { exerciseId: base.id };
}

export async function uploadExerciseVideo(exerciseId: number, filePath: string): Promise<void> {
  const meta = await getWgerMeta();
  const buf = await fs.readFile(filePath);
  const makeForm = (field: string) => {
    const form = new FormData();
    form.append(field, String(exerciseId));
    form.append("video", new Blob([new Uint8Array(buf)], { type: "video/mp4" }), "clip.mp4");
    return form;
  };

  const field = meta.modern ? "exercise" : "exercise_base";
  let res = await wgerFetch("/api/v2/video/", { method: "POST", body: makeForm(field) });
  if (res.status === 400) {
    // field name differs between wger versions; retry with the other one
    const other = field === "exercise" ? "exercise_base" : "exercise";
    const retry = await wgerFetch("/api/v2/video/", { method: "POST", body: makeForm(other) });
    if (retry.ok) return;
    res = retry;
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 500);
    throw new Error(`wger video upload failed (${res.status}): ${body}`);
  }
}

export function exerciseUrl(exerciseId: number): string {
  return `${config.wgerUrl}/en/exercise/${exerciseId}/view/`;
}

// ----------------------------------------------- name → wger id mapping

const norm = (s: string) => s.trim().toLowerCase();

function findCategoryId(name: string, meta: WgerMeta): number | null {
  const n = norm(name);
  const exact = meta.categories.find((c) => norm(c.name) === n);
  if (exact) return exact.id;
  const partial = meta.categories.find((c) => n.includes(norm(c.name)) || norm(c.name).includes(n));
  return partial?.id ?? null;
}

function findMuscleIds(names: string[], meta: WgerMeta): number[] {
  const ids = new Set<number>();
  for (const name of names) {
    const n = norm(name);
    const m = meta.muscles.find((x) => norm(x.name) === n || (x.nameEn && norm(x.nameEn) === n));
    if (m) ids.add(m.id);
  }
  return [...ids];
}

function findEquipmentIds(names: string[], meta: WgerMeta): number[] {
  const ids = new Set<number>();
  for (const name of names) {
    const n = norm(name);
    const e =
      meta.equipment.find((x) => norm(x.name) === n) ??
      meta.equipment.find((x) => n.includes(norm(x.name)) || norm(x.name).includes(n));
    if (e) ids.add(e.id);
  }
  return [...ids];
}

/**
 * Export a library exercise to wger: create the exercise (+ English
 * translation) and attach the stored clip if there is one.
 */
export async function exportExerciseToWger(
  exercise: LibraryExercise,
  clipPath: string | null
): Promise<{ wgerId: number; wgerUrl: string; videoUploaded: boolean }> {
  const meta = await getWgerMeta();
  const categoryId = findCategoryId(exercise.category, meta);
  if (categoryId === null) {
    throw new Error(`No wger category matches "${exercise.category}"`);
  }

  let description = exercise.description.trim();
  if (exercise.sourceUrl) {
    description += `${description ? "\n\n" : ""}Source: ${exercise.sourceUrl}`;
  }

  const { exerciseId } = await createExercise({
    name: exercise.name,
    description,
    categoryId,
    muscleIds: findMuscleIds(exercise.primaryMuscles, meta),
    secondaryMuscleIds: findMuscleIds(exercise.secondaryMuscles, meta),
    equipmentIds: findEquipmentIds(exercise.equipment, meta),
  });

  let videoUploaded = false;
  if (clipPath) {
    await uploadExerciseVideo(exerciseId, clipPath);
    videoUploaded = true;
  }

  return { wgerId: exerciseId, wgerUrl: exerciseUrl(exerciseId), videoUploaded };
}
