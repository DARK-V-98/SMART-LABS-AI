import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { BrandingSchema } from "@/types/storyboard";

const InputSchema = z.object({
  projectId: z.string(),
  branding: BrandingSchema,
});

export async function PATCH(req: NextRequest) {
  try {
    const { projectId, branding } = InputSchema.parse(await req.json());

    const projectRef = adminDb().collection("projects").doc(projectId);
    const projectDoc = await projectRef.get();
    if (!projectDoc.exists) {
      return NextResponse.json({ error: "project not found" }, { status: 404 });
    }

    await projectRef.set(
      { storyboard: { branding }, updatedAt: new Date().toISOString() },
      { merge: true }
    );

    return NextResponse.json({ branding });
  } catch (err) {
    console.error("branding update failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 400 }
    );
  }
}
