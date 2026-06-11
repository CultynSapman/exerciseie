import { NextResponse } from "next/server";
import { regenerateToday } from "@/lib/coach";

export async function POST() {
  return NextResponse.json(regenerateToday());
}
