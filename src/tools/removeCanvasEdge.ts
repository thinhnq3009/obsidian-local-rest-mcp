import { z } from "zod";

import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";
import { canvasDocumentSchema, canvasPathSchema, readCanvasDocument, removeCanvasEdge, writeCanvasDocument } from "./canvasCommon.js";

const inputSchema = z.object({
  path: canvasPathSchema.describe("Vault-relative .canvas path to update."),
  edge_id: z.string().trim().min(1).describe("Existing edge ID to remove."),
});

const outputSchema = z.object({
  path: z.string(),
  message: z.string(),
  removedEdgeId: z.string(),
  canvas: canvasDocumentSchema,
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
});

export const registerRemoveCanvasEdgeTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_remove_canvas_edge",
    {
      title: "Remove Obsidian Canvas Edge",
      description: "Remove one edge from a .canvas file by edge ID.",
      inputSchema,
      outputSchema,
    },
    async ({ path, edge_id: edgeId }) => {
      try {
        const current = await readCanvasDocument(client, path);
        const canvas = removeCanvasEdge(current.canvas, edgeId);
        const result = await writeCanvasDocument(client, path, canvas);

        return successResult(`Removed canvas edge ${edgeId} from ${result.path}.`, {
          path: result.path,
          message: result.message,
          removedEdgeId: edgeId,
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
