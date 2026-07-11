import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import chokidar, { type FSWatcher } from "chokidar";
import MiniSearch from "minisearch";

import type { IndexMode, WatchMode } from "../types.js";
import { VaultError } from "../types.js";
import { parseMetadata } from "./markdown.js";
import type { SearchQuery, SearchResponse } from "./types.js";

type SearchDocument = {
  id: string;
  path: string;
  title: string;
  content: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
};

type PersistedIndex = {
  documents: SearchDocument[];
  savedAt: string;
};

const INDEX_FILE = "search-index.json";

export class VaultSearchService {
  private readonly documents = new Map<string, SearchDocument>();
  private miniSearch = createMiniSearch();
  private watcher: FSWatcher | undefined;
  private effectiveMode: "scan" | "indexed" = "scan";
  private state: "scan" | "ready" | "building" | "degraded" = "scan";
  private error: string | undefined;
  private persistChain: Promise<void> = Promise.resolve();

  public constructor(
    private readonly vaultRoot: string,
    private readonly cacheDir: string,
    private readonly indexMode: IndexMode,
    private readonly watchMode: WatchMode,
    private readonly maxFileSizeBytes: number,
  ) {}

  public async initialize(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true });
    try {
      await this.loadOrBuild();
    } catch (error) {
      this.state = "degraded";
      this.error = error instanceof Error ? error.message : String(error);
      this.effectiveMode = "scan";
      await this.scanDocuments();
    }
    if (this.watchMode !== "off") this.startWatcher();
  }

  public async close(): Promise<void> {
    await this.watcher?.close();
    await this.persistChain;
  }

  public getStatus() {
    return { state: this.state, mode: this.effectiveMode, error: this.error };
  }

  public async rebuild(): Promise<{ indexedFiles: number; mode: string }> {
    this.state = "building";
    this.error = undefined;
    await this.scanDocuments();
    this.effectiveMode = this.resolveMode(this.documents.size);
    if (this.effectiveMode === "indexed") await this.persist();
    this.state = this.effectiveMode === "indexed" ? "ready" : "scan";
    return { indexedFiles: this.documents.size, mode: this.effectiveMode };
  }

  public async search(query: SearchQuery): Promise<SearchResponse> {
    if (this.documents.size === 0) await this.scanDocuments();
    const offset = decodeCursor(query.cursor);
    let results = this.effectiveMode === "indexed" && query.query?.trim()
      ? this.miniSearch.search(query.query, { prefix: true, fuzzy: 0.2 }).map((result) => ({ document: this.documents.get(String(result.id)), score: result.score }))
      : [...this.documents.values()].map((document) => ({ document, score: 1 }));

    if (query.regex && isUnsafeRegex(query.regex)) throw new VaultError("Regular expression is too complex or unsafe.", { code: "INVALID_QUERY" });
    const regex = query.regex ? new RegExp(query.regex, query.caseSensitive ? "u" : "iu") : undefined;
    const needle = query.query?.trim();
    results = results.filter((candidate) => {
      const document = candidate.document;
      if (!document) return false;
      if (query.folder && !(document.path === query.folder || document.path.startsWith(`${query.folder.replace(/\/$/u, "")}/`))) return false;
      if (query.tag && !document.tags.includes(query.tag.replace(/^#/u, ""))) return false;
      if (query.frontmatter && !Object.entries(query.frontmatter).every(([key, value]) => deepEqual(document.frontmatter[key], value))) return false;
      if (regex && !regex.test(document.content)) return false;
      if (needle && this.effectiveMode === "scan") {
        const haystack = `${document.path}\n${document.content}`;
        if (query.caseSensitive ? !haystack.includes(needle) : !haystack.toLowerCase().includes(needle.toLowerCase())) return false;
      }
      return true;
    });

    if (query.sort === "path") results.sort((left, right) => left.document!.path.localeCompare(right.document!.path));
    else results.sort((left, right) => right.score - left.score || left.document!.path.localeCompare(right.document!.path));

    const page = results.slice(offset, offset + query.limit);
    const output = page.map(({ document, score }) => ({
      path: document!.path,
      score,
      snippet: buildSnippet(document!.content, needle ?? query.regex ?? ""),
    }));
    const nextOffset = offset + output.length;
    return {
      results: output,
      ...(nextOffset < results.length ? { nextCursor: encodeCursor(nextOffset) } : {}),
    };
  }

  private async loadOrBuild(): Promise<void> {
    const files = await collectMarkdownFiles(this.vaultRoot, this.maxFileSizeBytes);
    this.effectiveMode = this.resolveMode(files.length);
    if (this.effectiveMode === "scan") {
      await this.scanDocuments(files);
      this.state = "scan";
      return;
    }

    try {
      const raw = await fs.readFile(path.join(this.cacheDir, INDEX_FILE), "utf8");
      const persisted = JSON.parse(raw) as PersistedIndex;
      for (const document of persisted.documents) this.documents.set(document.path, document);
      this.rebuildMiniSearch();
      await this.scanDocuments(files);
      await this.persist();
      this.state = "ready";
    } catch {
      await this.rebuild();
    }
  }

  private resolveMode(fileCount: number): "scan" | "indexed" {
    if (this.indexMode === "scan") return "scan";
    if (this.indexMode === "indexed") return "indexed";
    return fileCount < 1000 ? "scan" : "indexed";
  }

  private async scanDocuments(files?: string[]): Promise<void> {
    this.documents.clear();
    this.miniSearch = createMiniSearch();
    const candidates = files ?? await collectMarkdownFiles(this.vaultRoot, this.maxFileSizeBytes);
    for (const absolutePath of candidates) await this.upsert(absolutePath, false);
    this.rebuildMiniSearch();
  }

  private rebuildMiniSearch(): void {
    this.miniSearch = createMiniSearch();
    this.miniSearch.addAll([...this.documents.values()]);
  }

  private async upsert(absolutePath: string, persist = true): Promise<void> {
    if (!absolutePath.toLowerCase().endsWith(".md") || isExcluded(this.vaultRoot, absolutePath)) return;
    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile() || stat.size > this.maxFileSizeBytes) return;
      const content = await fs.readFile(absolutePath, "utf8");
      const relative = toVaultPath(path.relative(this.vaultRoot, absolutePath));
      let metadata: ReturnType<typeof parseMetadata>;
      try {
        metadata = parseMetadata(content);
      } catch {
        metadata = { frontmatter: {}, headings: [], tags: [], links: [] };
      }
      const document: SearchDocument = {
        id: relative,
        path: relative,
        title: path.basename(relative, path.extname(relative)),
        content,
        tags: metadata.tags,
        frontmatter: metadata.frontmatter,
      };
      const previous = this.documents.get(relative);
      this.documents.set(relative, document);
      if (previous && this.miniSearch.has(previous.id)) this.miniSearch.replace(document);
      else this.miniSearch.add(document);
      if (persist && this.effectiveMode === "indexed") await this.persist();
    } catch {
      // A watcher event may race with a rename or delete.
    }
  }

  private async remove(absolutePath: string): Promise<void> {
    const relative = toVaultPath(path.relative(this.vaultRoot, absolutePath));
    const previous = this.documents.get(relative);
    if (previous && this.miniSearch.has(previous.id)) this.miniSearch.discard(previous.id);
    this.documents.delete(relative);
    if (this.effectiveMode === "indexed") await this.persist();
  }

  private startWatcher(): void {
    this.watcher = chokidar.watch(this.vaultRoot, {
      ignoreInitial: true,
      ignored: (watchedPath) => isExcluded(this.vaultRoot, watchedPath),
      awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 },
    });
    this.watcher.on("add", (file) => void this.upsert(file));
    this.watcher.on("change", (file) => void this.upsert(file));
    this.watcher.on("unlink", (file) => void this.remove(file));
    this.watcher.on("error", (error) => {
      this.state = "degraded";
      this.error = error instanceof Error ? error.message : String(error);
    });
  }

  private persist(): Promise<void> {
    this.persistChain = this.persistChain.catch(() => undefined).then(() => this.writePersistedIndex());
    return this.persistChain;
  }

  private async writePersistedIndex(): Promise<void> {
    const destination = path.join(this.cacheDir, INDEX_FILE);
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify({ documents: [...this.documents.values()], savedAt: new Date().toISOString() } satisfies PersistedIndex), "utf8");
      await fs.rename(temporary, destination);
    } finally {
      await fs.unlink(temporary).catch(() => undefined);
    }
  }
}

