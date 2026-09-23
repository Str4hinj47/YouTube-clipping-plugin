"""plan_segments - pure cut-point math."""
from __future__ import annotations

import pytest

from yt_clipper.clip import plan_segments


def test_back_to_back_clips_drop_short_tail():
    segs = plan_segments(250, clip_length=60, min_clip_length=30)
    assert [ (s.start, s.end) for s in segs ] == [
        (0.0, 60.0), (60.0, 120.0), (120.0, 180.0), (180.0, 240.0),
    ]
    assert [s.index for s in segs] == [1, 2, 3, 4]


def test_exact_multiple():
    segs = plan_segments(180, clip_length=60, min_clip_length=30)
    assert len(segs) == 3
    assert segs[-1].end == 180.0


def test_overlap_steps_by_length_minus_overlap():
    segs = plan_segments(250, clip_length=60, overlap=5, min_clip_length=30)
    assert [(s.start, s.end) for s in segs] == [
        (0.0, 60.0), (55.0, 115.0), (110.0, 170.0), (165.0, 225.0), (220.0, 250.0),
    ]
    # last segment clamps to the video end and still meets min length
    assert segs[-1].length == pytest.approx(30.0)


def test_skip_intro_and_outro():
    segs = plan_segments(250, clip_length=60, skip_intro=30, skip_outro=20, min_clip_length=30)
    assert [(s.start, s.end) for s in segs] == [(30.0, 90.0), (90.0, 150.0), (150.0, 210.0)]


def test_shorter_than_min_clip_yields_nothing():
    assert plan_segments(20, clip_length=60, min_clip_length=30) == []
    assert plan_segments(0, clip_length=60) == []
    assert plan_segments(-5, clip_length=60) == []


def test_short_video_yields_one_partial_clip():
    segs = plan_segments(45, clip_length=60, min_clip_length=30)
    assert [(s.start, s.end) for s in segs] == [(0.0, 45.0)]


def test_content_smaller_than_intro():
    assert plan_segments(250, clip_length=60, skip_intro=300) == []


def test_tail_between_min_and_full_kept():
    # 60 + 40 of content -> second segment is a 40s clip, kept
    segs = plan_segments(100, clip_length=60, min_clip_length=30)
    assert [(s.start, s.end) for s in segs] == [(0.0, 60.0), (60.0, 100.0)]
    assert segs[1].length == pytest.approx(40.0)


def test_indices_and_lengths():
    segs = plan_segments(400, clip_length=60, overlap=10, min_clip_length=30)
    assert [s.index for s in segs] == list(range(1, len(segs) + 1))
    for s in segs[:-1]:
        assert s.length == pytest.approx(60.0)
    for a, b in zip(segs, segs[1:]):
        assert b.start == pytest.approx(a.start + 50.0)
        assert b.start < a.end  # real overlap
