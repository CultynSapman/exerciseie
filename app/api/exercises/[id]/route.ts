import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { deleteExercise, getExercise, updateExercise } from "@/lib/db";
import { config } from "@/lib/config";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const exercise = getExercise(id);
  if (!exercise) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }
  return NextResponse.json(exercise);
}

const EDITABLE = [
  "name",
  "aliases",
  "description",
  "category",
  "primaryMuscles",
  "secondaryMuscles",
  "equipment",
  "favorite",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!getExercise(id)) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (key in body) patch[key] = body[key];
  }
  if (typeof patch.name === "string" && patch.name.trim() === "") {
    return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
  }

  const updated = updateExercise(id, patch);
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existed = deleteExercise(id);
  if (!existed) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }
  // best-effort cleanup of the clip + thumbnail
  const dir = path.join(config.dataDir, "exercises", path.basename(id));
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  return NextResponse.json({ ok: true });
}
