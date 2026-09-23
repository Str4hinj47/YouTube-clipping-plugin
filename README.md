# YouTube Clipping Plugin

A self-contained plugin for **AI content-automation agents**. It finds **long,
high-quality Minecraft parkour videos** on YouTube, downloads the best one,
and cuts it into a bunch of **~60-second clips** — all with a JSON-in/
JSON-out API that plugs straight into tool-calling agents (OpenAI,
LangChain, AutoGen, CrewAI, MCP, or a plain script).

```
                ┌──────────────┐   ┌───────────┐   ┌──────────────┐
YouTube search  │ hard gates:  │   │ quality   │   │  ffmpeg:     │
ytsearch ─────► │ length,      │ ─►│ score     │ ─► │ 60s clips   │ ─► clips + manifest
(4 queries)     │ views, likes,│   │ 0..1      │   │ per source   │
                │ age, 720p+   │   └───────────┘   └──────────────┘
                └──────────────┘
```

## How it picks "high quality"

1. **Discovery** — searches a set of parkour-tuned queries via
   [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) (no API key).
2. **Hard gates** — keeps videos that are *long* (default ≥ 10 min, ≤ 1 h),
   *popular* (default ≥ 100k views), *well-liked* (≥ 4% like ratio),
   *recent* (≤ 3 years), and *high-res* (≥ 720p).
3. **Scoring** — the survivors get a 0..1 quality score from weighted
   components: duration (saturates at 30 min), views (log scale to 10M),
   like ratio, upload recency (1-year half-life), and title keywords
   (minecraft / parkour / no fall / challenge / speedrun …).
4. **Cutting** — the top video is downloaded (≤ 1080p mp4) and split into
   60-second segments with ffmpeg. Re-encoded by default so cuts are
   frame-accurate; stream-copy mode available for speed.

