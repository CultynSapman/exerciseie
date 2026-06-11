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
  if (!exercise?.thumbFile) {
    return NextResponse.json({ error: "No thumbnail for this exercise" }, { status: 404 });
  }
  const filePath = path.join(
    config.dataDir,
    "exercises",
    path.basename(id),
    path.basename(exercise.thumbFile)
  );
  return streamFile(req, filePath, "image/jpeg");
}
