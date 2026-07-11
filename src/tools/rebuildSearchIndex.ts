import { z } from "zod";

import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";

const outputSchema = z.object({ indexedFiles: z.number().int().nonnegative(), mode: z.string() });

export const registerRebuildSearchIndexTool: ToolRegistrar = (server, backend) => {
  server.registerTool("obsidian_rebuild_search_index", { title: "Rebuild Vault Search Index", description: "Rebuild the local search index from source notes without changing vault content.", outputSchema }, async () => {
    try { const result = await backend.rebuildSearchIndex(); return successResult(`Rebuilt search data for ${result.indexedFiles} files.`, result); }
    catch (error) { return errorResult(error); }
  });
};
