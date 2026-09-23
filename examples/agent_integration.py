"""How to plug the parkour clipper into an agent.

Everything the plugin returns is a plain JSON-serialisable dict, so it
drops into any tool-calling layer. Three common patterns below.

Setup:
    pip install -e .        # installs yt_clipper + yt-dlp
    # ffmpeg must be on PATH (brew/apt/choco, or `pip install static-ffmpeg`)
"""
from __future__ import annotations

import json

from yt_clipper.plugin import ParkourClippingPlugin

# ---------------------------------------------------------------------------
# 0) Build the plugin once, e.g. in your agent's init
# ---------------------------------------------------------------------------
plugin = ParkourClippingPlugin(output_dir="./clips")
# Tune it if you like - every ClippingConfig field can be overridden here:
# plugin = ParkourClippingPlugin(min_duration=900, min_views=500_000,
#                                clip_length=60, keep_source=False)

TOOLS = plugin.get_tools()  # ready-made OpenAI function-calling schemas


def dispatch(name: str, args: dict):
    """Map a tool call coming from your LLM to the matching plugin method."""
    if name == "find_videos":
        return plugin.find_videos(**args)
    if name == "make_clips":
        return plugin.make_clips(**args)
    if name == "clip_local":
        return plugin.clip_local(**args)
    if name == "process":
        return plugin.process(**args)
    raise ValueError(f"unknown tool: {name!r}")


# ---------------------------------------------------------------------------
# 1) OpenAI / any function-calling LLM (works with openai, langgraph, ...)
# ---------------------------------------------------------------------------
def openai_style_loop(client, model: str, user_request: str) -> str:
    """Minimal tool-calling loop. Swap `client.chat.completions.create`
    for whatever your agent framework calls under the hood."""
    messages = [
        {"role": "system", "content": (
            "You are a content automation agent. You have tools to find long, "
            "high-quality Minecraft parkour videos on YouTube and cut them into "
            "60-second clips. When asked to produce clips, call the `process` "
            "tool unless the user names a specific video."
        )},
        {"role": "user", "content": user_request},
    ]
    while True:
        resp = client.chat.completions.create(
            model=model, messages=messages, tools=TOOLS,
        )
        msg = resp.choices[0].message
        messages.append(msg)
        if not msg.tool_calls:
            return msg.content
        for call in msg.tool_calls:
            name = call.function.name
            args = json.loads(call.function.arguments or "{}")
            result = json.dumps(dispatch(name, args))  # tool result back to LLM
            messages.append({"role": "tool", "tool_call_id": call.id, "content": result})


# ---------------------------------------------------------------------------
# 2) LangChain
# ---------------------------------------------------------------------------
def langchain_tools():
    from langchain_core.tools import tool  # pip install langchain-core

    @tool
    def find_videos(limit: int = 5, query: str | None = None) -> list[dict]:
        """Find long, high-quality Minecraft parkour videos on YouTube (no download)."""
        return plugin.find_videos(limit=limit, query=query)

    @tool
    def make_clips(video: str, clip_length: float = 60, overlap: float = 0) -> list[dict]:
        """Download a YouTube video (id or URL) and cut it into ~60s clips."""
        return plugin.make_clips(video=video, clip_length=clip_length, overlap=overlap)

    @tool
    def clip_local(file_path: str, clip_length: float = 60, overlap: float = 0) -> list[dict]:
        """Cut a local video file into ~60s clips."""
        return plugin.clip_local(file_path, clip_length=clip_length, overlap=overlap)

    @tool
    def process(num_videos: int = 1) -> dict:
        """Full pipeline: find the best parkour video, download it, cut into clips."""
        return plugin.process(num_videos=num_videos)

    return [find_videos, make_clips, clip_local, process]


# ---------------------------------------------------------------------------
# 3) No LLM at all - straight script/cron automation
# ---------------------------------------------------------------------------
def plain_automation():
    result = plugin.process(num_videos=1)   # find -> download -> clip
    for clip in result["clips"]:
        print(clip["file"], clip["start"], clip["end"])
    # result["sources"][0] has the score breakdown if you want it
    # the JSON manifest is at result["manifest_path"]


if __name__ == "__main__":
    print(json.dumps(TOOLS, indent=2))
    print("\nTry: python examples/agent_integration.py")
    print("  plain_automation()  -> full pipeline")
    print("  openai_style_loop   -> wire into an LLM")
    print("  langchain_tools()   -> register with a LangChain agent")
