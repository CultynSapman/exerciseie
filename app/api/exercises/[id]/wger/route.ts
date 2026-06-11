import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { getExercise, updateExercise } from "@/lib/db";
import { config, wgerConfigured } from "@/lib/config";
import { exportExerciseToWger } from "@/lib/wger";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!wgerConfigured()) {
    return NextResponse.json(
      { error: "wger export is not configured (set WGER_URL and WGER_API_KEY)" },
      { status: 503 }
    );
  }

  const { id } = await params;
  const exercise = getExercise(id);
  if (!exercise) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }
  if (exercise.wgerUrl) {
    return NextResponse.json(
      { error: "Already exported to wger", wgerUrl: exercise.wgerUrl },
      { status: 409 }
    );
  }

  const clipPath = exercise.clipFile
    ? path.join(config.dataDir, "exercises", path.basename(id), path.basename(exercise.clipFile))
    : null;

  try {
    const result = await exportExerciseToWger(exercise, clipPath);
    const updated = updateExercise(id, { wgerId: result.wgerId, wgerUrl: result.wgerUrl });
    return NextResponse.json({ ...updated, videoUploaded: result.videoUploaded });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
