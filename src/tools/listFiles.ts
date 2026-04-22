import { z } from "zod";

import { optionalVaultPathSchema } from "../types.js";
import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";

const inputSchema = z.object({
  path: optionalVaultPathSchema.describe("Relative folder path inside the vault. Empty string means vault root."),
});

const outputSchema = z.object({
  root: z.string(),
  entries: z.array(
    z.object({
      path: z.string(),
      name: z.string(),
      isFolder: z.boolean(),
    }),
  ),
});

export const registerListFilesTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_list_files",
    {
      title: "List Obsidian Files",
      description: "List files or folders in an Obsidian vault path.",
      inputSchema,
      outputSchema,
    },
    async ({ path }) => {
      try {
        const result = await client.listFiles(path);
        const summary = `Found ${result.entries.length} entr${result.entries.length === 1 ? "y" : "ies"} under ${result.root || "/"}.`;
        return successResult(summary, result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
