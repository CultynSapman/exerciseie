import fs from "node:fs/promises";
import path from "node:path";
import { config, jobDir } from "./config";
import { run } from "./exec";
import type { VideoMetadata } from "./types";

export interface DownloadResult {
  videoPath: string;
  videoFile: string;
  metadata: VideoMetadata;
}

export async function downloadVideo(jobId: string, url: string): Promise<DownloadResult> {
  const dir = jobDir(jobId);
  await fs.mkdir(dir, { recursive: true });

  const args = [
    "--no-playlist",
    "-f", "bv*[height<=720]+ba/b[height<=720]/b",
    "--merge-output-format", "mp4",
    "--write-info-json",
    "--no-progress",
    "-o", path.join(dir, "source.%(ext)s"),
  ];
  if (config.ytdlpCookiesFile) {
    args.push("--cookies", config.ytdlpCookiesFile);
  }
  args.push(url);

  await run(config.ytdlpPath, args);

  const files = await fs.readdir(dir);
  const videoFile = files.find(
    (f) => f.startsWith("source.") && !f.endsWith(".json") && !f.endsWith(".part")
  );
  if (!videoFile) {
    throw new Error("yt-dlp finished but no video file was found");
  }

  let metadata: VideoMetadata = {
    title: "",
    description: "",
    uploader: "",
    webpageUrl: url,
  };
  try {
    const raw = await fs.readFile(path.join(dir, "source.info.json"), "utf8");
    const info = JSON.parse(raw);
    metadata = {
      title: info.title ?? "",
      description: info.description ?? "",
      uploader: info.uploader ?? info.channel ?? "",
      webpageUrl: info.webpage_url ?? url,
      thumbnail: info.thumbnail ?? undefined,
      duration: typeof info.duration === "number" ? info.duration : undefined,
    };
  } catch {
    // metadata is best-effort; the video itself is what matters
  }

  return { videoPath: path.join(dir, videoFile), videoFile, metadata };
}
