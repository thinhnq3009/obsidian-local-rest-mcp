import { z } from "zod";

import { vaultPathSchema } from "../types.js";
import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";

const inputSchema = z.object({
  path: vaultPathSchema.describe("Relative file path to open in Obsidian."),
});

const outputSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export const registerOpenFileTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_open_file",
    {
      title: "Open Obsidian File",
      description: "Open a file in the Obsidian desktop UI.",
      inputSchema,
      outputSchema,
    },
    async ({ path }) => {
      try {
        const result = await client.openFile(path);
        return successResult(`Opened ${result.path} in Obsidian.`, result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
