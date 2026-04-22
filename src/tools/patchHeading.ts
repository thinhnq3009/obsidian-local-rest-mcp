import { z } from "zod";

import { patchOperationSchema, vaultPathSchema } from "../types.js";
import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";

const inputSchema = z.object({
  path: vaultPathSchema.describe("Relative markdown file path inside the vault."),
  heading: z.string().min(1, "heading is required").describe("Heading text to patch."),
  content: z.string().describe("Content to apply to the target heading."),
  operation: patchOperationSchema.default("append").describe("Patch operation supported by Obsidian Local REST API."),
});

const outputSchema = z.object({
  path: z.string(),
  heading: z.string(),
  operation: patchOperationSchema,
  message: z.string(),
});

export const registerPatchHeadingTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_patch_heading",
    {
      title: "Patch Obsidian Heading",
      description: "Patch a specific heading using Obsidian Local REST API PATCH headers.",
      inputSchema,
      outputSchema,
    },
    async ({ path, heading, content, operation }) => {
      try {
        const result = await client.patchHeading(path, heading, content, operation);
        return successResult(`Patched heading "${heading}" in ${result.path}.`, result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
