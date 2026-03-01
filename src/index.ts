#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile } from "node:child_process";
import { z } from "zod";

const SERPER_API_URL = "https://google.serper.dev";
const CHARACTER_LIMIT = 25000;

const DESIGN_SITES = {
  dribbble: "dribbble.com",
  behance: "behance.net",
  awwwards: "awwwards.com",
  mobbin: "mobbin.com",
  pinterest: "pinterest.com",
} as const;

type DesignSite = keyof typeof DESIGN_SITES;

async function serperRequest<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "SERPER_API_KEY environment variable is required. Get one free at https://serper.dev"
    );
  }

  const response = await fetch(`${SERPER_API_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 401)
      throw new Error("Error: Invalid SERPER_API_KEY. Check your key at https://serper.dev/api-key");
    if (status === 429)
      throw new Error("Error: Rate limit exceeded. Wait before making more requests.");
    throw new Error(`Error: Serper API returned status ${status}`);
  }

  return response.json() as Promise<T>;
}

interface SerperImage {
  title: string;
  imageUrl: string;
  imageWidth?: number;
  imageHeight?: number;
  thumbnailUrl?: string;
  source: string;
  link: string;
}

interface SerperImagesResponse {
  images: SerperImage[];
  searchParameters?: Record<string, unknown>;
}

interface SerperOrganicResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

interface SerperSearchResponse {
  organic: SerperOrganicResult[];
  searchParameters?: Record<string, unknown>;
}

function formatImageResults(images: SerperImage[], query: string): string {
  if (!images.length) return `No design inspiration found for "${query}".`;

  const lines = [`# Design Inspiration: "${query}"`, "", `Found ${images.length} results`, ""];
  for (const img of images) {
    lines.push(`## ${img.title}`);
    lines.push(`- **Source**: ${img.source}`);
    lines.push(`- **Image**: ${img.imageUrl}`);
    lines.push(`- **Page**: ${img.link}`);
    if (img.imageWidth && img.imageHeight) {
      lines.push(`- **Size**: ${img.imageWidth}x${img.imageHeight}`);
    }
    lines.push("");
  }

  let result = lines.join("\n");
  if (result.length > CHARACTER_LIMIT) {
    result = result.slice(0, CHARACTER_LIMIT) + "\n\n...(truncated, use fewer results)";
  }
  return result;
}

function formatSearchResults(results: SerperOrganicResult[], query: string): string {
  if (!results.length) return `No results found for "${query}".`;

  const lines = [`# Design References: "${query}"`, "", `Found ${results.length} results`, ""];
  for (const r of results) {
    lines.push(`## ${r.title}`);
    lines.push(`${r.snippet}`);
    lines.push(`- **Link**: ${r.link}`);
    lines.push("");
  }

  let result = lines.join("\n");
  if (result.length > CHARACTER_LIMIT) {
    result = result.slice(0, CHARACTER_LIMIT) + "\n\n...(truncated, use fewer results)";
  }
  return result;
}

function buildSiteQuery(query: string, sites: DesignSite[]): string {
  if (!sites.length) {
    const allSites = Object.values(DESIGN_SITES);
    const siteFilter = allSites.map((s) => `site:${s}`).join(" OR ");
    return `${query} (${siteFilter})`;
  }
  const siteFilter = sites.map((s) => `site:${DESIGN_SITES[s]}`).join(" OR ");
  return `${query} (${siteFilter})`;
}

const server = new McpServer({
  name: "design-inspiration-mcp-server",
  version: "1.0.0",
});

