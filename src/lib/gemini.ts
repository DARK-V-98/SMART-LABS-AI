import { GoogleGenAI, Type } from "@google/genai";

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  return key;
}

let client: GoogleGenAI | null = null;
export function gemini(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: getApiKey() });
  return client;
}

export const MODELS = {
  text: "gemini-2.5-pro",
  image: "imagen-4.0-generate-001",
  video: "veo-3.0-generate-001",
  tts: "gemini-2.5-flash-preview-tts",
};

export async function generateSceneImage(prompt: string): Promise<Buffer> {
  const res = await gemini().models.generateImages({
    model: MODELS.image,
    prompt,
    config: { numberOfImages: 1, aspectRatio: "16:9" },
  });
  const img = res.generatedImages?.[0]?.image?.imageBytes;
  if (!img) throw new Error("Imagen returned no image");
  return Buffer.from(img, "base64");
}

export async function generateSceneVideo(prompt: string): Promise<Buffer> {
  let operation = await gemini().models.generateVideos({
    model: MODELS.video,
    prompt,
  });

  while (!operation.done) {
    await new Promise((r) => setTimeout(r, 8000));
    operation = await gemini().operations.getVideosOperation({ operation });
  }

  const video = operation.response?.generatedVideos?.[0]?.video;
  if (!video?.videoBytes) throw new Error("Veo returned no video");
  return Buffer.from(video.videoBytes, "base64");
}

export async function generateVoiceover(text: string): Promise<Buffer> {
  const res = await gemini().models.generateContent({
    model: MODELS.tts,
    contents: [{ role: "user", parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
      },
    },
  });

  const data = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!data) throw new Error("Gemini TTS returned no audio");
  return Buffer.from(data, "base64");
}

export const storyboardResponseSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    brand: { type: Type.STRING },
    summary: { type: Type.STRING },
    scenes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          order: { type: Type.INTEGER },
          durationSeconds: { type: Type.NUMBER },
          visualPrompt: { type: Type.STRING },
          voiceoverText: { type: Type.STRING },
          onScreenText: { type: Type.STRING },
          transition: { type: Type.STRING, enum: ["cut", "fade", "wipe", "zoom"] },
          cameraMove: {
            type: Type.STRING,
            enum: ["static", "pan-left", "pan-right", "zoom-in", "zoom-out"],
          },
          assetType: { type: Type.STRING, enum: ["image", "video"] },
        },
        required: [
          "id",
          "order",
          "durationSeconds",
          "visualPrompt",
          "voiceoverText",
          "transition",
          "cameraMove",
          "assetType",
        ],
      },
    },
  },
  required: ["title", "brand", "summary", "scenes"],
};
