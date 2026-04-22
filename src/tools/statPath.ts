import { z } from "zod";

import { collectTree, detectPathInfo } from "./pathOperations.js";
import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";
import { vaultPathSchema } from "../types.js";

const inputSchema = z.object({
  path: vaultPathSchema.describe("Vault path to inspect."),
});

const outputSchema = z.object({
  path: z.string(),
  exists: z.boolean(),
  kind: z.enum(["file", "folder", "missing"]),
  size: z.number().nullable(),
  ctime: z.number().nullable(),
  mtime: z.number().nullable(),
  tagsCount: z.number().int().nonnegative().nullable(),
  frontmatterKeys: z.array(z.string()).nullable(),
  childCount: z.number().int().nonnegative().nullable(),
});

export const registerStatPathTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_stat_path",
    {
      title: "Stat Obsidian Path",
      description: "Inspect whether a path exists and whether it is a file or folder.",
      inputSchema,
      outputSchema,
    },
    async ({ path }) => {
      try {
        const info = await detectPathInfo(client, path);
        if (!info.exists) {
          return successResult(`Path does not exist: ${path}.`, {
            path,
            exists: false,
            kind: "missing",
            size: null,
            ctime: null,
            mtime: null,
            tagsCount: null,
            frontmatterKeys: null,
            childCount: null,
          });
        }

        if (info.kind === "file") {
          const metadata = await client.readNoteMetadata(info.path);
          return successResult(`Inspected file ${info.path}.`, {
            path: info.path,
            exists: true,
            kind: "file",
            size: metadata.stat?.size ?? null,
            ctime: metadata.stat?.ctime ?? null,
            mtime: metadata.stat?.mtime ?? null,
            tagsCount: metadata.tags.length,
            frontmatterKeys: Object.keys(metadata.frontmatter),
            childCount: null,
          });
        }

        const tree = await collectTree(client, info.path, 1);
        return successResult(`Inspected folder ${info.path}.`, {
          path: info.path,
          exists: true,
          kind: "folder",
          size: null,
          ctime: null,
          mtime: null,
          tagsCount: null,
          frontmatterKeys: null,
          childCount: tree.children?.length ?? 0,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
