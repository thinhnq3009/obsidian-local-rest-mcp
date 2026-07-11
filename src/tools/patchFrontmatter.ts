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
  expected_revision: z.string().min(1).describe("Revision returned by the latest read."),
});

const outputSchema = z.object({
  path: z.string(),
  field: z.string(),
  operation: patchOperationSchema,
  message: z.string(),
  revision: z.string().optional(),
});

export const registerPatchFrontmatterTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_patch_frontmatter",
    {
      title: "Patch Obsidian Frontmatter",
      description: "Patch a YAML frontmatter field while preserving unrelated fields and comments.",
      inputSchema,
      outputSchema,
    },
    async ({ path, field, value, operation, create_if_missing: createIfMissing, expected_revision: expectedRevision }) => {
      try {
        const result = await client.patchFrontmatter(path, field, value, operation, createIfMissing, expectedRevision);
        return successResult(`Patched frontmatter field "${field}" in ${path}.`, result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
