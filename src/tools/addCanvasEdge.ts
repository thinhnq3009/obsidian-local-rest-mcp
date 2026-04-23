import { z } from "zod";

import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";
import {
  addCanvasEdge,
  canvasDocumentSchema,
  canvasEdgeSchema,
  canvasPathSchema,
  readCanvasDocument,
  writeCanvasDocument,
} from "./canvasCommon.js";

const inputSchema = z.object({
  path: canvasPathSchema.describe("Vault-relative .canvas path to update."),
  edge: canvasEdgeSchema.describe(
    "Canvas edge to add. Example: {\"id\":\"e1\",\"fromNode\":\"n1\",\"fromSide\":\"right\",\"toNode\":\"n2\",\"toSide\":\"left\",\"label\":\"next\"}.",
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

export const registerAddCanvasEdgeTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_add_canvas_edge",
    {
      title: "Add Obsidian Canvas Edge",
      description: "Add one validated edge to a .canvas file. The server verifies that fromNode and toNode already exist.",
      inputSchema,
      outputSchema,
    },
    async ({ path, edge }) => {
      try {
        const current = await readCanvasDocument(client, path);
        const canvas = addCanvasEdge(current.canvas, edge);
        const result = await writeCanvasDocument(client, path, canvas);

        return successResult(`Added canvas edge ${edge.id} to ${result.path}.`, {
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
