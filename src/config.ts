import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import type { AppConfig } from "./types.js";

const DEFAULT_BASE_URL = "https://127.0.0.1:27124";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_COUNT = 1;

const booleanStringSchema = z.preprocess(
  (value) => value ?? "false",
  z
    .string()
    .trim()
    .transform((input) => input.toLowerCase())
    .refine((value) => ["true", "false", "1", "0", "yes", "no"].includes(value), "must be a boolean string")
    .transform((value) => ["true", "1", "yes"].includes(value)),
);

const envSchema = z.object({
  OBSIDIAN_API_KEY: z.string().trim().min(1, "OBSIDIAN_API_KEY is required"),
  OBSIDIAN_BASE_URL: z.preprocess((value) => value ?? DEFAULT_BASE_URL, z.url()),
  OBSIDIAN_VERIFY_SSL: booleanStringSchema,
});

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const mergedSource = {
    ...(source === process.env ? loadDotEnvFile() : {}),
    ...source,
  };

  if (!mergedSource.OBSIDIAN_API_KEY?.trim()) {
    throw new Error("Invalid Obsidian configuration: OBSIDIAN_API_KEY is required");
  }

  const parsed = envSchema.safeParse(mergedSource);

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid Obsidian configuration: ${message}`);
  }

  return {
    obsidianApiKey: parsed.data.OBSIDIAN_API_KEY,
    obsidianBaseUrl: parsed.data.OBSIDIAN_BASE_URL.replace(/\/+$/, ""),
    obsidianVerifySsl: parsed.data.OBSIDIAN_VERIFY_SSL,
    requestTimeoutMs: DEFAULT_TIMEOUT_MS,
    retryCount: DEFAULT_RETRY_COUNT,
  };
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
