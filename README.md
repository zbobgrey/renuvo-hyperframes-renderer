# Renuvo HyperFrames renderer

This public repository turns Base64-encoded HyperFrames HTML into a narrated, music-backed 1080×1920, 30-fps MP4 on a standard GitHub-hosted Ubuntu runner. It uses `hyperframes@0.8.30`, installs `gsap@3`, copies GSAP and approved Renuvo media into the temporary project, creates narration with ElevenLabs, runs the local HyperFrames validator and renderer, verifies video and audio with `ffprobe`, and publishes the MP4 on the rolling `renuvo-renders` release.

No HeyGen key, hosted rendering service, customer data, or private media belongs in this repository.

## Repository setup

Create this as the public repository `zbobgrey/renuvo-hyperframes-renderer` with the default branch `main`. GitHub Actions must be enabled. The workflow's built-in `GITHUB_TOKEN` needs read/write workflow permissions so it can maintain release assets; the workflow narrows its declared permission to `contents: write`.

The renderer accepts these `workflow_dispatch` inputs:

- `html_base64`: a standalone HTML composition, limited by the workflow to 60,000 Base64 characters.
- `output_filename`: a filename matching `renuvo-[a-z0-9-]{1,96}.mp4`.
- `narration_segments_json`: six ordered `{id,text}` scene records. The renderer synthesizes each scene separately with character timestamps and rejects malformed, overlong, or retired copy.
- `narration_text`: optional combined copy retained only for audit compatibility.
- `elevenlabs_voice_id`: optional voice override; defaults to the established Renuvo voice `EyRf2vN1QWFKpAubRauZ`.

For compatibility with earlier n8n exports, the dispatcher also accepts
`html_b64` and `output_name` as aliases. Do not send both forms with different
values; the renderer rejects conflicting inputs.

Each dispatched composition is validated on its own HTML. The renderer does not
attach the example project's motion-assertion sidecar to uploaded compositions,
because those assertions contain selectors specific to the example. HyperFrames
errors remain blocking; non-fatal lint/layout warnings are reported in the run.

Jobs are serialized through the `renuvo-renders` concurrency group. Before upload, the workflow removes an existing asset with the same name, which makes retries idempotent and prevents rolling-release collisions.

## Narration, music, and logo

Add an encrypted GitHub Actions repository secret named `ELEVENLABS_API_KEY` under **Settings → Secrets and variables → Actions**. The workflow passes it only to the narration process; it is never sent by n8n, written into the HTML, committed, or printed.

The runner calls ElevenLabs' timestamped text-to-speech endpoint once per scene with `eleven_multilingual_v2`, the established Renuvo voice settings, and `mp3_44100_128`. It stores six temporary MP3 files plus character and word alignment metadata. `scripts/sync-composition-to-narration.mjs` uses the measured speech spans to assign all six contiguous scene windows and GSAP cue starts, distributes remaining breathing room proportionally, and preserves the exact 37-second composition duration.

The approved ink and ivory SVG lockups live in `assets/brand/`. The original locally synthesized, sample-free review bed lives at `assets/audio/music-bed-60s.wav`. Both are copied into the temporary project before validation; the composition keeps narration dominant and fades the music in and out beneath it.

## n8n credential

Create a fine-grained GitHub personal access token limited to this one public repository. Grant only:

- Repository permission `Actions: write`
- Repository permission `Metadata: read`

In n8n, create an **HTTP Header Auth** credential named `GitHub Actions - Renuvo Renderer` with:

- Header name: `Authorization`
- Header value: `Bearer GITHUB_TOKEN`

Replace `GITHUB_TOKEN` in n8n's credential editor with the token value. Do not paste it into the workflow JSON, this repository, screenshots, logs, or support messages. Select the credential on the `Dispatch Free Render` node after importing the workflow.

## Local smoke test

With Node.js 22 or newer, FFmpeg, and `ELEVENLABS_API_KEY` available, generate the local timestamped narration, synchronize the composition, and then render:

```bash
npm ci
npm run prepare:example
# Set NARRATION_SEGMENTS_JSON and ELEVENLABS_VOICE_ID.
$env:NARRATION_OUTPUT_DIR = 'example-project/media/narration'
$env:NARRATION_MANIFEST = 'example-project/media/narration-timing.json'
$env:COMPOSITION_HTML = 'example-project/index.html'
$env:RENDER_TIMING_OUTPUT = 'example-project/media/render-timing.json'
node scripts/generate-elevenlabs-narration.mjs
node scripts/sync-composition-to-narration.mjs
npm run check:example
npm run render:example
ffprobe -v error -show_format renders/renuvo-day-01-local.mp4
```

The example project is generated from the same populated Day 1 HTML that n8n dispatches. `npm run prepare:example` stages GSAP, logos, and music; generated example media is ignored by Git.

## Release download URL

For a public repository, n8n can poll the unauthenticated predictable URL:

```text
https://github.com/zbobgrey/renuvo-hyperframes-renderer/releases/download/renuvo-renders/OUTPUT_FILENAME
```

Each n8n execution generates a unique `OUTPUT_FILENAME`. The download node waits once, then retries 404 responses until GitHub Actions has validated, rendered, probed, and uploaded the MP4.

## First remote publish and test

Authenticate GitHub CLI, then create and push the public renderer repository:

```powershell
gh auth login -h github.com -w
Set-Location C:\Users\Zai\Projects\Renuvo\renuvo-hyperframes-renderer
gh repo create zbobgrey/renuvo-hyperframes-renderer --public --source . --remote origin --push
```

After the push, trigger a smoke render with a unique filename:

```powershell
$html = [System.IO.File]::ReadAllText((Resolve-Path '.\example-project\index.html'))
$htmlBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($html))
$output = 'renuvo-day-01-github-smoke-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + '.mp4'
$segments = @(
  @{ id = 'scene-01'; text = 'Your Brand. Built to return.' }
  @{ id = 'scene-02'; text = 'Renuvo gives your business flexible memberships, credits, and benefits, all shaped around the way you serve.' }
  @{ id = 'scene-03'; text = 'Customers can join, understand their value, and come back with confidence.' }
  @{ id = 'scene-04'; text = 'Every visit, balance, and benefit stays clear at each touchpoint, so your team is always ready.' }
  @{ id = 'scene-05'; text = 'The experience still feels like you—your name, your voice, and your customer relationship stay front and center.' }
  @{ id = 'scene-06'; text = 'Renuvo. Your Brand. Built to return.' }
) | ConvertTo-Json -Compress
gh workflow run render-hyperframes.yml --repo zbobgrey/renuvo-hyperframes-renderer --ref main -f "html_base64=$htmlBase64" -f "output_filename=$output" -f "narration_segments_json=$segments"
gh run watch --repo zbobgrey/renuvo-hyperframes-renderer --exit-status
```

The completed asset will be available at `https://github.com/zbobgrey/renuvo-hyperframes-renderer/releases/download/renuvo-renders/$output`.
