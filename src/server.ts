import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

import { createContextMiddleware } from "@ctxprotocol/sdk";

import { fetchHNMentions } from "./sources/hn.js";
import { normalizeMentions } from "./normalize.js";
import { enrichMentions } from "./enrichment/index.js";
import { generateBrief } from "./brief.js";
import type { TimeWindow, SocialBrief } from "./types.js";

// ─── Helper: error structuredContent matching outputSchema ─────

function errorBrief(
  q: string,
  win: string,
  message: string,
): Record<string, unknown> {
  return {
    query: q || "unknown",
    window: win || "7d",
    summary: `Error: ${message}`,
    overall_sentiment: "neutral",
    themes: [],
    top_mentions: [],
    recommended_action:
      "Retry the query. If the issue persists, check the server logs.",
    fetched_at: new Date().toISOString(),
  };
}

// ─── Tool definition (raw JSON Schema) ─────────────────────────

const TOOLS = [
  {
    name: "get_social_brief",
    description:
      "Get a social mention intelligence brief for any brand, competitor, or keyword. Scans Hacker News stories and comments, then returns sentiment analysis, theme clusters, urgency-ranked top mentions, and an actionable recommendation.",
    _meta: {
      surface: "both",
      queryEligible: true,
      latencyClass: "slow",
      rateLimit: {
        maxRequestsPerMinute: 10,
        cooldownMs: 6000,
        maxConcurrency: 2,
        notes: "Rate limited by HN Algolia API.",
      },
      pricing: {
        executeUsd: "0.00",
      },
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        q: {
          type: "string",
          description: "Brand, competitor, or keyword to search for",
        },
        window: {
          type: "string",
          enum: ["24h", "7d", "30d"],
          default: "7d",
          description:
            "Time window: 24h (last day), 7d (last week), or 30d (last month)",
        },
      },
      required: ["q"],
    },
    outputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "The brand, competitor, or keyword that was searched",
        },
        window: {
          type: "string",
          description: "Time window for the search (24h, 7d, or 30d)",
        },
        summary: {
          type: "string",
          description:
            "Human-readable summary including mention count, sentiment, and key themes",
        },
        overall_sentiment: {
          type: "string",
          enum: ["positive", "neutral", "negative"],
          description:
            "Engagement-weighted overall sentiment across all mentions",
        },
        themes: {
          type: "array",
          description:
            "Theme clusters found in mentions, sorted by frequency",
          items: {
            type: "object",
            properties: {
              theme: {
                type: "string",
                enum: [
                  "pricing_complaints",
                  "support_issues",
                  "feature_requests",
                  "switching_intent",
                  "praise",
                  "general_discussion",
                ],
                description: "Theme category label",
              },
              mention_count: {
                type: "number",
                description: "Number of mentions in this theme",
              },
              percentage: {
                type: "number",
                description: "Percentage of total mentions (0-100)",
              },
            },
            required: ["theme", "mention_count", "percentage"],
          },
        },
        top_mentions: {
          type: "array",
          description:
            "Most important mentions sorted by urgency, up to 5",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Story title" },
              body_snippet: {
                type: "string",
                description: "First 280 chars of body text",
              },
              url: { type: "string", description: "URL to mention" },
              author: { type: "string", description: "Author username" },
              published_at: {
                type: "string",
                description: "ISO 8601 timestamp",
              },
              sentiment: {
                type: "string",
                enum: ["positive", "neutral", "negative"],
                description: "Mention sentiment",
              },
              theme: {
                type: "string",
                description: "Primary theme detected",
              },
              urgency: {
                type: "number",
                description: "Urgency score 0-10",
              },
              why_it_matters: {
                type: "string",
                description: "Why this mention deserves attention",
              },
            },
            required: [
              "title",
              "body_snippet",
              "url",
              "author",
              "published_at",
              "sentiment",
              "theme",
              "urgency",
              "why_it_matters",
            ],
          },
        },
        recommended_action: {
          type: "string",
          description:
            "Actionable recommendation based on themes and sentiment",
        },
        fetched_at: {
          type: "string",
          description: "ISO 8601 timestamp of brief generation",
        },
      },
      required: [
        "query",
        "window",
        "summary",
        "overall_sentiment",
        "themes",
        "top_mentions",
        "recommended_action",
        "fetched_at",
      ],
    },
  },
];

// ─── Pipeline ──────────────────────────────────────────────────