const SearchImagesInputSchema = z
  .object({
    query: z
      .string()
      .min(2, "Query must be at least 2 characters")
      .max(200, "Query must not exceed 200 characters")
      .describe(
        'UI design search query. Examples: "dashboard dark mode", "mobile onboarding flow", "saas pricing page"'
      ),
    sites: z
      .array(z.enum(["dribbble", "behance", "awwwards", "mobbin", "pinterest"]))
      .default([])
      .describe(
        "Filter to specific design sites. Empty array searches all sites. Options: dribbble, behance, awwwards, mobbin, pinterest"
      ),
    num: z
      .number()
      .int()
      .min(1)
      .max(40)
      .default(10)
      .describe("Number of image results to return (1-40, default: 10)"),
  })
  .strict();

type SearchImagesInput = z.infer<typeof SearchImagesInputSchema>;

server.registerTool("design_search_images", {
  title: "Search design images",
  description: `Image search across Dribbble, Behance, Awwwards, Mobbin, and Pinterest. Returns image URLs, dimensions, and source links. Use specific UI terms ("fintech dashboard dark mode") over vague ones ("nice design").`,
  inputSchema: SearchImagesInputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
}, async (params: SearchImagesInput) => {
  try {
    const siteQuery = buildSiteQuery(params.query + " UI design", params.sites);
    const data = await serperRequest<SerperImagesResponse>("/images", {
      q: siteQuery,
      num: params.num,
    });

    const images = data.images || [];
    const text = formatImageResults(images, params.query);

    return {
      content: [{ type: "text" as const, text }],
      structuredContent: {
        query: params.query,
        count: images.length,
        images: images.map((img) => ({
          title: img.title,
          imageUrl: img.imageUrl,
          thumbnailUrl: img.thumbnailUrl,
          source: img.source,
          link: img.link,
          width: img.imageWidth,
          height: img.imageHeight,
        })),
      },
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: error instanceof Error ? error.message : `Error: ${String(error)}`,
        },
      ],
    };
  }
});

const SearchReferencesInputSchema = z
  .object({
    query: z
      .string()
      .min(2)
      .max(200)
      .describe(
        'UI design search query. Examples: "best dashboard designs 2025", "mobile navigation patterns"'
      ),
    sites: z
      .array(z.enum(["dribbble", "behance", "awwwards", "mobbin", "pinterest"]))
      .default([])
      .describe("Filter to specific design sites. Empty array searches all sites."),
    num: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(10)
      .describe("Number of results to return (1-20, default: 10)"),
  })
  .strict();

type SearchReferencesInput = z.infer<typeof SearchReferencesInputSchema>;

server.registerTool("design_search_references", {
  title: "Search design references",
  description: `Web search scoped to design platforms. Returns article titles, snippets, and links. Better than image search when you want case studies, write-ups, or design system documentation.`,
  inputSchema: SearchReferencesInputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
}, async (params: SearchReferencesInput) => {
  try {
    const siteQuery = buildSiteQuery(params.query, params.sites);
    const data = await serperRequest<SerperSearchResponse>("/search", {
      q: siteQuery,
      num: params.num,
    });

    const results = data.organic || [];
    const text = formatSearchResults(results, params.query);

    return {
      content: [{ type: "text" as const, text }],
      structuredContent: {
        query: params.query,
        count: results.length,
        results: results.map((r) => ({
          title: r.title,
          link: r.link,
          snippet: r.snippet,
          position: r.position,
        })),
      },
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: error instanceof Error ? error.message : `Error: ${String(error)}`,
        },
      ],
    };
  }
});

const SearchStyleInputSchema = z
  .object({
    style: z
      .string()
      .min(2)
      .max(200)
      .describe(
        'Design style to search for. Examples: "minimalist dark theme", "brutalist web design", "glassmorphism"'
      ),
    type: z
      .enum(["color-palette", "typography", "layout", "animation", "general"])
      .default("general")
      .describe("Type of style inspiration to search for"),
    num: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(10)
      .describe("Number of results (1-20, default: 10)"),
  })
  .strict();

type SearchStyleInput = z.infer<typeof SearchStyleInputSchema>;

