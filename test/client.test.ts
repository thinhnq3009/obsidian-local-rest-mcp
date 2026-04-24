import { describe, expect, it } from "vitest";

import { buildVaultPath, encodeVaultSegments, mapRequestError, ObsidianClient, type RequestLike } from "../src/obsidian/client.js";
import { ObsidianClientError, type AppConfig } from "../src/types.js";

const config: AppConfig = {
  obsidianApiKey: "secret",
  obsidianBaseUrl: "https://127.0.0.1:27124",
  obsidianVerifySsl: false,
  requestTimeoutMs: 10_000,
  retryCount: 0,
  mcpTransport: "stdio",
  mcpHttpHost: "127.0.0.1",
  mcpHttpPort: 39145,
  mcpHttpPath: "/mcp",
};

describe("vault path helpers", () => {
  it("encodes vault paths safely", () => {
    expect(encodeVaultSegments("Folder/My Note.md")).toBe("Folder/My%20Note.md");
    expect(buildVaultPath("Folder/My Note.md")).toBe("/vault/Folder/My%20Note.md");
    expect(buildVaultPath("")).toBe("/vault/");
  });
});

describe("ObsidianClient", () => {
  it("sends auth header when listing files", async () => {
    let capturedRequest: Parameters<RequestLike>[0] | undefined;
    const requestMock: RequestLike = (request) => {
      capturedRequest = request;
      return Promise.resolve({
        status: 200,
        statusText: "OK",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(["Notes/Test.md"]),
      });
    };

    const client = new ObsidianClient(config, { requestImpl: requestMock });
    const result = await client.listFiles();

    expect(capturedRequest?.url.toString()).toBe("https://127.0.0.1:27124/vault/");
    expect(capturedRequest?.headers?.Authorization).toBe("Bearer secret");
    expect(result.entries).toEqual([
      {
        path: "Notes/Test.md",
        name: "Test.md",
        isFolder: false,
      },
    ]);
  });

  it("maps http failures to ObsidianClientError", async () => {
    const client = new ObsidianClient(config, {
      requestImpl: (() => Promise.resolve({
        status: 503,
        statusText: "Service Unavailable",
        headers: {},
        body: "nope",
      })) as RequestLike,
    });

    await expect(client.listFiles()).rejects.toMatchObject({
      code: "OBSIDIAN_HTTP_ERROR",
      status: 503,
    });
  });

  it("requests note metadata with the note-json accept header", async () => {
    let capturedRequest: Parameters<RequestLike>[0] | undefined;
    const requestMock: RequestLike = (request) => {
      capturedRequest = request;
      return Promise.resolve({
        status: 200,
        statusText: "OK",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          path: "Notes/Test.md",
          tags: ["project"],
          frontmatter: { status: "open" },
          stat: { size: 12, ctime: 1, mtime: 2 },
          content: "# Test",
        }),
      });
    };

    const client = new ObsidianClient(config, { requestImpl: requestMock });
    const result = await client.readNoteMetadata("Notes/Test.md");

    expect(capturedRequest?.headers?.Accept).toBe("application/vnd.olrapi.note+json");
    expect(result.frontmatter).toEqual({ status: "open" });
    expect(result.tags).toEqual(["project"]);
  });

  it("patches frontmatter with the expected headers", async () => {
    let capturedRequest: Parameters<RequestLike>[0] | undefined;
    const requestMock: RequestLike = (request) => {
      capturedRequest = request;
      return Promise.resolve({
        status: 200,
        statusText: "OK",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "ok" }),
      });
    };

    const client = new ObsidianClient(config, { requestImpl: requestMock });
    await client.patchFrontmatter("Notes/Test.md", "status", "done", "replace", true);

    expect(capturedRequest?.headers?.["Content-Type"]).toBe("application/json");
    expect(capturedRequest?.headers?.Operation).toBe("replace");
    expect(capturedRequest?.headers?.["Target-Type"]).toBe("frontmatter");
    expect(capturedRequest?.headers?.Target).toBe("status");
    expect(capturedRequest?.headers?.["Create-Target-If-Missing"]).toBe("true");
    expect(capturedRequest?.body).toBe(JSON.stringify("done"));
  });

  it("writes generic files with the requested content type", async () => {
    let capturedRequest: Parameters<RequestLike>[0] | undefined;
    const requestMock: RequestLike = (request) => {
      capturedRequest = request;
      return Promise.resolve({
        status: 200,
        statusText: "OK",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "ok" }),
      });
    };

    const client = new ObsidianClient(config, { requestImpl: requestMock });
    await client.writeFile("Maps/Plan.canvas", "{}", {
      contentType: "application/json; charset=utf-8",
      successMessage: "Canvas written successfully.",
    });

    expect(capturedRequest?.headers?.["Content-Type"]).toBe("application/json; charset=utf-8");
    expect(capturedRequest?.body).toBe("{}");
  });

  it("sends advanced search using jsonlogic content type", async () => {
    let capturedRequest: Parameters<RequestLike>[0] | undefined;
    const requestMock: RequestLike = (request) => {
      capturedRequest = request;
      return Promise.resolve({
        status: 200,
        statusText: "OK",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify([{ path: "Notes/Test.md", content: "match" }]),
      });
    };

    const client = new ObsidianClient(config, { requestImpl: requestMock });
    const result = await client.searchAdvanced({ "!==": [{ var: "path" }, null] }, 20);

    expect(capturedRequest?.headers?.["Content-Type"]).toBe("application/vnd.olrapi.jsonlogic+json");
    expect(result.results[0]?.path).toBe("Notes/Test.md");
  });
});

describe("mapRequestError", () => {
  it("passes through existing client errors", () => {
    const error = new ObsidianClientError("boom", { code: "X", status: 400 });
    expect(mapRequestError(error)).toBe(error);
  });

  it("normalizes generic errors", () => {
    const mapped = mapRequestError(new Error("offline"));
    expect(mapped.code).toBe("OBSIDIAN_UNREACHABLE");
  });
});
