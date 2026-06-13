import { test } from "node:test";
import assert from "node:assert/strict";
import {
  creditSets,
  generateWorkout,
  pickAlternative,
  SPLITS,
  type CandidateExercise,
  type HistorySummary,
} from "../programming";
import { MUSCLE_GROUPS, MUSCLES, type MuscleGroup } from "../taxonomy";
import type { Profile, WorkoutItem } from "../types";

// --------------------------------------------------------------- fixture

/** Secondary muscles that realistic compounds for a group also hit. */
const COMPOUND_SECONDARIES: Partial<Record<MuscleGroup, string[]>> = {
  Quads: ["Gluteus maximus", "Adductor magnus"],
  Hamstrings: ["Gluteus maximus", "Erector spinae"],
  Glutes: ["Biceps femoris", "Quadriceps femoris"],
  Chest: ["Triceps brachii", "Anterior deltoid"],
  Back: ["Biceps brachii", "Posterior deltoid"],
  Shoulders: ["Triceps brachii", "Trapezius"],
};

function musclesOf(group: MuscleGroup): string[] {
  return MUSCLES.filter((m) => m.group === group).map((m) => m.name);
}

/** 4 exercises per muscle group: compound/isolation × bodyweight/equipment. */
function buildPool(): CandidateExercise[] {
  const pool: CandidateExercise[] = [];
  let n = 0;
  for (const { name: group } of MUSCLE_GROUPS) {
    const muscles = musclesOf(group);
    const variants: [string, string[], string][] = [
      ["compound", [], "bw"],
      ["compound", ["Barbell"], "barbell"],
      ["isolation", [], "bw"],
      ["isolation", ["Dumbbell"], "dumbbell"],
    ];
    for (const [mechanic, equipment, tag] of variants) {
      pool.push({
        id: `ex-${n}`,
        name: `${group} ${mechanic} ${tag} #${n++}`,
        primaryMuscles: [muscles[0]],
        secondaryMuscles:
          mechanic === "compound" ? COMPOUND_SECONDARIES[group] ?? muscles.slice(1, 2) : [],
        equipment,
        mechanic,
        force: null,
        level: "beginner",
        favorite: false,
        hasMedia: true,
      });
    }
    // extra accessories so the variety engine has alternatives
    for (let i = 0; i < 3; i++) {
      pool.push({
        id: `ex-${n}`,
        name: `${group} accessory #${n++}`,
        primaryMuscles: [muscles[muscles.length > 1 ? 1 : 0]],
        secondaryMuscles: [],
        equipment: ["Dumbbell"],
        mechanic: "isolation",
        force: null,
        level: "intermediate",
        favorite: false,
        hasMedia: false,
      });
    }
  }
  return pool;
}

const POOL = buildPool();

