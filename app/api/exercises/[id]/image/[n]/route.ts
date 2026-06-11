import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { getExercise } from "@/lib/db";
import { config } from "@/lib/config";
import { imageContentType, streamFile } from "@/lib/stream";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; n: string }> }
) {
  const { id, n } = await params;
  const exercise = getExercise(id);
  const index = Number.parseInt(n, 10);
  const file = exercise?.images[index];
  if (!file) {
    return NextResponse.json({ error: "No such image" }, { status: 404 });
  }
  const filePath = path.join(
    config.dataDir,
    "exercises",
    path.basename(id),
    path.basename(file)
  );
  return streamFile(req, filePath, imageContentType(file));
}
