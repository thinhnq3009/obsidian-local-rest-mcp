import { z } from "zod";

import type { ObsidianClient } from "../obsidian/client.js";
import { ObsidianClientError, vaultPathSchema } from "../types.js";

const nonEmptyString = z.string().trim().min(1);
const canvasIntegerSchema = z.number().int();

export const canvasPathSchema = vaultPathSchema.refine(
  (path) => path.toLowerCase().endsWith(".canvas"),
  "path must end with .canvas",
);

export const canvasColorSchema = z.string().min(1);
export const canvasSideSchema = z.enum(["top", "right", "bottom", "left"]);
export const canvasEndSchema = z.enum(["none", "arrow"]);
export const canvasBackgroundStyleSchema = z.enum(["cover", "ratio", "repeat"]);

const canvasNodeBaseSchema = z.object({
  id: nonEmptyString.describe("Unique node ID within the canvas."),
  x: canvasIntegerSchema.describe("X position in canvas pixels."),
  y: canvasIntegerSchema.describe("Y position in canvas pixels."),
  width: canvasIntegerSchema.describe("Node width in canvas pixels."),
  height: canvasIntegerSchema.describe("Node height in canvas pixels."),
  color: canvasColorSchema.optional().describe("Optional canvas color token or hex string."),
});

export const canvasTextNodeSchema = canvasNodeBaseSchema.extend({
  type: z.literal("text"),
  text: z.string().describe("Plain text content with optional Markdown formatting."),
});

export const canvasFileNodeSchema = canvasNodeBaseSchema.extend({
  type: z.literal("file"),
  file: vaultPathSchema.describe("Vault-relative file path referenced by the node."),
  subpath: z
    .string()
    .optional()
    .refine((value) => value === undefined || value.startsWith("#"), "subpath must start with #")
    .describe("Optional heading or block reference that starts with #."),
});

export const canvasLinkNodeSchema = canvasNodeBaseSchema.extend({
  type: z.literal("link"),
  url: z.string().url().describe("External URL for the link node."),
});

export const canvasGroupNodeSchema = canvasNodeBaseSchema.extend({
  type: z.literal("group"),
  label: z.string().optional().describe("Optional group title."),
  background: vaultPathSchema.optional().describe("Optional vault-relative background image path."),
  backgroundStyle: canvasBackgroundStyleSchema.optional().describe("Background image render mode."),
});

export const canvasNodeSchema = z.discriminatedUnion("type", [
  canvasTextNodeSchema,
  canvasFileNodeSchema,
  canvasLinkNodeSchema,
  canvasGroupNodeSchema,
]);
export const canvasNodesSchema = z.array(canvasNodeSchema);

export const canvasEdgeSchema = z.object({
  id: nonEmptyString.describe("Unique edge ID within the canvas."),
  fromNode: nonEmptyString.describe("Source node ID."),
  fromSide: canvasSideSchema.optional().describe("Optional side where the edge starts."),
  fromEnd: canvasEndSchema.optional().describe("Optional source endpoint shape."),
  toNode: nonEmptyString.describe("Destination node ID."),
  toSide: canvasSideSchema.optional().describe("Optional side where the edge ends."),
  toEnd: canvasEndSchema.optional().describe("Optional destination endpoint shape."),
  color: canvasColorSchema.optional().describe("Optional edge color token or hex string."),
  label: z.string().optional().describe("Optional edge label."),
});
export const canvasEdgesSchema = z.array(canvasEdgeSchema);

export const canvasDocumentSchema = z
  .object({
    nodes: canvasNodesSchema.default([]),
    edges: canvasEdgesSchema.default([]),
  })
  .superRefine((document, context) => {
    const seenNodeIds = new Set<string>();
    for (const [index, node] of document.nodes.entries()) {
      if (seenNodeIds.has(node.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate node id: ${node.id}`,
          path: ["nodes", index, "id"],
        });
      }
      seenNodeIds.add(node.id);
    }

    const seenEdgeIds = new Set<string>();
    for (const [index, edge] of document.edges.entries()) {
      if (seenEdgeIds.has(edge.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate edge id: ${edge.id}`,
          path: ["edges", index, "id"],
        });
      }
      seenEdgeIds.add(edge.id);

      if (!seenNodeIds.has(edge.fromNode)) {
        context.addIssue({
          code: "custom",
          message: `Edge ${edge.id} references missing fromNode ${edge.fromNode}`,
          path: ["edges", index, "fromNode"],
        });
      }

      if (!seenNodeIds.has(edge.toNode)) {
        context.addIssue({
          code: "custom",
          message: `Edge ${edge.id} references missing toNode ${edge.toNode}`,
          path: ["edges", index, "toNode"],
        });
      }
    }
  });

