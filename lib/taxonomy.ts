// Built-in taxonomy for the library. Muscle names are aligned with wger's
// standard lists where the muscle exists there, so the optional "send to
// wger" export can map by name; muscles wger doesn't track (forearms,
// erector spinae, …) simply don't map on export, which lib/wger.ts already
// tolerates.

export const CATEGORIES = [
  "Abs",
  "Arms",
  "Back",
  "Calves",
  "Cardio",
  "Chest",
  "Legs",
  "Shoulders",
] as const;

/**
 * Programming granularity: the routine generator plans in muscle groups,
 * while exercises carry specific muscles. `major` groups get full weekly
 * volume targets; `minor` groups get smaller accessory targets.
 */
export const MUSCLE_GROUPS = [
  { name: "Chest", major: true },
  { name: "Back", major: true },
  { name: "Shoulders", major: true },
  { name: "Quads", major: true },
  { name: "Hamstrings", major: true },
  { name: "Glutes", major: true },
  { name: "Biceps", major: false },
  { name: "Triceps", major: false },
  { name: "Forearms", major: false },
  { name: "Calves", major: false },
  { name: "Core", major: false },
  { name: "Lower back", major: false },
  { name: "Adductors", major: false },
  { name: "Abductors", major: false },
  { name: "Neck", major: false },
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]["name"];

export interface TaxonomyMuscle {
  /** Anatomical name (matches wger's `name` where the muscle exists there) */
  name: string;
  /** Everyday gym name shown in the UI */
  nameEn: string;
  /** Programming group this muscle belongs to */
  group: MuscleGroup;
}

export const MUSCLES: TaxonomyMuscle[] = [
  { name: "Pectoralis major", nameEn: "Chest", group: "Chest" },
  { name: "Latissimus dorsi", nameEn: "Lats", group: "Back" },
  { name: "Trapezius", nameEn: "Traps", group: "Back" },
  { name: "Rhomboids", nameEn: "Rhomboids", group: "Back" },
  { name: "Anterior deltoid", nameEn: "Front delts", group: "Shoulders" },
  { name: "Lateral deltoid", nameEn: "Side delts", group: "Shoulders" },
  { name: "Posterior deltoid", nameEn: "Rear delts", group: "Shoulders" },
  { name: "Biceps brachii", nameEn: "Biceps", group: "Biceps" },
  { name: "Brachialis", nameEn: "Brachialis", group: "Biceps" },
  { name: "Triceps brachii", nameEn: "Triceps", group: "Triceps" },
  { name: "Forearm flexors", nameEn: "Forearms", group: "Forearms" },
  { name: "Rectus abdominis", nameEn: "Abs", group: "Core" },
  { name: "Obliquus externus abdominis", nameEn: "Obliques", group: "Core" },
  { name: "Serratus anterior", nameEn: "Serratus", group: "Core" },
  { name: "Erector spinae", nameEn: "Lower back", group: "Lower back" },
  { name: "Quadriceps femoris", nameEn: "Quads", group: "Quads" },
  { name: "Biceps femoris", nameEn: "Hamstrings", group: "Hamstrings" },
  { name: "Gluteus maximus", nameEn: "Glutes", group: "Glutes" },
  { name: "Gluteus medius", nameEn: "Glute medius", group: "Abductors" },
  { name: "Adductor magnus", nameEn: "Adductors", group: "Adductors" },
  { name: "Gastrocnemius", nameEn: "Calves", group: "Calves" },
  { name: "Soleus", nameEn: "Soleus", group: "Calves" },
  { name: "Sternocleidomastoid", nameEn: "Neck", group: "Neck" },
];

export const EQUIPMENT = [
  "Barbell",
  "Dumbbell",
  "Kettlebell",
  "SZ-Bar",
  "Bench",
  "Incline bench",
  "Pull-up bar",
  "Gym mat",
  "Swiss Ball",
  "Resistance band",
  "Cable",
  "Machine",
  "Smith machine",
  "Medicine ball",
  "Foam roller",
  "Other",
] as const;

/** Resolve any taxonomy variant ("Biceps", "biceps brachii") to the canonical anatomical name. */
export function canonicalMuscle(input: string): string | null {
  const n = input.trim().toLowerCase();
  const m = MUSCLES.find(
    (x) => x.name.toLowerCase() === n || x.nameEn.toLowerCase() === n
  );
  return m?.name ?? null;
}

export function muscleGroupOf(muscleName: string): MuscleGroup | null {
  const n = muscleName.trim().toLowerCase();
  const m = MUSCLES.find(
    (x) => x.name.toLowerCase() === n || x.nameEn.toLowerCase() === n
  );
  return m?.group ?? null;
}

/** Distinct muscle groups an exercise hits, primary muscles first. */
export function groupsOfMuscles(muscleNames: string[]): MuscleGroup[] {
  const groups: MuscleGroup[] = [];
  for (const name of muscleNames) {
    const g = muscleGroupOf(name);
    if (g && !groups.includes(g)) groups.push(g);
  }
  return groups;
}
