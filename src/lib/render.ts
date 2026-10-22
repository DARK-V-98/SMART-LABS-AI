import { spawn } from "child_process";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import ffmpegPath from "ffmpeg-static";
import { Branding, Scene, Storyboard } from "@/types/storyboard";

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath as unknown as string, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

async function fetchToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

function escapeDrawtext(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function hexToFfmpegColor(hex: string, alpha: number): string {
  return `0x${hex.slice(1)}@${alpha}`;
}

type BrandingAssets = { logoPath?: string; musicPath?: string };

async function buildSceneClip(
  scene: Scene,
  branding: Branding,
  assets: BrandingAssets,
  workDir: string,
  index: number
): Promise<string> {
  if (!scene.assetUrl || !scene.voiceoverUrl) {
    throw new Error(`scene ${scene.id} is missing generated assets`);
  }

  const visualPath = path.join(workDir, `scene_${index}_visual`);
  const audioPath = path.join(workDir, `scene_${index}_audio.wav`);
  const outPath = path.join(workDir, `scene_${index}_out.mp4`);

  await Promise.all([
    fetchToFile(scene.assetUrl, visualPath),
    fetchToFile(scene.voiceoverUrl, audioPath),
  ]);

  const boxColor = branding.brandColor ? hexToFfmpegColor(branding.brandColor, 0.6) : "black@0.5";
  const drawtext = scene.onScreenText
    ? `,drawtext=text='${escapeDrawtext(scene.onScreenText)}':fontcolor=white:fontsize=48:box=1:boxcolor=${boxColor}:boxborderw=20:x=(w-text_w)/2:y=h-160`
    : "";

  const zoompan =
    scene.cameraMove === "zoom-in"
      ? ",zoompan=z='min(zoom+0.0015,1.2)':d=125:s=1920x1080"
      : scene.cameraMove === "zoom-out"
        ? ",zoompan=z='if(lte(zoom,1.0),1.2,max(1.001,zoom-0.0015))':d=125:s=1920x1080"
        : "";

  const baseVideoFilter = `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080${zoompan}${drawtext}`;

  // Build -i flags and track each input's ffmpeg stream index explicitly,
  // since -loop/-stream_loop flags precede -i without consuming an index.
  const inputArgs: string[] = [];
  let nextInputIdx = 0;

  const visualIdx = nextInputIdx++;
  if (scene.assetType === "image") {
    inputArgs.push("-loop", "1", "-i", visualPath);
  } else {
    inputArgs.push("-i", visualPath);
  }

  const voiceoverIdx = nextInputIdx++;
  inputArgs.push("-i", audioPath);

  let logoIdx: number | undefined;
  if (assets.logoPath) {
    logoIdx = nextInputIdx++;
    inputArgs.push("-i", assets.logoPath);
  }

  let musicIdx: number | undefined;
  if (assets.musicPath) {
    musicIdx = nextInputIdx++;
    inputArgs.push("-stream_loop", "-1", "-i", assets.musicPath);
  }

  const filterParts: string[] = [`[${visualIdx}:v]${baseVideoFilter}[vbase]`];
  let videoOutLabel = "vbase";
  if (logoIdx !== undefined) {
    filterParts.push(
      `[${logoIdx}:v]scale=200:-1[logo]`,
      `[vbase][logo]overlay=W-w-40:H-h-40[vout]`
    );
    videoOutLabel = "vout";
  }

  let audioMapArg = `${voiceoverIdx}:a`;
  if (musicIdx !== undefined) {
    filterParts.push(
      `[${musicIdx}:a]atrim=0:${scene.durationSeconds},volume=0.25[music]`,
      `[${voiceoverIdx}:a][music]amix=inputs=2:duration=first:dropout_transition=0[aout]`
    );
    audioMapArg = "[aout]";
  }

  const args = [
    "-y",
    ...inputArgs,
    "-t",
    String(scene.durationSeconds),
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    `[${videoOutLabel}]`,
    "-map",
    audioMapArg,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    outPath,
  ];

  await run(args);
  return outPath;
}

export type RenderProgress = {
  stage: "encoding-scene" | "concatenating" | "done";
  current: number;
  total: number;
};

export async function renderStoryboard(
  storyboard: Storyboard,
  onProgress?: (progress: RenderProgress) => void | Promise<void>
): Promise<Buffer> {
  const workDir = await mkdtemp(path.join(tmpdir(), "smartlabs-render-"));
  try {
    const branding = storyboard.branding ?? {};
    const assets: BrandingAssets = {};
    if (branding.logoUrl) {
      assets.logoPath = path.join(workDir, "logo.png");
      await fetchToFile(branding.logoUrl, assets.logoPath);
    }
    if (branding.musicUrl) {
      assets.musicPath = path.join(workDir, "music.mp3");
      await fetchToFile(branding.musicUrl, assets.musicPath);
    }

    const scenes = [...storyboard.scenes].sort((a, b) => a.order - b.order);
    const clipPaths: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      await onProgress?.({ stage: "encoding-scene", current: i + 1, total: scenes.length });
      clipPaths.push(await buildSceneClip(scenes[i], branding, assets, workDir, i));
    }

    await onProgress?.({ stage: "concatenating", current: scenes.length, total: scenes.length });

    const concatListPath = path.join(workDir, "concat.txt");
    await writeFile(
      concatListPath,
      clipPaths.map((p) => `file '${p}'`).join("\n")
    );

    const finalPath = path.join(workDir, "final.mp4");
    await run([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-c",
      "copy",
      finalPath,
    ]);

    await onProgress?.({ stage: "done", current: scenes.length, total: scenes.length });

    return await readFile(finalPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
