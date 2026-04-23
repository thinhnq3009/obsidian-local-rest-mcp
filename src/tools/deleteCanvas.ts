import { z } from "zod";

import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";
import { canvasPathSchema } from "./canvasCommon.js";

const inputSchema = z.object({
  path: canvasPathSchema.describe("Vault-relative .canvas path to delete."),
});

const outputSchema = z.object({
  path: z.string(),
  deleted: z.literal(true),
});

export const registerDeleteCanvasTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_delete_canvas",
    {
      title: "Delete Obsidian Canvas",
      description: "Delete one .canvas file from the vault.",
      inputSchema,
      outputSchema,
    },
    async ({ path }) => {
      try {
        await client.deletePath(path);
        return successResult(`Deleted canvas ${path}.`, {
          path,
          deleted: true,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
