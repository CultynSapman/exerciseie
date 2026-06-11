import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { getJob } from "@/lib/db";
import { jobDir } from "@/lib/config";
import { streamFile } from "@/lib/stream";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = getJob(id);
  if (!job?.videoFile) {
    return NextResponse.json({ error: "No video for this job" }, { status: 404 });
  }
  const filePath = path.join(jobDir(id), path.basename(job.videoFile));
  return streamFile(req, filePath, "video/mp4");
}
