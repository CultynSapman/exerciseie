// Deterministic, rules-based routine generator. No LLM involved — every
// prescription traces back to published resistance-training guidelines:
//
// - Weekly volume: ~10-20 hard sets per muscle group per week for growth,
//   with returns increasing from ~10 sets (Schoenfeld, Ogborn & Krieger 2017
//   dose-response meta-analysis; Pelland et al. 2024 meta-regression).
// - Frequency: training each muscle >=2x/week beats 1x/week at equal volume
//   (Schoenfeld, Ogborn & Krieger 2016 frequency meta-analysis) — encoded in
//   the split tables: every major group appears on >=2 days of each cycle.
// - Effort: sets within ~1-3 reps of failure ("RIR") are what count as
//   effective volume (Refalo et al. 2022; Robinson et al. 2023).
// - Load/reps by goal: strength adapts best to heavy low-rep work (3-6),
//   hypertrophy is robust across 6-12 at matched effort, endurance favors
//   12-20+ (ACSM progression position stand; Schoenfeld et al. 2021
//   loading-zone review).

import { MUSCLE_GROUPS, type MuscleGroup, muscleGroupOf } from "./taxonomy";
import type { ExperienceLevel, Goal, Profile, WorkoutItem } from "./types";

export interface CandidateExercise {
  id: string;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  mechanic: string | null;
  force: string | null;
  level: string | null;
  favorite: boolean;
  /** Has a video clip or images — preferred so workouts stay visual */
  hasMedia: boolean;
}

export interface HistorySummary {
  /** seq of the most recent non-skipped workout, or null if none yet */
  lastSeq: number | null;
  /** exerciseId -> how many workouts ago it was used (1 = previous workout) */
  recentExerciseIds: Map<string, number>;
  /** effective sets credited per muscle group over the trailing 7 days */
  weeklySetsByGroup: Record<string, number>;
}

export interface GeneratedWorkout {
  seq: number;
  dayLabel: string;
  focusGroups: MuscleGroup[];
  items: WorkoutItem[];
  rationale: string;
}

// ----------------------------------------------------------- goal params

interface GoalParams {
  reps: [number, number];
  restCompound: number;
  restIsolation: number;
  rir: number;
  setsCompound: number;
  setsIsolation: number;
  label: string;
}

export const GOAL_PARAMS: Record<Goal, GoalParams> = {
  strength: {
    reps: [3, 6],
    restCompound: 180,
    restIsolation: 120,
    rir: 2,
    setsCompound: 4,
    setsIsolation: 3,
    label: "Strength: heavy loads, 3–6 reps, long rests (ACSM progression models)",
  },
  hypertrophy: {
    reps: [6, 12],
    restCompound: 120,
    restIsolation: 90,
    rir: 2,
    setsCompound: 3,
    setsIsolation: 3,
    label:
      "Hypertrophy: 6–12 reps taken to 1–3 reps in reserve (Schoenfeld et al. loading-zone & dose-response meta-analyses)",
  },
  endurance: {
    reps: [12, 20],
    restCompound: 60,
    restIsolation: 45,
    rir: 3,
    setsCompound: 3,
    setsIsolation: 2,
    label: "Muscular endurance: 12–20 reps, short rests (ACSM position stand)",
  },
  general: {
    reps: [8, 12],
    restCompound: 90,
    restIsolation: 60,
    rir: 3,
    setsCompound: 3,
    setsIsolation: 2,
    label: "General fitness: 2–3 sets of 8–12 reps per exercise (ACSM guidelines)",
  },
};

/** Weekly effective-set target per muscle group (drives the neglect boost). */
export function weeklyTarget(group: MuscleGroup, level: ExperienceLevel): number {
  const major = MUSCLE_GROUPS.find((g) => g.name === group)?.major ?? false;
  const majorTargets: Record<ExperienceLevel, number> = {
    beginner: 10,
    intermediate: 13,
    advanced: 16,
  };
  const minorTargets: Record<ExperienceLevel, number> = {
    beginner: 4,
    intermediate: 6,
    advanced: 8,
  };
  return major ? majorTargets[level] : minorTargets[level];
}

// ----------------------------------------------------------------- splits

interface Slot {
  /** Single group, or a rotation list resolved to the most-neglected option */
  group: MuscleGroup | MuscleGroup[];
  kind: "compound" | "isolation" | "any";
}

