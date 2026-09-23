"""The plugin facade.

This is what your agent plugs in. Every public method takes and returns
plain JSON-serialisable data, so it drops into tool-calling loops
(OpenAI/LangChain/AutoGen/CrewAI/custom) without adapters.

Quick start
-----------
    from yt_clipper.plugin import ParkourClippingPlugin

    plugin = ParkourClippingPlugin(output_dir="./clips")

    # 1) see what it would pick:
    top = plugin.find_videos(limit=5)

    # 2) let it run the whole pipeline on the single best video:
    result = plugin.process(num_videos=1)
    print(result["clips"])

    # 3) or act on a specific video / local file yourself:
    clips = plugin.make_clips(video="dQw4w9WgXcQ", clip_length=60)
    clips = plugin.clip_local("/path/to/gameplay.mp4")
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import __version__
from .config import ClippingConfig
from .pipeline import clip_local_file, make_clips_for, run_pipeline
from .quality import score_candidates
from .search import VideoSearcher

log = logging.getLogger(__name__)

PLUGIN_NAME = "youtube-parkour-clipper"


class ParkourClippingPlugin:
    """Find long, high-quality Minecraft parkour videos and cut them into
    ~60-second clips.

    Parameters
    ----------
    output_dir:
        Where sources, clips and `clips_manifest.json` go.
    config:
        Full `ClippingConfig`; any keyword also overrides a single field,
        e.g. `ParkourClippingPlugin(min_duration=900, clip_length=60)`.
    """

    name = PLUGIN_NAME
    version = __version__
    description = (
        "Searches YouTube for long, high-quality Minecraft parkour videos "
        "(duration, views, like ratio, recency, resolution filters + quality "
        "score), downloads the best one(s), and cuts them into ~60-second "
        "clips with ffmpeg. Returns JSON."
    )

    def __init__(
        self,
        output_dir: Optional[str] = None,
        config: Optional[ClippingConfig] = None,
        **overrides: Any,
    ):
        self.cfg = config or ClippingConfig()
        if overrides:
            valid = set(self.cfg.__dataclass_fields__)
            for key, value in overrides.items():
                if key not in valid:
                    raise TypeError(f"unknown config option: {key!r}")
                setattr(self.cfg, key, value)
        if output_dir is not None:
            self.cfg.output_dir = Path(output_dir)

    # -- tools ------------------------------------------------------------------

    def find_videos(self, limit: int = 5, query: Optional[str] = None) -> List[Dict[str, Any]]:
        """Search YouTube and return the best `limit` long parkour videos
        with their quality score breakdown. Does not download anything."""
        queries = [query] if query else self.cfg.search_queries
        searcher = VideoSearcher(self.cfg)
        candidates = searcher.gather(queries)
        ranked = score_candidates(candidates, self.cfg)[: max(1, limit)]
        return [
            {
                "video_id": cand.video_id,
                "url": cand.url,
                "title": cand.title,
                "channel": cand.channel,
                "duration_seconds": cand.duration,
                "views": cand.view_count,
                "likes": cand.like_count,
                "like_ratio": round(cand.like_ratio, 4) if cand.like_ratio is not None else None,
                "upload_date": cand.upload_date,
                "max_height": cand.max_height,
                "score": score,
                "score_breakdown": breakdown,
            }
            for score, breakdown, cand in ranked
        ]

    def make_clips(
        self,
        video: str,
        clip_length: Optional[float] = None,
        overlap: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        """Download one video (YouTube id or URL) and cut it into clips.

        Returns the list of produced clips (file paths + timing).
        """
        cfg = self._tuned(clip_length, overlap)
        result = make_clips_for(video, cfg)
        if result.errors and not result.clips:
            raise RuntimeError("; ".join(result.errors))
        return result.clips

    def clip_local(
        self,
        file_path: str,
        clip_length: Optional[float] = None,
        overlap: Optional[float] = None,
        title: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Cut an existing local video file into clips (no network)."""
        cfg = self._tuned(clip_length, overlap)
        result = clip_local_file(Path(file_path), title, cfg)
        if result.errors and not result.clips:
            raise RuntimeError("; ".join(result.errors))
        return result.clips

    def process(self, num_videos: int = 1) -> Dict[str, Any]:
        """Full pipeline: search -> score -> download top `num_videos` ->
        clip. Returns everything: source info, scores, clip list, manifest
        path, and any per-video errors."""
        cfg = ClippingConfig.from_dict(self.cfg.to_dict(), max_videos=max(1, num_videos))
        result = run_pipeline(cfg)
        return result.to_dict()

    # -- helpers -----------------------------------------------------------------

    def _tuned(self, clip_length: Optional[float], overlap: Optional[float]) -> ClippingConfig:
        overrides: Dict[str, Any] = {}
        if clip_length is not None:
            overrides["clip_length"] = clip_length
        if overlap is not None:
            overrides["clip_overlap"] = overlap
        if not overrides:
            return self.cfg
        return ClippingConfig.from_dict(self.cfg.to_dict(), **overrides)

    @staticmethod
    def get_tools() -> List[Dict[str, Any]]:
        """OpenAI function-calling schemas for this plugin's tools.

        Map each schema's `function.name` to the matching method above.
        """
        return [
            {
                "type": "function",
                "function": {
                    "name": "find_videos",
                    "description": (
                        "Search YouTube for long, high-quality Minecraft parkour "
                        "videos and return the top candidates with quality scores. "
                        "Read-only; nothing is downloaded."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "limit": {
                                "type": "integer", "default": 5, "minimum": 1, "maximum": 20,
                                "description": "How many candidates to return.",
                            },
                            "query": {
                                "type": "string",
                                "description": "Optional custom search query (e.g. 'minecraft parkour no clip').",
                            },
                        },
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "make_clips",
                    "description": (
                        "Download one YouTube video (video id or URL) and cut it "
                        "into ~60-second clips. Returns the produced clip files."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "video": {
                                "type": "string",
                                "description": "YouTube video id or watch URL.",
                            },
                            "clip_length": {
                                "type": "number", "default": 60,
                                "description": "Target clip length in seconds.",
                            },
                            "overlap": {
                                "type": "number", "default": 0,
                                "description": "Overlap between consecutive clips in seconds.",
                            },
                        },
                        "required": ["video"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "clip_local",
                    "description": (
                        "Cut an existing local video file into ~60-second clips. "
                        "No network access needed."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "file_path": {"type": "string", "description": "Path to the local video file."},
                            "clip_length": {
                                "type": "number", "default": 60,
                                "description": "Target clip length in seconds.",
                            },
                            "overlap": {
                                "type": "number", "default": 0,
                                "description": "Overlap between consecutive clips in seconds.",
                            },
                            "title": {
                                "type": "string",
                                "description": "Optional title used for clip file names.",
                            },
                        },
                        "required": ["file_path"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "process",
                    "description": (
                        "Run the full automation: search for the best long Minecraft "
                        "parkour videos, download the top one, and cut it into "
                        "~60-second clips. Returns sources, scores, clip files and "
                        "the JSON manifest path."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "num_videos": {
                                "type": "integer", "default": 1, "minimum": 1, "maximum": 5,
                                "description": "How many top-scored videos to process.",
                            },
                        },
                    },
                },
            },
        ]


__all__ = ["ParkourClippingPlugin", "PLUGIN_NAME"]
