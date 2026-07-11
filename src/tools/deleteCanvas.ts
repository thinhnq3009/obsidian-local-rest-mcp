import { z } from "zod";

import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";
import { canvasPathSchema } from "./canvasCommon.js";

const inputSchema = z.object({
  path: canvasPathSchema.describe("Vault-relative .canvas path to delete."),
  expected_revision: z.string().min(1).describe("Revision returned by the latest canvas read."),
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
    async ({ path, expected_revision: expectedRevision }) => {
      try {
        await client.deletePath(path, { expectedRevision });
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
