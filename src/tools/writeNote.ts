import { z } from "zod";

import { vaultPathSchema } from "../types.js";
import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";

const inputSchema = z.object({
  path: vaultPathSchema.describe("Relative markdown file path inside the vault."),
  content: z.string().describe("Full note content to write."),
  mode: z.enum(["create", "replace"]).default("create").describe("Create a new note or replace an existing note."),
  expected_revision: z.string().optional().describe("Required when mode is replace."),
});

const outputSchema = z.object({
  path: z.string(),
  message: z.string(),
  revision: z.string().optional(),
});

export const registerWriteNoteTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_write_note",
    {
      title: "Write Obsidian Note",
      description: "Create a note, or safely replace one when its expected revision matches.",
      inputSchema,
      outputSchema,
    },
    async ({ path, content, mode, expected_revision: expectedRevision }) => {
      try {
        const result = await client.writeNote(path, content, { mode, ...(expectedRevision ? { expectedRevision } : {}) });
        return successResult(`Wrote ${result.path}.`, result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
