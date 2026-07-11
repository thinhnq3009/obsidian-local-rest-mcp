import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import { defaultCacheDir } from "./backend/filesystem.js";
import type { AppConfig } from "./types.js";

const DEFAULT_BASE_URL = "https://127.0.0.1:27124";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_COUNT = 1;
const DEFAULT_MCP_HTTP_PORT = 39145;

const booleanString = (fallback: boolean) => z.preprocess(
  (value) => value ?? String(fallback),
  z.string().trim().toLowerCase().refine((value) => ["true", "false", "1", "0", "yes", "no"].includes(value), "must be a boolean string").transform((value) => ["true", "1", "yes"].includes(value)),
);

const envSchema = z.object({
  BACKEND: z.preprocess((value) => value ?? "filesystem", z.enum(["filesystem", "local-rest"])),
  VAULT_PATH: z.string().trim().optional(),
  READ_ONLY: booleanString(false),
  READ_PATHS: z.string().optional(),
  WRITE_PATHS: z.string().optional(),
  INDEX_MODE: z.preprocess((value) => value ?? "auto", z.enum(["auto", "scan", "indexed"])),
  WATCH_MODE: z.preprocess((value) => value ?? "auto", z.enum(["auto", "on", "off"])),
  CACHE_DIR: z.preprocess((value) => value ?? defaultCacheDir(), z.string().trim().min(1)),
  MAX_FILE_SIZE_BYTES: z.preprocess((value) => value ?? 10 * 1024 * 1024, z.coerce.number().int().positive()),
  MAX_TREE_ENTRIES: z.preprocess((value) => value ?? 10_000, z.coerce.number().int().positive()),
  MAX_SEARCH_RESULTS: z.preprocess((value) => value ?? 100, z.coerce.number().int().min(1).max(1000)),
  OBSIDIAN_API_KEY: z.string().trim().optional(),
  OBSIDIAN_BASE_URL: z.preprocess((value) => value ?? DEFAULT_BASE_URL, z.url()),
  OBSIDIAN_VERIFY_SSL: booleanString(false),
  MCP_TRANSPORT: z.preprocess((value) => value ?? "stdio", z.enum(["stdio", "http"])),
  MCP_HTTP_HOST: z.preprocess((value) => value ?? "127.0.0.1", z.string().trim().min(1)),
  MCP_HTTP_PORT: z.preprocess((value) => value ?? DEFAULT_MCP_HTTP_PORT, z.coerce.number().int().min(1).max(65_535)),
  MCP_HTTP_PATH: z.preprocess((value) => value ?? "/mcp", z.string().trim().min(1).refine((value) => value.startsWith("/"), "MCP_HTTP_PATH must start with /")),
  MCP_ALLOWED_HOSTS: z.string().optional(),
  MCP_AUTH_TOKEN: z.string().trim().optional(),
});

type CliOverrides = Record<string, string | undefined>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv.slice(2)): AppConfig {
  const parsedArgs = parseCliArgs(argv);
  const merged: Record<string, string | undefined> = {
    ...(source === process.env ? loadDotEnvFile() : {}),
    ...source,
    ...parsedArgs,
  };
  const parsed = envSchema.safeParse(merged);
  if (!parsed.success) throw new Error(`Invalid configuration: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
  const data = parsed.data;
  if (data.BACKEND === "filesystem" && !data.VAULT_PATH) throw new Error("Invalid filesystem configuration: VAULT_PATH is required");
  if (data.BACKEND === "local-rest" && !data.OBSIDIAN_API_KEY) throw new Error("Invalid Local REST configuration: OBSIDIAN_API_KEY is required");
  if (!isLoopbackHost(data.MCP_HTTP_HOST) && !data.MCP_AUTH_TOKEN) throw new Error("MCP_AUTH_TOKEN is required when MCP_HTTP_HOST is not loopback");

  return {
    backend: data.BACKEND,
    ...(data.VAULT_PATH ? { vaultPath: path.resolve(data.VAULT_PATH) } : {}),
    readOnly: data.READ_ONLY,
    readPaths: splitList(data.READ_PATHS),
    writePaths: splitList(data.WRITE_PATHS),
    indexMode: data.INDEX_MODE,
    watchMode: data.WATCH_MODE,
    cacheDir: path.resolve(data.CACHE_DIR),
    maxFileSizeBytes: data.MAX_FILE_SIZE_BYTES,
    maxTreeEntries: data.MAX_TREE_ENTRIES,
    maxSearchResults: data.MAX_SEARCH_RESULTS,
    ...(data.OBSIDIAN_API_KEY ? { obsidianApiKey: data.OBSIDIAN_API_KEY } : {}),
    obsidianBaseUrl: data.OBSIDIAN_BASE_URL.replace(/\/+$/u, ""),
    obsidianVerifySsl: data.OBSIDIAN_VERIFY_SSL,
    requestTimeoutMs: DEFAULT_TIMEOUT_MS,
    retryCount: DEFAULT_RETRY_COUNT,
    mcpTransport: data.MCP_TRANSPORT,
    mcpHttpHost: data.MCP_HTTP_HOST,
    mcpHttpPort: data.MCP_HTTP_PORT,
    mcpHttpPath: data.MCP_HTTP_PATH.replace(/\/+$/u, "") || "/",
    ...(splitList(data.MCP_ALLOWED_HOSTS).length > 0 ? { mcpAllowedHosts: splitList(data.MCP_ALLOWED_HOSTS) } : {}),
    ...(data.MCP_AUTH_TOKEN ? { mcpAuthToken: data.MCP_AUTH_TOKEN } : {}),
  };
}

export function parseCliArgs(argv: string[]): CliOverrides {
  const overrides: CliOverrides = {};
  const mapping: Record<string, string> = {
    backend: "BACKEND", vault: "VAULT_PATH", "read-only": "READ_ONLY", "read-path": "READ_PATHS", "write-path": "WRITE_PATHS",
    "index-mode": "INDEX_MODE", "watch-mode": "WATCH_MODE", "cache-dir": "CACHE_DIR", transport: "MCP_TRANSPORT", host: "MCP_HTTP_HOST",
    port: "MCP_HTTP_PORT", path: "MCP_HTTP_PATH", "auth-token": "MCP_AUTH_TOKEN", "api-key": "OBSIDIAN_API_KEY", "base-url": "OBSIDIAN_BASE_URL", "verify-ssl": "OBSIDIAN_VERIFY_SSL",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument?.startsWith("--")) continue;
    if (argument === "--http" || argument === "--stdio") { overrides.MCP_TRANSPORT = argument.slice(2); continue; }
    if (argument === "--read-only") { overrides.READ_ONLY = "true"; continue; }
    const [rawKey, inlineValue] = argument.slice(2).split("=", 2);
    const candidate = inlineValue ?? argv[index + 1];
    const value = inlineValue ?? (candidate && !candidate.startsWith("--") ? candidate : undefined);
    if (inlineValue === undefined && value !== undefined) index += 1;
    const key = rawKey ? mapping[rawKey] : undefined;
    if (!key || value === undefined) continue;
    if ((key === "READ_PATHS" || key === "WRITE_PATHS") && overrides[key]) overrides[key] = `${overrides[key]},${value}`;
    else overrides[key] = value;
  }
  return overrides;
}

function loadDotEnvFile(): Record<string, string> {
  const filePath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(filePath)) return {};
  const result: Record<string, string> = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^['"]|['"]$/gu, "");
  }
  return result;
}

function splitList(value: string | undefined): string[] {
  return value?.split(",").map((item) => item.trim().replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "")).filter(Boolean) ?? [];
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}
