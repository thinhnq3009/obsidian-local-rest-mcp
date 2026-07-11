import { describe, expect, it } from "vitest";

import { parseMetadata, patchFrontmatterContent, patchHeadingContent } from "../src/backend/markdown.js";

describe("Markdown engine", () => {
  it("extracts metadata without treating code blocks as tags or links", () => {
    const metadata = parseMetadata("---\ntags: [project]\nstatus: active\n---\n# Plan\nSee [[Notes/Target]] and #roadmap.\n```md\n#fake [[Nope]]\n```\n");
    expect(metadata.frontmatter).toMatchObject({ status: "active" });
    expect(metadata.headings).toEqual([{ text: "Plan", level: 1 }]);
    expect(metadata.tags).toEqual(expect.arrayContaining(["project", "roadmap"]));
    expect(metadata.links).toContain("Notes/Target");
    expect(metadata.links).not.toContain("Nope");
  });

  it("requires an occurrence for duplicate headings", () => {
    const content = "# Same\nFirst\n# Same\nSecond\n";
    expect(() => patchHeadingContent(content, "Same", "Updated", "replace")).toThrow(/ambiguous/i);
    const patched = patchHeadingContent(content, "Same", "Updated", "replace", 2);
    expect(patched).toContain("First");
    expect(patched).toContain("# Same\nUpdated");
  });

  it("preserves BOM and CRLF while patching frontmatter", () => {
    const content = "\uFEFF---\r\nstatus: open # keep\r\nowner: me\r\n---\r\n# Note\r\n";
    const patched = patchFrontmatterContent(content, "status", "done", "replace", true);
    expect(patched.startsWith("\uFEFF---\r\n")).toBe(true);
    expect(patched).toContain("owner: me");
    expect(patched).toContain("# keep");
    expect(patched).toContain("status: done");
  });

  it("refuses malformed frontmatter without producing output", () => {
    expect(() => patchFrontmatterContent("---\nbroken: [\n---\nBody", "status", "done", "replace", true)).toThrow(/invalid yaml/i);
  });
});
