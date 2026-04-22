import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ObsidianClient } from "../obsidian/client.js";
import { ObsidianClientError } from "../types.js";

export type ToolRegistrar = (server: McpServer, client: ObsidianClient) => void;

export const toolErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    status: z.number().int().optional(),
  }),
});

export function successResult<T extends Record<string, unknown>>(summary: string, data: T) {
  return {
    content: [{ type: "text" as const, text: summary }],
    structuredContent: data,
  };
}

export function errorResult(error: unknown) {
  const normalized =
    error instanceof ObsidianClientError
      ? error
      : new ObsidianClientError(error instanceof Error ? error.message : "Unexpected tool error.", {
          code: "TOOL_ERROR",
        });

  return {
    isError: true,
    content: [{ type: "text" as const, text: `${normalized.code}: ${normalized.message}` }],
    structuredContent: {
      error: {
        code: normalized.code,
        message: normalized.message,
        status: normalized.status,
      },
    },
  };
}
