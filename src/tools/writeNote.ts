import { z } from "zod";

import { vaultPathSchema } from "../types.js";
import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";

const inputSchema = z.object({
  path: vaultPathSchema.describe("Relative markdown file path inside the vault."),
  content: z.string().describe("Full note content to write."),
});

const outputSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export const registerWriteNoteTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_write_note",
    {
      title: "Write Obsidian Note",
      description: "Overwrite an Obsidian note at the given path.",
      inputSchema,
      outputSchema,
    },
    async ({ path, content }) => {
      try {
        const result = await client.writeNote(path, content);
        return successResult(`Wrote ${result.path}.`, result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
