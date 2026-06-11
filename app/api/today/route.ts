import { NextResponse } from "next/server";
import { getOrCreateToday } from "@/lib/coach";

export async function GET() {
  return NextResponse.json(getOrCreateToday());
}
