import type { VaultBackend } from "../backend/types.js";
import { VaultError } from "../types.js";

export type TreeNode = {
  path: string;
  name: string;
  isFolder: boolean;
  children?: TreeNode[];
};

type CollectedTree = {
  folders: string[];
  files: string[];
  tree: TreeNode;
};

export type PathInfo =
  | { exists: true; kind: "file"; path: string }
  | { exists: true; kind: "folder"; path: string }
  | { exists: false; kind: "missing"; path: string };

export function isMarkdownPath(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
}

export function parentPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const parts = normalized.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

export function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return normalized.split("/").filter(Boolean).at(-1) ?? normalized;
}

export function joinVaultPath(...segments: string[]): string {
  return segments
    .flatMap((segment) => segment.split("/"))
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

export function renameWithinParent(path: string, newName: string): string {
  if (newName.includes("/") || newName.includes("\\")) {
    throw new VaultError("new_name must not include path separators.", {
      code: "INVALID_RENAME",
    });
  }

  const parent = parentPath(path);
  return joinVaultPath(parent, newName);
}

export async function collectMarkdownTree(
  client: VaultBackend,
  rootPath: string,
  maxDepth = Number.POSITIVE_INFINITY,
): Promise<CollectedTree> {
  return collectTreeInternal(client, rootPath, maxDepth, true);
}

export async function collectTree(
  client: VaultBackend,
  rootPath: string,
  maxDepth = Number.POSITIVE_INFINITY,
): Promise<TreeNode> {
  const result = await collectTreeInternal(client, rootPath, maxDepth, false);
  return result.tree;
}

async function collectTreeInternal(
  client: VaultBackend,
  rootPath: string,
  maxDepth: number,
  markdownOnly: boolean,
): Promise<CollectedTree> {
  const normalizedRoot = rootPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const rootName = normalizedRoot === "" ? "/" : basename(normalizedRoot);

  const tree = await walk(client, normalizedRoot, rootName, 0, maxDepth, markdownOnly);
  const folders: string[] = [];
  const files: string[] = [];
  flattenTree(tree, folders, files);

  return { tree, folders, files };
}

export async function detectPathInfo(client: VaultBackend, path: string): Promise<PathInfo> {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

  if (normalized === "") {
    return { exists: true, kind: "folder", path: "" };
  }

  const stat = await client.statPath(normalized);
  if (!stat.exists) return { exists: false, kind: "missing", path: normalized };
  return stat.kind === "file" ? { exists: true, kind: "file", path: normalized } : { exists: true, kind: "folder", path: normalized };
}

function flattenTree(node: TreeNode, folders: string[], files: string[]) {
  if (node.isFolder) {
    folders.push(node.path);
    for (const child of node.children ?? []) {
      flattenTree(child, folders, files);
    }
    return;
  }

  files.push(node.path);
}

async function walk(
  client: VaultBackend,
  path: string,
  name: string,
  depth: number,
  maxDepth: number,
  markdownOnly: boolean,
): Promise<TreeNode> {
  const { entries } = await client.listFiles(path);
  const node: TreeNode = {
    path,
    name,
    isFolder: true,
    children: [],
  };

  if (depth >= maxDepth) {
    return node;
  }

  for (const entry of entries) {
    if (entry.isFolder) {
      node.children?.push(await walk(client, entry.path, entry.name, depth + 1, maxDepth, markdownOnly));
      continue;
    }

    if (markdownOnly && !isMarkdownPath(entry.path)) {
      throw new VaultError(`Unsupported non-markdown file encountered: ${entry.path}`, {
        code: "UNSUPPORTED_PATH_CONTENT",
      });
    }

    node.children?.push({
      path: entry.path,
      name: entry.name,
      isFolder: false,
    });
  }

  node.children?.sort(compareTreeNodes);
  return node;
}

function compareTreeNodes(left: TreeNode, right: TreeNode): number {
  if (left.isFolder !== right.isFolder) {
    return left.isFolder ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
}
