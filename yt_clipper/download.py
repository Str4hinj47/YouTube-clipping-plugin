"""Downloading via yt-dlp, with progress logged (no noise on stdout)."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, Optional

import yt_dlp

from .config import ClippingConfig

log = logging.getLogger(__name__)


def _progress_hook(cfg: ClippingConfig):
    last = {"pct": -10}

    def hook(d: Dict) -> None:
        if d.get("status") == "downloading" and d.get("total_bytes"):
            pct = int(d.get("downloaded_bytes", 0) * 100 / d["total_bytes"])
            if pct >= last["pct"] + 10:
                last["pct"] = pct
                log.info("download: %d%%", pct)
        elif d.get("status") == "finished":
            log.info("download finished, merging if needed")

    return hook


def video_id_from_ref(ref: str) -> str:
    """Accept a bare id, watch URL, youtu.be link or Shorts URL."""
    ref = ref.strip()
    for marker in ("watch?v=", "youtu.be/", "shorts/", "embed/", "live/"):
        if marker in ref:
            rest = ref.split(marker, 1)[1]
            for sep in ("&", "?", "/"):
                rest = rest.split(sep, 1)[0]
            return rest
    if ref.startswith("http"):
        raise ValueError(f"unrecognised YouTube URL: {ref}")
    return ref


def download_video(
    video_id: str,
    out_dir: Path,
    cfg: ClippingConfig,
    ffmpeg: Optional[str] = None,
) -> Path:
    """Download one video into out_dir as <video_id>.mp4. Returns its path.

    Re-uses an existing complete file when present (idempotent runs).
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / f"{video_id}.mp4"
    if dest.exists() and dest.stat().st_size > 0:
        log.info("reusing existing download %s", dest)
        return dest

    opts: Dict = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "format": cfg.video_format,
        "merge_output_format": "mp4",
        "outtmpl": str(out_dir / f"{video_id}.%(ext)s"),
        "retries": cfg.retries,
        "socket_timeout": cfg.socket_timeout,
        "progress_hooks": [_progress_hook(cfg)],
    }
    if cfg.cookies_file:
        opts["cookiefile"] = cfg.cookies_file
    if ffmpeg:
        opts["ffmpeg_location"] = str(Path(ffmpeg).parent)

    url = f"https://www.youtube.com/watch?v={video_id}"
    log.info("downloading %s ...", url)
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
    title = (info or {}).get("title", video_id)
    log.info("downloaded: %s", title)

    if not dest.exists():
        # non-mp4 merge edge case - find whatever came out
        candidates = sorted(out_dir.glob(f"{video_id}.*"))
        if not candidates:
            raise RuntimeError(f"download produced no file for {video_id}")
        dest = candidates[0]
    return dest