async function runPipeline(
  q: string,
  window: TimeWindow,
): Promise<SocialBrief> {
  const raw = await fetchHNMentions(q, window);
  const normalized = normalizeMentions(raw, q);
  const enriched = enrichMentions(normalized);
  return generateBrief(q, window, enriched);
}

// ─── MCP Server factory ────────────────────────────────────────

function createSignalBriefServer() {
  const server = new Server(
    { name: "signalbrief", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name !== "get_social_brief") {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        structuredContent: errorBrief("", "7d", `Unknown tool: ${name}`),
        isError: true,
      };
    }

    const q = (args?.q as string) || "";
    const window = (args?.window as string) || "7d";

    if (!q) {
      return {
        content: [
          { type: "text", text: "Missing required parameter: q" },
        ],
        structuredContent: errorBrief("", window, "Missing required parameter: q"),
        isError: true,
      };
    }

    try {
      const brief = await runPipeline(q, window as TimeWindow);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(brief),
          },
        ],
        structuredContent: brief as unknown as Record<string, unknown>,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        structuredContent: errorBrief(q, window, message),
        isError: true,
      };
    }
  });

  return server;
}

// ─── Express app with SSE transport (CTX official pattern) ─────

const app = express();
app.use(express.json());

// Context Protocol security middleware
app.use("/sse", createContextMiddleware());
app.use("/mcp", createContextMiddleware());

// SSE transport — matches CTX official example
const transports = new Map<string, SSEServerTransport>();

app.get("/sse", async (_req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  const server = createSignalBriefServer();

  transports.set(transport.sessionId, transport);

  res.on("close", () => {
    transports.delete(transport.sessionId);
  });

  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);
  if (transport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(400).json({ error: "No active session" });
  }
});

// Also support Streamable HTTP on /mcp for compatibility
app.all("/mcp", async (req, res) => {
  try {
    // Dynamic import to avoid issues if not available
    const { StreamableHTTPServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );

    const body = req.body;
    const isInitialize =
      body?.method === "initialize" ||
      (Array.isArray(body) &&
        body.some((m: { method?: string }) => m.method === "initialize"));

    if (isInitialize || req.method === "GET") {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (sessionId: string) => {
          transports.set(sessionId, transport as any);
        },
      });

      transport.onclose = () => {
        const sid = (transport as unknown as { sessionId?: string })
          .sessionId;
        if (sid) transports.delete(sid);
      };

      const server = createSignalBriefServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      const t = transports.get(sessionId)!;
      if ("handleRequest" in t) {
        await (t as any).handleRequest(req, res, body);
      }
      return;
    }

    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "No active session. Send initialize first.",
      },
      id: body?.id ?? null,
    });
  } catch (err) {
    console.error("MCP handler error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// ─── Health check ──────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "signalbrief", version: "1.0.0" });
});

// ─── Debug routes ──────────────────────────────────────────────

app.get("/", (_req, res) => {
  res.send(`
    <html><body style="font-family:system-ui;padding:2rem">
      <h1>SignalBrief MCP Server</h1>
      <ul>
        <li><a href="/health">/health</a></li>
        <li>SSE: GET /sse + POST /messages</li>
        <li>HTTP Streaming: POST /mcp</li>
        <li><a href="/debug/brief?q=Apple&window=24h">/debug/brief?q=Apple</a></li>
      </ul>
    </body></html>
  `);
});

app.all("/debug/brief", async (req, res) => {
  try {
    const q = (req.body?.q || req.query?.q) as string | undefined;
    const win = (req.body?.window || req.query?.window) as
      | string
      | undefined;
    if (!q) {
      res.status(400).json({ error: "Missing required parameter: q" });
      return;
    }
    const validWindows: TimeWindow[] = ["24h", "7d", "30d"];
    const timeWindow: TimeWindow = validWindows.includes(win as TimeWindow)
      ? (win as TimeWindow)
      : "7d";
    const brief = await runPipeline(q, timeWindow);
    res.json(brief);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ─── Keep-alive ────────────────────────────────────────────────

const KEEP_ALIVE_MS = 10 * 60 * 1000;
setInterval(() => {
  fetch(`http://localhost:${PORT}/health`).catch(() => {});
}, KEEP_ALIVE_MS);

// ─── Start ─────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3000", 10);

app.listen(PORT, () => {
  console.log(`✓ SignalBrief running on http://localhost:${PORT}`);
  console.log(`  SSE: GET http://localhost:${PORT}/sse`);
  console.log(`  MCP: POST http://localhost:${PORT}/mcp`);
});
