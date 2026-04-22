import { z } from "zod";

import type { ObsidianClient } from "../obsidian/client.js";
import { collectMarkdownTree, detectPathInfo, isMarkdownPath } from "./pathOperations.js";
import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";
import { vaultPathSchema } from "../types.js";

const inputSchema = z.object({
  source_path: vaultPathSchema.describe("Existing markdown file or folder path to move."),
  destination_path: vaultPathSchema.describe("Destination path inside the vault."),
  overwrite: z.boolean().default(false).describe("Allow overwriting an existing markdown destination file."),
});

const outputSchema = z.object({
  sourcePath: z.string(),
  destinationPath: z.string(),
  kind: z.enum(["file", "folder"]),
  movedFiles: z.number().int().nonnegative(),
});

export const registerMovePathTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_move_path",
    {
      title: "Move Obsidian Path",
      description: "Move a markdown file or a markdown-only folder subtree inside the vault.",
      inputSchema,
      outputSchema,
    },
    async ({ source_path: sourcePath, destination_path: destinationPath, overwrite }) => {
      try {
        const result = await performMovePath(client, sourcePath, destinationPath, overwrite);
        const summary =
          result.kind === "file"
            ? `Moved ${result.sourcePath} to ${result.destinationPath}.`
            : `Moved ${result.movedFiles} markdown files from ${result.sourcePath} to ${result.destinationPath}.`;
        return successResult(summary, result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};

export async function performMovePath(
  client: ObsidianClient,
  sourcePath: string,
  destinationPath: string,
  overwrite: boolean,
) {
  const source = await detectPathInfo(client, sourcePath);
  if (!source.exists) {
    throw new Error(`Source path does not exist: ${sourcePath}`);
  }

  const destination = await detectPathInfo(client, destinationPath);
  if (destination.exists) {
    if (!(overwrite && source.kind === "file" && destination.kind === "file")) {
      throw new Error(`Destination already exists: ${destinationPath}`);
    }
  }

  if (source.kind === "file") {
    if (!isMarkdownPath(source.path) || !isMarkdownPath(destinationPath)) {
      throw new Error("obsidian_move_path currently supports markdown files only.");
    }

    const note = await client.readNote(source.path);
    if (destination.exists && overwrite) {
      await client.deletePath(destination.path);
    }
    await client.writeNote(destinationPath, note.content);
    await client.deletePath(source.path);

    return {
      sourcePath: source.path,
      destinationPath,
      kind: "file" as const,
      movedFiles: 1,
    };
  }

  if (destination.exists) {
    throw new Error("Folder moves require a missing destination path.");
  }

  const collected = await collectMarkdownTree(client, source.path);
  for (const filePath of collected.files) {
    const relative = filePath.slice(source.path.length).replace(/^\/+/, "");
    const nextPath = relative.length > 0 ? `${destinationPath}/${relative}` : destinationPath;
    const note = await client.readNote(filePath);
    await client.writeNote(nextPath, note.content);
  }

  for (const folderPath of [...collected.folders].sort((left, right) => right.length - left.length)) {
    await client.deletePath(folderPath);
  }

  return {
    sourcePath: source.path,
    destinationPath,
    kind: "folder" as const,
    movedFiles: collected.files.length,
  };
}
