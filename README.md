# obsidian-local-rest-mcp

`obsidian-local-rest-mcp` is a local MCP server for Codex and other MCP clients. It runs over STDIO and exposes Obsidian tools backed by the [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api).

## What It Does

This server acts as an adapter between an MCP client and your local Obsidian vault.

Canvas support is embedded directly in the server. Agents calling these MCP tools get local JSON Canvas validation, field constraints, and examples through the tool schemas and descriptions, so they do not need to research `.canvas` syntax on the web before using the server.

Supported tools:

- `obsidian_list_files`
- `obsidian_read_note`
- `obsidian_read_canvas`
- `obsidian_write_note`
- `obsidian_create_canvas`
- `obsidian_update_canvas`
- `obsidian_delete_canvas`
- `obsidian_append_to_note`
- `obsidian_patch_heading`
- `obsidian_search`
- `obsidian_get_active_file`
- `obsidian_open_file`
- `obsidian_add_canvas_node`
- `obsidian_update_canvas_node`
- `obsidian_remove_canvas_node`
- `obsidian_add_canvas_edge`
- `obsidian_update_canvas_edge`
- `obsidian_remove_canvas_edge`
- `obsidian_move_path`
- `obsidian_rename_path`
- `obsidian_delete_path`
- `obsidian_tree`
- `obsidian_stat_path`
- `obsidian_read_note_metadata`
- `obsidian_patch_frontmatter`
- `obsidian_search_content_advanced`

## Requirements

- Node.js `>=20.11.0`
- Obsidian with the Obsidian Local REST API plugin installed and running
- An Obsidian Local REST API key

Default API endpoint:

```text
https://127.0.0.1:27124
```

## Install

### Run from npm with `npx`

```bash
npx obsidian-local-rest-mcp
```

### Run from source

```bash
npm install
npm run build
npm run start
```

For development:

```bash
npm run dev
```

## Configuration

Set these environment variables:

```bash
OBSIDIAN_API_KEY=your-obsidian-local-rest-api-key
OBSIDIAN_BASE_URL=https://127.0.0.1:27124
OBSIDIAN_VERIFY_SSL=false
```

Notes:

- `OBSIDIAN_API_KEY` is required.
- `OBSIDIAN_BASE_URL` defaults to `https://127.0.0.1:27124`.
- `OBSIDIAN_VERIFY_SSL` defaults to `false`, which is useful for local self-signed certificates.

See [.env.example](/C:/Users/Admin/Desktop/thinhnq/tools/obs-mcp-server/.env.example:1).

## Codex Configuration

### Recommended: use the published npm package

Add this to `~/.codex/config.toml` or `.codex/config.toml`:

```toml
[mcp_servers.obsidian_local_rest]
enabled = true
command = "npx"
args = ["-y", "obsidian-local-rest-mcp"]

[mcp_servers.obsidian_local_rest.env]
OBSIDIAN_API_KEY = "replace-me"
OBSIDIAN_BASE_URL = "https://127.0.0.1:27124"
OBSIDIAN_VERIFY_SSL = "false"
```

### Local development: run from the cloned repo

```toml
[mcp_servers.obsidian_local_rest]
enabled = true
command = "node"
args = ["dist/index.js"]
cwd = "C:/path/to/obsidian-local-rest-mcp"

[mcp_servers.obsidian_local_rest.env]
OBSIDIAN_API_KEY = "replace-me"
OBSIDIAN_BASE_URL = "https://127.0.0.1:27124"
OBSIDIAN_VERIFY_SSL = "false"
```

## Example Tool Inputs

Read a note:

```json
{
  "path": "Daily/2026-04-13.md"
}
```

Create a canvas:

```json
{
  "path": "Maps/Plan.canvas",
  "nodes": [
    {
      "id": "n1",
      "type": "file",
      "file": "Projects/Plan.md",
      "x": 0,
      "y": 0,
      "width": 420,
      "height": 260
    },
    {
      "id": "n2",
      "type": "text",
      "text": "Next steps",
      "x": 520,
      "y": 0,
      "width": 320,
      "height": 180
    }
  ],
  "edges": [
    {
      "id": "e1",
      "fromNode": "n1",
      "fromSide": "right",
      "toNode": "n2",
      "toSide": "left",
      "label": "next"
    }
  ]
}
```

Add a node to an existing canvas:

```json
{
  "path": "Maps/Plan.canvas",
  "node": {
    "id": "n3",
    "type": "link",
    "url": "https://example.com",
    "x": 920,
    "y": 0,
    "width": 300,
    "height": 180
  }
}
```

Add an edge to an existing canvas:

```json
{
  "path": "Maps/Plan.canvas",
  "edge": {
    "id": "e2",
    "fromNode": "n2",
    "toNode": "n3",
    "label": "reference"
  }
}
```

Patch a heading:

```json
{
  "path": "Projects/Plan.md",
  "heading": "Next Steps",
  "content": "- Ship MCP adapter",
  "operation": "append"
}
```

Patch frontmatter:

```json
{
  "path": "Projects/Plan.md",
  "field": "status",
  "value": "active",
  "operation": "replace"
}
```

Advanced search:

```json
{
  "query": "adapter",
  "folder": "Projects",
  "tag": "#mcp",
  "limit": 10,
  "sort": "path"
}
```

Move a note:

```json
{
  "source_path": "Inbox/Idea.md",
  "destination_path": "Projects/Idea.md"
}
```

## Current Limits

These are not implemented because the Local REST API does not expose the right primitives yet:

- `obsidian_create_folder`
- `obsidian_copy_path`
- `obsidian_get_backlinks`
- `obsidian_resolve_link`

Path-management caveats:

- Folder move, rename, and delete are composed in the MCP layer.
- Recursive folder operations are currently `markdown-only`.
- If a subtree contains non-markdown or binary files, the tool fails instead of performing a partial operation.

Canvas notes:

- `.canvas` files are written through the standard Obsidian file endpoints.
- The server validates JSON Canvas documents locally before writing them.
- Semantic canvas tools update one node or one edge at a time so agents do not need to hand-edit the full JSON document.

## Development Scripts

```bash
npm run build
npm run dev
npm run start
npm run lint
npm test
```

## Publish to npm

```bash
npm login
npm publish --access public
```

The package is set up as a CLI package:

- binary: `obsidian-local-rest-mcp`
- entrypoint: [src/index.ts](/C:/Users/Admin/Desktop/thinhnq/tools/obs-mcp-server/src/index.ts:1)
- prepack: build before packaging
- prepublishOnly: lint and test before publish

## Implementation Notes

- Built with TypeScript in strict mode
- Uses `zod` for tool input/output schemas
- Handles request timeout, light retry, path encoding, and optional SSL verification
- Returns compact tool responses for model use
- Encodes JSON Canvas syntax and constraints locally in the server for MCP agents
- Uses only the current Obsidian Local REST API capabilities available to this project
