import { z } from "zod";

import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";
import {
  canvasDocumentPatchSchema,
  canvasDocumentSchema,
  canvasEdgesSchema,
  canvasNodesSchema,
  canvasPathSchema,
  readCanvasDocument,
  replaceCanvasDocument,
  writeCanvasDocument,
} from "./canvasCommon.js";

const inputSchema = z.object({
  path: canvasPathSchema.describe("Vault-relative .canvas path to update."),
  nodes: canvasNodesSchema.optional().describe("Replace the full nodes array if provided."),
  edges: canvasEdgesSchema.optional().describe("Replace the full edges array if provided."),
  expected_revision: z.string().min(1).describe("Revision returned by the latest canvas read."),
});

const outputSchema = z.object({
  path: z.string(),
  message: z.string(),
  canvas: canvasDocumentSchema,
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  revision: z.string().optional(),
});

const description = [
  "Replace the top-level nodes array, edges array, or both in an existing .canvas file.",
  "Use this for full-document canvas edits when semantic node/edge tools are not enough.",
  "Example input: {\"path\":\"Maps/Plan.canvas\",\"edges\":[{\"id\":\"e1\",\"fromNode\":\"n1\",\"toNode\":\"n2\"}]}",
].join(" ");

export const registerUpdateCanvasTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_update_canvas",
    {
      title: "Update Obsidian Canvas",
      description,
      inputSchema,
      outputSchema,
    },
    async ({ path, nodes, edges, expected_revision: expectedRevision }) => {
      try {
        const current = await readCanvasDocument(client, path);
        const canvas = replaceCanvasDocument(current.canvas, canvasDocumentPatchSchema.parse({ nodes, edges }));
        const result = await writeCanvasDocument(client, path, canvas, { mode: "replace", expectedRevision });

        return successResult(`Updated canvas ${result.path}.`, {
          path: result.path,
          message: result.message,
          canvas,
          nodeCount: canvas.nodes.length,
          edgeCount: canvas.edges.length,
          revision: result.revision,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
