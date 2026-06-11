import { NextRequest, NextResponse } from "next/server";
import { listExercises } from "@/lib/db";
import type { ExerciseSource } from "@/lib/types";

const SOURCES = new Set(["video", "free-exercise-db", "wger"]);

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const source = p.get("source");
  const exercises = listExercises({
    q: p.get("q") ?? undefined,
    category: p.get("category") ?? undefined,
    muscle: p.get("muscle") ?? undefined,
    equipment: p.get("equipment") ?? undefined,
    favorite: p.get("favorite") === "true",
    source: source && SOURCES.has(source) ? (source as ExerciseSource) : undefined,
  });
  return NextResponse.json(exercises);
}
