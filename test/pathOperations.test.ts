import { describe, expect, it, vi } from "vitest";

import type { ObsidianClient } from "../src/obsidian/client.js";
import { collectMarkdownTree, renameWithinParent } from "../src/tools/pathOperations.js";
import { performMovePath } from "../src/tools/movePath.js";

describe("renameWithinParent", () => {
  it("rejects separator characters in new_name", () => {
    expect(() => renameWithinParent("Notes/Test.md", "Nested/Bad.md")).toThrow(/path separators/i);
  });
});

describe("collectMarkdownTree", () => {
  it("fails when a subtree contains non-markdown files", async () => {
    const fakeClient: Pick<ObsidianClient, "listFiles"> = {
      listFiles: vi.fn((path: string = "") => {
        if (path === "Notes") {
          return Promise.resolve({
            root: "Notes",
            entries: [
              { path: "Notes/Test.md", name: "Test.md", isFolder: false },
              { path: "Notes/image.png", name: "image.png", isFolder: false },
            ],
          });
        }

        return Promise.resolve({ root: path, entries: [] as Array<{ path: string; name: string; isFolder: boolean }> });
      }),
    };

    await expect(collectMarkdownTree(fakeClient as ObsidianClient, "Notes")).rejects.toThrow(/non-markdown/i);
  });
});

describe("performMovePath", () => {
  it("moves a markdown file by write then delete", async () => {
    const fakeClient: Pick<ObsidianClient, "readNoteMetadata" | "listFiles" | "readNote" | "writeNote" | "deletePath"> = {
      readNoteMetadata: vi.fn((path: string) => {
        if (path === "Notes/Test.md") {
          return Promise.resolve({ path, tags: [], frontmatter: {}, stat: null });
        }
        throw Object.assign(new Error("not found"), { status: 404, code: "OBSIDIAN_HTTP_ERROR" });
      }),
      listFiles: vi.fn(() => {
        throw Object.assign(new Error("not found"), { status: 404, code: "OBSIDIAN_HTTP_ERROR" });
      }),
      readNote: vi.fn((path: string) =>
        Promise.resolve({ path, content: "# Test", contentType: "text/markdown", etag: null, lastModified: null }),
      ),
      writeNote: vi.fn((path: string, content: string) => Promise.resolve({ path, message: content })),
      deletePath: vi.fn(() => Promise.resolve()),
    };

    const result = await performMovePath(fakeClient as ObsidianClient, "Notes/Test.md", "Archive/Test.md", false);

    expect(fakeClient.writeNote).toHaveBeenCalledWith("Archive/Test.md", "# Test");
    expect(fakeClient.deletePath).toHaveBeenCalledWith("Notes/Test.md");
    expect(result.kind).toBe("file");
  });
});
