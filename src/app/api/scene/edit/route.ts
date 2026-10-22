import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { gemini, MODELS, sceneEditResponseSchema } from "@/lib/gemini";
import { adminDb } from "@/lib/firebase-admin";
import { Scene, SceneSchema, Storyboard } from "@/types/storyboard";

export const maxDuration = 60;

const EditInputSchema = z.object({
  projectId: z.string(),
  sceneId: z.string(),
  instruction: z.string().min(1),
});

const SYSTEM_PROMPT = `You are editing a single scene of a video storyboard. You will
be given the scene's current fields as JSON and a free-text instruction describing the
change the user wants. Return the scene's full set of fields again, with the requested
change applied and everything else kept the same unless the instruction implies a
broader change.`;

export async function POST(req: NextRequest) {
  try {
    const { projectId, sceneId, instruction } = EditInputSchema.parse(await req.json());

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
    const currentFields = {
      durationSeconds: scene.durationSeconds,
      visualPrompt: scene.visualPrompt,
      voiceoverText: scene.voiceoverText,
      onScreenText: scene.onScreenText ?? "",
      transition: scene.transition,
      cameraMove: scene.cameraMove,
      assetType: scene.assetType,
    };

    const result = await gemini().models.generateContent({
      model: MODELS.text,
      contents: `${SYSTEM_PROMPT}\n\nCurrent scene: ${JSON.stringify(currentFields)}\nInstruction: ${instruction}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: sceneEditResponseSchema,
      },
    });

    const raw = result.text;
    if (!raw) throw new Error("Gemini returned no content");
    const patch = JSON.parse(raw);

    const updatedScene = SceneSchema.parse({
      ...scene,
      ...patch,
      status: "pending",
      assetUrl: undefined,
      voiceoverUrl: undefined,
    });

    storyboard.scenes[sceneIndex] = updatedScene;
    await projectRef.set(
      { storyboard, updatedAt: new Date().toISOString() },
      { merge: true }
    );

    return NextResponse.json({ scene: updatedScene });
  } catch (err) {
    console.error("scene edit failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 400 }
    );
  }
}
