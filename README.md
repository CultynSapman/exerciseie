# 🏋️ Exerciseie

**Mealie, but for exercise videos.** A self-hosted library of exercises built from the fitness videos you find on social media — with the [social-to-mealie](https://github.com/GerardPolloRebozado/social-to-mealie)-style importer built in.

Paste a TikTok / Instagram Reel / YouTube Short link, and Exerciseie:

1. downloads the video with **yt-dlp** (plus the post caption — often where the real info is),
2. has **Gemini** watch the video and extract every demonstrated exercise — name, form cues, target muscles, equipment, and the timestamp range of each demonstration (works even for narration-free videos that explain everything in on-screen text),
3. shows a **review screen** where you edit anything and get warned about duplicates already in your library,
4. cuts each demonstration into its own **video clip** with ffmpeg and saves everything to **your library**.

The library is the app: browse a card grid of your exercises, full-text search, filter by category / muscle / equipment, favorite the keepers, and open any exercise to watch its clip and read the form cues.

Optionally, any exercise can be **exported to [wger](https://github.com/wger-project/wger)** (exercise + description + video clip) with one click if you run an instance.

## Setup

Only one key is required:

| Env var | Required | What it is |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | From [Google AI Studio](https://aistudio.google.com/apikey). The free tier is plenty for short videos. |
| `GEMINI_MODEL` | – | Default `gemini-2.5-flash`; any Gemini model with video input |
| `EXTRA_PROMPT` | – | Extra extraction instructions (e.g. "Write descriptions in German") |
| `AUTO_SAVE` | – | `true` skips the review screen and saves straight to the library |
| `YTDLP_COOKIES_FILE` | – | Netscape-format cookies file; Instagram often requires login cookies |
| `WGER_URL` / `WGER_API_KEY` | – | Optional: enables the per-exercise "Send to wger" button |
| `DATA_DIR` | – | Where the database, clips and thumbnails live (default `/data` in Docker) |

### Run with Docker Compose

```bash
cp .env.example .env   # fill in GEMINI_API_KEY at minimum
docker compose up -d   # pulls ghcr.io/cultynsapman/exerciseie:latest
```

Open http://localhost:3000 → **Import video** → paste a link → review → it's in your library.

(To build from source instead, swap `image:` for `build: .` in [docker-compose.yml](docker-compose.yml).)

### Run on Unraid

Every push to `main` automatically builds a multi-arch image to
`ghcr.io/cultynsapman/exerciseie:latest` via GitHub Actions
([workflow](.github/workflows/docker-publish.yml)).

Easiest: **Docker tab → Add Container → Template** isn't needed — grab the ready-made
template instead:

1. Copy [unraid/exerciseie.xml](unraid/exerciseie.xml) to
   `/boot/config/plugins/dockerMan/templates-user/` on your Unraid box (or paste its raw
   GitHub URL into Community Apps → *Template repositories*).
2. Docker tab → **Add Container** → select the *Exerciseie* template.
3. Fill in `GEMINI_API_KEY`, keep the defaults (port `3000`, library data at
   `/mnt/user/appdata/exerciseie`), apply.

Or add it manually: repository `ghcr.io/cultynsapman/exerciseie:latest`, map a port to
container port `3000`, map a share to `/data`, and set the `GEMINI_API_KEY` variable.

Everything you save lives in the `./data` volume (SQLite database + mp4 clips + thumbnails), so back that folder up and you own your library.

### Run locally (development)

Requires Node 24+, plus `yt-dlp` and `ffmpeg` on your PATH (`winget install yt-dlp.yt-dlp Gyan.FFmpeg` on Windows).

```bash
npm install
# set GEMINI_API_KEY in your environment or .env.local
npm run dev
```

## Optional wger export

If `WGER_URL` and `WGER_API_KEY` are set:

- the review screen also flags duplicates that exist in your wger database, and
- every library exercise gets a **Send to wger** button that creates the exercise there (category, muscles, equipment, description with source attribution) and uploads its video clip.

Both the modern wger ≥ 2.4 API (`exercise` / `exercise-translation`) and the legacy shape (`exercisebase` / `exercise`) are supported — the instance is probed automatically. The wger account must be allowed to contribute exercises (an admin account on your own instance works). The built-in category/muscle/equipment taxonomy uses wger's standard names, so exports map cleanly.

## Caveats

- **Instagram** frequently blocks anonymous downloads; export your browser cookies to a file and set `YTDLP_COOKIES_FILE`.
- **Extraction quality varies** with video quality: clearly named exercises with on-screen text or narration extract very well; unlabeled b-roll requires Gemini to recognize movements visually, which is good but not perfect — that's what the review screen is for.
- Personal use only: clips are stored for your own reference, like saving a recipe.
