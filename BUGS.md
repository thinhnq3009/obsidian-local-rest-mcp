# Known issues

The stable Local REST failures previously recorded here no longer affect the default backend because version 1.0 reads and writes the vault directly through the filesystem.

## Compatibility backend

The deprecated `local-rest` backend still inherits behavior and response-shape differences from the installed Obsidian Local REST API plugin. In particular, metadata, heading patching, advanced search, empty-folder creation, and folder moves may vary by plugin version.

Use the default `filesystem` backend for the supported 1.0 behavior. Compatibility-backend defects should be fixed only when they block migration and must not add new core dependencies on the REST API.

## Reporting a filesystem issue

Include the operating system, Node.js version, relevant configuration without secrets, tool name, structured error code, and a minimal fixture vault. Do not attach private note content unless it is necessary and redacted.
