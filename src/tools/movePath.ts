import { z } from "zod";

import type { VaultBackend } from "../backend/types.js";
import { vaultPathSchema } from "../types.js";
import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";

const inputSchema = z.object({
  source_path: vaultPathSchema.describe("Existing file or folder path to move."),
  destination_path: vaultPathSchema.describe("Destination path inside the vault."),
  overwrite: z.boolean().default(false),
  expected_revision: z.string().optional().describe("Required when moving a file."),
  expected_destination_revision: z.string().optional().describe("Required when overwriting an existing destination file."),
});

const outputSchema = z.object({ sourcePath: z.string(), destinationPath: z.string(), kind: z.enum(["file", "folder"]), movedFiles: z.number().int().nonnegative() });

export const registerMovePathTool: ToolRegistrar = (server, backend) => {
  server.registerTool("obsidian_move_path", { title: "Move Vault Path", description: "Move a file or folder atomically within the configured vault scope.", inputSchema, outputSchema },
    async ({ source_path: sourcePath, destination_path: destinationPath, overwrite, expected_revision: expectedRevision, expected_destination_revision: expectedDestinationRevision }) => {
      try {
        const result = await performMovePath(backend, sourcePath, destinationPath, overwrite, expectedRevision, expectedDestinationRevision);
        return successResult(`Moved ${result.sourcePath} to ${result.destinationPath}.`, result);
      } catch (error) { return errorResult(error); }
    });
};

export function performMovePath(backend: VaultBackend, sourcePath: string, destinationPath: string, overwrite: boolean, expectedRevision?: string, expectedDestinationRevision?: string) {
  return backend.movePath(sourcePath, destinationPath, { overwrite, ...(expectedRevision ? { expectedRevision } : {}), ...(expectedDestinationRevision ? { expectedDestinationRevision } : {}) });
}