Everything is configurable — see [Config](#configuration).

## Requirements

- Python **3.10+**
- **ffmpeg** on your `PATH` (`brew install ffmpeg`, `apt install ffmpeg`,
  `choco install ffmpeg`), or set `ClippingConfig.ffmpeg_path`
- Internet access to YouTube (for the search/download tools)

## Install

```bash
git clone https://github.com/Str4hinj47/YouTube-clipping-plugin
cd YouTube-clipping-plugin
pip install -e .            # runtime
pip install -e ".[dev]"     # + test deps
pip install -e ".[mcp]"     # + optional MCP server
```

## Plug it into your agent

The whole surface is one class with JSON-serialisable methods:

```python
from yt_clipper.plugin import ParkourClippingPlugin

plugin = ParkourClippingPlugin(output_dir="./clips")

# read-only: what would it pick?
top = plugin.find_videos(limit=5)
top[0]
# {'video_id': ..., 'title': 'Minecraft Parkour No Fall Challenge',
#  'duration_seconds': 1450, 'views': 3200000, 'like_ratio': 0.061,
#  'score': 0.83, 'score_breakdown': {...}, ...}

# full pipeline: search → download best → 60s clips
result = plugin.process(num_videos=1)
result["clips"]          # [{'file': ..., 'start': 0, 'end': 60, ...}, ...]
result["manifest_path"]  # JSON manifest with everything
```

| Method | What it does |
|---|---|
| `find_videos(limit=5, query=None)` | Search + score only. No downloads. |
| `make_clips(video, clip_length=60, overlap=0)` | One specific video (id or URL) → clips. |
| `clip_local(file_path, clip_length=60, overlap=0)` | Cut a local file. No network. |
| `process(num_videos=1)` | Full end-to-end pipeline. |
| `get_tools()` | Ready-made **OpenAI function-calling schemas** for the four methods above. |

### OpenAI-style loop

```python
import json
from yt_clipper.plugin import ParkourClippingPlugin

plugin = ParkourClippingPlugin(output_dir="./clips")
TOOLS = plugin.get_tools()

def dispatch(name, args):
    return {"find_videos": plugin.find_videos,
            "make_clips": plugin.make_clips,
            "clip_local": plugin.clip_local,
            "process": plugin.process}[name](**args)

# in your agent loop:
#   resp = client.chat.completions.create(model=..., messages=..., tools=TOOLS)
#   for call in resp.choices[0].message.tool_calls:
#       result = json.dumps(dispatch(call.function.name,
#                                    json.loads(call.function.arguments)))
#       # append as a "tool" message and continue
```

### LangChain

```python
from langchain_core.tools import tool
from yt_clipper.plugin import ParkourClippingPlugin

plugin = ParkourClippingPlugin(output_dir="./clips")

@tool
def process(num_videos: int = 1) -> dict:
    """Find the best long Minecraft parkour video and cut it into 60s clips."""
    return plugin.process(num_videos=num_videos)

@tool
def make_clips(video: str, clip_length: float = 60) -> list[dict]:
    """Cut a specific YouTube video (id or URL) into ~60s clips."""
    return plugin.make_clips(video, clip_length)

agent = create_react_agent(llm, [process, make_clips])
```

### MCP (Claude Desktop, Cursor, …)

```bash
pip install -e ".[mcp]"
python examples/mcp_server.py   # registers find_videos / make_clips / clip_local / process
```

Full annotated examples live in [`examples/agent_integration.py`](examples/agent_integration.py).

## CLI (for cron jobs / manual runs)

```bash
python -m yt_clipper search --limit 10                 # what it would pick
python -m yt_clipper search --query "minecraft parkour no clip"
python -m yt_clipper process -n 1 -o ./clips           # full pipeline
python -m yt_clipper process --length 60 --overlap 5   # 5s overlap between clips
python -m yt_clipper clip /path/to/gameplay.mp4 -o ./clips
```

All CLI output is JSON on stdout (logging goes to stderr) — pipe it into
`jq` or feed it to your agent. The installed `parkour-clipper` entry point
is the same tool.

## Output layout

```
./clips/
├── sources/
│   └── <video_id>.mp4                  # source download (kept by default)
├── clips/
│   ├── minecraft-parkour-no-fall_dQw4w9Wg_01_0-60s.mp4
│   ├── minecraft-parkour-no-fail_dQw4w9Wg_02_60-120s.mp4
│   └── ...
└── clips_manifest.json                 # config + sources + scores + clips
```

A 10-minute source yields 10 clips; a 30-minute one yields 30.

## Configuration

Build a `ClippingConfig` or pass kwargs to the plugin:

```python
plugin = ParkourClippingPlugin(
    output_dir="./clips",
    min_duration=900,        # 15 min minimum "long"
    min_views=500_000,
    min_like_ratio=0.05,
    max_upload_age_days=730,
    min_height=1080,
    clip_length=60,          # seconds per clip
    clip_overlap=0,          # seconds of overlap between clips
    skip_intro=30,           # cut past the video's intro
    skip_outro=15,
    keep_source=False,       # delete source after clipping
)
```

| Option | Default | Meaning |
|---|---|---|
| `search_queries` | 4 parkour queries | YouTube search terms |
| `max_results_per_query` | 25 | flat-search pool size per query |
| `detail_fetch_limit` | 10 | candidates re-fetched for likes/date/res |
| `min_duration` / `max_duration` | 600 / 3600 s | "long" window |
| `min_views` | 100 000 | popularity floor (0 = off) |
| `min_like_ratio` | 0.04 | quality-of-reception floor (0 = off) |
| `max_upload_age_days` | 1095 | freshness floor (0 = off) |
| `min_height` | 720 | resolution floor |
| `w_duration…w_keywords` | .25/.25/.15/.15/.20 | score weights (renormalised) |
| `ideal_duration` | 1800 s | duration that scores 1.0 |
| `clip_length` / `clip_overlap` | 60 / 0 s | cutting geometry |
| `min_clip_length` | 30 s | drop tails shorter than this |
| `skip_intro` / `skip_outro` | 0 / 0 s | trim head/tail before cutting |
| `max_videos` | 1 | top-scored sources to process |
| `reencode` | True | frame-accurate libx264; False = fast copy |
| `crf` | 19 | re-encode quality (lower = better) |
| `keep_source` | True | keep the downloaded source file |
| `ffmpeg_path` | `ffmpeg` | explicit binary location |
| `cookies_file` | None | cookies.txt for age-restricted uploads |

## Testing

```bash
pip install -e ".[dev]"
pytest
```

25 tests: segmentation math, scoring/renormalisation, hard filters,
filename/URL handling, and a real end-to-end ffmpeg cut of a synthetic
250s video (no network needed).

## Legal note

This tool downloads public YouTube videos for **personal automation**.
Only clip content you have rights to (yours, licensed, or cleared), and
respect YouTube's Terms of Service and copyright law before publishing
anything.

## Layout

```
yt_clipper/
  config.py     all knobs (ClippingConfig)
  models.py     VideoCandidate / ClipInfo / PipelineResult
  search.py     yt-dlp search + detail fetch
  quality.py    hard gates + 0..1 quality score
  download.py   yt-dlp download
  clip.py       cut-point math + ffmpeg cutting
  pipeline.py   find → score → download → clip → manifest
  plugin.py     ParkourClippingPlugin facade + tool schemas
  __main__.py   CLI
examples/
  agent_integration.py   OpenAI / LangChain / plain-automation patterns
  mcp_server.py          optional MCP server
tests/                   offline unit + end-to-end ffmpeg tests
```
