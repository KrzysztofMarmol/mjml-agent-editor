# MJML Editor Spike

Spike: edytor maili oparty o MJML + agent AI, który generuje maila z opisu i danych,
generuje obrazy (OpenAI gpt-image-2), edytuje pojedyncze sekcje i wprowadza poprawki
na podstawie komentarzy dodanych do sekcji w edytorze.

## Stack

- **web/** — Next.js + React, edytor [GrapesJS-MJML](https://github.com/GrapesJS/mjml)
  (`@grapesjs/react`), czat agenta na AI SDK UI (`@ai-sdk/react` `useChat` + AI Elements)
- **agent/** — Python 3.12+, FastAPI, [Vercel AI SDK for Python](https://ai-python.dev)
  (`ai` na PyPI, provider Anthropic), OpenAI Images API (`gpt-image-2`)
- **Supabase** — Postgres (dokumenty, komentarze) + Storage (wygenerowane obrazy);
  lokalny stack przez `npx supabase start` (Docker)

## Uruchomienie (dev)

```bash
# 1. Supabase (wymaga Dockera)
npx supabase start

# 2. Backend agenta
cd agent && cp .env.example .env   # uzupełnij ANTHROPIC_API_KEY, OPENAI_API_KEY
uv sync && uv run fastapi dev main.py

# 3. Frontend
cd web && cp .env.example .env.local
npm install && npm run dev
```

Otwórz http://localhost:3000.

## Kluczowe koncepty

- Źródłem prawdy jest **MJML** w `documents.mjml`; edytor i agent pracują na tym samym
  dokumencie.
- Każda `mj-section` dostaje stabilne ID w `css-class` (`sec-<id>`) — komentarze
  i narzędzia agenta adresują sekcje tym ID.
- Komentarze do sekcji trzymane są w tabeli `comments`; komenda „Wprowadź zmiany
  z komentarzy" uruchamia agenta, który czyta otwarte komentarze, poprawia sekcje
  i oznacza komentarze jako rozwiązane.
