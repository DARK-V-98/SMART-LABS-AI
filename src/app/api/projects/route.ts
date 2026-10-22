import { NextResponse, connection } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET() {
  await connection();
  const snapshot = await adminDb()
    .collection("projects")
    .orderBy("updatedAt", "desc")
    .limit(50)
    .get();

  const projects = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      projectId: doc.id,
      title: data.storyboard?.title ?? "Untitled project",
      updatedAt: data.updatedAt ?? null,
      renderedVideoUrl: data.renderedVideoUrl ?? null,
      sceneCount: data.storyboard?.scenes?.length ?? 0,
    };
  });

  return NextResponse.json({ projects });
}
