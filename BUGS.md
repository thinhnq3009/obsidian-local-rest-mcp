# MCP Tool Bug Log

Last updated: 2026-04-23

This file records bugs reproduced by running the built MCP server over STDIO and calling tools through a real MCP client, not by hitting helper methods directly.

## Test Setup

- Server command: `node dist/index.js`
- Transport: MCP `StdioClientTransport`
- Config source: local `.env`
- Latest failing run id: `2026-04-23T08-27-48-185Z`
- Test vault base path: `Codex MCP Retry/2026-04-23T08-27-48-185Z`

## Stable Failures

### 1. `obsidian_patch_heading`

- Status: reproducible
- MCP result:
  - `OBSIDIAN_HTTP_ERROR`
  - `400 Bad Request`
- Repro payload:

```json
{
  "path": "Codex MCP Retry/2026-04-23T08-27-48-185Z/Retry Note.md",
  "heading": "Heading One",
  "content": "- retry patch",
  "operation": "append"
}
```

- Current hypothesis:
  - The Local REST API patch-heading request mapping is wrong for this Obsidian instance or plugin version.
  - Check request headers in [src/obsidian/client.ts](C:/Users/Admin/Desktop/thinhnq/tools/obs-mcp-server/src/obsidian/client.ts:1), especially `Operation`, `Target-Type`, and `Target`.
  - Verify whether heading patch requires a different endpoint, body format, or exact heading target syntax.

### 2. `obsidian_read_note_metadata`

- Status: reproducible
- MCP result:
  - `OBSIDIAN_INVALID_RESPONSE`
  - `Obsidian returned invalid note metadata.`
- Repro payload:

```json
{
  "path": "Codex MCP Retry/2026-04-23T08-27-48-185Z/Retry Note.md"
}
```

- Current hypothesis:
  - The `Accept: application/vnd.olrapi.note+json` response shape from the plugin does not match the assumptions in `normalizeNoteJsonMetadata`.
  - Inspect parsing in [src/obsidian/client.ts](C:/Users/Admin/Desktop/thinhnq/tools/obs-mcp-server/src/obsidian/client.ts:1).
  - This bug cascades into tools that call `readNoteMetadata`.

### 3. `obsidian_stat_path`

- Status: reproducible
- MCP result:
  - `OBSIDIAN_INVALID_RESPONSE`
- Current hypothesis:
  - This is a downstream failure from `obsidian_read_note_metadata`.
  - `detectPathInfo` and file stat logic rely on metadata read succeeding.

### 4. `obsidian_rename_path`

- Status: reproducible
- MCP result:
  - `OBSIDIAN_INVALID_RESPONSE`
- Current hypothesis:
  - This is also downstream from `readNoteMetadata`, because rename uses `performMovePath` and path detection logic that first treats the source as a file by metadata lookup.

### 5. `obsidian_tree`

- Status: reproducible
- MCP result:
  - `TOOL_ERROR`
  - `obsidian_tree requires a folder path.`
- Repro payload:

```json
{
  "path": "Codex MCP Retry/2026-04-23T08-27-48-185Z",
  "max_depth": 4,
  "include_files": true,
  "include_folders": true
}
```

- Current hypothesis:
  - `detectPathInfo` is incorrectly failing to recognize an existing folder.
  - Root cause likely shares logic with metadata-based file detection and fallback folder detection in [src/tools/pathOperations.ts](C:/Users/Admin/Desktop/thinhnq/tools/obs-mcp-server/src/tools/pathOperations.ts:1).

### 6. `obsidian_search_content_advanced`

- Status: reproducible
- MCP result:
  - `OBSIDIAN_HTTP_ERROR`
  - `400 Bad Request`
- Repro payload:

```json
{
  "query": "2026-04-23T08-27-48-185Z",
  "folder": "Codex MCP Retry/2026-04-23T08-27-48-185Z",
  "limit": 10,
  "sort": "path"
}
```

- Current hypothesis:
  - The JSON Logic expression or request content type does not match what the Obsidian plugin expects.
  - Check builder logic in [src/tools/searchContentAdvanced.ts](C:/Users/Admin/Desktop/thinhnq/tools/obs-mcp-server/src/tools/searchContentAdvanced.ts:1) and request headers/body in [src/obsidian/client.ts](C:/Users/Admin/Desktop/thinhnq/tools/obs-mcp-server/src/obsidian/client.ts:1).

### 7. `obsidian_delete_path` with `recursive=true` on folders

- Status: reproducible
- MCP result:
  - `OBSIDIAN_TIMEOUT`
  - `Timed out while talking to Obsidian Local REST API.`
- Repro payload:

```json
{
  "path": "Codex MCP Retry/2026-04-23T08-27-48-185Z",
  "recursive": true
}
```

- Current hypothesis:
  - Folder detection and/or recursive traversal is slow or stuck because folder reads are not behaving as expected.
  - The delete implementation composes multiple reads/deletes in [src/tools/deletePath.ts](C:/Users/Admin/Desktop/thinhnq/tools/obs-mcp-server/src/tools/deletePath.ts:1) and [src/tools/pathOperations.ts](C:/Users/Admin/Desktop/thinhnq/tools/obs-mcp-server/src/tools/pathOperations.ts:1).
  - This may improve automatically once folder detection is fixed, but current timeout behavior should still be handled more defensively.

## Partial Success Notes

### `obsidian_get_active_file`

- Status: passes partially
- Result:
  - returns note content
  - returns `contentType`
  - returns `etag`
  - does not return `path` in this environment
- Current hypothesis:
  - The plugin response for `/active/` may not include a path field, so current behavior may be valid rather than a bug.

### Canvas tools

- Status: pass through real MCP calls
- Confirmed working in prior end-to-end run:
  - create
  - read
  - add node
  - update node
  - add edge
  - update edge
  - remove edge
  - remove node
  - delete

## Important Regression Already Fixed

Before these runs, MCP `tools/list` failed because public Zod schemas used `transform(...)`, which the MCP SDK could not export to JSON Schema.

- Error:
  - `Transforms cannot be represented in JSON Schema`
- Fix applied:
  - removed transforms from public path schemas in [src/types.ts](C:/Users/Admin/Desktop/thinhnq/tools/obs-mcp-server/src/types.ts:1)
  - moved normalization into runtime helpers

## Recommended Fix Order

1. Fix `read_note_metadata` response parsing.
2. Re-test `stat_path`, `rename_path`, and `tree` because they depend on metadata/path detection.
3. Fix `search_content_advanced` request shape.
4. Fix `patch_heading` request mapping.
5. Revisit recursive folder delete timeout after folder detection is stable.
