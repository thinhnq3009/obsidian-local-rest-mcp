import http from "node:http";
import https from "node:https";

import type {
  AppConfig,
  NoteJsonMetadata,
  NoteReadResult,
  PatchOperation,
  SearchResult,
  VaultEntry,
} from "../types.js";
import { ObsidianClientError } from "../types.js";

type RequestOptions = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: URLSearchParams;
  headers?: Record<string, string>;
  body?: string;
  authRequired?: boolean;
};

type InternalRequestOptions = {
  url: URL;
  method: RequestOptions["method"];
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  rejectUnauthorized: boolean;
};

type ResponseLike = {
  status: number;
  statusText: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

export type RequestLike = (options: InternalRequestOptions) => Promise<ResponseLike>;

type RawResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
};

export class ObsidianClient {
  private readonly config: AppConfig;
  private readonly requestImpl: RequestLike;

  public constructor(config: AppConfig, options?: { requestImpl?: RequestLike }) {
    this.config = config;
    this.requestImpl = options?.requestImpl ?? nodeRequest;
  }

  public async checkConnection(): Promise<void> {
    await this.request({
      method: "GET",
      path: "/",
      authRequired: false,
    });

    await this.request({
      method: "GET",
      path: "/vault/",
    });
  }

  public async listFiles(path = ""): Promise<{ entries: VaultEntry[]; root: string }> {
    const response = await this.request({
      method: "GET",
      path: buildVaultPath(path),
    });

    return {
      root: normalizeVaultPath(path),
      entries: normalizeVaultEntries(response.body),
    };
  }

  public async readNote(path: string): Promise<NoteReadResult> {
    const response = await this.request({
      method: "GET",
      path: buildVaultPath(path),
    });

    return {
      path: pathFromPayload(response.body) ?? normalizeVaultPath(path),
      content: bodyToString(response.body),
      contentType: headerValue(response.headers, "content-type"),
      etag: headerValue(response.headers, "etag"),
      lastModified: headerValue(response.headers, "last-modified"),
    };
  }

  public async writeNote(path: string, content: string): Promise<{ path: string; message: string }> {
    return this.writeFile(path, content, {
      contentType: "text/plain; charset=utf-8",
      successMessage: "Note written successfully.",
    });
  }

  public async writeFile(
    path: string,
    content: string,
    options?: { contentType?: string; successMessage?: string },
  ): Promise<{ path: string; message: string }> {
    const response = await this.request({
      method: "PUT",
      path: buildVaultPath(path),
      headers: {
        "Content-Type": options?.contentType ?? "text/plain; charset=utf-8",
      },
      body: content,
    });

    return {
      path: normalizeVaultPath(path),
      message: responseMessage(response.body, options?.successMessage ?? "File written successfully."),
    };
  }

  public async appendToNote(path: string, content: string): Promise<{ path: string; message: string }> {
    const response = await this.request({
      method: "POST",
      path: buildVaultPath(path),
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: content,
    });

    return {
      path: normalizeVaultPath(path),
      message: responseMessage(response.body, "Content appended successfully."),
    };
  }

  public async patchHeading(
    path: string,
    heading: string,
    content: string,
    operation: PatchOperation,
  ): Promise<{ path: string; heading: string; operation: PatchOperation; message: string }> {
    const response = await this.request({
      method: "PATCH",
      path: buildVaultPath(path),
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        Operation: operation,
        "Target-Type": "heading",
        Target: heading,
      },
      body: content,
    });

