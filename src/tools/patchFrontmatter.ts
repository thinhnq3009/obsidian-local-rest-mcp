import { z } from "zod";

import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";
import { patchOperationSchema, vaultPathSchema } from "../types.js";

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

const inputSchema = z.object({
  path: vaultPathSchema.describe("Markdown note path to modify."),
  field: z.string().min(1, "field is required"),
  value: jsonValueSchema,
  operation: patchOperationSchema.default("replace"),
  create_if_missing: z.boolean().default(true),
});

const outputSchema = z.object({
  path: z.string(),
  field: z.string(),
  operation: patchOperationSchema,
  message: z.string(),
});

export const registerPatchFrontmatterTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_patch_frontmatter",
    {
      title: "Patch Obsidian Frontmatter",
      description: "Patch a single YAML frontmatter field through the Obsidian Local REST API.",
      inputSchema,
      outputSchema,
    },
    async ({ path, field, value, operation, create_if_missing: createIfMissing }) => {
      try {
        const result = await client.patchFrontmatter(path, field, value, operation, createIfMissing);
        return successResult(`Patched frontmatter field "${field}" in ${path}.`, result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
