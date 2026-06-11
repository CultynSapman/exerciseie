import {
  GoogleGenAI,
  Type,
  createPartFromUri,
  createUserContent,
  type Schema,
} from "@google/genai";
import { config } from "./config";
import { CATEGORIES, EQUIPMENT, MUSCLES } from "./taxonomy";
import type { VideoMetadata } from "./types";

export interface RawExtractedExercise {
  name: string;
  aliases?: string[];
  description: string;
  category: string;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  equipment?: string[];
  startSec: number;
  endSec: number;
}

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    exercises: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: "Common English name of the exercise, e.g. 'Romanian Deadlift'",
          },
          aliases: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Other common names for the same exercise",
          },
          description: {
            type: Type.STRING,
            description:
              "How to perform the exercise in 2-4 sentences, including form cues from the narration or on-screen text. At least 40 characters.",
          },
          category: { type: Type.STRING },
          primaryMuscles: { type: Type.ARRAY, items: { type: Type.STRING } },
          secondaryMuscles: { type: Type.ARRAY, items: { type: Type.STRING } },
          equipment: { type: Type.ARRAY, items: { type: Type.STRING } },
          startSec: {
            type: Type.NUMBER,
            description: "Second in the video where the demonstration of this exercise starts",
          },
          endSec: {
            type: Type.NUMBER,
            description: "Second in the video where the demonstration of this exercise ends",
          },
        },
        required: ["name", "description", "category", "startSec", "endSec"],
      },
    },
  },
  required: ["exercises"],
};

function buildPrompt(metadata: VideoMetadata): string {
  const categories = CATEGORIES.join(", ");
  const muscles = MUSCLES.map((m) =>
    m.nameEn !== m.name ? `${m.name} (${m.nameEn})` : m.name
  ).join(", ");
  const equipment = EQUIPMENT.join(", ");

  const lines = [
    "You are an expert strength & conditioning coach. Analyze this exercise/fitness video and extract every distinct exercise that is demonstrated.",
    "",
    "Rules:",
    "- One entry per distinct exercise. Ignore intros, outros, talking-head segments and sponsor reads.",
    "- Pay close attention to on-screen text overlays; many fitness videos have no narration and explain everything in text.",
    "- name: the most common English name for the exercise.",
    "- description: 2-4 plain-text sentences explaining how to perform it, including any form cues given in the video. Minimum 40 characters.",
    `- category: exactly one of: ${categories}.`,
    `- primaryMuscles / secondaryMuscles: pick only from this list, using the exact names as written (the part before any parenthesis): ${muscles}. Leave empty if unsure.`,
    `- equipment: pick only from this list: ${equipment}. Use an empty list for bodyweight exercises.`,
    "- startSec / endSec: the time range (in seconds from the start of the video) where this exercise is being demonstrated, so the segment can be clipped out as a reference video.",
    "",
    "Context from the video post:",
    `Title: ${metadata.title || "(none)"}`,
    `Uploader: ${metadata.uploader || "(unknown)"}`,
    `Caption/description: ${metadata.description || "(none)"}`,
  ];
  if (config.extraPrompt) {
    lines.push("", `Additional instructions: ${config.extraPrompt}`);
  }
  return lines.join("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function extractExercises(
  videoPath: string,
  metadata: VideoMetadata
): Promise<RawExtractedExercise[]> {
  if (!config.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

  let file = await ai.files.upload({
    file: videoPath,
    config: { mimeType: "video/mp4" },
  });
  try {
    const started = Date.now();
    while (file.state === "PROCESSING") {
      if (Date.now() - started > 5 * 60_000) {
        throw new Error("Timed out waiting for Gemini to process the uploaded video");
      }
      await sleep(2000);
      file = await ai.files.get({ name: file.name! });
    }
    if (file.state === "FAILED") {
      throw new Error("Gemini failed to process the uploaded video");
    }

    const response = await ai.models.generateContent({
      model: config.geminiModel,
      contents: createUserContent([
        createPartFromUri(file.uri!, file.mimeType ?? "video/mp4"),
        buildPrompt(metadata),
      ]),
      config: {
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.2,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Gemini returned an empty response");
    }
    const parsed = JSON.parse(text) as { exercises?: RawExtractedExercise[] };
    if (!parsed.exercises || !Array.isArray(parsed.exercises)) {
      throw new Error("Gemini response did not contain an exercises array");
    }
    return parsed.exercises;
  } finally {
    if (file.name) {
      ai.files.delete({ name: file.name }).catch(() => {});
    }
  }
}
