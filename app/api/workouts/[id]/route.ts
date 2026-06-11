import { NextRequest, NextResponse } from "next/server";
import { setWorkoutStatus, swapItem, toggleItem } from "@/lib/coach";
import { getWorkout } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const workout = getWorkout(id);
  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }
  return NextResponse.json(workout);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.action === "swap" && typeof body.itemIndex === "number") {
      return NextResponse.json(swapItem(id, body.itemIndex));
    }
    if (body.action === "toggle" && typeof body.itemIndex === "number") {
      return NextResponse.json(toggleItem(id, body.itemIndex, Boolean(body.done)));
    }
    if (body.action === "status" && (body.status === "completed" || body.status === "skipped")) {
      return NextResponse.json(setWorkoutStatus(id, body.status));
    }
    return NextResponse.json(
      { error: "Body must be {action: 'swap'|'toggle'|'status', …}" },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found") ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
