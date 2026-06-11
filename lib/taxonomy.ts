// Built-in taxonomy for the library. Names are deliberately aligned with
// wger's standard category/muscle/equipment lists so the optional
// "send to wger" export can map by name without translation tables.

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

export interface TaxonomyMuscle {
  /** Anatomical name (matches wger's `name`) */
  name: string;
  /** Everyday gym name shown in the UI */
  nameEn: string;
}

export const MUSCLES: TaxonomyMuscle[] = [
  { name: "Pectoralis major", nameEn: "Chest" },
  { name: "Anterior deltoid", nameEn: "Front delts" },
  { name: "Trapezius", nameEn: "Traps" },
  { name: "Latissimus dorsi", nameEn: "Lats" },
  { name: "Biceps brachii", nameEn: "Biceps" },
  { name: "Brachialis", nameEn: "Brachialis" },
  { name: "Triceps brachii", nameEn: "Triceps" },
  { name: "Rectus abdominis", nameEn: "Abs" },
  { name: "Obliquus externus abdominis", nameEn: "Obliques" },
  { name: "Serratus anterior", nameEn: "Serratus" },
  { name: "Quadriceps femoris", nameEn: "Quads" },
  { name: "Biceps femoris", nameEn: "Hamstrings" },
  { name: "Gluteus maximus", nameEn: "Glutes" },
  { name: "Gastrocnemius", nameEn: "Calves" },
  { name: "Soleus", nameEn: "Soleus" },
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
] as const;

/** Resolve any taxonomy variant ("Biceps", "biceps brachii") to the canonical anatomical name. */
export function canonicalMuscle(input: string): string | null {
  const n = input.trim().toLowerCase();
  const m = MUSCLES.find(
    (x) => x.name.toLowerCase() === n || x.nameEn.toLowerCase() === n
  );
  return m?.name ?? null;
}