export type CanvasNode = z.infer<typeof canvasNodeSchema>;
export type CanvasEdge = z.infer<typeof canvasEdgeSchema>;
export type CanvasDocument = z.infer<typeof canvasDocumentSchema>;

export const canvasDocumentPatchSchema = z
  .object({
    nodes: canvasNodesSchema.optional(),
    edges: canvasEdgesSchema.optional(),
  })
  .refine((value) => value.nodes !== undefined || value.edges !== undefined, {
    message: "at least one of nodes or edges is required",
  });

export const canvasNodeUpdateSchema = z
  .object({
    x: canvasIntegerSchema.optional(),
    y: canvasIntegerSchema.optional(),
    width: canvasIntegerSchema.optional(),
    height: canvasIntegerSchema.optional(),
    color: canvasColorSchema.nullish(),
    text: z.string().optional(),
    file: vaultPathSchema.optional(),
    subpath: z
      .string()
      .nullish()
      .refine((value) => value === undefined || value === null || value.startsWith("#"), "subpath must start with #"),
    url: z.string().url().optional(),
    label: z.string().nullish(),
    background: vaultPathSchema.nullish(),
    backgroundStyle: canvasBackgroundStyleSchema.nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one node field update is required",
  });

export const canvasEdgeUpdateSchema = z
  .object({
    fromNode: nonEmptyString.optional(),
    fromSide: canvasSideSchema.nullish(),
    fromEnd: canvasEndSchema.nullish(),
    toNode: nonEmptyString.optional(),
    toSide: canvasSideSchema.nullish(),
    toEnd: canvasEndSchema.nullish(),
    color: canvasColorSchema.nullish(),
    label: z.string().nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one edge field update is required",
  });

export async function readCanvasDocument(client: ObsidianClient, path: string) {
  const file = await client.readNote(path);
  return {
    path: file.path ?? path,
    file,
    canvas: parseCanvasDocument(file.content, path),
  };
}

export async function writeCanvasDocument(client: ObsidianClient, path: string, canvas: CanvasDocument) {
  return client.writeFile(path, serializeCanvasDocument(canvas), {
    contentType: "application/json; charset=utf-8",
    successMessage: "Canvas written successfully.",
  });
}

export async function ensureCanvasDoesNotExist(client: ObsidianClient, path: string) {
  try {
    await client.readNote(path);
    throw new Error(`Canvas already exists: ${path}`);
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }

    throw error;
  }
}

export function parseCanvasDocument(content: string, path: string): CanvasDocument {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    throw new ObsidianClientError(`Invalid JSON in canvas ${path}.`, {
      code: "OBSIDIAN_INVALID_CANVAS",
      details: error instanceof Error ? error.message : error,
    });
  }

  const result = canvasDocumentSchema.safeParse(parsed);
  if (!result.success) {
    throw new ObsidianClientError(`Invalid canvas document at ${path}: ${formatZodIssues(result.error)}`, {
      code: "OBSIDIAN_INVALID_CANVAS",
      details: result.error.issues,
    });
  }

  return result.data;
}

export function serializeCanvasDocument(canvas: CanvasDocument): string {
  return `${JSON.stringify(canvasDocumentSchema.parse(canvas), null, 2)}\n`;
}

export function replaceCanvasDocument(current: CanvasDocument, patch: z.infer<typeof canvasDocumentPatchSchema>) {
  return canvasDocumentSchema.parse({
    nodes: patch.nodes ?? current.nodes,
    edges: patch.edges ?? current.edges,
  });
}

export function addCanvasNode(canvas: CanvasDocument, node: CanvasNode) {
  if (canvas.nodes.some((candidate) => candidate.id === node.id)) {
    throw new Error(`Canvas node already exists: ${node.id}`);
  }

  return canvasDocumentSchema.parse({
    ...canvas,
    nodes: [...canvas.nodes, node],
  });
}