function profileWith(overrides: Partial<Profile>): Profile {
  return {
    goal: "hypertrophy",
    level: "intermediate",
    daysPerWeek: 4,
    sessionMinutes: 60,
    equipment: ["Barbell", "Dumbbell"],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const emptyHistory = (): HistorySummary => ({
  lastSeq: null,
  recentExerciseIds: new Map(),
  weeklySetsByGroup: {},
});

/** Generate one full split cycle, feeding each workout back into history. */
function generateCycle(profile: Profile, seedBase = 1) {
  const split = SPLITS[profile.daysPerWeek];
  const history = emptyHistory();
  const workouts = [];
  for (let i = 0; i < split.length; i++) {
    const w = generateWorkout(profile, POOL, history, seedBase + i);
    workouts.push(w);
    history.lastSeq = w.seq;
    const ids = new Map<string, number>();
    for (const [id, ago] of history.recentExerciseIds) ids.set(id, ago + 1);
    for (const item of w.items) ids.set(item.exerciseId, 1);
    history.recentExerciseIds = ids;
    const credit = creditSets(w.items);
    for (const [g, sets] of Object.entries(credit)) {
      history.weeklySetsByGroup[g] = (history.weeklySetsByGroup[g] ?? 0) + sets;
    }
  }
  return workouts;
}

// ----------------------------------------------------------------- tests

test("only available equipment is prescribed", () => {
  const profile = profileWith({ equipment: ["Dumbbell"] });
  for (const w of generateCycle(profile)) {
    for (const item of w.items) {
      const ex = POOL.find((c) => c.id === item.exerciseId)!;
      assert.ok(
        ex.equipment.every((e) => e === "Dumbbell"),
        `${ex.name} needs ${ex.equipment.join(",")} but only Dumbbell is available`
      );
    }
  }
});

test("bodyweight-only profiles get bodyweight-only workouts", () => {
  const profile = profileWith({ equipment: [] });
  for (const w of generateCycle(profile)) {
    assert.ok(w.items.length >= 3, `workout too small: ${w.items.length} items`);
    for (const item of w.items) {
      const ex = POOL.find((c) => c.id === item.exerciseId)!;
      assert.deepEqual(ex.equipment, [], `${ex.name} requires equipment`);
    }
  }
});

test("every major muscle group is trained on >=2 days per cycle (all splits)", () => {
  for (const days of [2, 3, 4, 5, 6]) {
    const profile = profileWith({ daysPerWeek: days });
    const workouts = generateCycle(profile, days * 100);
    const majorGroups = MUSCLE_GROUPS.filter((g) => g.major).map((g) => g.name);
    for (const group of majorGroups) {
      const daysHit = workouts.filter((w) =>
        w.items.some((item) => item.groups.includes(group))
      ).length;
      assert.ok(
        daysHit >= 2,
        `${group} only trained on ${daysHit} day(s) of the ${days}-day cycle`
      );
    }
  }
});

test("minor groups accumulate volume over a cycle", () => {
  const profile = profileWith({ daysPerWeek: 5, sessionMinutes: 75 });
  const workouts = generateCycle(profile, 7);
  const credit: Record<string, number> = {};
  for (const w of workouts) {
    for (const [g, sets] of Object.entries(creditSets(w.items))) {
      credit[g] = (credit[g] ?? 0) + sets;
    }
  }
  // The neglect boost should pull in at least most minor groups each cycle
  const minorHit = MUSCLE_GROUPS.filter((g) => !g.major).filter(
    (g) => (credit[g.name] ?? 0) > 0
  );
  assert.ok(
    minorHit.length >= 5,
    `only ${minorHit.length} minor groups got volume: ${minorHit.map((g) => g.name).join(", ")}`
  );
});

test("every muscle group is trained within two weeks (3-5 day splits)", () => {
  for (const days of [3, 4, 5]) {
    const profile = profileWith({ daysPerWeek: days, sessionMinutes: 75 });
    const history = emptyHistory();
    const trained = new Set<string>();
    // rolling window of the last `days` workouts ≈ the trailing-7-days credit
    const window: WorkoutItem[][] = [];
    for (let i = 0; i < days * 2; i++) {
      const w = generateWorkout(profile, POOL, history, 1000 * days + i);
      for (const item of w.items) for (const g of item.groups) trained.add(g);

      window.push(w.items);
      if (window.length > days) window.shift();
      history.lastSeq = w.seq;
      const ids = new Map<string, number>();
      for (const [id, ago] of history.recentExerciseIds) ids.set(id, ago + 1);
      for (const item of w.items) ids.set(item.exerciseId, 1);
      history.recentExerciseIds = ids;
      history.weeklySetsByGroup = {};
      for (const items of window) {
        for (const [g, s] of Object.entries(creditSets(items))) {
          history.weeklySetsByGroup[g] = (history.weeklySetsByGroup[g] ?? 0) + s;
        }
      }
    }
    for (const g of MUSCLE_GROUPS) {
      assert.ok(
        trained.has(g.name),
        `${g.name} never trained across 2 weeks of the ${days}-day split`
      );
    }
  }
});

test("rep ranges and set counts follow the goal", () => {
  const cases: [Profile["goal"], number, number][] = [
    ["strength", 3, 6],
    ["hypertrophy", 6, 12],
    ["endurance", 12, 20],
    ["general", 8, 12],
  ];
  for (const [goal, repsMin, repsMax] of cases) {
    const w = generateWorkout(profileWith({ goal }), POOL, emptyHistory(), 42);
    for (const item of w.items) {
      assert.equal(item.repsMin, repsMin, `${goal}: wrong repsMin`);
      assert.equal(item.repsMax, repsMax, `${goal}: wrong repsMax`);
      assert.ok(item.sets >= 2 && item.sets <= 4, `${goal}: ${item.sets} sets out of range`);
      assert.ok(item.rir >= 1 && item.rir <= 3, `${goal}: RIR ${item.rir} out of range`);
    }
  }
});

test("session fits the time budget", () => {
  const profile = profileWith({ sessionMinutes: 45 });
  const w = generateWorkout(profile, POOL, emptyHistory(), 5);
  const estimate = w.items.reduce((sum, i) => sum + i.sets * (40 + i.restSec), 0);
  assert.ok(
    estimate <= profile.sessionMinutes * 60 - 300 || w.items.length <= 3,
    `estimated ${Math.round(estimate / 60)}min exceeds 45min budget`
  );
});

test("beginners never get advanced exercises and at most 5 exercises", () => {
  const pool = [
    ...POOL,
    ...POOL.slice(0, 10).map((c, i) => ({
      ...c,
      id: `adv-${i}`,
      name: `Advanced ${c.name}`,
      level: "advanced",
    })),
  ];
  const w = generateWorkout(profileWith({ level: "beginner" }), pool, emptyHistory(), 9);
  assert.ok(w.items.length <= 5, `beginner got ${w.items.length} exercises`);
  for (const item of w.items) {
    assert.ok(!item.exerciseId.startsWith("adv-"), `beginner was given ${item.name}`);
  }
});

test("consecutive same-label workouts differ in exercise selection", () => {
  const profile = profileWith({ daysPerWeek: 6 });
  const history = emptyHistory();
  const first = generateWorkout(profile, POOL, history, 11); // Push (seq 0)
  history.lastSeq = 2; // pretend Pull and Legs happened in between
  for (const item of first.items) history.recentExerciseIds.set(item.exerciseId, 3);
  for (const [g, s] of Object.entries(creditSets(first.items))) {
    history.weeklySetsByGroup[g] = s;
  }
  const second = generateWorkout(profile, POOL, history, 12); // Push B (seq 3)
  assert.equal(second.dayLabel, "Push B");
  const firstIds = new Set(first.items.map((i) => i.exerciseId));
  const overlap = second.items.filter((i) => firstIds.has(i.exerciseId)).length;
  assert.ok(
    overlap < second.items.length,
    `Push B repeated all ${overlap} exercises from Push A`
  );
});

test("same seed reproduces the same workout", () => {
  const a = generateWorkout(profileWith({}), POOL, emptyHistory(), 77);
  const b = generateWorkout(profileWith({}), POOL, emptyHistory(), 77);
  assert.deepEqual(
    a.items.map((i) => i.exerciseId),
    b.items.map((i) => i.exerciseId)
  );
});

test("pickAlternative swaps within the same muscle group, keeping the scheme", () => {
  const profile = profileWith({});
  const w = generateWorkout(profile, POOL, emptyHistory(), 21);
  const replaced: WorkoutItem = w.items[0];
  const alt = pickAlternative(profile, POOL, w.items, 0, emptyHistory(), 99);
  assert.ok(alt, "no alternative found");
  assert.notEqual(alt!.exerciseId, replaced.exerciseId);
  assert.equal(alt!.groups[0], replaced.groups[0]);
  assert.equal(alt!.sets, replaced.sets);
  assert.equal(alt!.repsMin, replaced.repsMin);
  assert.ok(!w.items.some((i, idx) => idx !== 0 && i.exerciseId === alt!.exerciseId));
});
