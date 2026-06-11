import path from "node:path";
import { config, jobDir, wgerConfigured } from "./config";
import {
  createJob,
  findExercisesByName,
  getJob,
  insertExercise,
  updateJob,
} from "./db";
import { downloadVideo } from "./downloader";
import { extractExercises, type RawExtractedExercise } from "./gemini";
import { clipVideo, makeThumbnail } from "./clipper";
import { CATEGORIES, EQUIPMENT, canonicalMuscle } from "./taxonomy";
import { searchWgerExercises } from "./wger";
import crypto from "node:crypto";
import type { ExerciseMatch, ExtractedExercise, ImportResult, Job } from "./types";

export function startJob(url: string): Job {
  const job = createJob(url);
  void processJob(job.id, url).catch((err) => {
    updateJob(job.id, { status: "error", error: errorMessage(err) });
  });
  return job;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function processJob(id: string, url: string): Promise<void> {
  updateJob(id, { status: "downloading" });
  const { videoPath, videoFile, metadata } = await downloadVideo(id, url);
  updateJob(id, { videoFile, metadata });

  updateJob(id, { status: "extracting" });
  const raw = await extractExercises(videoPath, metadata);
  if (raw.length === 0) {
    throw new Error("No exercises could be identified in this video");
  }

  const exercises: ExtractedExercise[] = [];
  for (const r of raw) {
    exercises.push(await toExtractedExercise(r, metadata.duration));
  }
  updateJob(id, { exercises });

  if (config.autoSave) {
    updateJob(id, { status: "saving" });
    await saveExercises(id, exercises);
  } else {
    updateJob(id, { status: "awaiting_review" });
  }
}

async function findMatches(name: string): Promise<ExerciseMatch[]> {
  const matches: ExerciseMatch[] = findExercisesByName(name).map((e) => ({
    source: "library",
    id: e.id,
    name: e.name,
  }));
  if (wgerConfigured()) {
    matches.push(...(await searchWgerExercises(name)));
  }
  return matches.slice(0, 6);
}

const normalize = (s: string) => s.trim().toLowerCase();

async function toExtractedExercise(
  r: RawExtractedExercise,
  videoDuration?: number
): Promise<ExtractedExercise> {
  const startSec = Math.max(0, Number(r.startSec) || 0);
  let endSec = Number(r.endSec) || 0;
  if (videoDuration !== undefined) endSec = Math.min(endSec, videoDuration);
  if (endSec <= startSec) endSec = videoDuration ?? startSec + 5;

  const name = (r.name ?? "").trim();
  const rawCategory = (r.category ?? "").trim();
  const category =
    CATEGORIES.find((c) => normalize(c) === normalize(rawCategory)) ?? rawCategory;

  const muscles = (names: unknown): string[] => {
    if (!Array.isArray(names)) return [];
    return [...new Set(names.map((n) => canonicalMuscle(String(n))).filter((n): n is string => n !== null))];
  };
  const equipment = (names: unknown): string[] => {
    if (!Array.isArray(names)) return [];
    return [
      ...new Set(
        names
          .map((n) => EQUIPMENT.find((e) => normalize(e) === normalize(String(n))))
          .filter((e): e is (typeof EQUIPMENT)[number] => e !== undefined)
      ),
    ];
  };

  return {
    name,
    aliases: Array.isArray(r.aliases) ? r.aliases.map(String) : [],
    description: (r.description ?? "").trim(),
    category,
    primaryMuscles: muscles(r.primaryMuscles),
    secondaryMuscles: muscles(r.secondaryMuscles),
    equipment: equipment(r.equipment),
    startSec,
    endSec,
    matches: name ? await findMatches(name) : [],
    include: true,
  };
}

export function confirmJob(id: string, exercises: ExtractedExercise[]): Job | null {
  const job = getJob(id);
  if (!job) return null;
  if (job.status !== "awaiting_review") {
    throw new Error(`Job is ${job.status}, not awaiting review`);
  }
  updateJob(id, { status: "saving", exercises });
  void saveExercises(id, exercises).catch((err) => {
    updateJob(id, { status: "error", error: errorMessage(err) });
  });
  return getJob(id);
}

async function saveExercises(id: string, exercises: ExtractedExercise[]): Promise<void> {
  const job = getJob(id);
  if (!job || !job.videoFile) {
    throw new Error("Job has no downloaded video");
  }
  const sourcePath = path.join(jobDir(id), job.videoFile);
  const results: ImportResult[] = [];

  const included = exercises.filter((e) => e.include);
  if (included.length === 0) {
    throw new Error("No exercises were selected to save");
  }

  for (const ex of included) {
    try {
      const exerciseId = crypto.randomUUID();
      const exDir = path.join(config.dataDir, "exercises", exerciseId);

      let clipFile: string | null = null;
      let thumbFile: string | null = null;
      try {
        await clipVideo(
          sourcePath,
          path.join(exDir, "clip.mp4"),
          ex.startSec,
          ex.endSec,
          job.metadata?.duration
        );
        clipFile = "clip.mp4";
        await makeThumbnail(
          sourcePath,
          path.join(exDir, "thumb.jpg"),
          ex.startSec + (ex.endSec - ex.startSec) / 2
        );
        thumbFile = "thumb.jpg";
      } catch {
        // a failed clip/thumbnail shouldn't lose the exercise data itself
      }

      const saved = insertExercise(
        {
          name: ex.name,
          aliases: ex.aliases,
          description: ex.description,
          category: ex.category,
          primaryMuscles: ex.primaryMuscles,
          secondaryMuscles: ex.secondaryMuscles,
          equipment: ex.equipment,
          sourceUrl: job.metadata?.webpageUrl ?? job.url,
          sourceTitle: job.metadata?.title ?? "",
          sourceUploader: job.metadata?.uploader ?? "",
          jobId: id,
          clipFile,
          thumbFile,
        },
        exerciseId
      );

      results.push({ name: ex.name, status: "saved", exerciseId: saved.id });
    } catch (err) {
      results.push({ name: ex.name, status: "error", error: errorMessage(err) });
    }
    updateJob(id, { results: [...results] });
  }

  updateJob(id, { status: "done", results });
}
