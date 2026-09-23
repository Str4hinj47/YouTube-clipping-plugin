"""End-to-end pipeline: find -> score -> download -> clip -> manifest."""
from __future__ import annotations

import json
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .clip import find_ffmpeg, split_video
from .config import ClippingConfig
from .download import video_id_from_ref, download_video
from .models import PipelineResult, VideoCandidate
from .quality import score_candidates
from .search import VideoSearcher

log = logging.getLogger(__name__)


def _write_manifest(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def run_pipeline(
    cfg: ClippingConfig,
    queries: Optional[List[str]] = None,
    candidates: Optional[List[VideoCandidate]] = None,
) -> PipelineResult:
    """Find the best long parkour videos and cut them into clips.

    `candidates` lets an agent inject its own shortlist (skip the search).
    """
    cfg.output_dir = Path(cfg.output_dir)
    sources_dir = cfg.output_dir / "sources"
    clips_dir = cfg.output_dir / "clips"
    manifest_path = cfg.output_dir / "clips_manifest.json"
    ffmpeg = find_ffmpeg(cfg)

    result = PipelineResult()

    # 1. Discover ----------------------------------------------------------------
    if candidates is None:
        searcher = VideoSearcher(cfg)
        candidates = searcher.gather(queries)
    log.info("candidates to score: %d", len(candidates))

    # 2. Score -------------------------------------------------------------------
    ranked = score_candidates(candidates, cfg)
    if not ranked:
        result.errors.append("no candidates survived the quality filters")
        _write_manifest(manifest_path, _manifest_payload(cfg, result))
        return result

    # 3. Download + clip the top N ----------------------------------------------
    for score, breakdown, cand in ranked[: cfg.max_videos]:
        vid = cand.video_id
        entry: Dict[str, Any] = {
            "video_id": vid,
            "url": cand.url,
            "title": cand.title,
            "channel": cand.channel,
            "duration": cand.duration,
            "views": cand.view_count,
            "likes": cand.like_count,
            "like_ratio": round(cand.like_ratio, 4) if cand.like_ratio is not None else None,
            "upload_date": cand.upload_date,
            "max_height": cand.max_height,
            "score": score,
            "score_breakdown": breakdown,
            "clips": [],
        }
        try:
            src = download_video(vid, sources_dir, cfg, ffmpeg)
            clips = split_video(src, cand.title, vid, clips_dir, cfg, ffmpeg)
            for clip in clips:
                entry["clips"].append(clip.to_dict())
                result.clips.append(clip.to_dict())
            if not cfg.keep_source and src.exists():
                src.unlink()
        except Exception as exc:  # noqa: BLE001 - keep going with the next candidate
            log.error("pipeline failed for %s: %s", vid, exc)
            result.errors.append(f"{vid}: {exc}")
            continue
        result.sources.append(entry)
        log.info("clipped %d segments from %s (%s)", len(entry["clips"]), cand.title, vid)

    _write_manifest(manifest_path, _manifest_payload(cfg, result))
    result.manifest_path = str(manifest_path)
    return result


def _manifest_payload(cfg: ClippingConfig, result: PipelineResult) -> Dict[str, Any]:
    return {
        "plugin": "youtube-clipping-plugin",
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "config": cfg.to_dict(),
        "sources": result.sources,
        "clips": result.clips,
        "errors": result.errors,
    }


def clip_local_file(
    video_path: Path,
    title: Optional[str],
    cfg: ClippingConfig,
    out_dir: Optional[Path] = None,
    source_id: Optional[str] = None,
) -> PipelineResult:
    """Cut an existing local file into clips (no search, no download)."""
    video_path = Path(video_path)
    if not video_path.exists():
        raise FileNotFoundError(video_path)
    cfg.output_dir = Path(cfg.output_dir)
    clips_dir = Path(out_dir) if out_dir else cfg.output_dir / "clips"
    manifest_path = (Path(out_dir) if out_dir else cfg.output_dir) / "clips_manifest.json"
    ffmpeg = find_ffmpeg(cfg)

    result = PipelineResult()
    try:
        clips = split_video(
            video_path,
            title or video_path.stem,
            source_id or video_path.stem,
            clips_dir,
            cfg,
            ffmpeg,
        )
        for clip in clips:
            entry: Dict[str, Any] = {
                "video_id": source_id or video_path.stem,
                "url": str(video_path),
                "title": title or video_path.stem,
                "source_file": str(video_path),
                "clips": [clip.to_dict()],
            }
            result.sources.append(entry)
            result.clips.append(clip.to_dict())
    except Exception as exc:  # noqa: BLE001
        result.errors.append(f"{video_path.name}: {exc}")
        raise
    _write_manifest(manifest_path, _manifest_payload(cfg, result))
    result.manifest_path = str(manifest_path)
    return result


def make_clips_for(
    video_ref: str,
    cfg: ClippingConfig,
) -> PipelineResult:
    """Download (if needed) and clip one specific video: id or URL or local path."""
    video_ref = str(video_ref).strip()
    if video_ref and (Path(video_ref).exists()):
        return clip_local_file(Path(video_ref), None, cfg, source_id=video_ref)

    vid = video_id_from_ref(video_ref)
    cfg.output_dir = Path(cfg.output_dir)
    sources_dir = cfg.output_dir / "sources"
    clips_dir = cfg.output_dir / "clips"
    manifest_path = cfg.output_dir / "clips_manifest.json"
    ffmpeg = find_ffmpeg(cfg)

    result = PipelineResult()
    src = download_video(vid, sources_dir, cfg, ffmpeg)
    # We need the title for nice clip names - a detail fetch is cheap and cached in yt-dlp.
    import yt_dlp

    try:
        with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True}) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={vid}", download=False)
        title = (info or {}).get("title") or vid
    except Exception:  # noqa: BLE001
        title = vid

    clips = split_video(src, title, vid, clips_dir, cfg, ffmpeg)
    entry: Dict[str, Any] = {
        "video_id": vid,
        "url": f"https://www.youtube.com/watch?v={vid}",
        "title": title,
        "clips": [c.to_dict() for c in clips],
    }
    result.sources.append(entry)
    result.clips = [c.to_dict() for c in clips]
    if not cfg.keep_source:
        shutil.rmtree(sources_dir, ignore_errors=True)
    _write_manifest(manifest_path, _manifest_payload(cfg, result))
    result.manifest_path = str(manifest_path)
    return result