    return {
      path: normalizeVaultPath(path),
      heading,
      operation,
      message: responseMessage(response.body, "Heading patched successfully."),
    };
  }

  public async search(query: string, limit: number): Promise<{ query: string; results: SearchResult[] }> {
    const response = await this.request({
      method: "POST",
      path: "/search/simple/",
      query: new URLSearchParams({ query }),
    });

    return {
      query,
      results: normalizeSearchResults(response.body).slice(0, limit),
    };
  }

  public async getActiveFile(): Promise<NoteReadResult> {
    const response = await this.request({
      method: "GET",
      path: "/active/",
    });

    const path = pathFromPayload(response.body);
    return {
      ...(path ? { path } : {}),
      content: bodyToString(response.body),
      contentType: headerValue(response.headers, "content-type"),
      etag: headerValue(response.headers, "etag"),
      lastModified: headerValue(response.headers, "last-modified"),
    };
  }

  public async openFile(path: string): Promise<{ path: string; message: string }> {
    const response = await this.request({
      method: "POST",
      path: `/open/${encodeVaultSegments(path)}`,
    });

    return {
      path: normalizeVaultPath(path),
      message: responseMessage(response.body, "File opened in Obsidian."),
    };
  }

  public async deletePath(path: string): Promise<void> {
    await this.request({
      method: "DELETE",
      path: buildVaultPath(path),
    });
  }

  public async readNoteMetadata(path: string): Promise<NoteJsonMetadata> {
    const response = await this.request({
      method: "GET",
      path: buildVaultPath(path),
      headers: {
        Accept: "application/vnd.olrapi.note+json",
      },
    });

    return normalizeNoteJsonMetadata(path, response.body);
  }

  public async patchFrontmatter(
    path: string,
    field: string,
    value: unknown,
    operation: PatchOperation,
    createIfMissing: boolean,
  ): Promise<{ path: string; field: string; operation: PatchOperation; message: string }> {
    const response = await this.request({
      method: "PATCH",
      path: buildVaultPath(path),
      headers: {
        "Content-Type": "application/json",
        Operation: operation,
        "Target-Type": "frontmatter",
        Target: field,
        ...(createIfMissing ? { "Create-Target-If-Missing": "true" } : {}),
      },
      body: JSON.stringify(value),
    });

    return {
      path: normalizeVaultPath(path),
      field,
      operation,
      message: responseMessage(response.body, "Frontmatter patched successfully."),
    };
  }

  public async searchAdvanced(
    expression: Record<string, unknown>,
    limit: number,
  ): Promise<{ results: SearchResult[] }> {
    const response = await this.request({
      method: "POST",
      path: "/search/",
      headers: {
        "Content-Type": "application/vnd.olrapi.jsonlogic+json",
      },
      body: JSON.stringify(expression),
    });

    return {
      results: normalizeSearchResults(response.body).slice(0, limit),
    };
  }

  private async request(options: RequestOptions): Promise<RawResponse> {
    const url = new URL(options.path, `${this.config.obsidianBaseUrl}/`);
    if (options.query) {
      url.search = options.query.toString();
    }

    const headers: Record<string, string> = {
      ...(options.headers ?? {}),
    };
    if (options.authRequired !== false) {
      headers.Authorization = `Bearer ${this.config.obsidianApiKey}`;
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.retryCount; attempt += 1) {
      try {
        const response = await this.requestImpl({
          url,
          method: options.method,
          headers,
          timeoutMs: this.config.requestTimeoutMs,
          rejectUnauthorized: this.config.obsidianVerifySsl,
          ...(options.body !== undefined ? { body: options.body } : {}),
        });

        const body = parseResponseBody(response);

        if (response.status < 200 || response.status >= 300) {
          throw new ObsidianClientError(
            `Obsidian API request failed with ${response.status} ${response.statusText}`,
            {
              code: "OBSIDIAN_HTTP_ERROR",
              status: response.status,
              details: body,
            },
          );
        }

        return {
          status: response.status,
          headers: response.headers,
          body,
        };
      } catch (error) {
        lastError = error;

        const shouldRetry =
          attempt < this.config.retryCount &&
          !(error instanceof ObsidianClientError && error.status !== undefined && error.status < 500);

        if (!shouldRetry) {
          throw mapRequestError(error);
        }
      }
    }

    throw mapRequestError(lastError);
  }
}

export function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "").trim();
}

export function encodeVaultSegments(path: string): string {
  const normalized = normalizeVaultPath(path);
  return normalized
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function buildVaultPath(path: string): string {
  const normalized = normalizeVaultPath(path);
  if (normalized.length === 0) {
    return "/vault/";
  }

  return `/vault/${encodeVaultSegments(normalized)}`;
}

export function mapRequestError(error: unknown): ObsidianClientError {
  if (error instanceof ObsidianClientError) {
    return error;
  }

  if (error instanceof Error) {
    if (error.name === "AbortError" || error.message.toLowerCase().includes("timeout")) {
      return new ObsidianClientError("Timed out while talking to Obsidian Local REST API.", {
        code: "OBSIDIAN_TIMEOUT",
        details: error.message,
      });
    }

    return new ObsidianClientError(`Unable to reach Obsidian Local REST API: ${error.message}`, {
      code: "OBSIDIAN_UNREACHABLE",
      details: error.message,
    });
  }

  return new ObsidianClientError("Unknown Obsidian API error.", {
    code: "OBSIDIAN_UNKNOWN_ERROR",
    details: error,
  });
}

async function nodeRequest(options: InternalRequestOptions): Promise<ResponseLike> {
  const transport = options.url.protocol === "https:" ? https : http;

  return new Promise<ResponseLike>((resolve, reject) => {
    const request = transport.request(
      options.url,
      {
        method: options.method,
        headers: options.headers,
        rejectUnauthorized: options.rejectUnauthorized,
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            statusText: response.statusMessage ?? "",
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    request.setTimeout(options.timeoutMs, () => {
      request.destroy(new Error("timeout"));
    });

    request.on("error", reject);

    if (options.body !== undefined) {
      request.write(options.body);
    }

    request.end();
  });
}

function parseResponseBody(response: ResponseLike): unknown {
  if (response.status === 204 || response.body === "") {
    return null;
  }

  const contentType = headerValue(response.headers, "content-type") ?? "";
  if (contentType.includes("application/json")) {
    return JSON.parse(response.body) as unknown;
  }

  return response.body;
}

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | null {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  if (!key) {
    return null;
  }

  const value = headers[key];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === "string" ? value : null;
}

function bodyToString(body: unknown): string {
  if (typeof body === "string") {
    return body;
  }

  if (body && typeof body === "object") {
    const content = (body as Record<string, unknown>).content;
    if (typeof content === "string") {
      return content;
    }

    return JSON.stringify(body, null, 2);
  }

  return "";
}

function pathFromPayload(body: unknown): string | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }

  const record = body as Record<string, unknown>;
  const candidate = record.path ?? record.file ?? record.filename;
  return typeof candidate === "string" ? candidate : undefined;
}

function responseMessage(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.trim().length > 0) {
    return body.trim();
  }

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const candidate = record.message ?? record.status ?? record.result;
    if (typeof candidate === "string") {
      return candidate;
    }
  }

  return fallback;
}