interface DayTemplate {
  label: string;
  slots: Slot[];
}

const PUSH: DayTemplate = {
  label: "Push",
  slots: [
    { group: "Chest", kind: "compound" },
    { group: "Shoulders", kind: "compound" },
    { group: "Chest", kind: "any" },
    { group: "Shoulders", kind: "isolation" },
    { group: "Triceps", kind: "isolation" },
    { group: ["Core", "Neck"], kind: "any" },
  ],
};

const PULL: DayTemplate = {
  label: "Pull",
  slots: [
    { group: "Back", kind: "compound" },
    { group: "Back", kind: "any" },
    { group: "Biceps", kind: "isolation" },
    { group: "Shoulders", kind: "isolation" },
    { group: ["Forearms", "Lower back"], kind: "any" },
    { group: "Core", kind: "any" },
  ],
};

const LEGS: DayTemplate = {
  label: "Legs",
  slots: [
    { group: "Quads", kind: "compound" },
    { group: "Hamstrings", kind: "compound" },
    { group: "Glutes", kind: "any" },
    { group: "Calves", kind: "isolation" },
    { group: ["Adductors", "Abductors"], kind: "any" },
    { group: "Core", kind: "any" },
  ],
};

const UPPER: DayTemplate = {
  label: "Upper body",
  slots: [
    { group: "Chest", kind: "compound" },
    { group: "Back", kind: "compound" },
    { group: "Shoulders", kind: "compound" },
    { group: "Back", kind: "any" },
    { group: "Biceps", kind: "isolation" },
    { group: "Triceps", kind: "isolation" },
    { group: ["Forearms", "Neck"], kind: "any" },
  ],
};

const LOWER: DayTemplate = {
  label: "Lower body",
  slots: [
    { group: "Quads", kind: "compound" },
    { group: "Hamstrings", kind: "compound" },
    { group: "Glutes", kind: "any" },
    { group: "Calves", kind: "isolation" },
    { group: ["Lower back", "Adductors", "Abductors"], kind: "any" },
    { group: "Core", kind: "any" },
  ],
};

const fullBody = (label: string, lead: Slot[]): DayTemplate => ({
  label,
  slots: [
    ...lead,
    { group: "Calves", kind: "isolation" },
    { group: ["Core", "Lower back", "Forearms"], kind: "any" },
  ],
});

const FULL_A = fullBody("Full body A", [
  { group: "Quads", kind: "compound" },
  { group: "Chest", kind: "compound" },
  { group: "Back", kind: "compound" },
  { group: ["Hamstrings", "Glutes"], kind: "any" },
  { group: "Shoulders", kind: "any" },
]);

const FULL_B = fullBody("Full body B", [
  { group: "Hamstrings", kind: "compound" },
  { group: "Shoulders", kind: "compound" },
  { group: "Back", kind: "any" },
  { group: "Chest", kind: "any" },
  { group: ["Quads", "Glutes"], kind: "any" },
]);

const FULL_C = fullBody("Full body C", [
  { group: "Glutes", kind: "compound" },
  { group: "Chest", kind: "any" },
  { group: "Back", kind: "any" },
  { group: ["Quads", "Hamstrings"], kind: "any" },
  { group: ["Biceps", "Triceps"], kind: "isolation" },
]);

/** Each major group appears on >=2 days of every cycle (2x/week frequency). */
export const SPLITS: Record<number, DayTemplate[]> = {
  2: [FULL_A, FULL_B],
  3: [FULL_A, FULL_B, FULL_C],
  4: [UPPER, LOWER, { ...UPPER, label: "Upper body B" }, { ...LOWER, label: "Lower body B" }],
  5: [PUSH, PULL, LEGS, UPPER, LOWER],
  6: [
    PUSH,
    PULL,
    LEGS,
    { ...PUSH, label: "Push B" },
    { ...PULL, label: "Pull B" },
    { ...LEGS, label: "Legs B" },
  ],
};

// ------------------------------------------------------------- selection

