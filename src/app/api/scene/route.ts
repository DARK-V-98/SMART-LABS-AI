import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  generateSceneImage,
  generateSceneVideo,
  generateVoiceover,
} from "@/lib/gemini";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { pcm16ToWav } from "@/lib/wav";
import { Scene, Storyboard } from "@/types/storyboard";

const SceneGenInputSchema = z.object({
  projectId: z.string(),
  sceneId: z.string(),
});

async function uploadAsset(
  projectId: string,
  sceneId: string,
  filename: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const bucket = adminStorage().bucket();
  const path = `projects/${projectId}/scenes/${sceneId}/${filename}`;
  const file = bucket.file(path);
  await file.save(buffer, { contentType });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${path}`;
}

export async function POST(req: NextRequest) {
  try {
    const { projectId, sceneId } = SceneGenInputSchema.parse(await req.json());

    const projectRef = adminDb().collection("projects").doc(projectId);
    const projectDoc = await projectRef.get();
    if (!projectDoc.exists) {
      return NextResponse.json({ error: "project not found" }, { status: 404 });
    }

    const storyboard = projectDoc.data()!.storyboard as Storyboard;
    const sceneIndex = storyboard.scenes.findIndex((s: Scene) => s.id === sceneId);
    if (sceneIndex === -1) {
      return NextResponse.json({ error: "scene not found" }, { status: 404 });
    }

    const scene = storyboard.scenes[sceneIndex];
    storyboard.scenes[sceneIndex] = { ...scene, status: "generating" };
    await projectRef.set({ storyboard }, { merge: true });

    const [assetBuffer, voiceoverBuffer] = await Promise.all([
      scene.assetType === "video"
        ? generateSceneVideo(scene.visualPrompt)
        : generateSceneImage(scene.visualPrompt),
      generateVoiceover(scene.voiceoverText),
    ]);

    const [assetUrl, voiceoverUrl] = await Promise.all([
      uploadAsset(
        projectId,
        sceneId,
        scene.assetType === "video" ? "visual.mp4" : "visual.png",
        assetBuffer,
        scene.assetType === "video" ? "video/mp4" : "image/png"
      ),
      uploadAsset(
        projectId,
        sceneId,
        "voiceover.wav",
        pcm16ToWav(voiceoverBuffer),
        "audio/wav"
      ),
    ]);

    storyboard.scenes[sceneIndex] = {
      ...scene,
      status: "ready",
      assetUrl,
      voiceoverUrl,
    };
    await projectRef.set({ storyboard }, { merge: true });

    return NextResponse.json({ scene: storyboard.scenes[sceneIndex] });
  } catch (err) {
    console.error("scene generation failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 400 }
    );
  }
}
