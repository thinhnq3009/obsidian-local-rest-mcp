import http from "node:http";

import type { Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createServer } from "./server.js";
import type { AppConfig } from "./types.js";

type ServerFactory = typeof createServer;

export async function startHttpServer(config: AppConfig, options: { createServer?: ServerFactory } = {}): Promise<http.Server> {
  const createServerImpl = options.createServer ?? createServer;

  await createServerImpl(config);

  const appOptions = {
    host: config.mcpHttpHost,
    ...(config.mcpAllowedHosts ? { allowedHosts: config.mcpAllowedHosts } : {}),
  };
  const app = createMcpExpressApp(appOptions);

  app.all(config.mcpHttpPath, async (request: Request<Record<string, string>, unknown, unknown>, response: Response) => {
    const { server } = await createServerImpl(config, { skipConnectionCheck: true });
    const transport = new StreamableHTTPServerTransport();
    const parsedBody: unknown = request.body;

    response.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport as Parameters<typeof server.connect>[0]);
      await transport.handleRequest(request, response, parsedBody);
    } catch (error: unknown) {
      await transport.close();
      await server.close();

      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  const server = http.createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.mcpHttpPort, config.mcpHttpHost, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.mcpHttpPort;

  process.stderr.write(`[obs-mcp-server] HTTP transport listening at http://${config.mcpHttpHost}:${String(port)}${config.mcpHttpPath}\n`);

  return server;
}
