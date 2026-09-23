"""Cut a video into ~60s segments with ffmpeg.

The segmentation math is a pure function (`plan_segments`) so it is fully
unit-testable without ffmpeg or network access.
"""
from __future__ import annotations

import logging
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from .config import ClippingConfig
from .models import ClipInfo

log = logging.getLogger(__name__)

_DURATION_RE = re.compile(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)")


@dataclass
class Segment:
    index: int
    start: float
    end: float

    @property
    def length(self) -> float:
        return self.end - self.start


def plan_segments(
    duration: float,
    clip_length: float = 60.0,
    overlap: float = 0.0,
    skip_intro: float = 0.0,
    skip_outro: float = 0.0,
    min_clip_length: float = 30.0,
) -> List[Segment]:
    """Compute cut points for a video of `duration` seconds.

    Segments tile the [skip_intro, duration - skip_outro] window with
    `clip_length`-long pieces, each shifted by `clip_length - overlap`.
    A trailing stub shorter than `min_clip_length` is dropped.
    """
    if duration <= 0:
        return []
    start = max(0.0, min(skip_intro, duration))
    content_end = max(0.0, min(duration - skip_outro, duration))
    if content_end <= start:
        return []

    step = clip_length - overlap
    segments: List[Segment] = []
    cursor = start
    idx = 1
    while cursor < content_end:
        end = min(cursor + clip_length, content_end)
        if end - cursor >= min_clip_length:
            segments.append(Segment(index=idx, start=round(cursor, 3), end=round(end, 3)))
            idx += 1
        if end >= content_end:
            break
        cursor += step
    return segments


def sanitize_filename(title: str, max_len: int = 60) -> str:
    """Filesystem-safe, url-safe-ish slug from a video title."""
    slug = re.sub(r"[^A-Za-z0-9]+", "-", title or "video").strip("-").lower()
    return (slug[:max_len].rstrip("-")) or "video"


def find_ffmpeg(cfg: ClippingConfig) -> str:
    if cfg.ffmpeg_path:
        return cfg.ffmpeg_path
    found = shutil.which("ffmpeg")
    if not found:
        raise RuntimeError(
            "ffmpeg not found on PATH. Install ffmpeg (e.g. `brew install ffmpeg`, "
            "`apt install ffmpeg`, or `pip install static-ffmpeg`) or set "
            "ClippingConfig.ffmpeg_path."
        )
    return found


def probe_duration(path: Path, ffmpeg: str) -> float:
    """Duration in seconds, via ffprobe if available else `ffmpeg -i` stderr."""
    ffprobe = shutil.which("ffprobe")
    if ffprobe:
        out = subprocess.run(
            [ffprobe, "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        return float(out)
    proc = subprocess.run(
        [ffmpeg, "-hide_banner", "-i", str(path)],
        capture_output=True, text=True,
    )
    m = _DURATION_RE.search(proc.stderr or "")
    if not m:
        raise RuntimeError(f"could not probe duration of {path}")
    h, mn, s = m.groups()
    return int(h) * 3600 + int(mn) * 60 + float(s)


def cut_segment(
    in_path: Path,
    out_path: Path,
    start: float,
    end: float,
    cfg: ClippingConfig,
    ffmpeg: str,
) -> None:
    length = end - start
    if cfg.reencode:
        cmd = [
            ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
            "-ss", f"{start:.3f}", "-i", str(in_path), "-t", f"{length:.3f}",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", str(cfg.crf),
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart", "-f", "mp4", str(out_path),
        ]
    else:
        cmd = [
            ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
            "-ss", f"{start:.3f}", "-i", str(in_path), "-t", f"{length:.3f}",
            "-c", "copy", "-avoid_negative_ts", "make_zero", "-f", "mp4", str(out_path),
        ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg failed cutting {in_path.name} [{start:.1f}-{end:.1f}s]: "
            f"{(proc.stderr or '').strip()[-500:]}"
        )
    if not out_path.exists() or out_path.stat().st_size == 0:
        raise RuntimeError(f"ffmpeg produced no output for {out_path.name}")


def split_video(
    video_path: Path,
    title: str,
    source_id: str,
    out_dir: Path,
    cfg: ClippingConfig,
    ffmpeg: Optional[str] = None,
) -> List[ClipInfo]:
    """Cut `video_path` into clips inside `out_dir`. Returns ClipInfo list."""
    ffmpeg = ffmpeg or find_ffmpeg(cfg)
    duration = probe_duration(video_path, ffmpeg)
    segments = plan_segments(
        duration,
        clip_length=cfg.clip_length,
        overlap=cfg.clip_overlap,
        skip_intro=cfg.skip_intro,
        skip_outro=cfg.skip_outro,
        min_clip_length=cfg.min_clip_length,
    )
    if not segments:
        raise RuntimeError(
            f"video {video_path.name} ({duration:.0f}s) yields no clips of "
            f">={cfg.min_clip_length:.0f}s with the current config"
        )

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    slug = sanitize_filename(title)
    vid8 = source_id[:8]

    clips: List[ClipInfo] = []
    for seg in segments:
        name = f"{slug}_{vid8}_{seg.index:02d}_{int(seg.start)}-{int(seg.end)}s.mp4"
        out_path = out_dir / name
        log.info("cutting %s -> %s", video_path.name, name)
        cut_segment(video_path, out_path, seg.start, seg.end, cfg, ffmpeg)
        clips.append(ClipInfo(
            file=str(out_path),
            source_id=source_id,
            source_title=title,
            index=seg.index,
            start=seg.start,
            end=seg.end,
            duration=round(seg.length, 3),
        ))
    return clips
