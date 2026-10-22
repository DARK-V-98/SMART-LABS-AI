"use client";

import { useState } from "react";
import type { Branding } from "@/types/storyboard";

export default function BrandingPanel({
  projectId,
  branding,
  onSaved,
}: {
  projectId: string;
  branding: Branding;
  onSaved: (branding: Branding) => void;
}) {
  const [open, setOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState(branding.logoUrl ?? "");
  const [brandColor, setBrandColor] = useState(branding.brandColor ?? "#2563eb");
  const [musicUrl, setMusicUrl] = useState(branding.musicUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const nextBranding: Branding = {
        logoUrl: logoUrl.trim() || undefined,
        brandColor: brandColor.trim() || undefined,
        musicUrl: musicUrl.trim() || undefined,
      };
      const res = await fetch("/api/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, branding: nextBranding }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save branding");
      onSaved(nextBranding);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-3 text-sm font-medium"
      >
        <span>Branding (logo, color, music)</span>
        <span className="text-zinc-500">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-zinc-200 p-3 dark:border-zinc-800">
          <label className="block text-xs">
            Logo image URL (overlaid bottom-right on every scene)
            <input
              className="mt-1 w-full rounded-md border border-zinc-300 bg-transparent p-2 text-sm dark:border-zinc-700"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
            />
          </label>
          <label className="block text-xs">
            Brand color (used for caption boxes)
            <input
              type="color"
              className="mt-1 h-9 w-full rounded-md border border-zinc-300 dark:border-zinc-700"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
            />
          </label>
          <label className="block text-xs">
            Background music URL (royalty-free track, mixed under voiceover)
            <input
              className="mt-1 w-full rounded-md border border-zinc-300 bg-transparent p-2 text-sm dark:border-zinc-700"
              value={musicUrl}
              onChange={(e) => setMusicUrl(e.target.value)}
              placeholder="https://..."
            />
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save branding"}
          </button>
        </div>
      )}
    </div>
  );
}
