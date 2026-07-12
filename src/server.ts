import { McpServer, type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AnySchema, ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { CallToolResult, ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";

import { FilesystemVaultBackend } from "./backend/filesystem.js";
import { LocalRestBackend } from "./backend/localRest.js";
import type { VaultBackend } from "./backend/types.js";
import { runtimeToolRegistrars, toolRegistrars } from "./tools/index.js";
import type { AppConfig } from "./types.js";

export type ApplicationContext = { backend: VaultBackend; close(): Promise<void> };
type ToolInputSchema = undefined | ZodRawShapeCompat | AnySchema;
type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export async function createApplication(config: AppConfig): Promise<ApplicationContext> {
  const backend: VaultBackend = config.backend === "local-rest" ? new LocalRestBackend(config) : new FilesystemVaultBackend(config);
  await backend.initialize();
  return { backend, close: () => backend.close() };
}

export function createMcpServer(backend: VaultBackend) {
  const server = new McpServer({ name: "obsidian-vault-mcp", version: "1.0.0" });
  installToolCallLogging(server);
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

function installToolCallLogging(server: McpServer): void {
  const registerTool = server.registerTool.bind(server);
  server.registerTool = ((name, config, callback) => registerTool(name, config, wrapToolCallback(name, callback))) as McpServer["registerTool"];
}

function wrapToolCallback<InputArgs extends ToolInputSchema>(toolName: string, callback: ToolCallback<InputArgs>): ToolCallback<InputArgs> {
  const wrapped = async (...args: Parameters<ToolCallback<InputArgs>>): Promise<CallToolResult> => {
    const startedAt = Date.now();
    const { input, extra } = extractToolCallArgs(args);
    const inputBytes = jsonByteLength(input);
    try {
      const invoke = callback as (...invokeArgs: Parameters<ToolCallback<InputArgs>>) => CallToolResult | Promise<CallToolResult>;
      const result = await invoke(...args);
      const error = result.isError === true ? errorSummaryFromResult(result) : undefined;
      writeToolLog({ toolName, extra, inputBytes, outputBytes: jsonByteLength(result), durationMs: Date.now() - startedAt, status: result.isError === true ? "error" : "ok", ...(error ? { error } : {}) });
      return result;
    } catch (error) {
      writeToolLog({ toolName, extra, inputBytes, outputBytes: 0, durationMs: Date.now() - startedAt, status: "error", error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };
  return wrapped as ToolCallback<InputArgs>;
}

function extractToolCallArgs(args: readonly unknown[]): { input: unknown; extra: Partial<ToolExtra> | undefined } {
  const maybeExtra = args.length > 1 ? args[1] : args[0];
  return {
    input: args.length > 1 ? args[0] : undefined,
    extra: isRecord(maybeExtra) ? maybeExtra as Partial<ToolExtra> : undefined,
  };
}

function writeToolLog(event: { toolName: string; extra: Partial<ToolExtra> | undefined; inputBytes: number; outputBytes: number; durationMs: number; status: "ok" | "error"; error?: string }): void {
  const caller = callerFields(event.extra);
  const fields = [
    `[obsidian-vault-mcp] tool=${event.toolName}`,
    ...caller,
    `in=${event.inputBytes}B`,
    `out=${event.outputBytes}B`,
    event.status,
    `${event.durationMs}ms`,
  ];
  if (event.error) fields.push(`error=${formatField(event.error, 120)}`);
  process.stderr.write(`${fields.join(" ")}\n`);
}

function callerFields(extra: Partial<ToolExtra> | undefined): string[] {
  const requestInfo = extra?.requestInfo;
  const headers = requestInfo?.headers;
  const fields = [`caller=${requestInfo ? "http" : "stdio"}`];
  const host = headers ? headerValue(headers, "host") : undefined;
  const origin = headers ? headerValue(headers, "origin") : undefined;
  const userAgent = headers ? headerValue(headers, "user-agent") : undefined;
  const requestId = extra?.requestId;
  if (host) fields.push(`host=${formatField(host, 80)}`);
  if (origin) fields.push(`origin=${formatField(origin, 80)}`);
  if (userAgent) fields.push(`ua=${formatField(userAgent, 80)}`);
  if (extra?.sessionId) fields.push(`session=${formatField(extra.sessionId, 40)}`);
  if (requestId !== undefined) fields.push(`request=${formatField(String(requestId), 40)}`);
  return fields;
}

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  const value = match?.[1];
  if (Array.isArray(value)) return value.join(",");
  return value;
}

function errorSummaryFromResult(result: CallToolResult): string | undefined {
  const text = result.content.find((item) => item.type === "text")?.text;
  return text ? text.replace(/\s+/gu, " ").trim() : undefined;
}

function jsonByteLength(value: unknown): number {
  if (value === undefined) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
  } catch {
    return 0;
  }
}

function formatField(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/gu, "_");
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
