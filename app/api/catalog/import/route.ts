import { NextRequest, NextResponse } from "next/server";
import { getCatalogProgress, startCatalogImport } from "@/lib/catalog";
import { countExercisesBySource } from "@/lib/db";

export async function GET() {
  return NextResponse.json({
    "free-exercise-db": getCatalogProgress("free-exercise-db"),
    wger: getCatalogProgress("wger"),
    counts: countExercisesBySource(),
  });
}

export async function POST(req: NextRequest) {
  let source: unknown;
  try {
    ({ source } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (source !== "free-exercise-db" && source !== "wger") {
    return NextResponse.json(
      { error: "source must be 'free-exercise-db' or 'wger'" },
      { status: 400 }
    );
  }
  try {
    const progress = startCatalogImport(source);
    return NextResponse.json(progress, { status: 202 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 409 }
    );
  }
}
