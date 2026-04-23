import { z } from "zod";

import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";
import {
  canvasDocumentSchema,
  canvasNodeSchema,
  canvasNodeUpdateSchema,
  canvasPathSchema,
  readCanvasDocument,
  updateCanvasNode,
  writeCanvasDocument,
} from "./canvasCommon.js";

const inputSchema = z.object({
  path: canvasPathSchema.describe("Vault-relative .canvas path to update."),
  node_id: z.string().trim().min(1).describe("Existing node ID to update."),
  updates: canvasNodeUpdateSchema.describe(
    "Partial node updates. Only fields valid for the target node type may be provided; null removes optional fields like color or subpath.",
  ),
});

const outputSchema = z.object({
  path: z.string(),
  message: z.string(),
  node: canvasNodeSchema,
  canvas: canvasDocumentSchema,
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
});

export const registerUpdateCanvasNodeTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_update_canvas_node",
    {
      title: "Update Obsidian Canvas Node",
      description:
        "Update one node inside a .canvas file without hand-merging the full JSON document. Example: set x/y/width/height for layout or update file/text/url fields by node type.",
      inputSchema,
      outputSchema,
    },
    async ({ path, node_id: nodeId, updates }) => {
      try {
        const current = await readCanvasDocument(client, path);
        const canvas = updateCanvasNode(current.canvas, nodeId, updates);
        const result = await writeCanvasDocument(client, path, canvas);
        const node = canvas.nodes.find((candidate) => candidate.id === nodeId);
        if (!node) {
          throw new Error(`Canvas node does not exist after update: ${nodeId}`);
        }

        return successResult(`Updated canvas node ${nodeId} in ${result.path}.`, {
          path: result.path,
          message: result.message,
          node,
          canvas,
          nodeCount: canvas.nodes.length,
          edgeCount: canvas.edges.length,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
