# SmartLabs AI Video Builder

Chat-driven generator for animated marketing videos: describe a product/campaign,
get a scene-by-scene storyboard from Gemini, generate each scene's visual (Imagen
or Veo) and voiceover (Gemini TTS), then render the final MP4 with ffmpeg.

## How it works

1. **Storyboard** — `POST /api/storyboard` sends your brief to Gemini
   (`gemini-2.5-pro`) with a strict JSON schema and gets back scenes
   (duration, visual prompt, voiceover line, on-screen text, camera move,
   transition). Saved to Firestore under `projects/{projectId}`.
2. **Scene assets** — `POST /api/scene` generates one scene's visual
   (`imagen-4.0-generate-001` for stills, `veo-3.0-generate-001` for native
   video clips) and voiceover (`gemini-2.5-flash-preview-tts`), uploads both
   to Firebase Storage, and writes the URLs back onto the scene.
3. **Render** — `POST /api/render` requires every scene to be `ready`, then
   downloads each scene's visual + voiceover, builds a per-scene clip with
   ffmpeg (pan/zoom for stills, caption burn-in for on-screen text, matched
   duration), concatenates them, and uploads the final MP4 to Firebase
   Storage.
4. **UI** — `src/components/VideoBuilder.tsx` is the chat + scene-grid
   builder: left panel chats with Gemini to draft/redraft the storyboard,
   right panel shows scene cards with per-scene Generate/Regenerate and a
   Render button once everything is ready.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in:
   - `GEMINI_API_KEY` — your paid Gemini API key (Imagen/Veo/TTS access
     required for video + voice generation).
   - Firebase client config (`NEXT_PUBLIC_FIREBASE_*`) from Firebase console
     → Project settings → General.
   - Firebase admin credentials (`FIREBASE_PROJECT_ID`,
     `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`,
     `FIREBASE_STORAGE_BUCKET`) from a service account key (Project settings
     → Service accounts → Generate new private key).
2. In Firebase, enable **Firestore** and **Storage** for the project. The
   render/scene routes call `makePublic()` on uploaded files — tighten
   Storage rules/ACLs before shipping this to real users.
3. `npm install && npm run dev`, open http://localhost:3000.

## Notes / next steps

- `ffmpeg`/`ffprobe` must be on the server's `PATH` for `/api/render` — not
  available on Vercel's standard serverless runtime. Deploy the render route
  on a host with ffmpeg (a small VM, Fly.io, Render.com, or a Docker
  container), or swap in a cloud render service.
- Veo video generation is long-running; `generateSceneVideo` polls until
  done, which can take a couple of minutes per scene.
- No auth yet — add Firebase Auth + per-user project scoping before this is
  multi-tenant.
- Background music isn't wired in yet; the render pipeline only muxes the
  generated voiceover. Add a music track step in `src/lib/render.ts` if
  needed (free royalty-free libraries work fine here, no AI required).
