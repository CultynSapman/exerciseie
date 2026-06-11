import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import type {
  ExerciseFilters,
  Job,
  JobStatus,
  LibraryExercise,
  Profile,
  Workout,
  WorkoutItem,
  WorkoutStatus,
} from "./types";

// Cache the connection on globalThis so Next.js dev-mode hot reloads and
// separately-bundled route handlers share a single database handle.
const globalStore = globalThis as unknown as { __exerciseieDb?: DatabaseSync };

/** Add a column to an existing table if it's missing (in-place upgrade of deployed DBs). */
function ensureColumn(db: DatabaseSync, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

function getDb(): DatabaseSync {
  if (!globalStore.__exerciseieDb) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    const db = new DatabaseSync(path.join(config.dataDir, "exerciseie.db"));
    db.exec("PRAGMA journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        video_file TEXT,
        metadata TEXT,
        exercises TEXT,
        results TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS exercises (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        aliases TEXT NOT NULL DEFAULT '[]',
        description TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        primary_muscles TEXT NOT NULL DEFAULT '[]',
        secondary_muscles TEXT NOT NULL DEFAULT '[]',
        equipment TEXT NOT NULL DEFAULT '[]',
        favorite INTEGER NOT NULL DEFAULT 0,
        source_url TEXT NOT NULL DEFAULT '',
        source_title TEXT NOT NULL DEFAULT '',
        source_uploader TEXT NOT NULL DEFAULT '',
        job_id TEXT,
        clip_file TEXT,
        thumb_file TEXT,
        wger_id INTEGER,
        wger_url TEXT,
        source TEXT NOT NULL DEFAULT 'video',
        images TEXT NOT NULL DEFAULT '[]',
        force TEXT,
        mechanic TEXT,
        level TEXT,
        license TEXT,
        license_author TEXT,
        catalog_key TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        goal TEXT NOT NULL,
        level TEXT NOT NULL,
        days_per_week INTEGER NOT NULL,
        session_minutes INTEGER NOT NULL,
        equipment TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workouts (
        id TEXT PRIMARY KEY,
        seq INTEGER NOT NULL,
        day_label TEXT NOT NULL,
        focus_groups TEXT NOT NULL DEFAULT '[]',
        items TEXT NOT NULL DEFAULT '[]',
        rationale TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'planned',
        created_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    // upgrade pre-v2 databases in place
    ensureColumn(db, "exercises", "source", "source TEXT NOT NULL DEFAULT 'video'");
    ensureColumn(db, "exercises", "images", "images TEXT NOT NULL DEFAULT '[]'");
    ensureColumn(db, "exercises", "force", "force TEXT");
    ensureColumn(db, "exercises", "mechanic", "mechanic TEXT");
    ensureColumn(db, "exercises", "level", "level TEXT");
    ensureColumn(db, "exercises", "license", "license TEXT");
    ensureColumn(db, "exercises", "license_author", "license_author TEXT");
    ensureColumn(db, "exercises", "catalog_key", "catalog_key TEXT");
    globalStore.__exerciseieDb = db;
  }
  return globalStore.__exerciseieDb;
}

// ---------------------------------------------------------------- jobs

interface JobRow {
  id: string;
  url: string;
  status: string;
  error: string | null;
  video_file: string | null;
  metadata: string | null;
  exercises: string | null;
  results: string | null;
  created_at: string;
  updated_at: string;
}

function rowToJob(row: JobRow): Job {
  return {
    id: row.id,
    url: row.url,
    status: row.status as JobStatus,
    error: row.error,
    videoFile: row.video_file,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    exercises: row.exercises ? JSON.parse(row.exercises) : null,
    results: row.results ? JSON.parse(row.results) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createJob(url: string): Job {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      "INSERT INTO jobs (id, url, status, created_at, updated_at) VALUES (?, ?, 'queued', ?, ?)"
    )
    .run(id, url, now, now);
  return getJob(id)!;
}

export function getJob(id: string): Job | null {
  const row = getDb()
    .prepare("SELECT * FROM jobs WHERE id = ?")
    .get(id) as JobRow | undefined;
  return row ? rowToJob(row) : null;
}

export function listJobs(limit = 30): Job[] {
  const rows = getDb()
    .prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?")
    .all(limit) as unknown as JobRow[];
  return rows.map(rowToJob);
}

export function updateJob(
  id: string,
  patch: Partial<Pick<Job, "status" | "error" | "videoFile" | "metadata" | "exercises" | "results">>
): void {
  const sets: string[] = [];
  const values: (string | null)[] = [];
  if (patch.status !== undefined) {
    sets.push("status = ?");
    values.push(patch.status);
  }
  if (patch.error !== undefined) {
    sets.push("error = ?");
    values.push(patch.error);
  }
  if (patch.videoFile !== undefined) {
    sets.push("video_file = ?");
    values.push(patch.videoFile);
  }
  if (patch.metadata !== undefined) {
    sets.push("metadata = ?");
    values.push(patch.metadata === null ? null : JSON.stringify(patch.metadata));
  }
  if (patch.exercises !== undefined) {
    sets.push("exercises = ?");
    values.push(patch.exercises === null ? null : JSON.stringify(patch.exercises));
  }
  if (patch.results !== undefined) {
    sets.push("results = ?");
    values.push(patch.results === null ? null : JSON.stringify(patch.results));
  }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(id);
  getDb()
    .prepare(`UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values);
}

// ------------------------------------------------------------ exercises

interface ExerciseRow {
  id: string;
  name: string;
  aliases: string;
  description: string;
  category: string;
  primary_muscles: string;
  secondary_muscles: string;
  equipment: string;
  favorite: number;
  source_url: string;
  source_title: string;
  source_uploader: string;
  job_id: string | null;
  clip_file: string | null;
  thumb_file: string | null;
  wger_id: number | null;
  wger_url: string | null;
  source: string;
  images: string;
  force: string | null;
  mechanic: string | null;
  level: string | null;
  license: string | null;
  license_author: string | null;
  catalog_key: string | null;
  created_at: string;
  updated_at: string;
}

function rowToExercise(row: ExerciseRow): LibraryExercise {
  return {
    id: row.id,
    name: row.name,
    aliases: JSON.parse(row.aliases),
    description: row.description,
    category: row.category,
    primaryMuscles: JSON.parse(row.primary_muscles),
    secondaryMuscles: JSON.parse(row.secondary_muscles),
    equipment: JSON.parse(row.equipment),
    favorite: row.favorite === 1,
    sourceUrl: row.source_url,
    sourceTitle: row.source_title,
    sourceUploader: row.source_uploader,
    jobId: row.job_id,
    clipFile: row.clip_file,
    thumbFile: row.thumb_file,
    wgerId: row.wger_id,
    wgerUrl: row.wger_url,
    source: (row.source as LibraryExercise["source"]) ?? "video",
    images: row.images ? JSON.parse(row.images) : [],
    force: row.force,
    mechanic: row.mechanic,
    level: row.level,
    license: row.license,
    licenseAuthor: row.license_author,
    catalogKey: row.catalog_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type NewExercise = Omit<
  LibraryExercise,
  | "id"
  | "favorite"
  | "wgerId"
  | "wgerUrl"
  | "createdAt"
  | "updatedAt"
  | "source"
  | "images"
  | "force"
  | "mechanic"
  | "level"
  | "license"
  | "licenseAuthor"
  | "catalogKey"
> &
  Partial<
    Pick<
      LibraryExercise,
      "source" | "images" | "force" | "mechanic" | "level" | "license" | "licenseAuthor" | "catalogKey"
    >
  >;

export function insertExercise(ex: NewExercise, id?: string): LibraryExercise {
  const exerciseId = id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO exercises (
        id, name, aliases, description, category,
        primary_muscles, secondary_muscles, equipment,
        source_url, source_title, source_uploader,
        job_id, clip_file, thumb_file,
        source, images, force, mechanic, level, license, license_author, catalog_key,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      exerciseId,
      ex.name,
      JSON.stringify(ex.aliases),
      ex.description,
      ex.category,
      JSON.stringify(ex.primaryMuscles),
      JSON.stringify(ex.secondaryMuscles),
      JSON.stringify(ex.equipment),
      ex.sourceUrl,
      ex.sourceTitle,
      ex.sourceUploader,
      ex.jobId,
      ex.clipFile,
      ex.thumbFile,
      ex.source ?? "video",
      JSON.stringify(ex.images ?? []),
      ex.force ?? null,
      ex.mechanic ?? null,
      ex.level ?? null,
      ex.license ?? null,
      ex.licenseAuthor ?? null,
      ex.catalogKey ?? null,
      now,
      now
    );
  return getExercise(exerciseId)!;
}

export function getExercise(id: string): LibraryExercise | null {
  const row = getDb()
    .prepare("SELECT * FROM exercises WHERE id = ?")
    .get(id) as ExerciseRow | undefined;
  return row ? rowToExercise(row) : null;
}

export function listExercises(filters: ExerciseFilters = {}, limit = 2000): LibraryExercise[] {
  const where: string[] = [];
  const values: (string | number)[] = [];

  if (filters.q) {
    where.push("(name LIKE ? OR description LIKE ? OR aliases LIKE ?)");
    const like = `%${filters.q}%`;
    values.push(like, like, like);
  }
  if (filters.category) {
    where.push("category = ?");
    values.push(filters.category);
  }
  if (filters.muscle) {
    // muscles are stored as JSON arrays of exact taxonomy names
    where.push("(primary_muscles LIKE ? OR secondary_muscles LIKE ?)");
    const like = `%${JSON.stringify(filters.muscle)}%`;
    values.push(like, like);
  }
  if (filters.equipment) {
    where.push("equipment LIKE ?");
    values.push(`%${JSON.stringify(filters.equipment)}%`);
  }
  if (filters.favorite) {
    where.push("favorite = 1");
  }
  if (filters.source) {
    where.push("source = ?");
    values.push(filters.source);
  }

  const sql = `SELECT * FROM exercises ${
    where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""
  } ORDER BY created_at DESC LIMIT ?`;
  values.push(limit);

  const rows = getDb().prepare(sql).all(...values) as unknown as ExerciseRow[];
  return rows.map(rowToExercise);
}

/** Case-insensitive name lookup used to flag likely duplicates during import review. */
export function findExercisesByName(name: string): LibraryExercise[] {
  const rows = getDb()
    .prepare("SELECT * FROM exercises WHERE name LIKE ? LIMIT 5")
    .all(`%${name.trim()}%`) as unknown as ExerciseRow[];
  return rows.map(rowToExercise);
}

export function exerciseNameExists(name: string): boolean {
  const row = getDb()
    .prepare("SELECT 1 FROM exercises WHERE LOWER(name) = LOWER(?) LIMIT 1")
    .get(name.trim());
  return row !== undefined;
}

export function catalogKeyExists(catalogKey: string): boolean {
  const row = getDb()
    .prepare("SELECT 1 FROM exercises WHERE catalog_key = ? LIMIT 1")
    .get(catalogKey);
  return row !== undefined;
}

export function countExercisesBySource(): Record<string, number> {
  const rows = getDb()
    .prepare("SELECT source, COUNT(*) AS n FROM exercises GROUP BY source")
    .all() as unknown as { source: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.source, r.n]));
}

export function updateExercise(
  id: string,
  patch: Partial<
    Pick<
      LibraryExercise,
      | "name"
      | "aliases"
      | "description"
      | "category"
      | "primaryMuscles"
      | "secondaryMuscles"
      | "equipment"
      | "favorite"
      | "wgerId"
      | "wgerUrl"
    >
  >
): LibraryExercise | null {
  const columns: Record<string, string | number | null> = {};
  if (patch.name !== undefined) columns.name = patch.name;
  if (patch.aliases !== undefined) columns.aliases = JSON.stringify(patch.aliases);
  if (patch.description !== undefined) columns.description = patch.description;
  if (patch.category !== undefined) columns.category = patch.category;
  if (patch.primaryMuscles !== undefined)
    columns.primary_muscles = JSON.stringify(patch.primaryMuscles);
  if (patch.secondaryMuscles !== undefined)
    columns.secondary_muscles = JSON.stringify(patch.secondaryMuscles);
  if (patch.equipment !== undefined) columns.equipment = JSON.stringify(patch.equipment);
  if (patch.favorite !== undefined) columns.favorite = patch.favorite ? 1 : 0;
  if (patch.wgerId !== undefined) columns.wger_id = patch.wgerId;
  if (patch.wgerUrl !== undefined) columns.wger_url = patch.wgerUrl;

  const keys = Object.keys(columns);
  if (keys.length === 0) return getExercise(id);

  const sets = keys.map((k) => `${k} = ?`).join(", ");
  getDb()
    .prepare(`UPDATE exercises SET ${sets}, updated_at = ? WHERE id = ?`)
    .run(...keys.map((k) => columns[k]), new Date().toISOString(), id);
  return getExercise(id);
}

export function deleteExercise(id: string): boolean {
  const result = getDb().prepare("DELETE FROM exercises WHERE id = ?").run(id);
  return result.changes > 0;
}

// -------------------------------------------------------------- profile

interface ProfileRow {
  goal: string;
  level: string;
  days_per_week: number;
  session_minutes: number;
  equipment: string;
  updated_at: string;
}

export function getProfile(): Profile | null {
  const row = getDb().prepare("SELECT * FROM profile WHERE id = 1").get() as
    | ProfileRow
    | undefined;
  if (!row) return null;
  return {
    goal: row.goal as Profile["goal"],
    level: row.level as Profile["level"],
    daysPerWeek: row.days_per_week,
    sessionMinutes: row.session_minutes,
    equipment: JSON.parse(row.equipment),
    updatedAt: row.updated_at,
  };
}

export function saveProfile(p: Omit<Profile, "updatedAt">): Profile {
  getDb()
    .prepare(
      `INSERT INTO profile (id, goal, level, days_per_week, session_minutes, equipment, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         goal = excluded.goal,
         level = excluded.level,
         days_per_week = excluded.days_per_week,
         session_minutes = excluded.session_minutes,
         equipment = excluded.equipment,
         updated_at = excluded.updated_at`
    )
    .run(
      p.goal,
      p.level,
      p.daysPerWeek,
      p.sessionMinutes,
      JSON.stringify(p.equipment),
      new Date().toISOString()
    );
  return getProfile()!;
}

// -------------------------------------------------------------- workouts

interface WorkoutRow {
  id: string;
  seq: number;
  day_label: string;
  focus_groups: string;
  items: string;
  rationale: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

function rowToWorkout(row: WorkoutRow): Workout {
  return {
    id: row.id,
    seq: row.seq,
    dayLabel: row.day_label,
    focusGroups: JSON.parse(row.focus_groups),
    items: JSON.parse(row.items),
    rationale: row.rationale,
    status: row.status as WorkoutStatus,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export function insertWorkout(
  w: Omit<Workout, "id" | "status" | "createdAt" | "completedAt">
): Workout {
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO workouts (id, seq, day_label, focus_groups, items, rationale, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'planned', ?)`
    )
    .run(
      id,
      w.seq,
      w.dayLabel,
      JSON.stringify(w.focusGroups),
      JSON.stringify(w.items),
      w.rationale,
      new Date().toISOString()
    );
  return getWorkout(id)!;
}

export function getWorkout(id: string): Workout | null {
  const row = getDb().prepare("SELECT * FROM workouts WHERE id = ?").get(id) as
    | WorkoutRow
    | undefined;
  return row ? rowToWorkout(row) : null;
}

export function latestWorkout(): Workout | null {
  const row = getDb()
    .prepare("SELECT * FROM workouts ORDER BY created_at DESC LIMIT 1")
    .get() as WorkoutRow | undefined;
  return row ? rowToWorkout(row) : null;
}

export function listWorkouts(limit = 20): Workout[] {
  const rows = getDb()
    .prepare("SELECT * FROM workouts ORDER BY created_at DESC LIMIT ?")
    .all(limit) as unknown as WorkoutRow[];
  return rows.map(rowToWorkout);
}

/** Completed workouts whose completion date is on/after the given ISO timestamp. */
export function completedWorkoutsSince(iso: string): Workout[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM workouts WHERE status = 'completed' AND completed_at >= ? ORDER BY completed_at DESC"
    )
    .all(iso) as unknown as WorkoutRow[];
  return rows.map(rowToWorkout);
}

export function updateWorkout(
  id: string,
  patch: Partial<{ items: WorkoutItem[]; status: WorkoutStatus; completedAt: string | null }>
): Workout | null {
  const sets: string[] = [];
  const values: (string | null)[] = [];
  if (patch.items !== undefined) {
    sets.push("items = ?");
    values.push(JSON.stringify(patch.items));
  }
  if (patch.status !== undefined) {
    sets.push("status = ?");
    values.push(patch.status);
  }
  if (patch.completedAt !== undefined) {
    sets.push("completed_at = ?");
    values.push(patch.completedAt);
  }
  if (sets.length === 0) return getWorkout(id);
  values.push(id);
  getDb()
    .prepare(`UPDATE workouts SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values);
  return getWorkout(id);
}

export function deleteWorkout(id: string): void {
  getDb().prepare("DELETE FROM workouts WHERE id = ?").run(id);
}

// -------------------------------------------------------------- settings

export function getSetting<T>(key: string): T | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? (JSON.parse(row.value) as T) : null;
}

export function setSetting(key: string, value: unknown): void {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, JSON.stringify(value));
}
