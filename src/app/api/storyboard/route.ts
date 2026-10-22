import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { gemini, MODELS, storyboardResponseSchema } from "@/lib/gemini";
import { adminDb } from "@/lib/firebase-admin";
import { StoryboardGenInputSchema, StoryboardSchema } from "@/types/storyboard";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an expert video director for SmartLabs marketing videos.
Given a product/campaign brief, break it into a scene-by-scene storyboard for a short
animated marketing video. Keep scenes punchy (3-8 seconds each), write voiceover lines
that sound natural when read aloud, and vary camera moves and transitions. Target the
requested total duration by choosing an appropriate number of scenes.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = StoryboardGenInputSchema.parse(body);

    const result = await gemini().models.generateContent({
      model: MODELS.text,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${SYSTEM_PROMPT}\n\nTarget duration: ${input.targetDurationSeconds}s\nBrief: ${input.brief}`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: storyboardResponseSchema,
      },
    });

    const raw = result.text;
    if (!raw) throw new Error("Gemini returned no content");

    const parsed = JSON.parse(raw);
    parsed.scenes = parsed.scenes.map((s: Record<string, unknown>, i: number) => ({
      ...s,
      id: s.id || randomUUID(),
      order: s.order ?? i,
      status: "pending",
    }));

    const storyboard = StoryboardSchema.parse(parsed);

    const projectId = input.projectId || randomUUID();
    await adminDb()
      .collection("projects")
      .doc(projectId)
      .set(
        {
          brief: input.brief,
          storyboard,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

    return NextResponse.json({ projectId, storyboard });
  } catch (err) {
    console.error("storyboard generation failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 400 }
    );
  }
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const doc = await adminDb().collection("projects").doc(projectId).get();
  if (!doc.exists) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ projectId, ...doc.data() });
}
