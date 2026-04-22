# Repository Guidelines

## Scope
This guide applies to the whole repository. `request.md` is the source of truth; if a task conflicts with this file, follow `request.md` and then update this guide if the workflow changes.

## Project Structure & Module Organization
Build this repo as a TypeScript + Node.js MCP server that runs over `STDIO` and adapts Codex tools to the Obsidian Local REST API. Keep the requested layout: `src/index.ts` for process startup, `src/server.ts` for MCP tool registration and error mapping, `src/config.ts` for env parsing, `src/types.ts` for shared types, `src/obsidian/client.ts` for all HTTP calls, and `src/tools/*.ts` for one tool per module. Root artifacts should include `README.md`, `.env.example`, `package.json`, `tsconfig.json`, ESLint config, and a sample Codex TOML such as `.codex/config.toml`.

## Build, Test, and Development Commands
Use `npm install`, `npm run build`, `npm run dev`, `npm run start`, and `npm test`. Keep these scripts working together: README examples, env handling, and runtime entrypoints must stay consistent. Prefer a stable MCP SDK implementation and keep the server runnable locally with minimal setup.

## Coding Style & Naming Conventions
Use TypeScript `strict` mode and typed schemas at every tool boundary with `zod` or an equivalent validator. Keep MCP tool names aligned with the required public API: `obsidian_list_files`, `obsidian_read_note`, `obsidian_write_note`, `obsidian_append_to_note`, `obsidian_patch_heading`, `obsidian_search`, `obsidian_get_active_file`, and `obsidian_open_file`. Tool modules should not call HTTP directly; centralize timeout, light retry, safe path encoding, TLS handling, and header/body mapping in `src/obsidian/client.ts`. Keep logging minimal and errors normalized for model-friendly output.

## Testing Guidelines
Prioritize unit tests for request building, input validation, path encoding, and error mapping. Mock the HTTP layer only when full Obsidian integration is impractical. Cover missing `OBSIDIAN_API_KEY`, unreachable `OBSIDIAN_BASE_URL`, `OBSIDIAN_VERIFY_SSL=false` self-signed behavior, and compact tool responses.

## Security, Config, and Delivery
Never hardcode secrets. Read `OBSIDIAN_API_KEY`, default `OBSIDIAN_BASE_URL` to `https://127.0.0.1:27124`, and default `OBSIDIAN_VERIFY_SSL` to `false` for local development only. Before handoff, verify README, `.env.example`, scripts, and Codex config examples still match the code. In multi-agent work, use this split: Spec Analyst reads `request.md`, Repo Structure defines paths, Tooling & Quality owns commands/tests/style, Collaboration prepares review notes, and the Editor merges the final change set.
