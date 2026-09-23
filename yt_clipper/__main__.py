"""CLI.

    python -m yt_clipper search  [--limit N] [--query Q] [--min-duration S]
    python -m yt_clipper process [--num-videos N] [-o OUTDIR] [--keep-source]
    python -m yt_clipper clip LOCAL_FILE [-o OUTDIR] [--length 60] [--overlap 0]

All output is JSON on stdout - easy to pipe into an agent or jq.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from typing import Optional

from .config import ClippingConfig
from .plugin import ParkourClippingPlugin


def _build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--ffmpeg-path", default=None,
                        help="explicit ffmpeg binary (default: ffmpeg on PATH)")

    p = argparse.ArgumentParser(prog="yt_clipper", parents=[common],
                                description=__doc__.strip().splitlines()[0])
    p.add_argument("-v", "--verbose", action="store_true", help="debug logging on stderr")
    sub = p.add_subparsers(dest="command", required=True)

    s = sub.add_parser("search", parents=[common],
                       help="find candidate videos (no download)")
    s.add_argument("--limit", type=int, default=5)
    s.add_argument("--query", help="single custom query (skips the default query set)")
    s.add_argument("--min-duration", type=float, default=None, help="seconds")
    s.add_argument("--min-views", type=int, default=None)
    s.add_argument("--max-duration", type=float, default=None, help="seconds")

    pr = sub.add_parser("process", parents=[common],
                        help="full pipeline: find, download, clip")
    pr.add_argument("--num-videos", type=int, default=1)
    pr.add_argument("-o", "--output-dir", default=None)
    pr.add_argument("--keep-source", action="store_true", help="don't delete the source file")
    pr.add_argument("--length", type=float, default=60.0, help="clip length in seconds")
    pr.add_argument("--overlap", type=float, default=0.0, help="clip overlap in seconds")

    c = sub.add_parser("clip", parents=[common],
                       help="cut a local video file into clips")
    c.add_argument("file", help="path to a local video")
    c.add_argument("-o", "--output-dir", default=None)
    c.add_argument("--length", type=float, default=60.0)
    c.add_argument("--overlap", type=float, default=0.0)
    c.add_argument("--title", default=None)
    return p


def main(argv: Optional[list] = None) -> int:
    args = _build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )

    overrides = {}
    if args.command in ("search", "process") and getattr(args, "min_duration", None):
        overrides["min_duration"] = args.min_duration
    if args.command == "search" and getattr(args, "min_views", None) is not None:
        overrides["min_views"] = args.min_views
    if args.command in ("search", "process") and getattr(args, "max_duration", None):
        overrides["max_duration"] = args.max_duration

    if getattr(args, "ffmpeg_path", None):
        overrides["ffmpeg_path"] = args.ffmpeg_path
    plugin = ParkourClippingPlugin(
        output_dir=args.output_dir if getattr(args, "output_dir", None) else None,
        **overrides,
    )

    if args.command == "search":
        result = plugin.find_videos(limit=args.limit, query=args.query)
    elif args.command == "process":
        if args.keep_source:
            plugin.cfg.keep_source = True
        plugin.cfg.clip_length = args.length
        plugin.cfg.clip_overlap = args.overlap
        result = plugin.process(num_videos=args.num_videos)
    else:  # clip
        result = plugin.clip_local(
            args.file, clip_length=args.length, overlap=args.overlap, title=args.title
        )

    json.dump(result, sys.stdout, indent=2, ensure_ascii=False)
    print()
    if isinstance(result, dict) and result.get("errors"):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
