import { describe, expect, it, vi } from "vitest";

import type { VaultBackend } from "../src/backend/types.js";
import { registerDeletePathTool } from "../src/tools/deletePath.js";
import { registerSearchTool } from "../src/tools/search.js";
import { collectMarkdownTree, renameWithinParent } from "../src/tools/pathOperations.js";
import { performMovePath } from "../src/tools/movePath.js";

type ToolResult = { structuredContent?: Record<string, unknown> };
type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;
type RegisterToolMock = ReturnType<typeof vi.fn> & { mock: { calls: Array<[unknown, unknown, ToolHandler]> } };

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

describe("tool response contracts", () => {
  it("includes the query required by the search output schema", async () => {
    const search = vi.fn(() => Promise.resolve({ results: [{ path: "Notes/Alpha.md", score: 1, snippet: "Alpha" }] }));
    const handler = registeredHandler(registerSearchTool, { search } as unknown as VaultBackend);

    const result = await handler({ query: "Alpha", limit: 10 });

    expect(result.structuredContent).toMatchObject({
      query: "Alpha",
      results: [{ path: "Notes/Alpha.md" }],
    });
  });

  it("counts files before recursively deleting a folder", async () => {
    const deletePath = vi.fn(() => Promise.resolve());
    const fakeBackend = {
      statPath: vi.fn(() => Promise.resolve({ path: "Nested", exists: true, kind: "folder", size: null, ctime: null, mtime: null, revision: null })),
      listFiles: vi.fn((path: string = "") => {
        const entries: Array<{ path: string; name: string; isFolder: boolean }> =
          path === "Nested"
            ? [
                { path: "Nested/One.md", name: "One.md", isFolder: false },
                { path: "Nested/Deeper", name: "Deeper", isFolder: true },
              ]
            : [{ path: "Nested/Deeper/Two.md", name: "Two.md", isFolder: false }];

        return Promise.resolve({ root: path, entries });
      }),
      deletePath,
    } as unknown as VaultBackend;
    const handler = registeredHandler(registerDeletePathTool, fakeBackend);

    const result = await handler({ path: "Nested", recursive: true });

    expect(deletePath).toHaveBeenCalledWith("Nested", { recursive: true });
    expect(result.structuredContent).toMatchObject({ path: "Nested", kind: "folder", deletedFiles: 2 });
  });
});

function registeredHandler(registrar: (server: never, backend: VaultBackend) => void, backend: VaultBackend) {
  const registerTool = vi.fn() as RegisterToolMock;
  registrar({ registerTool } as never, backend);
  const handler = registerTool.mock.calls[0]?.[2];
  if (typeof handler !== "function") throw new Error("registerTool handler was not registered");
  return handler;
}
