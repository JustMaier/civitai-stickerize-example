# Project Instructions

## Overview

Civitai-Stickerize Example is a SvelteKit demo that pairs **Civitai OAuth sign-in** with the **Civitai orchestrator** (Nano Banana 2) for image generation, falling back to Google Gemini when no Civitai token is configured. See `README.md` for the public-facing summary.

**Tech stack:** SvelteKit · Tailwind CSS · SQLite · JWT auth · `@civitai/app-sdk` · `@openrouter/sdk` · Google Gemini

## Civitai integration

Civitai is the primary image-generation path. The job processor in `src/lib/server/job-processor.ts` resolves an orchestrator client per-job via `getCivitaiClientForUser(userId)`:

1. If the user signed in with Civitai, their OAuth token is used — Buzz debits from their account, and any failure (insufficient Buzz, denied scope, expired refresh) surfaces to the user.
2. Otherwise, the server-wide `CIVITAI_API_TOKEN` is used — Buzz debits from the token owner.
3. If neither is configured, the job falls back to the Gemini path in `src/lib/server/image-generation.ts`.

OAuth lives in `src/lib/server/auth/civitai.ts` (PKCE, sealed-cookie state, per-user encrypted `users.civitai_tokens` with refresh-on-read). Orchestrator calls — `imageGen` workflow body for Nano Banana 2, submit/poll, image download — live in `src/lib/server/civitai-orchestrator.ts`. Auth routes are under `src/routes/api/auth/oauth/civitai/**`.

The whole stack is gated by `OAUTH_CIVITAI_CLIENT_ID` / `OAUTH_CIVITAI_CLIENT_SECRET` / `CIVITAI_SESSION_SECRET` (for the OAuth flow) and `CIVITAI_API_TOKEN` (for the server-side fallback). With OAuth env unset, the welcome page hides the "Continue with Civitai" button; with the API token also unset, the pipeline falls through to Gemini.

## Component development

When creating or modifying any Svelte component in `src/lib/components/`:

1. Add a `<script module>` block with `export const preview` containing all variants.
2. Components without preview data will fail visual regression tests (`pnpm visual-test`).

## Knowledge verification

Always verify your knowledge against authoritative sources before providing guidance — your training data may not reflect recent SvelteKit, Civitai, or OpenRouter changes. Prefer official docs over assumptions.
