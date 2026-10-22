"use client";

import { useState } from "react";
import type { Scene } from "@/types/storyboard";

export default function SceneCard({
  scene,
  projectId,
  generating,
  onGenerate,
  onSceneUpdated,
}: {
  scene: Scene;
  projectId: string;
  generating: boolean;
  onGenerate: (sceneId: string) => void;
  onSceneUpdated: (scene: Scene) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function applyEdit() {
    if (!instruction.trim()) return;
    setEditing(true);
    setEditError(null);
    try {
      const res = await fetch("/api/scene/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, sceneId: scene.id, instruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to edit scene");
      onSceneUpdated(data.scene);
      setInstruction("");
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setEditing(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
        <span>Scene {scene.order + 1}</span>
        <span>{scene.durationSeconds}s</span>
      </div>
      {scene.assetUrl && scene.assetType === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={scene.assetUrl}
          alt=""
          className="mb-2 aspect-video w-full rounded-md object-cover"
        />
      )}
      {scene.assetUrl && scene.assetType === "video" && (
        <video src={scene.assetUrl} className="mb-2 aspect-video w-full rounded-md" controls />
      )}
      <p className="mb-2 line-clamp-3 text-sm">{scene.voiceoverText}</p>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs capitalize text-zinc-500">{scene.status}</span>
        <button
          onClick={() => onGenerate(scene.id)}
          disabled={generating}
          className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium disabled:opacity-50 dark:border-zinc-700"
        >
          {generating ? "Generating..." : scene.status === "ready" ? "Regenerate" : "Generate"}
        </button>
      </div>
      <div className="flex gap-1">
        <input
          className="flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
          placeholder="e.g. make it more energetic, switch to a female voice"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyEdit()}
        />
        <button
          onClick={applyEdit}
          disabled={editing || !instruction.trim()}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700"
        >
          {editing ? "..." : "Apply"}
        </button>
      </div>
      {editError && <p className="mt-1 text-xs text-red-600">{editError}</p>}
    </div>
  );
}