function createMiniSearch(): MiniSearch<SearchDocument> {
  return new MiniSearch<SearchDocument>({ fields: ["title", "path", "content", "tags"], storeFields: ["path"], tokenize: (value) => value.toLowerCase().split(/[^\p{L}\p{N}_/-]+/u).filter(Boolean) });
}

async function collectMarkdownFiles(root: string, maxFileSizeBytes: number): Promise<string[]> {
  const files: string[] = [];
  const walk = async (directory: string) => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (isExcluded(root, absolute)) continue;
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        const stat = await fs.stat(absolute);
        if (stat.size <= maxFileSizeBytes) files.push(absolute);
      }
    }
  };
  await walk(root);
  return files;
}

function isExcluded(root: string, absolutePath: string): boolean {
  const parts = toVaultPath(path.relative(root, absolutePath)).split("/");
  return parts.some((part) => part === ".obsidian" || part === ".git" || part.startsWith(".obsidian-vault-mcp-"));
}

function buildSnippet(content: string, needle: string): string {
  const normalized = needle.replace(/[.*+?^${}()|[\]\\]/gu, "");
  const index = normalized ? content.toLowerCase().indexOf(normalized.toLowerCase()) : 0;
  const start = Math.max(0, index - 80);
  return content.slice(start, start + 240).replace(/\s+/gu, " ").trim();
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { offset?: unknown };
    return typeof value.offset === "number" && value.offset >= 0 ? value.offset : 0;
  } catch {
    return 0;
  }
}

function toVaultPath(value: string): string {
  return value.replace(/\\/gu, "/");
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isUnsafeRegex(value: string): boolean {
  if (value.length > 256) return true;
  if (/\\[1-9]|\(\?<([=!])|\(\?<[A-Za-z]/u.test(value)) return true;
  return /\([^)]*[+*][^)]*\)[+*{]/u.test(value);
}
