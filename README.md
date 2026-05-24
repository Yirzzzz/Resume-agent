# Resume Agent

A web-first resume agent platform inspired by LapisCV, focused on low deployment friction and AI-assisted resume workflows.

## Monorepo Layout
- `apps/web`: Next.js frontend (resume editor + templates + export UI)
- `apps/api`: backend APIs (auth, resume CRUD, agent workflows)
- `packages/common`: shared types, schema validators, utility libs
- `schemas`: JSON schemas for resume data and agent outputs
- `templates`: template manifests and style tokens

## Collaboration Files
- `feature.json`: product roadmap and feature status
- `agents.md` / `progress.md`: local collaboration artifacts (optional, usually ignored in public repo)

## Next Bootstrapping Steps
1. Initialize web app (`apps/web`) with Next.js + Tailwind.
2. Initialize api app (`apps/api`) with NestJS.
3. Add `schemas/resume.schema.json` and runtime validator.
4. Build minimal flow: create resume -> preview -> export PDF.

## Data Bootstrap
- Personal runtime data is ignored by git (`data/resume-files.json`).
- To initialize local data after clone:
  - `cp data/resume-files.example.json data/resume-files.json`
