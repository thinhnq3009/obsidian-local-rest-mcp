import { z } from "zod";

import { vaultPathSchema } from "../types.js";
import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";

const inputSchema = z.object({
  path: vaultPathSchema.describe("Existing file or folder path to delete."),
  recursive: z.boolean().default(false),
  expected_revision: z.string().optional().describe("Required when deleting a file."),
});
const outputSchema = z.object({ path: z.string(), kind: z.enum(["file", "folder"]), deletedFiles: z.number().int().nonnegative() });

export const registerDeletePathTool: ToolRegistrar = (server, backend) => {
  server.registerTool("obsidian_delete_path", { title: "Delete Vault Path", description: "Delete a file or recursively delete a folder within the configured write scope.", inputSchema, outputSchema },
    async ({ path, recursive, expected_revision: expectedRevision }) => {
      try {
        const stat = await backend.statPath(path);
        if (!stat.exists) throw new Error(`Path does not exist: ${path}`);
        await backend.deletePath(path, { recursive, ...(expectedRevision ? { expectedRevision } : {}) });
        return successResult(`Deleted ${path}.`, { path, kind: stat.kind, deletedFiles: stat.kind === "file" ? 1 : 0 });
      } catch (error) { return errorResult(error); }
    });
};
