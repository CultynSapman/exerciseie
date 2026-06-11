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
} from "./types";

// Cache the connection on globalThis so Next.js dev-mode hot reloads and
// separately-bundled route handlers share a single database handle.
const globalStore = globalThis as unknown as { __exerciseieDb?: DatabaseSync };

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
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type NewExercise = Omit<
  LibraryExercise,
  "id" | "favorite" | "wgerId" | "wgerUrl" | "createdAt" | "updatedAt"
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
        job_id, clip_file, thumb_file, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

export function listExercises(filters: ExerciseFilters = {}, limit = 200): LibraryExercise[] {
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
