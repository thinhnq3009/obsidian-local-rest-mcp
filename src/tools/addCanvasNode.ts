import { z } from "zod";

import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";
import {
  addCanvasNode,
  canvasDocumentSchema,
  canvasNodeSchema,
  canvasPathSchema,
  readCanvasDocument,
  writeCanvasDocument,
} from "./canvasCommon.js";

const inputSchema = z.object({
  path: canvasPathSchema.describe("Vault-relative .canvas path to update."),
  node: canvasNodeSchema.describe(
    "Canvas node to add. Example file node: {\"id\":\"n1\",\"type\":\"file\",\"file\":\"Projects/Plan.md\",\"x\":0,\"y\":0,\"width\":400,\"height\":240}.",
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

export const registerAddCanvasNodeTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_add_canvas_node",
    {
      title: "Add Obsidian Canvas Node",
      description:
        "Add one validated JSON Canvas node to an existing .canvas file. Supported node types are text, file, link, and group.",
      inputSchema,
      outputSchema,
    },
    async ({ path, node }) => {
      try {
        const current = await readCanvasDocument(client, path);
        const canvas = addCanvasNode(current.canvas, node);
        const result = await writeCanvasDocument(client, path, canvas);

        return successResult(`Added canvas node ${node.id} to ${result.path}.`, {
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
