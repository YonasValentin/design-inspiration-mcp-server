# design-inspiration

MCP server that searches Dribbble, Behance, Awwwards, Mobbin, and Pinterest for UI design inspiration. Built for Claude Code but works with any MCP client.

Uses the [Serper API](https://serper.dev) (Google search) with `site:` filters to scope results to design platforms only. Can also extract actual design tokens (colors, fonts, spacing) from any live website via headless browser.

Find inspiration, then extract exact tokens from sites you like.

## Why

I wanted Claude to pull design references while building UI — look at real Dribbble shots, find color palettes, browse layout patterns — without leaving the terminal. The existing options either required Playwright (heavy) or didn't return image URLs I could actually download and view.

The search side wraps Serper's image and web search endpoints with pre-configured site filters. Simple.

The token extraction side came from a different itch: I'd find a site I liked on Dribbble, open it, and then manually eyedrop colors and inspect fonts. Now I just point `design_extract_tokens` at the URL and get the exact values back.

## Tools

**`design_search_images`** — Image search across design platforms. Returns image URLs, dimensions, source links. Good for finding visual references for a specific UI pattern.

**`design_search_references`** — Web search scoped to design sites. Returns article titles, snippets, links. Better for finding case studies, design system docs, or pattern explanations.

**`design_search_styles`** — Searches for a specific aesthetic direction (color palette, typography, layout, animation). Runs both image and web search in parallel, returns combined results.

**`design_extract_tokens`** — Extracts design tokens from a live website. Point it at any URL and get back colors, typography, spacing, border radii, and shadows. Supports `dark_mode` and `mobile` flags. Requires `dembrandt` installed globally (`npm install -g dembrandt`).

The three search tools accept a `sites` parameter to filter to specific platforms, and a `num` parameter to control result count.

## Setup

You need a Serper API key for the search tools. Free tier gives you 2,500 searches with no credit card.

1. Sign up at [serper.dev](https://serper.dev)
2. Copy your API key

For token extraction, install dembrandt globally:

```bash
npm install -g dembrandt
```

### Claude Code

```bash
claude mcp add design-inspiration -e SERPER_API_KEY=your-key-here -- node /path/to/design-inspiration-mcp-server/dist/index.js
```

### Any MCP client (stdio)

```json
{
  "design-inspiration": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/design-inspiration-mcp-server/dist/index.js"],
    "env": {
      "SERPER_API_KEY": "your-key-here"
    }
  }
}
```

## Build from source

```bash
git clone https://github.com/YonasValentin/design-inspiration-mcp-server.git
cd design-inspiration-mcp-server
npm install
npm run build
```

## How it actually works

Each tool builds a search query by appending `site:dribbble.com OR site:behance.net OR ...` to whatever you searched for. Then it hits Serper's `/images` or `/search` endpoint and formats the response.

The `design_search_styles` tool runs both endpoints in parallel (`Promise.all`) to get images and articles for the same query.

`design_extract_tokens` shells out to `dembrandt` (via `child_process.execFile`) with `--json-only`, parses the JSON output, and formats it into markdown + structured data. 60-second timeout. No extra npm dependencies — dembrandt runs as a global CLI and `child_process` is built-in.

Results are returned as both markdown (for display) and structured JSON (for programmatic use). Responses get truncated at 25,000 characters to avoid flooding the context window.

## Usage tips

Search for specific UI patterns, not generic terms:

```
# good
"fintech dashboard dark mode"
"mobile onboarding flow card swipe"
"saas pricing page comparison table"

# too vague
"nice website"
"good design"
```

You can download the returned image URLs and have Claude view them directly:

```bash
curl -sL "https://cdn.dribbble.com/..." -o /tmp/reference.jpg
```

Then ask Claude to read the image file — it can see and describe the design.

## License

MIT
