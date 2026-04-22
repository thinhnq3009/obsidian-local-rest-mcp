import { z } from "zod";

import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";

const inputSchema = z.object({
  query: z.string().optional(),
  folder: z.string().optional(),
  tag: z.string().optional(),
  regex: z.string().optional(),
  case_sensitive: z.boolean().default(false),
  limit: z.number().int().min(1).max(50).default(20),
  sort: z.enum(["relevance", "path"]).default("relevance"),
});

const outputSchema = z.object({
  results: z.array(
    z.object({
      path: z.string(),
      score: z.number().optional(),
      snippet: z.string().optional(),
    }),
  ),
});

export const registerSearchContentAdvancedTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_search_content_advanced",
    {
      title: "Advanced Obsidian Search",
      description: "Search note content and metadata using JSON Logic filters over the Local REST API.",
      inputSchema,
      outputSchema,
    },
    async ({ query, folder, tag, regex, case_sensitive: caseSensitive, limit, sort }) => {
      try {
        const logic = buildJsonLogic({
          ...(query !== undefined ? { query } : {}),
          ...(folder !== undefined ? { folder } : {}),
          ...(tag !== undefined ? { tag } : {}),
          ...(regex !== undefined ? { regex } : {}),
          caseSensitive,
        });
        const { results } = await client.searchAdvanced(logic, limit);
        const sortedResults =
          sort === "path" ? [...results].sort((left, right) => left.path.localeCompare(right.path)) : results;

        return successResult(`Found ${sortedResults.length} advanced search result${sortedResults.length === 1 ? "" : "s"}.`, {
          results: sortedResults,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};

function buildJsonLogic(input: {
  query?: string;
  folder?: string;
  tag?: string;
  regex?: string;
  caseSensitive: boolean;
}) {
  const clauses: Record<string, unknown>[] = [];

  if (input.query?.trim()) {
    clauses.push({
      regexp: [buildRegexPattern(input.query, input.caseSensitive), { var: "content" }],
    });
  }

  if (input.regex?.trim()) {
    clauses.push({
      regexp: [input.regex, { var: "content" }],
    });
  }

  if (input.folder?.trim()) {
    const escaped = escapeRegex(input.folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""));
    clauses.push({
      regexp: [`^${escaped}(?:/|$)`, { var: "path" }],
    });
  }

  if (input.tag?.trim()) {
    clauses.push({
      in: [input.tag.replace(/^#/, ""), { var: "tags" }],
    });
  }

  return clauses.length === 0 ? { "!==": [{ var: "path" }, null] } : { and: clauses };
}

function buildRegexPattern(query: string, caseSensitive: boolean): string {
  const escaped = escapeRegex(query);
  return caseSensitive ? escaped : `(?i)${escaped}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
