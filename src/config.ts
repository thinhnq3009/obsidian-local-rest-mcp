import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import type { AppConfig } from "./types.js";

const DEFAULT_BASE_URL = "https://127.0.0.1:27124";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_COUNT = 1;
const DEFAULT_MCP_TRANSPORT = "stdio";
const DEFAULT_MCP_HTTP_HOST = "127.0.0.1";
const DEFAULT_MCP_HTTP_PORT = 39145;
const DEFAULT_MCP_HTTP_PATH = "/mcp";

const booleanStringSchema = z.preprocess(
  (value) => value ?? "false",
  z
    .string()
    .trim()
    .transform((input) => input.toLowerCase())
    .refine((value) => ["true", "false", "1", "0", "yes", "no"].includes(value), "must be a boolean string")
    .transform((value) => ["true", "1", "yes"].includes(value)),
);

const transportSchema = z.enum(["stdio", "http"]);
const httpPathSchema = z.string().trim().min(1, "MCP_HTTP_PATH is required").refine((value) => value.startsWith("/"), "MCP_HTTP_PATH must start with /");

const envSchema = z.object({
  OBSIDIAN_API_KEY: z.string().trim().min(1, "OBSIDIAN_API_KEY is required"),
  OBSIDIAN_BASE_URL: z.preprocess((value) => value ?? DEFAULT_BASE_URL, z.url()),
  OBSIDIAN_VERIFY_SSL: booleanStringSchema,
  MCP_TRANSPORT: z.preprocess((value) => value ?? DEFAULT_MCP_TRANSPORT, transportSchema),
  MCP_HTTP_HOST: z.preprocess((value) => value ?? DEFAULT_MCP_HTTP_HOST, z.string().trim().min(1, "MCP_HTTP_HOST is required")),
  MCP_HTTP_PORT: z.preprocess(
    (value) => value ?? DEFAULT_MCP_HTTP_PORT,
    z.coerce.number().int("MCP_HTTP_PORT must be an integer").min(1, "MCP_HTTP_PORT must be at least 1").max(65_535, "MCP_HTTP_PORT must be at most 65535"),
  ),
  MCP_HTTP_PATH: z.preprocess((value) => value ?? DEFAULT_MCP_HTTP_PATH, httpPathSchema),
  MCP_ALLOWED_HOSTS: z.string().optional(),
});

type CliOverrides = Partial<Record<"MCP_TRANSPORT" | "MCP_HTTP_HOST" | "MCP_HTTP_PORT" | "MCP_HTTP_PATH", string>>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv.slice(2)): AppConfig {
  const mergedSource: Record<string, string | undefined> = {
    ...(source === process.env ? loadDotEnvFile() : {}),
    ...source,
    ...parseCliArgs(argv),
  };

  if (!mergedSource.OBSIDIAN_API_KEY?.trim()) {
    throw new Error("Invalid Obsidian configuration: OBSIDIAN_API_KEY is required");
  }

  const parsed = envSchema.safeParse(mergedSource);

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid Obsidian configuration: ${message}`);
  }

  const allowedHosts = parseAllowedHosts(parsed.data.MCP_ALLOWED_HOSTS);

  return {
    obsidianApiKey: parsed.data.OBSIDIAN_API_KEY,
    obsidianBaseUrl: parsed.data.OBSIDIAN_BASE_URL.replace(/\/+$/, ""),
    obsidianVerifySsl: parsed.data.OBSIDIAN_VERIFY_SSL,
    requestTimeoutMs: DEFAULT_TIMEOUT_MS,
    retryCount: DEFAULT_RETRY_COUNT,
    mcpTransport: parsed.data.MCP_TRANSPORT,
    mcpHttpHost: parsed.data.MCP_HTTP_HOST,
    mcpHttpPort: parsed.data.MCP_HTTP_PORT,
    mcpHttpPath: normalizeHttpPath(parsed.data.MCP_HTTP_PATH),
    ...(allowedHosts ? { mcpAllowedHosts: allowedHosts } : {}),
  };
}

export function parseCliArgs(argv: string[]): CliOverrides {
  const overrides: CliOverrides = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument?.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = argument.slice(2).split("=", 2);
    const nextValue = inlineValue ?? argv[index + 1];
    const value = inlineValue ?? (!nextValue?.startsWith("--") ? nextValue : undefined);

    if (inlineValue === undefined && value !== undefined) {
      index += 1;
    }

    if (value === undefined) {
      continue;
    }

    switch (rawKey) {
      case "transport":
        overrides.MCP_TRANSPORT = value;
        break;
      case "host":
        overrides.MCP_HTTP_HOST = value;
        break;
      case "port":
        overrides.MCP_HTTP_PORT = value;
        break;
      case "path":
        overrides.MCP_HTTP_PATH = value;
        break;
      default:
        break;
    }
  }

  return overrides;
}

function loadDotEnvFile(): Record<string, string> {
  const filePath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const result: Record<string, string> = {};
  const content = fs.readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/gu, "");
    if (key.length > 0) {
      result[key] = value;
    }
  }

  return result;
}

function normalizeHttpPath(httpPath: string): string {
  return httpPath.replace(/\/+$/u, "") || "/";
}

function parseAllowedHosts(rawValue: string | undefined): string[] | undefined {
  if (!rawValue) {
    return undefined;
  }

  const hosts = rawValue
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return hosts.length > 0 ? hosts : undefined;
}
