import { z } from "zod";

import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";

const inputSchema = z.object({
  query: z.string().min(1, "query is required").describe("Fuzzy search query for the vault."),
  limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of results to return."),
  cursor: z.string().optional().describe("Opaque cursor from a previous search response."),
});

const outputSchema = z.object({
  query: z.string(),
  results: z.array(
    z.object({
      path: z.string(),
      score: z.number().optional(),
      snippet: z.string().optional(),
    }),
  ),
  nextCursor: z.string().optional(),
});

export const registerSearchTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_search",
    {
      title: "Search Obsidian Vault",
      description: "Run a simple fuzzy search across the Obsidian vault.",
      inputSchema,
      outputSchema,
    },
    async ({ query, limit, cursor }) => {
      try {
        const result = await client.search({ query, limit, ...(cursor ? { cursor } : {}) });
        const summary = `Found ${result.results.length} search result${result.results.length === 1 ? "" : "s"} for "${query}".`;
        return successResult(summary, { query, ...result });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
