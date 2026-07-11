import { z } from "zod";

import { collectTree } from "./pathOperations.js";
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
  revision: z.string().nullable(),
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
        const stat = await client.statPath(path);
        if (!stat.exists) {
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
            revision: null,
          });
        }

        if (stat.kind === "file") {
          const metadata = await client.readNoteMetadata(stat.path);
          return successResult(`Inspected file ${stat.path}.`, {
            path: stat.path,
            exists: true,
            kind: "file",
            size: stat.size,
            ctime: stat.ctime,
            mtime: stat.mtime,
            tagsCount: metadata.tags.length,
            frontmatterKeys: Object.keys(metadata.frontmatter),
            childCount: null,
            revision: stat.revision,
          });
        }

        const tree = await collectTree(client, stat.path, 1);
        return successResult(`Inspected folder ${stat.path}.`, {
          path: stat.path,
          exists: true,
          kind: "folder",
          size: null,
          ctime: null,
          mtime: null,
          tagsCount: null,
          frontmatterKeys: null,
          childCount: tree.children?.length ?? 0,
          revision: null,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
