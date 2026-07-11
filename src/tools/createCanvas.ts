import { z } from "zod";

import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";
import {
  canvasDocumentSchema,
  canvasEdgeSchema,
  canvasNodeSchema,
  canvasPathSchema,
  ensureCanvasDoesNotExist,
  writeCanvasDocument,
} from "./canvasCommon.js";

const inputSchema = z.object({
  path: canvasPathSchema.describe("Vault-relative .canvas path to create."),
  nodes: z
    .array(canvasNodeSchema)
    .default([])
    .describe("Initial canvas nodes. JSON Canvas uses text, file, link, and group node types."),
  edges: z
    .array(canvasEdgeSchema)
    .default([])
    .describe("Initial canvas edges. Each edge must point at existing node IDs."),
  open_after_create: z.boolean().default(false).describe("Open the created canvas in Obsidian after writing it."),
  overwrite: z.boolean().default(false).describe("Allow replacing an existing .canvas file."),
  expected_revision: z.string().optional().describe("Required when overwrite is true."),
});

const outputSchema = z.object({
  path: z.string(),
  message: z.string(),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  opened: z.boolean(),
  revision: z.string().optional(),
});

const description = [
  "Create an Obsidian .canvas file using embedded JSON Canvas validation.",
  "A canvas file is JSON with top-level nodes and edges arrays.",
  "Node types: text, file, link, group.",
  "Example input: {\"path\":\"Maps/Plan.canvas\",\"nodes\":[{\"id\":\"n1\",\"type\":\"file\",\"file\":\"Projects/Plan.md\",\"x\":0,\"y\":0,\"width\":400,\"height\":240}],\"edges\":[]}",
].join(" ");

export const registerCreateCanvasTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_create_canvas",
    {
      title: "Create Obsidian Canvas",
      description,
      inputSchema,
      outputSchema,
    },
    async ({ path, nodes, edges, open_after_create: openAfterCreate, overwrite, expected_revision: expectedRevision }) => {
      try {
        if (!overwrite) {
          await ensureCanvasDoesNotExist(client, path);
        }

        const canvas = canvasDocumentSchema.parse({ nodes, edges });
        const result = await writeCanvasDocument(client, path, canvas, { mode: overwrite ? "replace" : "create", ...(expectedRevision ? { expectedRevision } : {}) });

        if (openAfterCreate) {
          if (!client.openFile) throw new Error("open_after_create is unsupported by the active backend.");
          await client.openFile(path);
        }

        return successResult(`Created canvas ${result.path}.`, {
          path: result.path,
          message: result.message,
          nodeCount: canvas.nodes.length,
          edgeCount: canvas.edges.length,
          opened: openAfterCreate,
          revision: result.revision,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
