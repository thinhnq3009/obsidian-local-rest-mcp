import { z } from "zod";

import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";
import {
  canvasDocumentSchema,
  canvasEdgeSchema,
  canvasEdgeUpdateSchema,
  canvasPathSchema,
  readCanvasDocument,
  updateCanvasEdge,
  writeCanvasDocument,
} from "./canvasCommon.js";

const inputSchema = z.object({
  path: canvasPathSchema.describe("Vault-relative .canvas path to update."),
  edge_id: z.string().trim().min(1).describe("Existing edge ID to update."),
  updates: canvasEdgeUpdateSchema.describe(
    "Partial edge updates. Use null to clear optional fields like label, color, or side metadata.",
  ),
});

const outputSchema = z.object({
  path: z.string(),
  message: z.string(),
  edge: canvasEdgeSchema,
  canvas: canvasDocumentSchema,
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
});

export const registerUpdateCanvasEdgeTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_update_canvas_edge",
    {
      title: "Update Obsidian Canvas Edge",
      description: "Update one edge inside a .canvas file without rewriting the full JSON document.",
      inputSchema,
      outputSchema,
    },
    async ({ path, edge_id: edgeId, updates }) => {
      try {
        const current = await readCanvasDocument(client, path);
        const canvas = updateCanvasEdge(current.canvas, edgeId, updates);
        const result = await writeCanvasDocument(client, path, canvas);
        const edge = canvas.edges.find((candidate) => candidate.id === edgeId);
        if (!edge) {
          throw new Error(`Canvas edge does not exist after update: ${edgeId}`);
        }

        return successResult(`Updated canvas edge ${edgeId} in ${result.path}.`, {
          path: result.path,
          message: result.message,
          edge,
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
