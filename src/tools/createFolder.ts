import { z } from "zod";

import { vaultPathSchema } from "../types.js";
import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";

const inputSchema = z.object({ path: vaultPathSchema.describe("Vault-relative folder path to create.") });
const outputSchema = z.object({ path: z.string(), created: z.boolean() });

export const registerCreateFolderTool: ToolRegistrar = (server, backend) => {
  server.registerTool("obsidian_create_folder", { title: "Create Vault Folder", description: "Create an empty folder inside the configured vault write scope.", inputSchema, outputSchema }, async ({ path }) => {
    try {
      const result = await backend.createFolder(path);
      return successResult(result.created ? `Created folder ${path}.` : `Folder already exists: ${path}.`, result);
    } catch (error) { return errorResult(error); }
  });
};
