# design-inspiration

MCP server that searches Dribbble, Behance, Awwwards, Mobbin, and Pinterest for UI design inspiration. Built for Claude Code but works with any MCP client.

Uses the [Serper API](https://serper.dev) (Google search) with `site:` filters to scope results to design platforms only. No scraping, no Playwright, no browser automation.

## Why

I wanted Claude to pull design references while building UI — look at real Dribbble shots, find color palettes, browse layout patterns — without leaving the terminal. The existing options either required Playwright (heavy) or didn't return image URLs I could actually download and view.

This just wraps Serper's image and web search endpoints with pre-configured site filters. Simple.

## Tools

**`design_search_images`** — Image search across design platforms. Returns image URLs, dimensions, source links. Good for finding visual references for a specific UI pattern.

**`design_search_references`** — Web search scoped to design sites. Returns article titles, snippets, links. Better for finding case studies, design system docs, or pattern explanations.

**`design_search_styles`** — Searches for a specific aesthetic direction (color palette, typography, layout, animation). Runs both image and web search in parallel, returns combined results.

All three tools accept a `sites` parameter to filter to specific platforms, and a `num` parameter to control result count.

## Setup

You need a Serper API key. Free tier gives you 2,500 searches with no credit card.

1. Sign up at [serper.dev](https://serper.dev)
2. Copy your API key

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

Results are returned as both markdown (for display) and structured JSON (for programmatic use). Responses get truncated at 25,000 characters to avoid flooding the context window.

That's it. ~250 lines of TypeScript, two dependencies (`@modelcontextprotocol/sdk` and `zod`).

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
