# MJML Editor Spike

Spike: an MJML-based email editor + an AI agent that generates an email from a
description and data, generates images (OpenAI gpt-image-2), edits individual
sections and applies fixes based on comments added to sections in the editor.

## Stack

- **web/** — Next.js + React, [GrapesJS-MJML](https://github.com/GrapesJS/mjml) editor
  (`@grapesjs/react`), agent chat on AI SDK UI (`@ai-sdk/react` `useChat` + AI Elements)
- **agent/** — Python 3.12+, FastAPI, [Vercel AI SDK for Python](https://ai-python.dev)
  (`ai` on PyPI, Anthropic provider), OpenAI Images API (`gpt-image-2`)
- **Supabase** — Postgres (documents, comments) + Storage (generated images);
  local stack via `npx supabase start` (Docker)

## Running (dev)

```bash
# 1. Supabase (requires Docker)
npx supabase start

# 2. Agent backend
cd agent && cp .env.example .env   # fill in ANTHROPIC_API_KEY, OPENAI_API_KEY
uv sync && uv run fastapi dev main.py

# 3. Frontend
cd web && cp .env.example .env.local
npm install && npm run dev
```

Open http://localhost:3000.

## Key concepts

- The source of truth is the **MJML** in `documents.mjml`; the editor and the
  agent work on the same document.
- Every `mj-section` gets a stable ID in `css-class` (`sec-<id>`) — comments
  and the agent's tools address sections by this ID.
- Section comments live in the `comments` table; the "Apply changes from
  comments" command runs the agent, which reads the open comments, fixes the
  sections and marks the comments as resolved.
