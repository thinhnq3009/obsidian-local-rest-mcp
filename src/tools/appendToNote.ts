import { z } from "zod";

import { vaultPathSchema } from "../types.js";
import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";

const inputSchema = z.object({
  path: vaultPathSchema.describe("Relative markdown file path inside the vault."),
  content: z.string().min(1, "content is required").describe("Content to append to the end of the note."),
  expected_revision: z.string().min(1).describe("Revision returned by the latest read."),
});

const outputSchema = z.object({
  path: z.string(),
  message: z.string(),
  revision: z.string().optional(),
});

export const registerAppendToNoteTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_append_to_note",
    {
      title: "Append To Obsidian Note",
      description: "Append text to the end of an Obsidian note.",
      inputSchema,
      outputSchema,
    },
    async ({ path, content, expected_revision: expectedRevision }) => {
      try {
        const result = await client.appendToNote(path, content, expectedRevision);
        return successResult(`Appended content to ${result.path}.`, result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
