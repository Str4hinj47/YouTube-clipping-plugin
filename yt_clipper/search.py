"""YouTube discovery via yt-dlp's search (no API key required).

Two stages:
  1. Flat search per query - cheap, gives id/title/duration/views.
  2. Detail fetch for the strongest coarse candidates - adds like counts,
     upload date and resolution, which the quality scorer needs.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional

import yt_dlp

from .config import ClippingConfig
from .models import VideoCandidate
from .quality import passes_hard_filters

log = logging.getLogger(__name__)

_FLAT_OPTS = {
    "quiet": True,
    "no_warnings": True,
    "skip_download": True,
    "extract_flat": "in_playlist",
    "noplaylist": True,
}

_DETAIL_OPTS = {
    "quiet": True,
    "no_warnings": True,
    "skip_download": True,
    "noplaylist": True,
}


class VideoSearcher:
    def __init__(self, cfg: ClippingConfig):
        self.cfg = cfg

    def _ydl_opts(self, base: Dict, extra: Optional[Dict] = None) -> Dict:
        opts = dict(base)
        opts["socket_timeout"] = self.cfg.socket_timeout
        opts["retries"] = self.cfg.retries
        if self.cfg.cookies_file:
            opts["cookiefile"] = self.cfg.cookies_file
        if extra:
            opts.update(extra)
        return opts

    def search_query(self, query: str, limit: Optional[int] = None) -> List[VideoCandidate]:
        """Flat-search one query; returns whatever YouTube returns."""
        limit = limit or self.cfg.max_results_per_query
        url = f"ytsearch{limit}:{query}"
        log.info("searching: %r", query)
        try:
            with yt_dlp.YoutubeDL(self._ydl_opts(_FLAT_OPTS)) as ydl:
                info = ydl.extract_info(url, download=False)
        except Exception as exc:  # noqa: BLE001 - report, don't kill the run
            log.warning("search %r failed: %s", query, exc)
            return []
        entries = (info or {}).get("entries") or []
        out = []
        for entry in entries:
            try:
                cand = VideoCandidate.from_ytdlp_entry(entry)
            except Exception as exc:  # noqa: BLE001
                log.warning("skipping unparseable entry: %s", exc)
                continue
            if cand.video_id:
                out.append(cand)
        return out

    def fetch_details(self, video_id: str) -> Optional[VideoCandidate]:
        """Full extract for one video (likes, upload date, resolution)."""
        url = f"https://www.youtube.com/watch?v={video_id}"
        try:
            with yt_dlp.YoutubeDL(self._ydl_opts(_DETAIL_OPTS)) as ydl:
                info = ydl.extract_info(url, download=False)
        except Exception as exc:  # noqa: BLE001
            log.warning("detail fetch for %s failed: %s", video_id, exc)
            return None
        if not info or not info.get("id"):
            return None
        return VideoCandidate.from_ytdlp_entry(info)

    def gather(self, queries: Optional[List[str]] = None) -> List[VideoCandidate]:
        """Full two-stage candidate gathering.

        Returns candidates that survive the hard filters, with full metadata
        for the strongest of them.
        """
        queries = queries or self.cfg.search_queries
        seen: Dict[str, VideoCandidate] = {}
        for q in queries:
            for cand in self.search_query(q):
                if cand.video_id not in seen:
                    seen[cand.video_id] = cand

        # Coarse pass with flat metadata (likes/date unknown yet - fine,
        # passes_hard_filters only gates on what it has).
        coarse = [c for c in seen.values() if passes_hard_filters(c, self.cfg)[0]]
        log.info("coarse candidates after hard filters: %d", len(coarse))

        # Rank by views, then duration, to pick who gets a detail fetch.
        coarse.sort(key=lambda c: (-(c.view_count or 0), -(c.duration or 0)))
        finalists: List[VideoCandidate] = []
        for cand in coarse[: self.cfg.detail_fetch_limit]:
            detail = self.fetch_details(cand.video_id) or cand
            ok, reason = passes_hard_filters(detail, self.cfg)
            if not ok:
                log.info("dropping %s: %s", cand.video_id, reason)
                continue
            finalists.append(detail)
        return finalists


__all__ = ["VideoSearcher"]