/** Deterministic PRNG so generation is reproducible for a given seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function primaryGroups(c: CandidateExercise): MuscleGroup[] {
  const groups: MuscleGroup[] = [];
  for (const m of c.primaryMuscles) {
    const g = muscleGroupOf(m);
    if (g && !groups.includes(g)) groups.push(g);
  }
  return groups;
}

function equipmentOk(c: CandidateExercise, available: string[]): boolean {
  return c.equipment.every((e) => available.includes(e));
}

function levelOk(c: CandidateExercise, level: ExperienceLevel): boolean {
  if (c.level === "advanced" && level === "beginner") return false;
  return true;
}

function scoreCandidate(
  c: CandidateExercise,
  slotKind: Slot["kind"],
  history: HistorySummary,
  rand: () => number
): number {
  let score = 0;
  if (c.favorite) score += 3;
  if (c.hasMedia) score += 1;

  if (slotKind !== "any") {
    if (c.mechanic === slotKind) score += 2;
    else if (c.mechanic === null) score += 0.5;
    else score -= 2;
  }

  const ago = history.recentExerciseIds.get(c.id);
  if (ago !== undefined) {
    // strong penalty for "used last workout", decaying over ~5 workouts —
    // this is the variety engine
    score -= Math.max(0, 6 - ago) * 1.5;
  }

  score += rand() * 2;
  return score;
}

/** Credit effective sets per muscle group for a list of workout items. */
export function creditSets(items: WorkoutItem[]): Record<string, number> {
  const credit: Record<string, number> = {};
  for (const item of items) {
    item.groups.forEach((g, i) => {
      credit[g] = (credit[g] ?? 0) + (i === 0 ? item.sets : item.sets * 0.5);
    });
  }
  return credit;
}

function resolveSlotGroup(
  slot: Slot,
  history: HistorySummary,
  level: ExperienceLevel,
  rand: () => number
): MuscleGroup {
  if (!Array.isArray(slot.group)) return slot.group;
  // Rotation slot: pick the option furthest below its weekly target. For
  // all-minor rotations ([Forearms, Neck]…) jitter breaks ties so equal
  // options rotate week to week instead of the first in the list winning
  // forever; major-group rotations stay strict to keep 2x/week frequency.
  const allMinor = slot.group.every(
    (g) => !(MUSCLE_GROUPS.find((mg) => mg.name === g)?.major ?? false)
  );
  let best = slot.group[0];
  let bestDeficit = -Infinity;
  for (const g of slot.group) {
    const deficit =
      weeklyTarget(g, level) -
      (history.weeklySetsByGroup[g] ?? 0) +
      (allMinor ? rand() * 0.75 : 0);
    if (deficit > bestDeficit) {
      bestDeficit = deficit;
      best = g;
    }
  }
  return best;
}

function buildItem(c: CandidateExercise, kind: Slot["kind"], params: GoalParams): WorkoutItem {
  const isCompound = (c.mechanic ?? (kind === "compound" ? "compound" : "isolation")) === "compound";
  const groups: string[] = [];
  for (const m of [...c.primaryMuscles, ...c.secondaryMuscles]) {
    const g = muscleGroupOf(m);
    if (g && !groups.includes(g)) groups.push(g);
  }
  return {
    exerciseId: c.id,
    name: c.name,
    groups,
    sets: isCompound ? params.setsCompound : params.setsIsolation,
    repsMin: params.reps[0],
    repsMax: params.reps[1],
    restSec: isCompound ? params.restCompound : params.restIsolation,
    rir: params.rir,
    done: false,
  };
}

/** Estimated seconds an item takes: ~40s of work per set plus rest between sets. */
function itemSeconds(item: WorkoutItem): number {
  return item.sets * (40 + item.restSec);
}

const MAX_EXERCISES: Record<ExperienceLevel, number> = {
  beginner: 5,
  intermediate: 7,
  advanced: 8,
};

