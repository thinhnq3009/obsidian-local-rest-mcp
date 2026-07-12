# Changelog

## 1.0.0

- Added standalone filesystem backend; Obsidian and Local REST are no longer prerequisites.
- Added atomic writes, cross-process locks, path/symlink containment, read-only mode, path scopes, and revision conflicts.
- Added Markdown AST metadata/heading handling and YAML document frontmatter updates.
- Added incremental MiniSearch indexing, watcher updates, health/status, index rebuild, and folder creation tools.
- Made active-file and open-file tools conditional on runtime backend capabilities.
- Kept the Local REST backend as a deprecated 1.x migration adapter.
- Added Windows, macOS, and Linux CI plus standalone integration tests.
