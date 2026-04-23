import { z } from "zod";

import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";
import { canvasDocumentSchema, canvasPathSchema, readCanvasDocument, removeCanvasNode, writeCanvasDocument } from "./canvasCommon.js";

const inputSchema = z.object({
  path: canvasPathSchema.describe("Vault-relative .canvas path to update."),
  node_id: z.string().trim().min(1).describe("Existing node ID to remove."),
});

const outputSchema = z.object({
  path: z.string(),
  message: z.string(),
  removedNodeId: z.string(),
  canvas: canvasDocumentSchema,
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
});

export const registerRemoveCanvasNodeTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_remove_canvas_node",
    {
      title: "Remove Obsidian Canvas Node",
      description: "Remove one node from a .canvas file and automatically drop any edges connected to it.",
      inputSchema,
      outputSchema,
    },
    async ({ path, node_id: nodeId }) => {
      try {
        const current = await readCanvasDocument(client, path);
        const canvas = removeCanvasNode(current.canvas, nodeId);
        const result = await writeCanvasDocument(client, path, canvas);

        return successResult(`Removed canvas node ${nodeId} from ${result.path}.`, {
          path: result.path,
          message: result.message,
          removedNodeId: nodeId,
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
