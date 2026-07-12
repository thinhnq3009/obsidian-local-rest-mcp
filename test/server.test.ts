import { describe, expect, it } from "vitest";

import { errorResult } from "../src/tools/common.js";
import { ObsidianClientError } from "../src/types.js";

describe("errorResult", () => {
  it("returns MCP-friendly errors without structured content outside tool output schemas", () => {
    const result = errorResult(new ObsidianClientError("Forbidden", { code: "OBSIDIAN_HTTP_ERROR", status: 403 }));

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: "text", text: "OBSIDIAN_HTTP_ERROR: Forbidden" }]);
    expect(result).not.toHaveProperty("structuredContent");
  });
});
