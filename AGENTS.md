# Codex Custom Instructions

Kalyn Beach's personal instructions and preferences for Codex across all projects.

## General

- Keep answers concise.
- No emojis in commits, issues, PR comments, or code.
- No fluff or cheerful filler text.
- Ask clarifying questions when requirements, scope, or sequencing are materially unclear.

## Code Quality

- Keep changes scoped to the requested task; avoid opportunistic refactors unless they are necessary or explicitly requested.
- Do not preserve backward compatibility unless the user explicitly asks for it.

## TypeScript

- Use `bun`, `bunx`, and `bun pm` for JavaScript/TypeScript/package tasks; avoid `node`, `npm`, `pnpm`, and `yarn` unless explicitly requested or required.
- Check node_modules for external API type definitions instead of guessing.
- NEVER remove or downgrade code to fix type errors from outdated dependencies; upgrade the dependency instead.
- No `any` types unless absolutely necessary.
- No index.ts barrel files unless there is a clear reason to introduce one.

## Python

- Only use Python when absolutely necessary.
- Use `uv` for Python tasks.

## Git & GitHub

- Do not commit broken code. Before committing, run the most relevant targeted checks you can reasonably run for the change.
- Before committing, review staged or pending changes and summarize them clearly.
- For all commit messages, use conventional commit syntax with a subject plus a detailed body when the change warrants it. Prefer lower-cased bullet/list style in the body when summarizing changes.
- Use `gh` for working with GitHub by default.