export function updateCanvasNode(
  canvas: CanvasDocument,
  nodeId: string,
  updates: z.infer<typeof canvasNodeUpdateSchema>,
) {
  const index = canvas.nodes.findIndex((node) => node.id === nodeId);
  if (index === -1) {
    throw new Error(`Canvas node does not exist: ${nodeId}`);
  }

  const current = canvas.nodes[index];
  if (!current) {
    throw new Error(`Canvas node does not exist: ${nodeId}`);
  }
  const next = { ...current } as Record<string, unknown>;

  for (const key of ["x", "y", "width", "height"] as const) {
    if (updates[key] !== undefined) {
      next[key] = updates[key];
    }
  }

  if ("color" in updates) {
    if (updates.color === null || updates.color === undefined) {
      delete next.color;
    } else {
      next.color = updates.color;
    }
  }

  switch (current.type) {
    case "text":
      rejectInvalidUpdateKeys(updates, ["x", "y", "width", "height", "color", "text"], current.type);
      if (updates.text !== undefined) {
        next.text = updates.text;
      }
      break;
    case "file":
      rejectInvalidUpdateKeys(updates, ["x", "y", "width", "height", "color", "file", "subpath"], current.type);
      if (updates.file !== undefined) {
        next.file = updates.file;
      }
      if ("subpath" in updates) {
        if (updates.subpath === null || updates.subpath === undefined) {
          delete next.subpath;
        } else {
          next.subpath = updates.subpath;
        }
      }
      break;
    case "link":
      rejectInvalidUpdateKeys(updates, ["x", "y", "width", "height", "color", "url"], current.type);
      if (updates.url !== undefined) {
        next.url = updates.url;
      }
      break;
    case "group":
      rejectInvalidUpdateKeys(
        updates,
        ["x", "y", "width", "height", "color", "label", "background", "backgroundStyle"],
        current.type,
      );
      if ("label" in updates) {
        if (updates.label === null || updates.label === undefined) {
          delete next.label;
        } else {
          next.label = updates.label;
        }
      }
      if ("background" in updates) {
        if (updates.background === null || updates.background === undefined) {
          delete next.background;
        } else {
          next.background = updates.background;
        }
      }
      if ("backgroundStyle" in updates) {
        if (updates.backgroundStyle === null || updates.backgroundStyle === undefined) {
          delete next.backgroundStyle;
        } else {
          next.backgroundStyle = updates.backgroundStyle;
        }
      }
      break;
  }

  const nodes = [...canvas.nodes];
  nodes[index] = canvasNodeSchema.parse(next);

  return canvasDocumentSchema.parse({
    ...canvas,
    nodes,
  });
}

export function removeCanvasNode(canvas: CanvasDocument, nodeId: string) {
  const nodeExists = canvas.nodes.some((node) => node.id === nodeId);
  if (!nodeExists) {
    throw new Error(`Canvas node does not exist: ${nodeId}`);
  }

  return canvasDocumentSchema.parse({
    nodes: canvas.nodes.filter((node) => node.id !== nodeId),
    edges: canvas.edges.filter((edge) => edge.fromNode !== nodeId && edge.toNode !== nodeId),
  });
}

export function addCanvasEdge(canvas: CanvasDocument, edge: CanvasEdge) {
  if (canvas.edges.some((candidate) => candidate.id === edge.id)) {
    throw new Error(`Canvas edge already exists: ${edge.id}`);
  }

  return canvasDocumentSchema.parse({
    ...canvas,
    edges: [...canvas.edges, edge],
  });
}

export function updateCanvasEdge(
  canvas: CanvasDocument,
  edgeId: string,
  updates: z.infer<typeof canvasEdgeUpdateSchema>,
) {
  const index = canvas.edges.findIndex((edge) => edge.id === edgeId);
  if (index === -1) {
    throw new Error(`Canvas edge does not exist: ${edgeId}`);
  }

  const next = { ...canvas.edges[index] } as Record<string, unknown>;
  for (const key of ["fromNode", "toNode"] as const) {
    if (updates[key] !== undefined) {
      next[key] = updates[key];
    }
  }

  for (const key of ["fromSide", "fromEnd", "toSide", "toEnd", "color", "label"] as const) {
    if (key in updates) {
      const value = updates[key];
      if (value === null || value === undefined) {
        delete next[key];
      } else {
        next[key] = value;
      }
    }
  }

  const edges = [...canvas.edges];
  edges[index] = canvasEdgeSchema.parse(next);

  return canvasDocumentSchema.parse({
    ...canvas,
    edges,
  });
}

export function removeCanvasEdge(canvas: CanvasDocument, edgeId: string) {
  const edgeExists = canvas.edges.some((edge) => edge.id === edgeId);
  if (!edgeExists) {
    throw new Error(`Canvas edge does not exist: ${edgeId}`);
  }

  return canvasDocumentSchema.parse({
    ...canvas,
    edges: canvas.edges.filter((edge) => edge.id !== edgeId),
  });
}

function rejectInvalidUpdateKeys(
  updates: z.infer<typeof canvasNodeUpdateSchema>,
  allowedKeys: string[],
  nodeType: CanvasNode["type"],
) {
  for (const key of Object.keys(updates)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`Field ${key} is not valid for canvas node type ${nodeType}.`);
    }
  }
}

function isNotFoundError(error: unknown) {
  return error instanceof ObsidianClientError && error.status === 404;
}

function formatZodIssues(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}
