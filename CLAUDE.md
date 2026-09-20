# Peaceful Pursuit

Single-page, no-build-step site: plain HTML/CSS/JS, a Three.js plane, synthesised sound, a dogfight mini-game. Dev server: `python serve.py` (or `preview_start({name: "portfolio"})`), port 5173, no-cache.

## LLM Wiki

This project has an external knowledge base (an "LLM wiki") — a standalone Obsidian vault, not part of this git repo (not committed, pushed, or affected by repo operations):

```
Project vault: D:\Claude\Obsidian\Peaceful Pursuit
Global vault:  D:\Claude\Obsidian\Global   (shared across all my projects — tool/language gotchas, personal conventions, reusable patterns)
```

Use the `llm-wiki` skill for the full procedure (what goes in which vault, when to read/update, inline vs. background-agent updates). Short version: **read `D:\Claude\Obsidian\Peaceful Pursuit\index.md` before exploring this repo for any nontrivial change** — its lookup table points at the specific file page (path + line-numbered section map) for almost any request, so you don't need to read the whole codebase. Verify line numbers against the real file before trusting them.
