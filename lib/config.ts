import path from "node:path";

export const config = {
  wgerUrl: (process.env.WGER_URL ?? "").replace(/\/+$/, ""),
  wgerApiKey: process.env.WGER_API_KEY ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  extraPrompt: process.env.EXTRA_PROMPT ?? "",
  autoSave: (process.env.AUTO_SAVE ?? "false").toLowerCase() === "true",
  ytdlpCookiesFile: process.env.YTDLP_COOKIES_FILE ?? "",
  ytdlpPath: process.env.YTDLP_PATH ?? "yt-dlp",
  ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
  dataDir: path.resolve(process.env.DATA_DIR ?? "./data"),
};

export function jobDir(jobId: string): string {
  return path.join(config.dataDir, "jobs", jobId);
}

export function missingConfig(): string[] {
  const missing: string[] = [];
  if (!config.geminiApiKey) missing.push("GEMINI_API_KEY");
  return missing;
}

/** wger is an optional export target, not a requirement. */
export function wgerConfigured(): boolean {
  return Boolean(config.wgerUrl && config.wgerApiKey);
}
