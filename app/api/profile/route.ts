import { NextRequest, NextResponse } from "next/server";
import { getProfile, saveProfile } from "@/lib/db";
import { EQUIPMENT } from "@/lib/taxonomy";

const GOALS = new Set(["strength", "hypertrophy", "endurance", "general"]);
const LEVELS = new Set(["beginner", "intermediate", "advanced"]);

export async function GET() {
  return NextResponse.json(getProfile());
}

export async function PUT(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const goal = String(body.goal ?? "");
  const level = String(body.level ?? "");
  const daysPerWeek = Number(body.daysPerWeek);
  const sessionMinutes = Number(body.sessionMinutes);
  const equipment = Array.isArray(body.equipment) ? body.equipment.map(String) : null;

  if (!GOALS.has(goal)) {
    return NextResponse.json({ error: "Invalid goal" }, { status: 400 });
  }
  if (!LEVELS.has(level)) {
    return NextResponse.json({ error: "Invalid level" }, { status: 400 });
  }
  if (!Number.isInteger(daysPerWeek) || daysPerWeek < 2 || daysPerWeek > 6) {
    return NextResponse.json({ error: "daysPerWeek must be 2-6" }, { status: 400 });
  }
  if (!Number.isFinite(sessionMinutes) || sessionMinutes < 15 || sessionMinutes > 240) {
    return NextResponse.json({ error: "sessionMinutes must be 15-240" }, { status: 400 });
  }
  if (!equipment) {
    return NextResponse.json({ error: "equipment must be an array" }, { status: 400 });
  }
  const validEquipment = equipment.filter((e) =>
    (EQUIPMENT as readonly string[]).includes(e)
  );

  const profile = saveProfile({
    goal: goal as "strength" | "hypertrophy" | "endurance" | "general",
    level: level as "beginner" | "intermediate" | "advanced",
    daysPerWeek,
    sessionMinutes: Math.round(sessionMinutes),
    equipment: validEquipment,
  });
  return NextResponse.json(profile);
}
