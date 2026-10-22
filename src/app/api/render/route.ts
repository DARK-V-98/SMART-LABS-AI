import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { renderStoryboard, type AspectRatio } from "@/lib/render";
import { Storyboard } from "@/types/storyboard";

export const maxDuration = 300;

const RenderInputSchema = z.object({
  projectId: z.string(),
  formats: z.array(z.enum(["16:9", "9:16", "1:1"])).min(1).default(["16:9"]),
});

export async function POST(req: NextRequest) {
  let projectId: string | undefined;
  try {
    let formats: AspectRatio[];
    ({ projectId, formats } = RenderInputSchema.parse(await req.json()));

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

    await projectRef.set(
      { renderProgress: { stage: "encoding-scene", format: formats[0], current: 0, total: storyboard.scenes.length } },
      { merge: true }
    );

    const videoBuffers = await renderStoryboard(storyboard, formats, async (progress) => {
      await projectRef.set({ renderProgress: progress }, { merge: true });
    });

    const bucket = adminStorage().bucket();
    const videoUrls: Partial<Record<AspectRatio, string>> = {};
    for (const format of formats) {
      const buffer = videoBuffers[format];
      const filePath = `projects/${projectId}/final/${format.replace(":", "x")}-${Date.now()}.mp4`;
      const file = bucket.file(filePath);
      await file.save(buffer, { contentType: "video/mp4" });
      await file.makePublic();
      videoUrls[format] = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    }

    await projectRef.set(
      {
        renderedVideoUrls: videoUrls,
        renderedVideoUrl: videoUrls["16:9"] ?? Object.values(videoUrls)[0],
        renderedAt: new Date().toISOString(),
        renderProgress: null,
      },
      { merge: true }
    );

    return NextResponse.json({ videoUrls });
  } catch (err) {
    console.error("render failed", err);
    if (projectId) {
      await adminDb()
        .collection("projects")
        .doc(projectId)
        .set({ renderProgress: null }, { merge: true })
        .catch(() => {});
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 400 }
    );
  }
}
