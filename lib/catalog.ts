import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config";
import {
  catalogKeyExists,
  deleteExercise,
  exerciseNameExists,
  getSetting,
  insertExercise,
  listExercises,
  setSetting,
  updateExercise,
} from "./db";
import { canonicalMuscle, muscleGroupOf, EQUIPMENT } from "./taxonomy";
import type { CatalogProgress, ExerciseSource } from "./types";

// Pinned so imports are reproducible; bump deliberately to pick up new exercises.
const FREE_EXERCISE_DB_REF = "b0eed061e1c832b3ed815fbaa4b45b3cdc14df49";
const FREE_EXERCISE_DB_BASE = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${FREE_EXERCISE_DB_REF}`;
const WGER_BASE = "https://wger.de";
const ENGLISH = 2; // wger.de language id

const progressKey = (source: ExerciseSource) => `catalog_import_${source}`;

export function getCatalogProgress(source: ExerciseSource): CatalogProgress {
  return (
    getSetting<CatalogProgress>(progressKey(source)) ?? {
      source,
      status: "idle",
      total: 0,
      done: 0,
      imported: 0,
      skipped: 0,
      errors: [],
      finishedAt: null,
    }
  );
}

function saveProgress(p: CatalogProgress): void {
  setSetting(progressKey(p.source), p);
}

export function startCatalogImport(source: "free-exercise-db" | "wger"): CatalogProgress {
  const current = getCatalogProgress(source);
  if (current.status === "running") {
    throw new Error(`A ${source} import is already running`);
  }
  const progress: CatalogProgress = {
    source,
    status: "running",
    total: 0,
    done: 0,
    imported: 0,
    skipped: 0,
    errors: [],
    finishedAt: null,
  };
  saveProgress(progress);

  const run = source === "free-exercise-db" ? importFreeExerciseDb : importWger;
  void run(progress).then(
    () => {
      progress.status = "done";
      progress.finishedAt = new Date().toISOString();
      saveProgress(progress);
    },
    (err) => {
      progress.status = "error";
      progress.errors.push(err instanceof Error ? err.message : String(err));
      progress.finishedAt = new Date().toISOString();
      saveProgress(progress);
    }
  );
  return progress;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    throw new Error(`GET ${url} failed (${res.status})`);
  }
  return res;
}

async function downloadImage(url: string, destDir: string, baseName: string): Promise<string> {
  const ext = path.extname(new URL(url).pathname).toLowerCase() || ".jpg";
  const fileName = `${baseName}${ext}`;
  const res = await fetchWithTimeout(url);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(destDir, { recursive: true });
  await fs.writeFile(path.join(destDir, fileName), buf);
  return fileName;
}

/** Run `worker` over `items` with bounded concurrency. */
async function pool<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

function recordError(progress: CatalogProgress, name: string, err: unknown): void {
  if (progress.errors.length < 20) {
    progress.errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Derive a body-part category (wger-style) from the first mapped primary muscle. */
function categoryFromMuscles(primaryMuscles: string[]): string {
  const group = primaryMuscles.length > 0 ? muscleGroupOf(primaryMuscles[0]) : null;
  switch (group) {
    case "Chest":
      return "Chest";
    case "Back":
    case "Lower back":
      return "Back";
    case "Shoulders":
    case "Neck":
      return "Shoulders";
    case "Biceps":
    case "Triceps":
    case "Forearms":
      return "Arms";
    case "Quads":
    case "Hamstrings":
    case "Glutes":
    case "Adductors":
    case "Abductors":
      return "Legs";
    case "Calves":
      return "Calves";
    case "Core":
      return "Abs";
    default:
      return "Cardio";
  }
}

// ------------------------------------------------- free-exercise-db

interface FedbExercise {
  id: string;
  name: string;
  force: string | null;
  level: string | null;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
}

const FEDB_MUSCLES: Record<string, string> = {
  abdominals: "Rectus abdominis",
  abductors: "Gluteus medius",
  adductors: "Adductor magnus",
  biceps: "Biceps brachii",
  calves: "Gastrocnemius",
  chest: "Pectoralis major",
  forearms: "Forearm flexors",
  glutes: "Gluteus maximus",
  hamstrings: "Biceps femoris",
  lats: "Latissimus dorsi",
  "lower back": "Erector spinae",
  "middle back": "Rhomboids",
  neck: "Sternocleidomastoid",
  quadriceps: "Quadriceps femoris",
  shoulders: "Anterior deltoid",
  traps: "Trapezius",
  triceps: "Triceps brachii",
};

const FEDB_EQUIPMENT: Record<string, string[]> = {
  "body only": [],
  machine: ["Machine"],
  other: ["Other"],
  "foam roll": ["Foam roller"],
  kettlebells: ["Kettlebell"],
  dumbbell: ["Dumbbell"],
  cable: ["Cable"],
  barbell: ["Barbell"],
  bands: ["Resistance band"],
  "medicine ball": ["Medicine ball"],
  "exercise ball": ["Swiss Ball"],
  "e-z curl bar": ["SZ-Bar"],
};

async function importFreeExerciseDb(progress: CatalogProgress): Promise<void> {
  const res = await fetchWithTimeout(`${FREE_EXERCISE_DB_BASE}/dist/exercises.json`);
  const all = (await res.json()) as FedbExercise[];
  progress.total = all.length;
  saveProgress(progress);

  await pool(all, 6, async (entry) => {
    try {
      const catalogKey = `fedb-${entry.id}`;
      if (catalogKeyExists(catalogKey) || exerciseNameExists(entry.name)) {
        progress.skipped++;
        return;
      }

      const mapMuscles = (names: string[]) => [
        ...new Set(
          names
            .map((n) => FEDB_MUSCLES[n.toLowerCase()] ?? canonicalMuscle(n))
            .filter((n): n is string => n !== null && n !== undefined)
        ),
      ];
      const primaryMuscles = mapMuscles(entry.primaryMuscles ?? []);
      const secondaryMuscles = mapMuscles(entry.secondaryMuscles ?? []).filter(
        (m) => !primaryMuscles.includes(m)
      );

      const id = crypto.randomUUID();
      const destDir = path.join(config.dataDir, "exercises", id);
      const images: string[] = [];
      for (const [i, img] of (entry.images ?? []).slice(0, 2).entries()) {
        try {
          images.push(
            await downloadImage(`${FREE_EXERCISE_DB_BASE}/exercises/${img}`, destDir, `img-${i}`)
          );
        } catch (err) {
          recordError(progress, `${entry.name} (image)`, err);
        }
      }

      const description = (entry.instructions ?? [])
        .map((step, i) => `${i + 1}. ${step}`)
        .join("\n");

      insertExercise(
        {
          name: entry.name,
          aliases: [],
          description,
          category:
            entry.category === "cardio" ? "Cardio" : categoryFromMuscles(primaryMuscles),
          primaryMuscles,
          secondaryMuscles,
          equipment:
            (entry.equipment ? FEDB_EQUIPMENT[entry.equipment.toLowerCase()] : null) ??
            inferEquipmentFromName(entry.name),
          sourceUrl: "https://github.com/yuhonas/free-exercise-db",
          sourceTitle: "free-exercise-db",
          sourceUploader: "",
          jobId: null,
          clipFile: null,
          thumbFile: images[0] ?? null,
          source: "free-exercise-db",
          images,
          // fedb leaves most stretches' force untagged; mark them static so
          // the routine generator knows to skip them
          force: entry.force ?? (entry.category === "stretching" ? "static" : null),
          mechanic: entry.mechanic ?? null,
          level: entry.level === "expert" ? "advanced" : entry.level ?? null,
          license: "Public domain (Unlicense)",
          licenseAuthor: null,
          catalogKey,
        },
        id
      );
      progress.imported++;
    } catch (err) {
      recordError(progress, entry.name ?? "unknown", err);
    } finally {
      progress.done++;
      saveProgress(progress);
    }
  });

  healMissingEquipment(progress);
}

// ------------------------------------------------------------- wger.de

interface WgerInfoExercise {
  id: number;
  uuid: string;
  category: { name: string } | null;
  muscles: { name: string }[];
  muscles_secondary: { name: string }[];
  equipment: { name: string }[];
  license_author: string | null;
  translations: {
    language: number;
    name: string;
    description: string;
    license_author: string | null;
  }[];
  images: { image: string; is_main: boolean }[];
}

// wger's community data sometimes files Spanish/German/French text under the
// English language id, so trusting `language === 2` alone lets junk through.
// Score the text against common foreign vs English words and reject clear misses.
const FOREIGN_WORDS =
  /\b(el|la|los|las|un[ao]?|unos|unas|con|para|hacia|desde|pierna[s]?|brazo[s]?|espalda|pecho|hombro[s]?|rodilla[s]?|codo[s]?|mano[s]?|cuello|cadera[s]?|ejercicio[s]?|repeticion(es)?|polea|mancuerna[s]?|barra|banco|maquina|sentadilla[s]?|pantorrilla[s]?|jalon(es)?|agarre|remo|remada|supin[ao]|pron[ao]|abiert[ao]|cerrad[ao]|estrech[ao]|caballero|sentad[ao]|tumbad[ao]|elevación|flexión|extensión|jalón|estiramiento|respiración|meditación|der|die|das|und|mit|für|übung(en)?|arme|beine|rücken|bauch|les|des|avec|jambe[s]?|bras|coude[s]?|épaule[s]?)\b/gi;
const ENGLISH_WORDS =
  /\b(the|and|with|your|you|to|of|in|on|for|from|keep|hold|slowly|lower|raise|lift|press|pull|push|return|repeat|position|starting|stand|sit|bench|barbell|dumbbell|cable|machine|arm[s]?|leg[s]?|back|chest|shoulder[s]?|knee[s]?|elbow[s]?|hand[s]?|hip[s]?|feet|foot|up|down)\b/gi;
const FOREIGN_CHARS = /[ñáéíóúü¿¡äößàèùâêîôûç]/gi;

// Both catalogs have entries whose equipment list is empty even though the
// name says "Cable Fly" or "Smith Machine Press" — which would let them slip
// into bodyweight-only workouts. Infer the gear from the name as a fallback.
const NAME_EQUIPMENT: [RegExp, string][] = [
  [/\bsmith\b/i, "Smith machine"],
  [/\b(machine|lever(age)?)\b/i, "Machine"],
  [/\b(cable|pulley|pulldown|pushdown|cross[- ]?over|woodchop)/i, "Cable"],
  [/\bbands?\b/i, "Resistance band"],
  [/\b(barbell|landmine)\b/i, "Barbell"],
  [/\b([es]z[- ]?bar|curl bar)\b/i, "SZ-Bar"],
  [/\bdumbbells?\b/i, "Dumbbell"],
  [/\bkettlebells?\b/i, "Kettlebell"],
  [/\bmedicine ball\b/i, "Medicine ball"],
  [/\b(exercise|swiss|stability) ball\b/i, "Swiss Ball"],
  [/\bbench\b/i, "Bench"],
  [/\b(trx|suspension|jump rope|ropes?|plates?|bosu|sled)\b/i, "Other"],
];

export function inferEquipmentFromName(name: string): string[] {
  const out: string[] = [];
  for (const [re, eq] of NAME_EQUIPMENT) {
    if (re.test(name) && !out.includes(eq)) out.push(eq);
  }
  return out;
}

function textLooksEnglish(text: string): boolean {
  const foreign =
    (text.match(FOREIGN_WORDS)?.length ?? 0) + (text.match(FOREIGN_CHARS)?.length ?? 0) * 2;
  if (foreign < 2) return true;
  const english = text.match(ENGLISH_WORDS)?.length ?? 0;
  return english >= foreign;
}

/** The name must read as English on its own — it's what workout lists display —
 *  and the entry as a whole must too. */
export function looksEnglish(name: string, description: string): boolean {
  return textLooksEnglish(name) && textLooksEnglish(`${name} ${description}`);
}

function stripHtml(html: string): string {
  return html
    .replace(/<\/(p|li|ol|ul|br|div|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mapWgerEquipment(names: string[]): string[] {
  const result: string[] = [];
  for (const name of names) {
    if (/none|bodyweight/i.test(name)) continue;
    const match = EQUIPMENT.find((e) => e.toLowerCase() === name.trim().toLowerCase());
    result.push(match ?? "Other");
  }
  return [...new Set(result)];
}

async function importWger(progress: CatalogProgress): Promise<void> {
  // collect all pages first so `total` is accurate
  const all: WgerInfoExercise[] = [];
  let url = `${WGER_BASE}/api/v2/exerciseinfo/?format=json&limit=100`;
  for (let page = 0; page < 30 && url; page++) {
    const res = await fetchWithTimeout(url);
    const data = (await res.json()) as { results: WgerInfoExercise[]; next: string | null };
    all.push(...data.results);
    url = data.next ?? "";
  }
  progress.total = all.length;
  saveProgress(progress);

  await pool(all, 6, async (entry) => {
    const translation = entry.translations?.find(
      (t) => t.language === ENGLISH && t.name?.trim()
    );
    try {
      const catalogKey = `wger-${entry.uuid ?? entry.id}`;
      if (!translation) {
        progress.skipped++;
        return;
      }
      const name = translation.name.trim();
      const description = stripHtml(translation.description ?? "");
      if (!looksEnglish(name, description)) {
        progress.skipped++;
        return;
      }
      if (catalogKeyExists(catalogKey) || exerciseNameExists(name)) {
        progress.skipped++;
        return;
      }

      const mapMuscles = (muscles: { name: string }[]) => [
        ...new Set(
          muscles
            .map((m) => canonicalMuscle(m.name))
            .filter((n): n is string => n !== null)
        ),
      ];
      const primaryMuscles = mapMuscles(entry.muscles ?? []);
      const secondaryMuscles = mapMuscles(entry.muscles_secondary ?? []).filter(
        (m) => !primaryMuscles.includes(m)
      );

      const id = crypto.randomUUID();
      const destDir = path.join(config.dataDir, "exercises", id);
      const images: string[] = [];
      const sortedImages = [...(entry.images ?? [])].sort(
        (a, b) => Number(b.is_main) - Number(a.is_main)
      );
      for (const [i, img] of sortedImages.slice(0, 2).entries()) {
        try {
          images.push(await downloadImage(img.image, destDir, `img-${i}`));
        } catch (err) {
          recordError(progress, `${name} (image)`, err);
        }
      }

      insertExercise(
        {
          name,
          aliases: [],
          description,
          category: entry.category?.name ?? categoryFromMuscles(primaryMuscles),
          primaryMuscles,
          secondaryMuscles,
          equipment: ((eq) => (eq.length > 0 ? eq : inferEquipmentFromName(name)))(
            mapWgerEquipment((entry.equipment ?? []).map((e) => e.name))
          ),
          sourceUrl: `${WGER_BASE}/en/exercise/${entry.id}/view/`,
          sourceTitle: "wger.de exercise database",
          sourceUploader: "",
          jobId: null,
          clipFile: null,
          thumbFile: images[0] ?? null,
          source: "wger",
          images,
          force: null,
          mechanic: null,
          level: null,
          license: "CC-BY-SA 4.0",
          licenseAuthor:
            translation.license_author || entry.license_author || "wger.de community",
          catalogKey,
        },
        id
      );
      progress.imported++;
    } catch (err) {
      recordError(progress, translation?.name ?? `wger #${entry.id}`, err);
    } finally {
      progress.done++;
      saveProgress(progress);
    }
  });

  await cleanupNonEnglishWger(progress);
  healMissingEquipment(progress);
}

/** Heal libraries imported before the language check: drop wger entries with non-English text. */
async function cleanupNonEnglishWger(progress: CatalogProgress): Promise<void> {
  const existing = listExercises({ source: "wger" }, 10_000);
  for (const ex of existing) {
    if (looksEnglish(ex.name, ex.description)) continue;
    deleteExercise(ex.id);
    await fs
      .rm(path.join(config.dataDir, "exercises", ex.id), { recursive: true, force: true })
      .catch(() => {});
    progress.removed = (progress.removed ?? 0) + 1;
  }
  saveProgress(progress);
}

/** Heal catalog entries imported before equipment-from-name inference existed. */
function healMissingEquipment(progress: CatalogProgress): void {
  for (const source of ["free-exercise-db", "wger"] as const) {
    for (const ex of listExercises({ source }, 10_000)) {
      if (ex.equipment.length > 0) continue;
      const inferred = inferEquipmentFromName(ex.name);
      if (inferred.length === 0) continue;
      updateExercise(ex.id, { equipment: inferred });
      progress.fixed = (progress.fixed ?? 0) + 1;
    }
  }
  saveProgress(progress);
}
