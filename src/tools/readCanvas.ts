import { z } from "zod";

import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";
import { canvasDocumentSchema, canvasPathSchema, readCanvasDocument } from "./canvasCommon.js";

const inputSchema = z.object({
  path: canvasPathSchema.describe("Vault-relative .canvas path to read."),
});

const outputSchema = z.object({
  path: z.string(),
  canvas: canvasDocumentSchema,
  contentType: z.string().nullable(),
  etag: z.string().nullable(),
  lastModified: z.string().nullable(),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
});

const description =
  "Read and validate an Obsidian .canvas file. The server knows JSON Canvas format locally, so callers can inspect nodes and edges without external research.";

export const registerReadCanvasTool: ToolRegistrar = (server, client) => {
  server.registerTool(
    "obsidian_read_canvas",
    {
      title: "Read Obsidian Canvas",
      description,
      inputSchema,
      outputSchema,
    },
    async ({ path }) => {
      try {
        const result = await readCanvasDocument(client, path);
        return successResult(`Read canvas ${result.path}.`, {
          path: result.path,
          canvas: result.canvas,
          contentType: result.file.contentType,
          etag: result.file.etag,
          lastModified: result.file.lastModified,
          nodeCount: result.canvas.nodes.length,
          edgeCount: result.canvas.edges.length,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
};
