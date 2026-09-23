"""Data models shared across the plugin."""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional


@dataclass
class VideoCandidate:
    """A YouTube video that may be worth clipping."""

    video_id: str
    title: str
    url: str
    duration: Optional[float] = None          # seconds
    view_count: Optional[int] = None
    like_count: Optional[int] = None
    upload_date: Optional[str] = None          # "YYYYMMDD"
    channel: Optional[str] = None
    channel_follower_count: Optional[int] = None
    max_height: Optional[int] = None           # best available height in pixels
    extra: Dict[str, Any] = field(default_factory=dict)

    @property
    def like_ratio(self) -> Optional[float]:
        if self.like_count is not None and self.view_count:
            return self.like_count / self.view_count
        return None

    @classmethod
    def from_ytdlp_entry(cls, entry: Dict[str, Any]) -> "VideoCandidate":
        """Build a candidate from a yt-dlp info dict (flat or full)."""
        video_id = str(entry.get("id") or "")
        formats = entry.get("formats") or []
        max_height = None
        for fmt in formats:
            h = fmt.get("height")
            if isinstance(h, (int, float)):
                max_height = max(max_height or 0, int(h))
        max_height = max_height or None
        upload_date = entry.get("upload_date")
        return cls(
            video_id=video_id,
            title=str(entry.get("title") or ""),
            url=str(entry.get("url") or (f"https://www.youtube.com/watch?v={video_id}" if video_id else "")),
            duration=_as_float(entry.get("duration")),
            view_count=_as_int(entry.get("view_count")),
            like_count=_as_int(entry.get("like_count")),
            upload_date=str(upload_date) if upload_date else None,
            channel=entry.get("channel") or entry.get("uploader") or None,
            channel_follower_count=_as_int(entry.get("channel_follower_count")),
            max_height=max_height,
            extra={"resolution": entry.get("resolution")},
        )

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["like_ratio"] = self.like_ratio
        data.pop("extra", None)
        return data


def _as_float(value: Any) -> Optional[float]:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _as_int(value: Any) -> Optional[int]:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


@dataclass
class ClipInfo:
    """One produced 60s clip."""

    file: str                 # absolute or workspace-relative path
    source_id: str
    source_title: str
    index: int                # 1-based position in the source video
    start: float              # seconds
    end: float                # seconds
    duration: float           # seconds

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class PipelineResult:
    """Outcome of a full find->download->clip run."""

    sources: List[Dict[str, Any]] = field(default_factory=list)
    clips: List[Dict[str, Any]] = field(default_factory=list)
    manifest_path: Optional[str] = None
    errors: List[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return bool(self.clips) and not self.errors

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
