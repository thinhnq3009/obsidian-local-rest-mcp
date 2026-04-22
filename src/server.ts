import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ObsidianClient } from "./obsidian/client.js";
import { toolRegistrars } from "./tools/index.js";
import type { AppConfig } from "./types.js";

export async function createServer(config: AppConfig) {
  const client = new ObsidianClient(config);
  await client.checkConnection();

  const server = new McpServer({
    name: "obs-mcp-server",
    version: "0.1.0",
  });

  for (const registerTool of toolRegistrars) {
    registerTool(server, client);
  }

  return { server, client };
}
