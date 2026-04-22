import { z } from "zod";

import { collectMarkdownTree, detectPathInfo } from "./pathOperations.js";
import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";
import { vaultPathSchema } from "../types.js";

const inputSchema = z.object({
  path: vaultPathSchema.describe("Existing file or folder path to delete."),
  recursive: z.boolean().default(false).describe("Allow recursive deletion for folders."),
});

const outputSchema = z.object({
  path: z.string(),
  kind: z.enum(["file", "folder"]),
  deletedFiles: z.number().int().nonnegative(),
});

export const registerDeletePathTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_delete_path",
    {
      title: "Delete Obsidian Path",
      description: "Delete a markdown file or recursively delete a markdown-only folder subtree.",
      inputSchema,
      outputSchema,
    },
    async ({ path, recursive }) => {
      try {
        const info = await detectPathInfo(client, path);
        if (!info.exists) {
          throw new Error(`Path does not exist: ${path}`);
        }

        if (info.kind === "file") {
          await client.deletePath(info.path);
          return successResult(`Deleted ${info.path}.`, {
            path: info.path,
            kind: "file",
            deletedFiles: 1,
          });
        }

        if (!recursive) {
          throw new Error("Folder deletion requires recursive=true.");
        }

        const collected = await collectMarkdownTree(client, info.path);
        for (const filePath of [...collected.files].sort((left, right) => right.length - left.length)) {
          await client.deletePath(filePath);
        }
        for (const folderPath of [...collected.folders].sort((left, right) => right.length - left.length)) {
          await client.deletePath(folderPath);
        }

        return successResult(`Deleted folder ${info.path} and ${collected.files.length} markdown files.`, {
          path: info.path,
          kind: "folder",
          deletedFiles: collected.files.length,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
