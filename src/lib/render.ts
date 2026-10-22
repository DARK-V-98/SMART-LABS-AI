import { spawn } from "child_process";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { Scene, Storyboard } from "@/types/storyboard";

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-2000)}`));
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

async function buildSceneClip(
  scene: Scene,
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

  const drawtext = scene.onScreenText
    ? `,drawtext=text='${escapeDrawtext(scene.onScreenText)}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.5:boxborderw=20:x=(w-text_w)/2:y=h-160`
    : "";

  const zoompan =
    scene.cameraMove === "zoom-in"
      ? ",zoompan=z='min(zoom+0.0015,1.2)':d=125:s=1920x1080"
      : scene.cameraMove === "zoom-out"
        ? ",zoompan=z='if(lte(zoom,1.0),1.2,max(1.001,zoom-0.0015))':d=125:s=1920x1080"
        : "";

  if (scene.assetType === "image") {
    await run("ffmpeg", [
      "-y",
      "-loop",
      "1",
      "-i",
      visualPath,
      "-i",
      audioPath,
      "-t",
      String(scene.durationSeconds),
      "-vf",
      `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080${zoompan}${drawtext}`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      outPath,
    ]);
  } else {
    await run("ffmpeg", [
      "-y",
      "-i",
      visualPath,
      "-i",
      audioPath,
      "-t",
      String(scene.durationSeconds),
      "-vf",
      `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080${drawtext}`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-shortest",
      outPath,
    ]);
  }

  return outPath;
}

export async function renderStoryboard(storyboard: Storyboard): Promise<Buffer> {
  const workDir = await mkdtemp(path.join(tmpdir(), "smartlabs-render-"));
  try {
    const scenes = [...storyboard.scenes].sort((a, b) => a.order - b.order);
    const clipPaths: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      clipPaths.push(await buildSceneClip(scenes[i], workDir, i));
    }

    const concatListPath = path.join(workDir, "concat.txt");
    await writeFile(
      concatListPath,
      clipPaths.map((p) => `file '${p}'`).join("\n")
    );

    const finalPath = path.join(workDir, "final.mp4");
    await run("ffmpeg", [
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

    return await readFile(finalPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