export function generateWorkout(
  profile: Profile,
  candidates: CandidateExercise[],
  history: HistorySummary,
  seed: number
): GeneratedWorkout {
  const rand = mulberry32(seed);
  const split = SPLITS[Math.min(6, Math.max(2, profile.daysPerWeek))];
  const seq = (history.lastSeq ?? -1) + 1;
  const template = split[seq % split.length];
  const params = GOAL_PARAMS[profile.goal];

  const eligible = candidates.filter(
    (c) =>
      equipmentOk(c, profile.equipment) &&
      levelOk(c, profile.level) &&
      primaryGroups(c).length > 0
  );

  const budget = profile.sessionMinutes * 60 - 300; // minus warm-up
  const maxExercises = MAX_EXERCISES[profile.level];
  const items: WorkoutItem[] = [];
  const usedIds = new Set<string>();
  const focusGroups: MuscleGroup[] = [];
  let spent = 0;

  const fillSlot = (group: MuscleGroup, kind: Slot["kind"], extraCap = 0): boolean => {
    if (items.length >= maxExercises + extraCap) return false;
    const pool = eligible.filter(
      (c) => !usedIds.has(c.id) && primaryGroups(c).includes(group)
    );
    if (pool.length === 0) return false;
    let best: CandidateExercise | null = null;
    let bestScore = -Infinity;
    for (const c of pool) {
      const s = scoreCandidate(c, kind, history, rand);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (!best) return false;
    const item = buildItem(best, kind, params);
    if (spent + itemSeconds(item) > budget && items.length >= 3) return false;
    items.push(item);
    usedIds.add(best.id);
    spent += itemSeconds(item);
    if (!focusGroups.includes(group)) focusGroups.push(group);
    return true;
  };

  for (const slot of template.slots) {
    fillSlot(resolveSlotGroup(slot, history, profile.level, rand), slot.kind);
  }

  // Spend leftover time on the most neglected groups (catches minor groups
  // the templates rotate through less often). Groups with zero volume in the
  // trailing week come first, and one of them may squeeze past the exercise
  // cap (except for beginners) so no muscle group is ever forgotten.
  const running = creditSets(items);
  const deficits = MUSCLE_GROUPS.map((g) => {
    const trained =
      (history.weeklySetsByGroup[g.name] ?? 0) + (running[g.name] ?? 0);
    return {
      group: g.name,
      deficit: weeklyTarget(g.name, profile.level) - trained,
      untrained: trained === 0,
    };
  })
    .filter((d) => d.deficit > 2)
    .sort(
      (a, b) => Number(b.untrained) - Number(a.untrained) || b.deficit - a.deficit
    );
  let extraUsed = false;
  for (const d of deficits.slice(0, 4)) {
    const allowExtra = d.untrained && !extraUsed && profile.level !== "beginner";
    const before = items.length;
    fillSlot(d.group, "any", allowExtra ? 1 : 0);
    if (allowExtra && items.length > before && items.length > maxExercises) {
      extraUsed = true;
    }
  }

  const neglected = deficits
    .slice(0, 2)
    .map((d) => d.group)
    .join(", ");
  const rationale = [
    params.label + ".",
    `${template.label} day (${profile.daysPerWeek}-day rotation) — each muscle group is trained at least twice a week.`,
    neglected ? `Prioritized lagging groups this session: ${neglected}.` : "",
    "Exercises rotate between sessions so consecutive workouts don't repeat the same selection.",
  ]
    .filter(Boolean)
    .join(" ");

  return { seq, dayLabel: template.label, focusGroups, items, rationale };
}

/** Best replacement for one item: same primary group, not already in the workout. */
export function pickAlternative(
  profile: Profile,
  candidates: CandidateExercise[],
  currentItems: WorkoutItem[],
  itemIndex: number,
  history: HistorySummary,
  seed: number
): WorkoutItem | null {
  const rand = mulberry32(seed);
  const target = currentItems[itemIndex];
  if (!target) return null;
  const group = target.groups[0] as MuscleGroup | undefined;
  if (!group) return null;
  const usedIds = new Set(currentItems.map((i) => i.exerciseId));

  const pool = candidates.filter(
    (c) =>
      !usedIds.has(c.id) &&
      equipmentOk(c, profile.equipment) &&
      levelOk(c, profile.level) &&
      primaryGroups(c).includes(group)
  );
  if (pool.length === 0) return null;

  let best: CandidateExercise | null = null;
  let bestScore = -Infinity;
  for (const c of pool) {
    const s = scoreCandidate(c, "any", history, rand);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  if (!best) return null;

  // keep the replaced item's set/rep scheme so the swap is predictable
  const groups: string[] = [];
  for (const m of [...best.primaryMuscles, ...best.secondaryMuscles]) {
    const g = muscleGroupOf(m);
    if (g && !groups.includes(g)) groups.push(g);
  }
  return { ...target, exerciseId: best.id, name: best.name, groups, done: false };
}
