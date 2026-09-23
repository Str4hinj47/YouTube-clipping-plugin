"""Quality scoring + hard filters."""
from __future__ import annotations

import datetime

import pytest

from yt_clipper.config import ClippingConfig
from yt_clipper.models import VideoCandidate
from yt_clipper.quality import (
    age_days,
    keyword_score,
    passes_hard_filters,
    quality_score,
    score_candidates,
)

NOW = datetime.date(2026, 9, 23)
CFG = ClippingConfig()  # defaults: min 600s, min 100k views, 0.04 like ratio


def cand(**kw) -> VideoCandidate:
    base = dict(
        video_id="abc",
        title="Minecraft Parkour No Fall Challenge",
        url="https://www.youtube.com/watch?v=abc",
        duration=1200,
        view_count=2_000_000,
        like_count=100_000,
        upload_date="20260101",
        max_height=1080,
    )
    base.update(kw)
    return VideoCandidate(**base)


def test_duration_component_saturates_at_ideal():
    assert quality_score(cand(duration=600), CFG, NOW)[1]["duration"] == 0.0
    assert quality_score(cand(duration=1200), CFG, NOW)[1]["duration"] == pytest.approx(0.5)
    assert quality_score(cand(duration=1800), CFG, NOW)[1]["duration"] == 1.0
    assert quality_score(cand(duration=5000), CFG, NOW)[1]["duration"] == 1.0  # clamped


def test_views_component_log_scale():
    assert quality_score(cand(view_count=100_000), CFG, NOW)[1]["views"] == pytest.approx(0.0)
    assert quality_score(cand(view_count=10_000_000), CFG, NOW)[1]["views"] == pytest.approx(1.0)
    assert quality_score(cand(view_count=None), CFG, NOW)[1]["views"] is None


def test_recency_decays_with_half_life_year():
    fresh = quality_score(cand(upload_date="20260901"), CFG, NOW)[1]["recency"]
    old = quality_score(cand(upload_date="20250923"), CFG, NOW)[1]["recency"]
    older = quality_score(cand(upload_date="20240923"), CFG, NOW)[1]["recency"]
    assert fresh == pytest.approx(1.0)
    assert old == pytest.approx(0.5)
    assert older == pytest.approx(0.25, abs=0.01)
    assert quality_score(cand(upload_date=None), CFG, NOW)[1]["recency"] is None


def test_keyword_signals():
    assert keyword_score("Minecraft Parkour: NO FALL 1 Life challenge") == pytest.approx(1.0)
    assert keyword_score("minecraft speedrun world record") < 1.0
    assert keyword_score("how to make a bed in minecraft") < keyword_score("minecraft parkour")
    assert keyword_score("totally unrelated vlog") == 0.0


def test_missing_likes_renormalises_weights():
    scored, breakdown = quality_score(cand(like_count=None), CFG, NOW)
    assert breakdown["likes"] is None
    assert 0.0 < scored <= 1.0
    # without likes the remaining components should scale up: a video that
    # would score 0 with full data still scores something meaningful
    full, _ = quality_score(cand(), CFG, NOW)
    assert scored != pytest.approx(full)


def test_better_video_scores_higher():
    strong = cand(duration=2400, view_count=8_000_000, like_count=500_000, upload_date="20260601")
    weak = cand(
        video_id="def",
        title="some random minecraft video",
        duration=620,
        view_count=120_000,
        like_count=5_000,
        upload_date="20200301",
        max_height=720,
    )
    s_strong, _ = quality_score(strong, CFG, NOW)
    s_weak, _ = quality_score(weak, CFG, NOW)
    assert s_strong > s_weak > 0.0


def test_hard_filters():
    assert passes_hard_filters(cand(), CFG, NOW)[0]
    assert passes_hard_filters(cand(duration=300), CFG, NOW) == (False, "too short (300s < 600s)")
    assert not passes_hard_filters(cand(duration=4000), CFG, NOW)[0]  # > 1h
    assert not passes_hard_filters(cand(view_count=50_000), CFG, NOW)[0]
    assert not passes_hard_filters(cand(like_count=1000, view_count=100_000), CFG, NOW)[0]  # 1% ratio
    assert not passes_hard_filters(cand(upload_date="20150101"), CFG, NOW)[0]  # > 3y
    assert not passes_hard_filters(cand(max_height=480), CFG, NOW)[0]
    # unknown values never hard-fail (may be flat-search entries)
    assert passes_hard_filters(cand(duration=None), CFG, NOW) == (False, "duration unknown")
    ok = cand(like_count=None, upload_date=None, max_height=None)
    assert passes_hard_filters(ok, CFG, NOW)[0]


def test_score_candidates_sorts_and_filters():
    pool = [
        cand(video_id="a", view_count=100_000, like_count=5_000, duration=610),
        cand(video_id="b", view_count=5_000_000, like_count=300_000, duration=2000, upload_date="20260501"),
        cand(video_id="c", duration=300),  # filtered out: too short
    ]
    ranked = score_candidates(pool, CFG, NOW)
    assert [item[2].video_id for item in ranked] == ["b", "a"]
    scores = [item[0] for item in ranked]
    assert scores == sorted(scores, reverse=True)


def test_age_days():
    assert age_days("20260923", NOW) == 0.0
    assert age_days("20260924", NOW) == 0.0  # future clamps
    assert age_days("20260922", NOW) == 1.0
    assert age_days("bogus", NOW) is None
    assert age_days(None, NOW) is None
