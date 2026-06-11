import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { getExercise } from "@/lib/db";
import { config } from "@/lib/config";
import { streamFile } from "@/lib/stream";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const exercise = getExercise(id);
  if (!exercise?.clipFile) {
    return NextResponse.json({ error: "No video for this exercise" }, { status: 404 });
  }
  const filePath = path.join(
    config.dataDir,
    "exercises",
    path.basename(id),
    path.basename(exercise.clipFile)
  );
  return streamFile(req, filePath, "video/mp4");
}
