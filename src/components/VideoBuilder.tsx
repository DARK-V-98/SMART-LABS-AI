"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import BrandingPanel from "@/components/BrandingPanel";
import type { Scene, Storyboard } from "@/types/storyboard";

type RenderProgress = {
  stage: "encoding-scene" | "concatenating" | "done";
  current: number;
  total: number;
} | null;

type ChatMessage = { role: "user" | "assistant"; text: string };

type ProjectSummary = {
  projectId: string;
  title: string;
  updatedAt: string | null;
  renderedVideoUrl: string | null;
  sceneCount: number;
};

const INITIAL_MESSAGE: ChatMessage = {
  role: "assistant",
  text: "Describe the SmartLabs product or campaign you want a video for — I'll draft a scene-by-scene storyboard.",
};

export default function VideoBuilder() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [brief, setBrief] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [busy, setBusy] = useState(false);
  const [generatingSceneId, setGeneratingSceneId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [renderProgress, setRenderProgress] = useState<RenderProgress>(null);

  useEffect(() => {
    if (!projectId) return;
    const unsubscribe = onSnapshot(doc(db, "projects", projectId), (snap) => {
      setRenderProgress(snap.data()?.renderProgress ?? null);
    });
    return unsubscribe;
  }, [projectId]);

  async function refreshProjects() {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      if (res.ok) setProjects(data.projects);
    } catch {
      // history is a convenience, fail silently
    }
  }

  useEffect(() => {
    refreshProjects();
  }, []);

  function startNewProject() {
    setProjectId(null);
    setStoryboard(null);
    setVideoUrl(null);
    setMessages([INITIAL_MESSAGE]);
    setError(null);
  }

  async function loadProject(id: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/storyboard?projectId=${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load project");
      setProjectId(id);
      setStoryboard(data.storyboard);
      setVideoUrl(data.renderedVideoUrl ?? null);
      setMessages([
        INITIAL_MESSAGE,
        { role: "user", text: data.brief },
        {
          role: "assistant",
          text: `Loaded "${data.storyboard.title}" with ${data.storyboard.scenes.length} scenes.`,
        },
      ]);
      setShowHistory(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function submitBrief() {
    if (!brief.trim() || busy) return;
    setError(null);
    setMessages((m) => [...m, { role: "user", text: brief }]);
    setBusy(true);
    try {
      const res = await fetch("/api/storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, brief, targetDurationSeconds: 30 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate storyboard");
      setProjectId(data.projectId);
      setStoryboard(data.storyboard);
      setVideoUrl(null);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: `Drafted "${data.storyboard.title}" with ${data.storyboard.scenes.length} scenes. Generate each scene below, then render.`,
        },
      ]);
      setBrief("");
      refreshProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function generateScene(sceneId: string) {
    if (!projectId) return;
    setGeneratingSceneId(sceneId);
    setError(null);
    try {
      const res = await fetch("/api/scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, sceneId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate scene");
      setStoryboard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          scenes: prev.scenes.map((s) => (s.id === sceneId ? data.scene : s)),
        };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setGeneratingSceneId(null);
    }
  }

  async function renderVideo() {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Render failed");
      setVideoUrl(data.videoUrl);
      refreshProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  const allReady =
    !!storyboard && storyboard.scenes.every((s) => s.status === "ready");

  return (
    <div className="grid h-screen grid-cols-1 gap-0 md:grid-cols-[380px_1fr]">
      <div className="flex flex-col border-r border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between border-b border-zinc-200 p-4 font-semibold dark:border-zinc-800">
          <span>SmartLabs Video Builder</span>
          <div className="flex gap-2 text-xs font-normal">
            <button
              onClick={startNewProject}
              className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
            >
              New
            </button>
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
            >
              History ({projects.length})
            </button>
          </div>
        </div>
        {showHistory && (
          <div className="max-h-48 overflow-y-auto border-b border-zinc-200 dark:border-zinc-800">
            {projects.length === 0 && (
              <p className="p-3 text-xs text-zinc-500">No past projects yet.</p>
            )}
            {projects.map((p) => (
              <button
                key={p.projectId}
                onClick={() => loadProject(p.projectId)}
                className="flex w-full flex-col items-start border-b border-zinc-100 p-3 text-left text-xs hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900"
              >
                <span className="font-medium">{p.title}</span>
                <span className="text-zinc-500">
                  {p.sceneCount} scenes{p.renderedVideoUrl ? " · rendered" : ""}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-blue-600 text-white"
                  : "bg-zinc-100 dark:bg-zinc-800"
              }`}
            >
              {m.text}
            </div>
          ))}
          {error && (
            <div className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {error}
            </div>
          )}
        </div>
        <div className="flex gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
          <textarea
            className="flex-1 resize-none rounded-md border border-zinc-300 bg-transparent p-2 text-sm dark:border-zinc-700"
            rows={2}
            placeholder="e.g. 30s launch video for our new SmartLabs IoT sensor kit, energetic tone"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitBrief();
              }
            }}
          />
          <button
            onClick={submitBrief}
            disabled={busy || !brief.trim()}
            className="rounded-md bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>

      <div className="overflow-y-auto p-6">
        {!storyboard && (
          <p className="text-zinc-500">No storyboard yet. Start chatting on the left.</p>
        )}

        {storyboard && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">{storyboard.title}</h2>
                <p className="text-sm text-zinc-500">{storyboard.summary}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <button
                  onClick={renderVideo}
                  disabled={!allReady || busy}
                  className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {busy ? "Rendering..." : "Render final video"}
                </button>
                {renderProgress && renderProgress.stage !== "done" && (
                  <span className="text-xs text-zinc-500">
                    {renderProgress.stage === "encoding-scene"
                      ? `Encoding scene ${renderProgress.current}/${renderProgress.total}`
                      : "Combining scenes..."}
                  </span>
                )}
              </div>
            </div>

            {projectId && (
              <BrandingPanel
                projectId={projectId}
                branding={storyboard.branding}
                onSaved={(branding) =>
                  setStoryboard((prev) => (prev ? { ...prev, branding } : prev))
                }
              />
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {storyboard.scenes.map((scene: Scene) => (
                <div
                  key={scene.id}
                  className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                >
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
                    <video
                      src={scene.assetUrl}
                      className="mb-2 aspect-video w-full rounded-md"
                      controls
                    />
                  )}
                  <p className="mb-2 line-clamp-3 text-sm">{scene.voiceoverText}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs capitalize text-zinc-500">
                      {scene.status}
                    </span>
                    <button
                      onClick={() => generateScene(scene.id)}
                      disabled={generatingSceneId === scene.id}
                      className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium disabled:opacity-50 dark:border-zinc-700"
                    >
                      {generatingSceneId === scene.id
                        ? "Generating..."
                        : scene.status === "ready"
                          ? "Regenerate"
                          : "Generate"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {videoUrl && (
              <div className="mt-6">
                <h3 className="mb-2 font-semibold">Final video</h3>
                <video src={videoUrl} controls className="w-full max-w-2xl rounded-lg" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
