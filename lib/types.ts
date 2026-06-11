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
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseFilters {
  q?: string;
  category?: string;
  muscle?: string;
  equipment?: string;
  favorite?: boolean;
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
