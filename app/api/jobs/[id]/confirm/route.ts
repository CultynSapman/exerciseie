import { NextRequest, NextResponse } from "next/server";
import { confirmJob } from "@/lib/pipeline";
import type { ExtractedExercise } from "@/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let exercises: ExtractedExercise[];
  try {
    const body = await req.json();
    exercises = body.exercises;
    if (!Array.isArray(exercises)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Body must contain an exercises array" }, { status: 400 });
  }

  try {
    const job = confirmJob(id, exercises);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json(job);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 409 }
    );
  }
}
