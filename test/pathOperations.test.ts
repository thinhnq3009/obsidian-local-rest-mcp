import { describe, expect, it, vi } from "vitest";

import type { VaultBackend } from "../src/backend/types.js";
import { collectMarkdownTree, renameWithinParent } from "../src/tools/pathOperations.js";
import { performMovePath } from "../src/tools/movePath.js";

describe("renameWithinParent", () => {
  it("rejects separator characters in new_name", () => {
    expect(() => renameWithinParent("Notes/Test.md", "Nested/Bad.md")).toThrow(/path separators/i);
  });
});

describe("collectMarkdownTree", () => {
  it("fails when a subtree contains non-markdown files", async () => {
    const fakeClient: Pick<VaultBackend, "listFiles"> = {
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

    await expect(collectMarkdownTree(fakeClient as VaultBackend, "Notes")).rejects.toThrow(/non-markdown/i);
  });
});

describe("performMovePath", () => {
  it("delegates moves to the active backend", async () => {
    const movePath = vi.fn(() => Promise.resolve({ sourcePath: "Notes/Test.md", destinationPath: "Archive/Test.md", kind: "file" as const, movedFiles: 1 }));
    const fakeBackend = { movePath } as unknown as VaultBackend;
    const result = await performMovePath(fakeBackend, "Notes/Test.md", "Archive/Test.md", false, "sha256:test");
    expect(movePath).toHaveBeenCalledWith("Notes/Test.md", "Archive/Test.md", { overwrite: false, expectedRevision: "sha256:test" });
    expect(result.kind).toBe("file");
  });
});
