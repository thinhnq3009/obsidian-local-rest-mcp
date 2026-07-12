import { z } from "zod";

import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";

const outputSchema = z.object({
  backend: z.enum(["filesystem", "local-rest"]),
  vaultPath: z.string().nullable(),
  readOnly: z.boolean(),
  capabilities: z.object({ activeFile: z.boolean(), openFile: z.boolean(), searchIndex: z.boolean(), filesystem: z.boolean() }),
  indexState: z.enum(["disabled", "scan", "ready", "building", "degraded"]),
  indexError: z.string().optional(),
});

export const registerBackendStatusTool: ToolRegistrar = (server, backend) => {
  server.registerTool("obsidian_backend_status", { title: "Vault Backend Status", description: "Report active backend, vault scope, read-only state, capabilities, and search-index state.", outputSchema }, async () => {
    try { const result = await backend.status(); return successResult(`Active backend: ${result.backend}.`, result); }
    catch (error) { return errorResult(error); }
  });
};
