import { z } from "zod";

import { collectTree, detectPathInfo, type TreeNode } from "./pathOperations.js";
import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";
import { optionalVaultPathSchema } from "../types.js";

const inputSchema = z.object({
  path: optionalVaultPathSchema.describe("Root path to traverse. Empty string means vault root."),
  max_depth: z.number().int().min(0).max(10).default(3).describe("Maximum folder depth to traverse."),
  include_files: z.boolean().default(true),
  include_folders: z.boolean().default(true),
});

type OutputTreeNode = {
  path: string;
  name: string;
  isFolder: boolean;
  children?: OutputTreeNode[] | undefined;
};

const treeNodeSchema: z.ZodType<OutputTreeNode> = z.lazy(() =>
  z.object({
    path: z.string(),
    name: z.string(),
    isFolder: z.boolean(),
    children: z.array(treeNodeSchema).optional(),
  }),
);

const outputSchema = z.object({
  root: treeNodeSchema,
});

export const registerTreeTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_tree",
    {
      title: "Tree Obsidian Vault",
      description: "List a folder tree with depth control.",
      inputSchema,
      outputSchema,
    },
    async ({ path, max_depth: maxDepth, include_files: includeFiles, include_folders: includeFolders }) => {
      try {
        const info = await detectPathInfo(client, path);
        if (!info.exists) {
          throw new Error(`Path does not exist: ${path}`);
        }
        if (info.kind !== "folder") {
          throw new Error("obsidian_tree requires a folder path.");
        }

        const tree = await collectTree(client, info.path, maxDepth);
        const filtered = filterTree(tree, includeFiles, includeFolders);
        return successResult(`Collected a tree for ${info.path || "/"}.`, {
          root: filtered,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};

function filterTree(node: TreeNode, includeFiles: boolean, includeFolders: boolean): TreeNode {
  const children = (node.children ?? [])
    .filter((child) => (child.isFolder ? includeFolders : includeFiles))
    .map((child) => filterTree(child, includeFiles, includeFolders));

  return {
    path: node.path,
    name: node.name,
    isFolder: node.isFolder,
    ...(children.length > 0 ? { children } : {}),
  };
}
