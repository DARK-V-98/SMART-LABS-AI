import { z } from "zod";

export const SceneSchema = z.object({
  id: z.string(),
  order: z.number().int().nonnegative(),
  durationSeconds: z.number().positive(),
  visualPrompt: z.string(),
  voiceoverText: z.string(),
  onScreenText: z.string().optional(),
  transition: z.enum(["cut", "fade", "wipe", "zoom"]).default("fade"),
  cameraMove: z.enum(["static", "pan-left", "pan-right", "zoom-in", "zoom-out"]).default("static"),
  assetType: z.enum(["image", "video"]).default("image"),
  assetUrl: z.string().url().optional(),
  voiceoverUrl: z.string().url().optional(),
  status: z.enum(["pending", "generating", "ready", "failed"]).default("pending"),
});

export const StoryboardSchema = z.object({
  title: z.string(),
  brand: z.string().default("SmartLabs"),
  summary: z.string(),
  scenes: z.array(SceneSchema).min(1),
});

export type Scene = z.infer<typeof SceneSchema>;
export type Storyboard = z.infer<typeof StoryboardSchema>;

export const StoryboardGenInputSchema = z.object({
  projectId: z.string().nullable().optional(),
  brief: z.string().min(1),
  targetDurationSeconds: z.number().positive().default(30),
});

export type StoryboardGenInput = z.infer<typeof StoryboardGenInputSchema>;
