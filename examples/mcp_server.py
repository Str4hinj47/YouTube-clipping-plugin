"""Optional: expose the plugin as an MCP (Model Context Protocol) server.

Run with:
    pip install "mcp[cli]"
    python examples/mcp_server.py

Then point any MCP client (Claude Desktop, Cursor, OpenAI Agents SDK,
LangGraph MCP adapter, ...) at this file. Your agent gets the four tools:
find_videos, make_clips, clip_local, process.
"""
from __future__ import annotations

import json
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from yt_clipper.plugin import ParkourClippingPlugin

# Server-level config; agents can't override per call, so keep it sane.
plugin = ParkourClippingPlugin(output_dir=Path(__file__).parent / "clips")
mcp = FastMCP("youtube-parkour-clipper")


def _json(value) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False)


@mcp.tool()
def find_videos(limit: int = 5, query: str | None = None) -> str:
    """Search YouTube for long, high-quality Minecraft parkour videos and
    return the top candidates with quality scores. Nothing is downloaded."""
    return _json(plugin.find_videos(limit=limit, query=query))


@mcp.tool()
def make_clips(video: str, clip_length: float = 60, overlap: float = 0) -> str:
    """Download a YouTube video (id or URL) and cut it into ~60-second clips."""
    return _json(plugin.make_clips(video=video, clip_length=clip_length, overlap=overlap))


@mcp.tool()
def clip_local(file_path: str, clip_length: float = 60, overlap: float = 0) -> str:
    """Cut an existing local video file into ~60-second clips."""
    return _json(plugin.clip_local(file_path, clip_length=clip_length, overlap=overlap))


@mcp.tool()
def process(num_videos: int = 1) -> str:
    """Full pipeline: find the best long parkour video, download it, cut it
    into ~60-second clips. Returns sources, scores, clip files, manifest."""
    return _json(plugin.process(num_videos=num_videos))


if __name__ == "__main__":
    mcp.run()
