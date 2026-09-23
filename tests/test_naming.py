"""Filename sanitisation + video id parsing."""
from __future__ import annotations

from yt_clipper.clip import sanitize_filename
from yt_clipper.download import video_id_from_ref


def test_sanitize_filename():
    assert sanitize_filename("Minecraft Parkour: NO FALL!! (1 life)") == "minecraft-parkour-no-fall-1-life"
    assert sanitize_filename("  --weird__stuff//  ") == "weird-stuff"
    assert sanitize_filename("") == "video"
    assert sanitize_filename("a" * 200, max_len=60) <= "a" * 60
    assert sanitize_filename("no trailing -") == "no-trailing"


def test_video_id_from_ref():
    assert video_id_from_ref("dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert video_id_from_ref("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12") == "dQw4w9WgXcQ"
    assert video_id_from_ref("https://youtu.be/dQw4w9WgXcQ?si=abc") == "dQw4w9WgXcQ"
    assert video_id_from_ref("https://www.youtube.com/shorts/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert video_id_from_ref("https://www.youtube.com/live/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    try:
        video_id_from_ref("https://example.com/foo")
        assert False, "should have raised"
    except ValueError:
        pass
