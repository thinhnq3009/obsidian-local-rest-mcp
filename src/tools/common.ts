import { z } from "zod";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { VaultBackend } from "../backend/types.js";
import { VaultError } from "../types.js";

export type ToolRegistrar = (server: McpServer, backend: VaultBackend) => void;

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
    error instanceof VaultError
      ? error
      : new VaultError(error instanceof Error ? error.message : "Unexpected tool error.", {
          code: "TOOL_ERROR",
        });

  return {
    isError: true,
    content: [{ type: "text" as const, text: `${normalized.code}: ${normalized.message}` }],
  };
}
