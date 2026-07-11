import { z } from "zod";

import { patchOperationSchema, vaultPathSchema } from "../types.js";
import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";

const inputSchema = z.object({
  path: vaultPathSchema.describe("Relative markdown file path inside the vault."),
  heading: z.string().min(1, "heading is required").describe("Heading text to patch."),
  content: z.string().describe("Content to apply to the target heading."),
  operation: patchOperationSchema.default("append").describe("How to update the selected heading section."),
  occurrence: z.number().int().min(1).optional().describe("1-based occurrence when multiple headings have the same text."),
  expected_revision: z.string().min(1).describe("Revision returned by the latest read."),
});

const outputSchema = z.object({
  path: z.string(),
  heading: z.string(),
  operation: patchOperationSchema,
  message: z.string(),
  revision: z.string().optional(),
});

export const registerPatchHeadingTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_patch_heading",
    {
      title: "Patch Obsidian Heading",
      description: "Patch exactly one Markdown heading section without rewriting unrelated content.",
      inputSchema,
      outputSchema,
    },
    async ({ path, heading, content, operation, occurrence, expected_revision: expectedRevision }) => {
      try {
        const result = await client.patchHeading(path, heading, content, operation, { ...(occurrence ? { occurrence } : {}), expectedRevision });
        return successResult(`Patched heading "${heading}" in ${result.path}.`, result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
