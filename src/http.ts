import http from "node:http";

import type { Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createApplication, createMcpServer, type ApplicationContext } from "./server.js";
import type { AppConfig } from "./types.js";

type ApplicationFactory = (config: AppConfig) => Promise<ApplicationContext>;

export async function startHttpServer(config: AppConfig, options: { createApplication?: ApplicationFactory } = {}): Promise<http.Server> {
  const application = await (options.createApplication ?? createApplication)(config);
  const app = createMcpExpressApp({ host: config.mcpHttpHost, ...(config.mcpAllowedHosts ? { allowedHosts: config.mcpAllowedHosts } : {}) });

  app.all(config.mcpHttpPath, async (request: Request<Record<string, string>, unknown, unknown>, response: Response) => {
    if (config.mcpAuthToken && request.headers.authorization !== `Bearer ${config.mcpAuthToken}`) {
      response.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
      return;
    }
    const server = createMcpServer(application.backend);
    const transport = new StreamableHTTPServerTransport();
    response.on("close", () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport as Parameters<typeof server.connect>[0]);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      await transport.close(); await server.close();
      if (!response.headersSent) response.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: error instanceof Error ? error.message : "Internal server error" }, id: null });
    }
  });

  const server = http.createServer(app);
  server.on("close", () => { void application.close(); });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.mcpHttpPort, config.mcpHttpHost, () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.mcpHttpPort;
  process.stderr.write(`[obsidian-vault-mcp] HTTP transport listening at http://${config.mcpHttpHost}:${String(port)}${config.mcpHttpPath}\n`);
  return server;
}
