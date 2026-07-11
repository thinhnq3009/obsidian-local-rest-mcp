import { z } from "zod";

import type { ToolRegistrar } from "./common.js";
import { errorResult, successResult } from "./common.js";

const outputSchema = z.object({ ok: z.boolean(), checks: z.record(z.string(), z.string()) });

export const registerVaultHealthTool: ToolRegistrar = (server, backend) => {
  server.registerTool("obsidian_vault_health", { title: "Vault Health", description: "Check vault accessibility and index health without requiring Obsidian.", outputSchema }, async () => {
    try { const result = await backend.health(); return successResult(result.ok ? "Vault health checks passed." : "Vault health checks reported problems.", result); }
    catch (error) { return errorResult(error); }
  });
};
