# Changelog

## 1.1.0 — 2026-03-01

**New tool: `design_extract_tokens`**

Extracts design tokens (colors, typography, spacing, borders, shadows) from any live website. Pass it a URL, get back the exact values. Supports dark mode and mobile viewport extraction.

Requires `dembrandt` installed globally (`npm install -g dembrandt`). No new npm dependencies in the project itself — it shells out to the CLI via `child_process`.

## 1.0.0 — 2025-02-20

Initial release with three search tools:

- `design_search_images` — image search across Dribbble, Behance, Awwwards, Mobbin, Pinterest
- `design_search_references` — web search scoped to design platforms
- `design_search_styles` — combined image + web search for a specific aesthetic direction
