import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { run } from "./exec";

/**
 * Cut [startSec, endSec] out of the source video as an H.264 mp4 suitable
 * for uploading to wger. If the range covers (almost) the whole video the
 * source file is copied as-is to skip a pointless re-encode.
 */
export async function clipVideo(
  sourcePath: string,
  outPath: string,
  startSec: number,
  endSec: number,
  totalDuration?: number
): Promise<string> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const start = Math.max(0, startSec);
  const coversWholeVideo =
    totalDuration !== undefined && start <= 0.5 && endSec >= totalDuration - 0.5;
  if (coversWholeVideo && sourcePath.toLowerCase().endsWith(".mp4")) {
    await fs.copyFile(sourcePath, outPath);
    return outPath;
  }

  const duration = Math.max(0.5, endSec - start);
  await run(config.ffmpegPath, [
    "-y",
    "-ss", start.toFixed(2),
    "-i", sourcePath,
    "-t", duration.toFixed(2),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "96k",
    "-movflags", "+faststart",
    outPath,
  ]);
  return outPath;
}

/** Grab a single frame as a JPEG thumbnail for library cards. */
export async function makeThumbnail(
  sourcePath: string,
  outPath: string,
  atSec: number
): Promise<string> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await run(config.ffmpegPath, [
    "-y",
    "-ss", Math.max(0, atSec).toFixed(2),
    "-i", sourcePath,
    "-frames:v", "1",
    "-vf", "scale=480:-2",
    "-q:v", "4",
    outPath,
  ]);
  return outPath;
}