server.registerTool("design_search_styles", {
  title: "Search design styles",
  description: `Search for a specific aesthetic direction — color palettes, typography, layouts, or animation references. Runs image and web search in parallel and returns combined results.`,
  inputSchema: SearchStyleInputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
}, async (params: SearchStyleInput) => {
  try {
    const typeKeywords: Record<string, string> = {
      "color-palette": "color palette scheme",
      typography: "typography fonts",
      layout: "layout grid structure",
      animation: "animation motion design",
      general: "",
    };

    const query = `${params.style} ${typeKeywords[params.type]} UI design inspiration`;
    const allSites = Object.values(DESIGN_SITES);
    const siteFilter = allSites.map((s) => `site:${s}`).join(" OR ");
    const fullQuery = `${query} (${siteFilter})`;

    const [imageData, searchData] = await Promise.all([
      serperRequest<SerperImagesResponse>("/images", { q: fullQuery, num: params.num }),
      serperRequest<SerperSearchResponse>("/search", { q: fullQuery, num: params.num }),
    ]);

    const images = imageData.images || [];
    const results = searchData.organic || [];

    const lines = [`# Style Inspiration: "${params.style}" (${params.type})`, ""];

    if (images.length) {
      lines.push("## Images", "");
      for (const img of images.slice(0, 5)) {
        lines.push(`- **${img.title}**: ${img.imageUrl}`);
        lines.push(`  Source: ${img.source} | [View](${img.link})`);
      }
      lines.push("");
    }

    if (results.length) {
      lines.push("## References", "");
      for (const r of results) {
        lines.push(`- **${r.title}**`);
        lines.push(`  ${r.snippet}`);
        lines.push(`  [View](${r.link})`);
        lines.push("");
      }
    }

    let text = lines.join("\n");
    if (text.length > CHARACTER_LIMIT) {
      text = text.slice(0, CHARACTER_LIMIT) + "\n\n...(truncated)";
    }

    return {
      content: [{ type: "text" as const, text }],
      structuredContent: {
        style: params.style,
        type: params.type,
        images: images.slice(0, 5).map((img) => ({
          title: img.title,
          imageUrl: img.imageUrl,
          source: img.source,
          link: img.link,
        })),
        references: results.map((r) => ({
          title: r.title,
          link: r.link,
          snippet: r.snippet,
        })),
      },
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: error instanceof Error ? error.message : `Error: ${String(error)}`,
        },
      ],
    };
  }
});

// --- design_extract_tokens tool ---

interface DesignTokens {
  colors?: Record<string, unknown>;
  typography?: Record<string, unknown>;
  spacing?: Record<string, unknown>;
  borders?: Record<string, unknown>;
  shadows?: Record<string, unknown>;
  [key: string]: unknown;
}

function runDembrandt(url: string, flags: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [url, "--json-only", ...flags];
    execFile("dembrandt", args, { timeout: 60_000, maxBuffer: 5 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const msg = stderr?.trim() || error.message;
        if (error.killed) return reject(new Error("Timed out after 60s. The site may be too slow — try with --slow via CLI."));
        if (msg.includes("net::ERR_NAME_NOT_RESOLVED")) return reject(new Error(`Could not resolve URL: ${url}`));
        if (msg.includes("net::ERR_CONNECTION_REFUSED")) return reject(new Error(`Connection refused: ${url}`));
        return reject(new Error(`dembrandt failed: ${msg}`));
      }
      resolve(stdout);
    });
  });
}

