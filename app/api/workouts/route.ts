import { NextResponse } from "next/server";
import { listWorkouts } from "@/lib/db";

export async function GET() {
  return NextResponse.json(listWorkouts(20));
}
