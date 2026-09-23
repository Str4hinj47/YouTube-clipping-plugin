"""Quality scoring: turn raw candidate metadata into a 0..1 "worth clipping" score."""
from __future__ import annotations

import datetime as _dt
import re
from typing import Dict, Iterable, Optional, Tuple

from .config import ClippingConfig
from .models import VideoCandidate

# Title signals that a video is actually parkour content and likely watchable
# end-to-end (compilations with tons of cuts tend to score lower).
_PARKOUR_TERMS = re.compile(
    r"\b(parkour|no\s?fall|one\s?life|1\s?life|obby|obstacle|gym|challenge"
    r"|speedrun|speed\s?run|full\s?run|no\s?clip)\b",
    re.IGNORECASE,
)
_MINECRAFT_RE = re.compile(r"minecraft", re.IGNORECASE)
_LONG_RUN_RE = re.compile(r"\b(24\s?hours?|48\s?hours?|72\s?hours?|marathon|no\s?fall|full\b)", re.IGNORECASE)


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def age_days(upload_date: Optional[str], now: Optional[_dt.date] = None) -> Optional[float]:
    """Age in days of a YYYYMMDD upload date, or None if unknown."""
    if not upload_date:
        return None
    try:
        d = _dt.datetime.strptime(upload_date, "%Y%m%d").date()
    except ValueError:
        return None
    now = now or _dt.date.today()
    return max(0.0, (now - d).days)


def duration_score(duration: Optional[float], cfg: ClippingConfig) -> Optional[float]:
    if duration is None:
        return None
    if duration < cfg.min_duration:
        return 0.0
    ideal = max(cfg.ideal_duration, cfg.min_duration + 1)
    return _clamp((duration - cfg.min_duration) / (ideal - cfg.min_duration))


def views_score(view_count: Optional[int], cfg: ClippingConfig) -> Optional[float]:
    if not view_count:
        return None
    # log10 scale: 100k views -> ~0, 10M views -> 1
    lo, hi = 5.0, 7.0
    import math

    return _clamp((math.log10(max(view_count, 1)) - lo) / (hi - lo))


def likes_score(cand: VideoCandidate) -> Optional[float]:
    r = cand.like_ratio
    if r is None:
        return None
    # 4% -> 0, 8% -> 1
    return _clamp((r - 0.04) / (0.08 - 0.04))


def recency_score(upload_date: Optional[str], now: Optional[_dt.date] = None) -> Optional[float]:
    d = age_days(upload_date, now)
    if d is None:
        return None
    if d <= 30:
        return 1.0
    # exponential decay, half-life one year
    return 0.5 ** (d / 365.0)


def keyword_score(title: str) -> float:
    if not title:
        return 0.0
    score = 0.0
    if _MINECRAFT_RE.search(title):
        score += 0.4
    if _PARKOUR_TERMS.search(title):
        score += 0.4
    if _LONG_RUN_RE.search(title):
        score += 0.2
    return _clamp(score)


def quality_score(
    cand: VideoCandidate,
    cfg: ClippingConfig,
    now: Optional[_dt.date] = None,
) -> Tuple[float, Dict[str, Optional[float]]]:
    """Score a candidate 0..1.

    Returns (score, breakdown). Unknown components are dropped and the
    remaining weights are renormalised, so missing metadata doesn't tank
    a good video.
    """
    parts: Dict[str, Tuple[Optional[float], float]] = {
        "duration": (duration_score(cand.duration, cfg), cfg.w_duration),
        "views": (views_score(cand.view_count, cfg), cfg.w_views),
        "likes": (likes_score(cand), cfg.w_likes),
        "recency": (recency_score(cand.upload_date, now), cfg.w_recency),
        "keywords": (keyword_score(cand.title), cfg.w_keywords),
    }

    known = {k: (v, w) for k, (v, w) in parts.items() if v is not None}
    if not known:
        return 0.0, {k: None for k in parts}
    total_w = sum(w for _, w in known.values())
    score = sum(v * w for v, w in known.values()) / total_w
    breakdown = {k: parts[k][0] for k in parts}
    return round(score, 4), breakdown


def passes_hard_filters(cand: VideoCandidate, cfg: ClippingConfig, now: Optional[_dt.date] = None) -> Tuple[bool, Optional[str]]:
    """Non-negotiable gates. Returns (ok, reason_if_not)."""
    if cand.duration is None:
        return False, "duration unknown"
    if cand.duration < cfg.min_duration:
        return False, f"too short ({cand.duration:.0f}s < {cfg.min_duration:.0f}s)"
    if cand.duration > cfg.max_duration:
        return False, f"too long ({cand.duration:.0f}s > {cfg.max_duration:.0f}s)"
    if cfg.min_views and (cand.view_count or 0) < cfg.min_views:
        return False, f"too few views ({cand.view_count or 0} < {cfg.min_views})"
    if cfg.min_like_ratio and cand.like_count is not None and cand.view_count:
        if cand.like_ratio < cfg.min_like_ratio:
            return False, f"low like ratio ({cand.like_ratio:.3f} < {cfg.min_like_ratio})"
    d = age_days(cand.upload_date, now)
    if cfg.max_upload_age_days and d is not None and d > cfg.max_upload_age_days:
        return False, f"too old ({d:.0f} days)"
    if cand.max_height is not None and cand.max_height < cfg.min_height:
        return False, f"low resolution (max {cand.max_height}p)"
    return True, None


def score_candidates(
    candidates: Iterable[VideoCandidate],
    cfg: ClippingConfig,
    now: Optional[_dt.date] = None,
) -> list:
    """Score every candidate; return [(score, breakdown, candidate)] sorted best-first."""
    out = []
    for cand in candidates:
        ok, _reason = passes_hard_filters(cand, cfg, now)
        if not ok:
            continue
        score, breakdown = quality_score(cand, cfg, now)
        if score < cfg.min_score:
            continue
        out.append((score, breakdown, cand))
    out.sort(key=lambda item: (-item[0], -(item[2].view_count or 0)))
    return out