function formatTokens(tokens: DesignTokens, url: string): string {
  const lines = [`# Design Tokens: ${url}`, ""];

  if (tokens.colors && Object.keys(tokens.colors).length) {
    lines.push("## Colors", "");
    for (const [name, value] of Object.entries(tokens.colors)) {
      if (typeof value === "string") {
        lines.push(`- **${name}**: \`${value}\``);
      } else if (typeof value === "object" && value !== null) {
        lines.push(`- **${name}**: \`${JSON.stringify(value)}\``);
      }
    }
    lines.push("");
  }

  if (tokens.typography && Object.keys(tokens.typography).length) {
    lines.push("## Typography", "");
    for (const [name, value] of Object.entries(tokens.typography)) {
      if (typeof value === "string") {
        lines.push(`- **${name}**: \`${value}\``);
      } else if (typeof value === "object" && value !== null) {
        lines.push(`- **${name}**: \`${JSON.stringify(value)}\``);
      }
    }
    lines.push("");
  }

  if (tokens.spacing && Object.keys(tokens.spacing).length) {
    lines.push("## Spacing", "");
    for (const [name, value] of Object.entries(tokens.spacing)) {
      lines.push(`- **${name}**: \`${JSON.stringify(value)}\``);
    }
    lines.push("");
  }

  if (tokens.borders && Object.keys(tokens.borders).length) {
    lines.push("## Borders", "");
    for (const [name, value] of Object.entries(tokens.borders)) {
      lines.push(`- **${name}**: \`${JSON.stringify(value)}\``);
    }
    lines.push("");
  }

  if (tokens.shadows && Object.keys(tokens.shadows).length) {
    lines.push("## Shadows", "");
    for (const [name, value] of Object.entries(tokens.shadows)) {
      lines.push(`- **${name}**: \`${JSON.stringify(value)}\``);
    }
    lines.push("");
  }

  // Any remaining top-level keys
  const handled = new Set(["colors", "typography", "spacing", "borders", "shadows"]);
  for (const [key, value] of Object.entries(tokens)) {
    if (handled.has(key) || value === undefined || value === null) continue;
    lines.push(`## ${key.charAt(0).toUpperCase() + key.slice(1)}`, "");
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        lines.push(`- **${k}**: \`${typeof v === "string" ? v : JSON.stringify(v)}\``);
      }
    } else {
      lines.push(`- ${JSON.stringify(value)}`);
    }
    lines.push("");
  }

  let result = lines.join("\n");
  if (result.length > CHARACTER_LIMIT) {
    result = result.slice(0, CHARACTER_LIMIT) + "\n\n...(truncated)";
  }
  return result;
}

const ExtractTokensInputSchema = z
  .object({
    url: z
      .string()
      .min(4, "URL is required")
      .describe('Website URL to extract design tokens from. Examples: "https://stripe.com", "https://linear.app"'),
    dark_mode: z
      .boolean()
      .default(false)
      .describe("Extract colors from dark mode variant"),
    mobile: z
      .boolean()
      .default(false)
      .describe("Extract from mobile viewport (375px)"),
  })
  .strict();

type ExtractTokensInput = z.infer<typeof ExtractTokensInputSchema>;

server.registerTool("design_extract_tokens", {
  title: "Extract design tokens from website",
  description: `Extract actual design tokens (colors, typography, spacing, borders, shadows) from a live website using headless browser. Give it any URL and get back the exact values used. Pairs well with the search tools — find inspiration, then extract tokens from sites you like.`,
  inputSchema: ExtractTokensInputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
}, async (params: ExtractTokensInput) => {
  try {
    const url = params.url.startsWith("http") ? params.url : `https://${params.url}`;
    const flags: string[] = [];
    if (params.dark_mode) flags.push("--dark-mode");
    if (params.mobile) flags.push("--mobile");

    const stdout = await runDembrandt(url, flags);
    const tokens: DesignTokens = JSON.parse(stdout);
    const text = formatTokens(tokens, url);

    return {
      content: [{ type: "text" as const, text }],
      structuredContent: { url, dark_mode: params.dark_mode, mobile: params.mobile, tokens },
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: error instanceof Error ? error.message : `Error: ${String(error)}`,
        },
      ],
    };
  }
});

async function main() {
  if (!process.env.SERPER_API_KEY) {
    console.error("WARNING: SERPER_API_KEY not set. Get a free key at https://serper.dev");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Design Inspiration MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
