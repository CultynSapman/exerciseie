import { NextRequest, NextResponse } from "next/server";
import { listJobs } from "@/lib/db";
import { startJob } from "@/lib/pipeline";
import { missingConfig } from "@/lib/config";

export async function POST(req: NextRequest) {
  const missing = missingConfig();
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing configuration: ${missing.join(", ")}` },
      { status: 503 }
    );
  }

  let url: unknown;
  try {
    ({ url } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof url !== "string" || !/^https?:\/\//i.test(url.trim())) {
    return NextResponse.json({ error: "Provide a valid http(s) video URL" }, { status: 400 });
  }

  const job = startJob(url.trim());
  return NextResponse.json(job, { status: 201 });
}

export async function GET() {
  return NextResponse.json(listJobs(30));
}
