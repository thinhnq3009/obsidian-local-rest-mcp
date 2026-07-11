import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FilesystemVaultBackend } from "../src/backend/filesystem.js";
import { createTempVault, makeConfig } from "./helpers.js";

const cleanup: string[] = [];

afterEach(async () => {
  for (const target of cleanup.splice(0)) await fs.rm(target, { recursive: true, force: true });
});

async function createBackend(overrides = {}) {
  const vault = await createTempVault(); cleanup.push(vault);
  const cache = await fs.mkdtemp(path.join(os.tmpdir(), "obsidian-vault-cache-")); cleanup.push(cache);
  const backend = new FilesystemVaultBackend(makeConfig({ vaultPath: vault, cacheDir: cache, ...overrides }));
  await backend.initialize();
  return { backend, vault };
}

describe("FilesystemVaultBackend", () => {
  it("creates, reads, safely replaces, and appends notes with revisions", async () => {
    const { backend } = await createBackend();
    const created = await backend.writeNote("Notes/Test.md", "# Test\n", { mode: "create" });
    expect(created.revision).toMatch(/^sha256:/u);
    const read = await backend.readNote("Notes/Test.md");
    await expect(backend.writeNote("Notes/Test.md", "changed", { mode: "replace" })).rejects.toMatchObject({ code: "CONFLICT" });
    const replaced = await backend.writeNote("Notes/Test.md", "# Updated\n", { mode: "replace", expectedRevision: read.revision });
    await expect(backend.appendToNote("Notes/Test.md", "stale", read.revision)).rejects.toMatchObject({ code: "CONFLICT" });
    const appended = await backend.appendToNote("Notes/Test.md", "More\n", replaced.revision);
    expect((await backend.readNote("Notes/Test.md")).content).toContain("More");
    expect(appended.revision).not.toBe(replaced.revision);
    await backend.close();
  });

  it("blocks traversal, absolute paths, read-only writes, and paths outside ACL scopes", async () => {
    const { backend } = await createBackend({ readPaths: ["Notes"], writePaths: ["Notes"] });
    await expect(backend.readNote("../secret.md")).rejects.toMatchObject({ code: "INVALID_PATH" });
    await expect(backend.readNote(path.resolve("secret.md"))).rejects.toMatchObject({ code: "INVALID_PATH" });
    await expect(backend.writeNote("Private/Test.md", "x", { mode: "create" })).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await backend.close();

    const readOnly = await createBackend({ readOnly: true });
    await expect(readOnly.backend.writeNote("Test.md", "x", { mode: "create" })).rejects.toMatchObject({ code: "READ_ONLY" });
    await readOnly.backend.close();
  });

  it("handles Unicode and hidden notes and enforces file-size limits", async () => {
    const { backend } = await createBackend({ maxFileSizeBytes: 32 });
    expect((await backend.createFolder("Nested/Folder")).created).toBe(true);
    await backend.writeNote("Ghi chú/.ẩn.md", "# Xin chào\n", { mode: "create" });
    expect((await backend.readNote("Ghi chú/.ẩn.md")).content).toContain("Xin chào");
    await expect(backend.writeNote("TooLarge.md", "x".repeat(33), { mode: "create" })).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    await backend.close();
  });

  it("rejects symlink or junction escapes", async () => {
    const { backend, vault } = await createBackend();
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "outside-vault-")); cleanup.push(outside);
    await fs.writeFile(path.join(outside, "Secret.md"), "secret", "utf8");
    try {
      await fs.symlink(outside, path.join(vault, "Escape"), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") { await backend.close(); return; }
      throw error;
    }
    await expect(backend.readNote("Escape/Secret.md")).rejects.toMatchObject({ code: "INVALID_PATH" });
    await backend.close();
  });

  it("does not allow symlinks to bypass configured path scopes", async () => {
    const { backend, vault } = await createBackend({ readPaths: ["Public"], writePaths: ["Public"] });
    await fs.mkdir(path.join(vault, "Private"), { recursive: true });
    await fs.mkdir(path.join(vault, "Public"), { recursive: true });
    await fs.writeFile(path.join(vault, "Private", "Secret.md"), "secret", "utf8");
    try {
      await fs.symlink(path.join(vault, "Private"), path.join(vault, "Public", "Alias"), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") { await backend.close(); return; }
      throw error;
    }
    await expect(backend.readNote("Public/Alias/Secret.md")).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await backend.close();
  });

  it("prevents lost updates across concurrent writers", async () => {
    const { backend } = await createBackend();
    const created = await backend.writeNote("Concurrent.md", "base", { mode: "create" });
    const writes = await Promise.allSettled([
      backend.writeNote("Concurrent.md", "left", { mode: "replace", expectedRevision: created.revision }),
      backend.writeNote("Concurrent.md", "right", { mode: "replace", expectedRevision: created.revision }),
    ]);
    expect(writes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(writes.filter((result) => result.status === "rejected")).toHaveLength(1);
    await backend.close();
  });

  it("patches metadata and moves arbitrary files and folders", async () => {
    const { backend } = await createBackend();
    const created = await backend.writeNote("Notes/Plan.md", "---\nstatus: open\n---\n# Next\nOld\n", { mode: "create" });
    const frontmatter = await backend.patchFrontmatter("Notes/Plan.md", "status", "done", "replace", true, created.revision);
    const heading = await backend.patchHeading("Notes/Plan.md", "Next", "New", "replace", { expectedRevision: frontmatter.revision });
    const metadata = await backend.readNoteMetadata("Notes/Plan.md");
    expect(metadata.frontmatter.status).toBe("done");
    expect((await backend.readNote("Notes/Plan.md")).content).toContain("New");
    await backend.writeFile("Assets/data.bin", "data", { mode: "create" });
    await backend.movePath("Assets", "Archive/Assets");
    expect((await backend.statPath("Archive/Assets/data.bin")).exists).toBe(true);
    await backend.deletePath("Notes/Plan.md", { expectedRevision: heading.revision });
    expect((await backend.statPath("Notes/Plan.md")).exists).toBe(false);
    await backend.close();
  });

  it("requires the destination revision before an overwrite move", async () => {
    const { backend } = await createBackend();
    const source = await backend.writeNote("Source.md", "source", { mode: "create" });
    const destination = await backend.writeNote("Destination.md", "destination", { mode: "create" });
    await expect(backend.movePath("Source.md", "Destination.md", { overwrite: true, expectedRevision: source.revision })).rejects.toMatchObject({ code: "CONFLICT" });
    await backend.movePath("Source.md", "Destination.md", { overwrite: true, expectedRevision: source.revision, expectedDestinationRevision: destination.revision });
    expect((await backend.readNote("Destination.md")).content).toBe("source");
    await backend.close();
  });

  it("searches content, tags, frontmatter, and rebuilds the local index", async () => {
    const { backend } = await createBackend({ indexMode: "indexed" });
    await backend.writeNote("Projects/Alpha.md", "---\nstatus: active\ntags: [mcp]\n---\n# Alpha\nStandalone vault search", { mode: "create" });
    await backend.writeNote("Projects/Beta.md", "# Beta\nOther content", { mode: "create" });
    await backend.rebuildSearchIndex();
    const result = await backend.search({ query: "standalone", tag: "mcp", frontmatter: { status: "active" }, folder: "Projects", limit: 10 });
    expect(result.results.map((item) => item.path)).toEqual(["Projects/Alpha.md"]);
    expect((await backend.status()).indexState).toBe("ready");
    await backend.close();
  });

  it("updates search results from filesystem watcher events", async () => {
    const { backend, vault } = await createBackend({ watchMode: "on", indexMode: "indexed" });
    await fs.writeFile(path.join(vault, "Watched.md"), "# Watched\nwatcher-token", "utf8");
    const result = await waitFor(async () => backend.search({ query: "watcher-token", limit: 10 }), (value) => value.results.length === 1);
    expect(result.results[0]?.path).toBe("Watched.md");
    await backend.close();
  });

  it("rejects unsafe regular expressions", async () => {
    const { backend } = await createBackend();
    await expect(backend.search({ regex: "(a+)+$", limit: 10 })).rejects.toMatchObject({ code: "INVALID_QUERY" });
    await backend.close();
  });
});

async function waitFor<T>(operation: () => Promise<T>, predicate: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 5000;
  let value = await operation();
  while (!predicate(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    value = await operation();
  }
  return value;
}
