import { describe, expect, it } from "vitest";

import { errorResult } from "../src/tools/common.js";
import { ObsidianClientError } from "../src/types.js";

describe("errorResult", () => {
  it("returns MCP-friendly structured errors", () => {
    const result = errorResult(new ObsidianClientError("Forbidden", { code: "OBSIDIAN_HTTP_ERROR", status: 403 }));

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: {
        code: "OBSIDIAN_HTTP_ERROR",
        message: "Forbidden",
        status: 403,
      },
    });
  });
});
