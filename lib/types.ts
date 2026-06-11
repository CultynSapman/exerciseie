export type JobStatus =
  | "queued"
  | "downloading"
  | "extracting"
  | "awaiting_review"
  | "saving"
  | "done"
  | "error";

export interface VideoMetadata {
  title: string;
  description: string;
  uploader: string;
  webpageUrl: string;
  thumbnail?: string;
  duration?: number;
}

export interface ExerciseMatch {
  source: "library" | "wger";
  id: string;
  name: string;
}

export interface ExtractedExercise {
  name: string;
  aliases: string[];
  description: string;
  category: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  startSec: number;
  endSec: number;
  matches: ExerciseMatch[];
  include: boolean;
}

export interface ImportResult {
  name: string;
  status: "saved" | "error";
  exerciseId?: string;
  error?: string;
}

export interface Job {
  id: string;
  url: string;
  status: JobStatus;
  error: string | null;
  videoFile: string | null;
  metadata: VideoMetadata | null;
  exercises: ExtractedExercise[] | null;
  results: ImportResult[] | null;
  createdAt: string;
  updatedAt: string;
}

export type ExerciseSource = "video" | "free-exercise-db" | "wger";

export interface LibraryExercise {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  category: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  favorite: boolean;
  sourceUrl: string;
  sourceTitle: string;
  sourceUploader: string;
  jobId: string | null;
  clipFile: string | null;
  thumbFile: string | null;
  wgerId: number | null;
  wgerUrl: string | null;
  source: ExerciseSource;
  /** Local image filenames under DATA_DIR/exercises/<id>/ */
  images: string[];
  force: string | null;
  mechanic: string | null;
  level: string | null;
  license: string | null;
  licenseAuthor: string | null;
  catalogKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseFilters {
  q?: string;
  category?: string;
  muscle?: string;
  equipment?: string;
  favorite?: boolean;
  source?: ExerciseSource;
}

// ------------------------------------------------------------ training

export type Goal = "strength" | "hypertrophy" | "endurance" | "general";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export interface Profile {
  goal: Goal;
  level: ExperienceLevel;
  daysPerWeek: number;
  sessionMinutes: number;
  /** Equipment the user has access to (taxonomy names); bodyweight is always available */
  equipment: string[];
  updatedAt: string;
}

export interface WorkoutItem {
  exerciseId: string;
  name: string;
  /** Muscle groups this item credits (primary first) */
  groups: string[];
  sets: number;
  repsMin: number;
  repsMax: number;
  restSec: number;
  rir: number;
  done: boolean;
}

export type WorkoutStatus = "planned" | "completed" | "skipped";

export interface Workout {
  id: string;
  /** Position in the rolling split rotation */
  seq: number;
  dayLabel: string;
  focusGroups: string[];
  items: WorkoutItem[];
  rationale: string;
  status: WorkoutStatus;
  createdAt: string;
  completedAt: string | null;
}

export interface CatalogProgress {
  source: ExerciseSource;
  status: "idle" | "running" | "done" | "error";
  total: number;
  done: number;
  imported: number;
  skipped: number;
  errors: string[];
  finishedAt: string | null;
}

export interface Taxonomy {
  categories: string[];
  muscles: { name: string; nameEn: string }[];
  equipment: string[];
  wgerConfigured: boolean;
}

export interface WgerMeta {
  categories: { id: number; name: string }[];
  muscles: { id: number; name: string; nameEn: string }[];
  equipment: { id: number; name: string }[];
  languageId: number;
  /** true for wger >= 2.4 (exercise / exercise-translation endpoints) */
  modern: boolean;
}
