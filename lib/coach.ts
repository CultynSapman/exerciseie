import {
  completedWorkoutsSince,
  deleteWorkout,
  getProfile,
  getWorkout,
  insertWorkout,
  latestWorkout,
  listExercises,
  listWorkouts,
  updateWorkout,
} from "./db";
import {
  creditSets,
  generateWorkout,
  pickAlternative,
  type CandidateExercise,
  type HistorySummary,
} from "./programming";
import type { LibraryExercise, Workout } from "./types";

/** A workout needs at least this many eligible exercises to be worth generating. */
const MIN_POOL = 12;

/**
 * Strength programming excludes stretches (force=static, but catalogs often
 * leave stretches untagged, so the name is checked too), pure cardio entries,
 * and anything without a clip or diagram — a workout shouldn't prescribe an
 * exercise you can't see how to perform.
 */
function isProgrammable(e: LibraryExercise): boolean {
  const hasMedia = Boolean(e.clipFile || e.thumbFile || e.images.length > 0);
  return (
    hasMedia &&
    e.force !== "static" &&
    e.category !== "Cardio" &&
    !/\bstretch(es|ing)?\b/i.test(e.name)
  );
}

function toCandidate(e: LibraryExercise): CandidateExercise {
  return {
    id: e.id,
    name: e.name,
    primaryMuscles: e.primaryMuscles,
    secondaryMuscles: e.secondaryMuscles,
    equipment: e.equipment,
    mechanic: e.mechanic,
    force: e.force,
    level: e.level,
    favorite: e.favorite,
    hasMedia: Boolean(e.clipFile || e.thumbFile || e.images.length > 0),
  };
}

function buildHistory(): HistorySummary {
  const recent = listWorkouts(12); // newest first
  const lastSeq = recent.find((w) => w.status !== "planned")?.seq ?? null;

  const recentExerciseIds = new Map<string, number>();
  let ago = 1;
  for (const w of recent) {
    if (w.status !== "completed") continue;
    for (const item of w.items) {
      if (!recentExerciseIds.has(item.exerciseId)) {
        recentExerciseIds.set(item.exerciseId, ago);
      }
    }
    ago++;
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const weeklySetsByGroup: Record<string, number> = {};
  for (const w of completedWorkoutsSince(weekAgo)) {
    for (const [g, sets] of Object.entries(creditSets(w.items.filter((i) => i.done)))) {
      weeklySetsByGroup[g] = (weeklySetsByGroup[g] ?? 0) + sets;
    }
  }

  return { lastSeq, recentExerciseIds, weeklySetsByGroup };
}

export interface TodayResult {
  workout: Workout | null;
  needsProfile: boolean;
  poolSize: number;
}

/** The rolling "what should I do today" view; generates the next workout if none is planned. */
export function getOrCreateToday(): TodayResult {
  const profile = getProfile();
  if (!profile) {
    return { workout: null, needsProfile: true, poolSize: 0 };
  }

  const candidates = listExercises({}, 5000).filter(isProgrammable).map(toCandidate);

  const latest = latestWorkout();
  if (latest?.status === "planned") {
    return { workout: latest, needsProfile: false, poolSize: candidates.length };
  }

  if (candidates.length < MIN_POOL) {
    return { workout: null, needsProfile: false, poolSize: candidates.length };
  }

  const generated = generateWorkout(profile, candidates, buildHistory(), Date.now());
  const workout = insertWorkout({
    seq: generated.seq,
    dayLabel: generated.dayLabel,
    focusGroups: generated.focusGroups,
    items: generated.items,
    rationale: generated.rationale,
  });
  return { workout, needsProfile: false, poolSize: candidates.length };
}

/** Throw away the current planned workout and roll a new one (fresh seed). */
export function regenerateToday(): TodayResult {
  const latest = latestWorkout();
  if (latest?.status === "planned") {
    deleteWorkout(latest.id);
  }
  return getOrCreateToday();
}

export function swapItem(workoutId: string, itemIndex: number): Workout {
  const workout = getWorkout(workoutId);
  if (!workout) throw new Error("Workout not found");
  if (workout.status !== "planned") throw new Error("Only planned workouts can be edited");

  const profile = getProfile();
  if (!profile) throw new Error("No training profile");

  const candidates = listExercises({}, 5000).filter(isProgrammable).map(toCandidate);
  const alt = pickAlternative(
    profile,
    candidates,
    workout.items,
    itemIndex,
    buildHistory(),
    Date.now()
  );
  if (!alt) throw new Error("No alternative exercise available for that muscle group");

  const items = workout.items.map((item, i) => (i === itemIndex ? alt : item));
  return updateWorkout(workoutId, { items })!;
}

export function toggleItem(workoutId: string, itemIndex: number, done: boolean): Workout {
  const workout = getWorkout(workoutId);
  if (!workout) throw new Error("Workout not found");
  const items = workout.items.map((item, i) => (i === itemIndex ? { ...item, done } : item));
  return updateWorkout(workoutId, { items })!;
}

export function setWorkoutStatus(
  workoutId: string,
  status: "completed" | "skipped"
): Workout {
  const workout = getWorkout(workoutId);
  if (!workout) throw new Error("Workout not found");
  const patch: Parameters<typeof updateWorkout>[1] = {
    status,
    completedAt: status === "completed" ? new Date().toISOString() : null,
  };
  // completing without any boxes ticked means "I did the whole thing"
  if (status === "completed" && workout.items.every((i) => !i.done)) {
    patch.items = workout.items.map((i) => ({ ...i, done: true }));
  }
  return updateWorkout(workoutId, patch)!;
}
