"""End-to-end ffmpeg cutting on a synthetic 250s video (no network)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from conftest import FFMPEG

from yt_clipper.clip import probe_duration, split_video
from yt_clipper.config import ClippingConfig
from yt_clipper.plugin import ParkourClippingPlugin


@pytest.fixture()
def cfg(tmp_path):
    return ClippingConfig(output_dir=tmp_path / "out", ffmpeg_path=FFMPEG)


def test_split_produces_back_to_back_60s_clips(demo_video, cfg, tmp_path):
    clips = split_video(demo_video, "Demo Parkour Run", "demovid0", tmp_path / "clips", cfg)
    assert [c.index for c in clips] == [1, 2, 3, 4]
    assert [(c.start, c.end) for c in clips] == [
        (0.0, 60.0), (60.0, 120.0), (120.0, 180.0), (180.0, 240.0),
    ]
    for clip in clips:
        path = Path(clip.file)
        assert path.exists()
        assert path.name.endswith(f"_{clip.index:02d}_{int(clip.start)}-{int(clip.end)}s.mp4")
        actual = probe_duration(path, FFMPEG)
        assert actual == pytest.approx(60.0, abs=1.5)


def test_split_with_overlap(demo_video, cfg, tmp_path):
    cfg.clip_overlap = 5.0
    clips = split_video(demo_video, "Demo", "demovid0", tmp_path / "clips", cfg)
    assert len(clips) == 5
    assert clips[-1].duration == pytest.approx(30.0, abs=1.5)
    for a, b in zip(clips, clips[1:]):
        assert b.start == pytest.approx(a.start + 55.0)


def test_split_skips_intro_outro(demo_video, cfg, tmp_path):
    cfg.skip_intro = 30.0
    cfg.skip_outro = 20.0
    clips = split_video(demo_video, "Demo", "demovid0", tmp_path / "clips", cfg)
    assert [(c.start, c.end) for c in clips] == [(30.0, 90.0), (90.0, 150.0), (150.0, 210.0)]


def test_plugin_clip_local_returns_json_safe_clips(demo_video, tmp_path):
    plugin = ParkourClippingPlugin(output_dir=tmp_path / "out", ffmpeg_path=FFMPEG)
    clips = plugin.clip_local(str(demo_video), title="Plugin Demo")
    assert len(clips) == 4
    json.dumps(clips)  # must be serialisable for agent tool responses
    first = clips[0]
    assert set(first) == {"file", "source_id", "source_title", "index", "start", "end", "duration"}
    assert "plugin-demo" in Path(first["file"]).name
    assert Path(first["file"]).is_absolute()


def test_tool_schemas_are_valid_openai_tools():
    tools = ParkourClippingPlugin.get_tools()
    names = {t["function"]["name"] for t in tools}
    assert names == {"find_videos", "make_clips", "clip_local", "process"}
    for t in tools:
        assert t["type"] == "function"
        assert t["function"]["parameters"]["type"] == "object"
        for prop in t["function"]["parameters"]["properties"].values():
            assert "type" in prop
