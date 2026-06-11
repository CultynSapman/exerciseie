import { NextRequest, NextResponse } from "next/server";
import { listExercises } from "@/lib/db";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const exercises = listExercises({
    q: p.get("q") ?? undefined,
    category: p.get("category") ?? undefined,
    muscle: p.get("muscle") ?? undefined,
    equipment: p.get("equipment") ?? undefined,
    favorite: p.get("favorite") === "true",
  });
  return NextResponse.json(exercises);
}
