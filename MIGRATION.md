# Migrating from 0.x to 1.0

Version 1.0 changes the default architecture from Obsidian Local REST API to direct filesystem access.

## Configuration mapping

| 0.x | 1.0 |
| --- | --- |
| `OBSIDIAN_API_KEY` | Remove; set `VAULT_PATH` |
| `OBSIDIAN_BASE_URL` | Remove in filesystem mode |
| `OBSIDIAN_VERIFY_SSL` | Remove in filesystem mode |
| Obsidian and Local REST plugin running | Not required |
| No write scope | Optionally set `READ_ONLY`, `READ_PATHS`, `WRITE_PATHS` |

Minimal 1.0 configuration:

```text
VAULT_PATH=C:/Users/me/Documents/My Vault
```

## Mutation contract changes

- `obsidian_write_note` creates by default. Replacing an existing file requires `mode: "replace"` and `expected_revision`.
- Append, heading/frontmatter patches, Canvas updates, and file deletion require the revision returned by the latest read/stat call.
- A stale or missing revision returns `CONFLICT`.
- Folder moves and deletes use native filesystem operations and are no longer limited to Markdown-only trees.

## Runtime-only tools

`obsidian_get_active_file` and `obsidian_open_file` are not listed in filesystem mode because there is no running Obsidian UI. They remain available when using the deprecated Local REST backend.

## Temporary compatibility mode

Set `BACKEND=local-rest` and retain the old API settings to migrate incrementally. Local REST compatibility is deprecated and intended to be removed after the 1.x release line.