function normalizeVaultEntries(body: unknown): VaultEntry[] {
  if (Array.isArray(body)) {
    return body.flatMap((entry) => normalizeVaultEntry(entry));
  }

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const combined: unknown[] = [];
    for (const candidate of [record.entries, record.files, record.folders, record.children]) {
      if (Array.isArray(candidate)) {
        for (const item of candidate) {
          combined.push(item);
        }
      }
    }

    if (combined.length > 0) {
      return combined.flatMap((entry) => normalizeVaultEntry(entry));
    }
  }

  return [];
}

function normalizeVaultEntry(entry: unknown): VaultEntry[] {
  if (typeof entry === "string") {
    const path = normalizeVaultPath(entry);
    if (path.length === 0) {
      return [];
    }

    return [
      {
        path,
        name: path.split("/").at(-1) ?? path,
        isFolder: false,
      },
    ];
  }

  if (!entry || typeof entry !== "object") {
    return [];
  }

  const record = entry as Record<string, unknown>;
  const rawPath = firstString(record.path, record.filename, record.file, record.name);
  if (!rawPath) {
    return [];
  }

  const path = normalizeVaultPath(rawPath);
  const kind = firstString(record.type, record.kind);
  const isFolder =
    typeof record.isFolder === "boolean"
      ? record.isFolder
      : typeof record.folder === "boolean"
        ? record.folder
        : kind === "folder" || kind === "directory";

  return [
    {
      path,
      name: firstString(record.name, record.basename) ?? path.split("/").at(-1) ?? path,
      isFolder,
    },
  ];
}

function normalizeSearchResults(body: unknown): SearchResult[] {
  const rawResults =
    Array.isArray(body)
      ? body
      : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).results)
        ? ((body as Record<string, unknown>).results as unknown[])
        : [];

  return rawResults.flatMap((result) => {
    if (typeof result === "string") {
      return [{ path: normalizeVaultPath(result) }];
    }

    if (!result || typeof result !== "object") {
      return [];
    }

    const record = result as Record<string, unknown>;
    const path = firstString(record.path, record.file, record.filename);
    if (!path) {
      return [];
    }

    return [
      {
        path: normalizeVaultPath(path),
        score: typeof record.score === "number" ? record.score : undefined,
        snippet: firstString(record.context, record.snippet, record.match, record.content)?.slice(0, 240),
      },
    ];
  });
}

function normalizeNoteJsonMetadata(path: string, body: unknown): NoteJsonMetadata {
  if (!body || typeof body !== "object") {
    throw new ObsidianClientError("Obsidian returned invalid note metadata.", {
      code: "OBSIDIAN_INVALID_RESPONSE",
      details: body,
    });
  }

  const record = body as Record<string, unknown>;
  const tags = Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === "string") : [];
  const frontmatter =
    record.frontmatter && typeof record.frontmatter === "object" && !Array.isArray(record.frontmatter)
      ? (record.frontmatter as Record<string, unknown>)
      : {};
  const stat =
    record.stat && typeof record.stat === "object" && !Array.isArray(record.stat)
      ? (record.stat as Record<string, unknown>)
      : null;

  return {
    path: typeof record.path === "string" ? normalizeVaultPath(record.path) : normalizeVaultPath(path),
    tags,
    frontmatter,
    stat:
      stat === null
        ? null
        : {
            ...(typeof stat.ctime === "number" ? { ctime: stat.ctime } : {}),
            ...(typeof stat.mtime === "number" ? { mtime: stat.mtime } : {}),
            ...(typeof stat.size === "number" ? { size: stat.size } : {}),
          },
    ...(typeof record.content === "string" ? { content: record.content } : {}),
  };
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}
