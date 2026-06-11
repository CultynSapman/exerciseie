import { NextResponse } from "next/server";
import { CATEGORIES, EQUIPMENT, MUSCLES } from "@/lib/taxonomy";
import { wgerConfigured } from "@/lib/config";
import type { Taxonomy } from "@/lib/types";

export async function GET() {
  const taxonomy: Taxonomy = {
    categories: [...CATEGORIES],
    muscles: MUSCLES,
    equipment: [...EQUIPMENT],
    wgerConfigured: wgerConfigured(),
  };
  return NextResponse.json(taxonomy);
}
