# 🏋️ Exerciseie

**Mealie, but for exercise videos — plus a coach.** A self-hosted exercise library built from the fitness videos you find on social media, seeded with 1,700+ catalog exercises, and a science-based routine generator that tells you what to train every day.

## Import from social media

Paste a TikTok / Instagram Reel / YouTube Short link, and Exerciseie:

1. downloads the video with **yt-dlp** (plus the post caption — often where the real info is),
2. has **Gemini** watch the video and extract every demonstrated exercise — name, form cues, target muscles, equipment, and the timestamp range of each demonstration (works even for narration-free videos that explain everything in on-screen text),
3. shows a **review screen** where you edit anything and get warned about duplicates already in your library,
4. cuts each demonstration into its own **video clip** with ffmpeg and saves everything to **your library**.

## A real library

Browse a card grid of your exercises, full-text search, filter by category / muscle / equipment / source, favorite the keepers, and open any exercise to watch its clip or step-by-step photos.

Seed it in one click from Settings with two catalogs (safe to re-run; duplicates are skipped):

- **[free-exercise-db](https://github.com/yuhonas/free-exercise-db)** — ~870 exercises, 2 demo photos + numbered instructions each, public domain.
- **wger.de community database** — ~1,000 exercises from the [wger](https://github.com/wger-project/wger) project (CC-BY-SA 4.0; attribution is stored and shown on every imported exercise).

Community catalogs are messy, so imports also run a quality pass — entries whose "English" text is actually Spanish/German/French are dropped, and exercises whose names reveal gear the data forgot to tag ("Cable Fly" with an empty equipment list) get their equipment fixed so they can't sneak into bodyweight-only workouts. Re-running an import applies these repairs to an existing library too.

## Daily workouts (the coach)

Set your **goal** (strength / hypertrophy / endurance / general), **experience level**, **days per week**, **session length** and **available equipment** — the generator plans every session with a deterministic rules engine grounded in published meta-analyses (no LLM, fully explainable; every workout shows its "why"):

- **Splits**: 2–3 days → full body, 4 → upper/lower, 5–6 → push/pull/legs; every major muscle group lands on ≥2 days per cycle (training a muscle 2×/week beats 1×/week at equal volume — Schoenfeld et al. 2016).
- **Volume**: weekly set targets per muscle group (~10–16 hard sets for major groups by level, smaller targets for minor ones), tracked over your trailing 7 days of *completed* work.
- **Prescriptions**: goal-based rep ranges (strength 3–6, hypertrophy 6–12, endurance 12–20), rest times, and a reps-in-reserve target so sets stay close to failure where effective volume lives.
- **Variety**: a recency penalty rotates exercise selection between sessions, a "neglect boost" pulls in whichever groups are behind target (that's how rear delts, forearms, calves and adductors don't get forgotten — a muscle group with zero volume in the trailing week may even earn an extra accessory slot), favorites get picked more often, and any exercise can be swapped with one tap.
- **Only demonstrable exercises**: workouts never prescribe an exercise without a video clip or diagram, and never stretches or cardio entries from the catalogs.

The **Today** page is rolling: open the app any day and it shows your next session in the rotation — check off exercises, finish or skip, and the next one is ready. Miss a day and nothing breaks.

Optionally, any exercise can still be **exported to wger** (exercise + description + video clip) with one click if you run an instance.

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
