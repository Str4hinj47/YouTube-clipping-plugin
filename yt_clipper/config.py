"""Configuration for the parkour clipping plugin.

Every field can be overridden at runtime:

    cfg = ClippingConfig(min_duration=900, max_videos=2)
    plugin = ParkourClippingPlugin(config=cfg)

or per-call through the plugin facade methods.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import __version__

DEFAULT_QUERIES: List[str] = [
    "minecraft parkour",
    "minecraft parkour challenge",
    "minecraft parkour no clip",
    "minecraft parkour speedrun",
]


@dataclass
class ClippingConfig:
    # --- Discovery ---------------------------------------------------------
    search_queries: List[str] = field(default_factory=lambda: list(DEFAULT_QUERIES))
    """YouTube search queries to use. Keep at least the core terms you care about."""
    max_results_per_query: int = 25
    """How many results to pull per query before filtering."""
    detail_fetch_limit: int = 10
    """How many coarse-filtered candidates to re-fetch with full metadata
    (like counts, upload date, resolution) before scoring."""

    # --- "Long" + "high quality" gates --------------------------------------
    min_duration: float = 600.0
    """Minimum source video length in seconds (default 10 min)."""
    max_duration: float = 3600.0
    """Maximum source video length in seconds (default 1 h)."""
    min_views: int = 100_000
    """Minimum view count. 0 disables the gate."""
    min_like_ratio: float = 0.04
    """Minimum likes/views ratio. 0 disables the gate. Parkour videos that
    genuinely land usually sit between 0.04 and 0.10."""
    max_upload_age_days: int = 1095
    """Skip videos older than this (default 3 years). 0 disables the gate."""
    min_height: int = 720
    """Minimum source resolution in pixels (1080 for crisp clips)."""

    # --- Scoring weights (renormalised over known components) ---------------
    ideal_duration: float = 1800.0
    """Duration that scores a perfect 1.0 on the duration component (30 min)."""
    w_duration: float = 0.25
    w_views: float = 0.25
    w_likes: float = 0.15
    w_recency: float = 0.15
    w_keywords: float = 0.20
    min_score: float = 0.0
    """Drop candidates scoring below this (0..1)."""

    # --- Cutting ------------------------------------------------------------
    clip_length: float = 60.0
    """Target clip length in seconds."""
    clip_overlap: float = 0.0
    """Overlap between consecutive clips in seconds (0 = back-to-back)."""
    min_clip_length: float = 30.0
    """A final partial segment shorter than this is discarded."""
    skip_intro: float = 0.0
    """Seconds to skip at the start of the source (intros, sponsors)."""
    skip_outro: float = 0.0
    """Seconds to skip at the end (end cards, credits)."""

    # --- Output / download ----------------------------------------------------
    output_dir: Path = field(default_factory=lambda: Path("output"))
    max_videos: int = 1
    """How many of the top-scored sources to download + clip."""
    video_format: str = (
        "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/"
        "best[height<=1080][ext=mp4]/best[height<=1080]/best"
    )
    reencode: bool = True
    """True  = frame-accurate libx264 re-encode (default, recommended).
    False = stream copy, faster but cuts snap to keyframes."""
    crf: int = 19
    """libx264 quality (lower = better; 18 is visually lossless-ish)."""
    keep_source: bool = True
    """Keep the downloaded source file after clipping."""
    ffmpeg_path: Optional[str] = None
    """Explicit ffmpeg binary; defaults to `ffmpeg` on PATH."""
    cookies_file: Optional[str] = None
    """Optional Netscape-format cookies.txt for age-restricted uploads."""
    socket_timeout: int = 20
    retries: int = 3

    def __post_init__(self) -> None:
        self.output_dir = Path(self.output_dir)
        if self.clip_overlap >= self.clip_length:
            raise ValueError("clip_overlap must be smaller than clip_length")
        if self.min_clip_length <= 0 or self.min_clip_length > self.clip_length:
            raise ValueError("min_clip_length must be in (0, clip_length]")

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["output_dir"] = str(self.output_dir)
        data["plugin_version"] = __version__
        return data

    @classmethod
    def from_dict(cls, data: Dict[str, Any], **overrides: Any) -> "ClippingConfig":
        valid = {f for f in cls.__dataclass_fields__}
        kwargs = {k: v for k, v in data.items() if k in valid}
        kwargs.update({k: v for k, v in overrides.items() if k in valid})
        return cls(**kwargs)
