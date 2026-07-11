import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { FilesystemVaultBackend } from "./backend/filesystem.js";
import { LocalRestBackend } from "./backend/localRest.js";
import type { VaultBackend } from "./backend/types.js";
import { runtimeToolRegistrars, toolRegistrars } from "./tools/index.js";
import type { AppConfig } from "./types.js";

export type ApplicationContext = { backend: VaultBackend; close(): Promise<void> };

export async function createApplication(config: AppConfig): Promise<ApplicationContext> {
  const backend: VaultBackend = config.backend === "local-rest" ? new LocalRestBackend(config) : new FilesystemVaultBackend(config);
  await backend.initialize();
  return { backend, close: () => backend.close() };
}

export function createMcpServer(backend: VaultBackend) {
  const server = new McpServer({ name: "obsidian-vault-mcp", version: "1.0.0" });
  for (const registerTool of toolRegistrars) registerTool(server, backend);
  if (backend.capabilities.activeFile || backend.capabilities.openFile) {
    for (const registerTool of runtimeToolRegistrars) registerTool(server, backend);
  }
  return server;
}

export async function createServer(config: AppConfig, options: { application?: ApplicationContext } = {}) {
  const application = options.application ?? await createApplication(config);
  return { server: createMcpServer(application.backend), backend: application.backend, application };
}
