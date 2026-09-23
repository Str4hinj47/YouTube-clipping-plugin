"""Shared fixtures.

The clip tests need a real ffmpeg binary. We use the system ffmpeg when
present, and fall back to the static binary bundled with `imageio-ffmpeg`
(dev dependency) so the suite also runs in minimal containers.
"""
from __future__ import annotations

import shutil
import subprocess

import pytest


def _find_ffmpeg() -> str:
    system = shutil.which("ffmpeg")
    if system:
        return system
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        pytest.skip("ffmpeg not available (install ffmpeg or `pip install imageio-ffmpeg`)")


FFMPEG = _find_ffmpeg()


@pytest.fixture(scope="session")
def demo_video(tmp_path_factory):
    """A 250s synthetic video (160x120, 15fps, sine audio)."""
    out_dir = tmp_path_factory.mktemp("media")
    path = out_dir / "demo.mp4"
    if not path.exists():
        subprocess.run(
            [
                FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
                "-f", "lavfi", "-i", "testsrc=duration=250:size=160x120:rate=15",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=250",
                "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-shortest", str(path),
            ],
            check=True,
        )
    return path
