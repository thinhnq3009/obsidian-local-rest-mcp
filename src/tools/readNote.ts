import { z } from "zod";

import { vaultPathSchema } from "../types.js";
import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";

const inputSchema = z.object({
  path: vaultPathSchema.describe("Relative markdown file path inside the vault."),
});

const outputSchema = z.object({
  path: z.string().optional(),
  content: z.string(),
  contentType: z.string().nullable(),
  etag: z.string().nullable(),
  lastModified: z.string().nullable(),
});

export const registerReadNoteTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_read_note",
    {
      title: "Read Obsidian Note",
      description: "Read the full content of an Obsidian note by path.",
      inputSchema,
      outputSchema,
    },
    async ({ path }) => {
      try {
        const result = await client.readNote(path);
        const summary = `Read ${result.path ?? path} (${result.content.length} characters).`;
        return successResult(summary, result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
