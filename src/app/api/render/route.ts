import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { renderStoryboard } from "@/lib/render";
import { Storyboard } from "@/types/storyboard";

export const maxDuration = 300;

const RenderInputSchema = z.object({ projectId: z.string() });

export async function POST(req: NextRequest) {
  try {
    const { projectId } = RenderInputSchema.parse(await req.json());

    const projectRef = adminDb().collection("projects").doc(projectId);
    const projectDoc = await projectRef.get();
    if (!projectDoc.exists) {
      return NextResponse.json({ error: "project not found" }, { status: 404 });
    }

    const storyboard = projectDoc.data()!.storyboard as Storyboard;
    const notReady = storyboard.scenes.filter((s) => s.status !== "ready");
    if (notReady.length > 0) {
      return NextResponse.json(
        { error: `${notReady.length} scene(s) are not ready yet` },
        { status: 400 }
      );
    }

    const videoBuffer = await renderStoryboard(storyboard);

    const bucket = adminStorage().bucket();
    const filePath = `projects/${projectId}/final/${Date.now()}.mp4`;
    const file = bucket.file(filePath);
    await file.save(videoBuffer, { contentType: "video/mp4" });
    await file.makePublic();
    const videoUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    await projectRef.set(
      { renderedVideoUrl: videoUrl, renderedAt: new Date().toISOString() },
      { merge: true }
    );

    return NextResponse.json({ videoUrl });
  } catch (err) {
    console.error("render failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 400 }
    );
  }
}
