"""YouTube parkour clipping plugin.

A self-contained plugin for AI content-automation agents: finds long,
high-quality Minecraft parkour videos on YouTube and cuts them into
~60-second clips.

Entry points:
    from yt_clipper.plugin import ParkourClippingPlugin   # for your agent
    python -m yt_clipper ...                              # CLI
"""
from ._version import __version__
from .config import ClippingConfig, DEFAULT_QUERIES
from .models import ClipInfo, PipelineResult, VideoCandidate
from .plugin import ParkourClippingPlugin, PLUGIN_NAME

__all__ = [
    "__version__",
    "ClippingConfig",
    "DEFAULT_QUERIES",
    "ClipInfo",
    "PipelineResult",
    "VideoCandidate",
    "ParkourClippingPlugin",
    "PLUGIN_NAME",
]
