import { z } from "zod";

export const patchOperationSchema = z.enum(["append", "prepend", "replace"]);

export type PatchOperation = z.infer<typeof patchOperationSchema>;

export type AppConfig = {
  obsidianApiKey: string;
  obsidianBaseUrl: string;
  obsidianVerifySsl: boolean;
  requestTimeoutMs: number;
  retryCount: number;
};

export class ObsidianClientError extends Error {
  public readonly code: string;
  public readonly status: number | undefined;
  public readonly details: unknown;

  public constructor(message: string, options: { code: string; status?: number; details?: unknown }) {
    super(message);
    this.name = "ObsidianClientError";
    this.code = options.code;
    if (options.status !== undefined) {
      this.status = options.status;
    }
    this.details = options.details;
  }
}

export const vaultPathSchema = z
  .string()
  .min(1, "path is required")
  .transform((value) => value.replace(/\\/g, "/").replace(/^\/+/, "").trim())
  .refine((value) => value.length > 0, "path is required")
  .refine((value) => !value.split("/").some((segment) => segment === ".."), "path must stay inside the vault");

export const optionalVaultPathSchema = z
  .string()
  .default("")
  .transform((value) => value.replace(/\\/g, "/").replace(/^\/+/, "").trim())
  .refine((value) => !value.split("/").some((segment) => segment === ".."), "path must stay inside the vault");

export type VaultEntry = {
  path: string;
  name: string;
  isFolder: boolean;
};

export type NoteMetadata = {
  path?: string;
  contentType: string | null;
  etag: string | null;
  lastModified: string | null;
};

export type NoteReadResult = NoteMetadata & {
  content: string;
};

export type SearchResult = {
  path: string;
  score?: number;
  snippet?: string;
};

export type NoteStat = {
  ctime?: number;
  mtime?: number;
  size?: number;
};

export type NoteJsonMetadata = {
  path: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
  stat: NoteStat | null;
  content?: string;
};
