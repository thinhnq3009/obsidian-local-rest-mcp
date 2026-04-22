import { z } from "zod";

import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";

const outputSchema = z.object({
  path: z.string().optional(),
  content: z.string(),
  contentType: z.string().nullable(),
  etag: z.string().nullable(),
  lastModified: z.string().nullable(),
});

export const registerGetActiveFileTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_get_active_file",
    {
      title: "Get Active Obsidian File",
      description: "Read the currently active file from Obsidian.",
      outputSchema,
    },
    async () => {
      try {
        const result = await client.getActiveFile();
        const summary = `Read the active Obsidian file${result.path ? ` (${result.path})` : ""}.`;
        return successResult(summary, result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
