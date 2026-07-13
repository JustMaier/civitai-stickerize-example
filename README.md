# Civitai-Stickerize Example

A SvelteKit example app showing how to integrate **Civitai OAuth** and the **Civitai orchestrator** (Nano Banana 2) into a real-feeling product. Forked from [Stickerize](https://stickerize.justinmaier.com) and stripped down to focus on the integration patterns worth copying.

## What it demonstrates

- **Sign in with Civitai** — PKCE OAuth flow, sealed-cookie state, encrypted per-user token storage with refresh-on-read (`src/lib/server/auth/civitai.ts`)
- **Image generation via the Civitai orchestrator** — Nano Banana 2 `imageGen` workflow, submit-and-poll, image download, all matching the existing Gemini path's `GenerationResult` shape so the rest of the pipeline stays provider-agnostic (`src/lib/server/civitai-orchestrator.ts`)
- **Per-user vs server-wide Buzz** — generation bills the user's own Civitai account when they're signed in; falls back to a server `CIVITAI_API_TOKEN` for users without OAuth
- **Insufficient-Buzz handling** — detected across multiple orchestrator error shapes (HTTP 402, `transactions.insufficientBuzz`, error text), marked non-retryable, surfaced as a clear message
- **Live Buzz balance UI** — pill in the app header with tweened rolling-number animation and a floating "−N" deduction badge when balance drops after a job (`src/lib/components/civitai/BuzzBalance.svelte`)
- **Gemini fallback path** — when `CIVITAI_API_TOKEN` is unset, generation falls back to Google's Gemini image API (`src/lib/server/image-generation.ts`)

## Tech stack

SvelteKit · Tailwind CSS · SQLite (better-sqlite3 + drizzle-orm) · JWT session · `@civitai/app-sdk` · `@openrouter/sdk` · `@google/genai`

## Prerequisites

- **Node 22+** and **pnpm 10+** (the `preinstall` hook blocks other package managers)
- A **Civitai account** with an OAuth app registered (see step 2 below)
- An **OpenRouter API key** for the vision LLM that validates uploaded photos
- *(One of)* a personal **Civitai API key** or a **Google Gemini API key** for actual image generation

## Setup

### 1. Clone and install

```sh
git clone https://github.com/JustMaier/civitai-stickerize-example.git
cd civitai-stickerize-example
pnpm install
```

### 2. Register a Civitai OAuth app

1. Visit https://civitai.com/user/account → **OAuth Apps** → **Create**.
2. App type: **Confidential**.
3. Redirect URI: `http://localhost:5173/api/auth/oauth/civitai/callback`
   (Add your production callback URL too if you plan to deploy.)
4. Scopes: `UserRead`, `BuzzRead`, `AIServicesRead`, `AIServicesWrite`.
5. Copy the **Client ID** and **Client Secret**.

### 3. Configure environment

```sh
cp .env.example .env
```

Fill in `.env`:

| Variable | Required? | What it does |
|---|---|---|
| `OAUTH_CIVITAI_CLIENT_ID` | yes | From step 2 |
| `OAUTH_CIVITAI_CLIENT_SECRET` | yes | From step 2 |
| `CIVITAI_SESSION_SECRET` | yes | 32+ char hex. Encrypts the OAuth state cookie and the per-user sealed token blob. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `OPENROUTER_API_KEY` | yes | https://openrouter.ai/keys — used by the photo-validation LLM call |
| `JWT_SECRET` | yes | Session signing key. Generate with `openssl rand -base64 32` |
| `CIVITAI_API_TOKEN` | one of two | Personal Civitai API key. Used for users who haven't connected their Civitai account — Buzz debits from this key's owner. https://civitai.com/user/account → API Keys |
| `GOOGLE_AI_API_KEY` | one of two | Falls back to Gemini image generation when `CIVITAI_API_TOKEN` is unset. https://aistudio.google.com/app/apikey |
| `BASE_URL` | no | Defaults to `http://localhost:5173`. Used to build the OAuth callback URL — match what you registered with Civitai. |
| `CIVITAI_AUTH_URL` | no | Defaults to `https://auth.civitai.com`. The auth hub that serves the OAuth endpoints (authorize / token / revoke). Override for a local Civitai checkout. |
| `CIVITAI_BASE_URL` | no | Defaults to `https://civitai.com`. The main app that serves `/api/v1/me` and the Buzz balance. Not the OAuth endpoints — those are on `CIVITAI_AUTH_URL`. |
| `LLM_MODEL` | no | Defaults to `anthropic/claude-opus-4.5`. Any vision-capable OpenRouter model works. |
| `IMAGE_GEN_COST_CENTS` | no | Flat cents recorded per gen when not using Civitai Buzz |
| `IMAGE_OPTIMIZATION_*` | no | WebP/AVIF compression on output images |

### 4. Run the database migrations

```sh
pnpm db:migrate
```

This creates `./storage/stickerize.db` with the four tables (`users`, `characters`, `stickers`, `generation_jobs`).

### 5. Start the dev server

```sh
pnpm dev
```

Open http://localhost:5173 — you should see the welcome page with a single "Continue with Civitai" button.

### 6. Try it out

1. Click **Continue with Civitai** → consent on Civitai → you land back on the feed.
2. The header pill shows your Buzz balance, fetched live from `/api/civitai/buzz`.
3. Create a character — uploads your photo, runs photo validation (LLM), then submits a Nano Banana 2 workflow to the Civitai orchestrator. Watch the balance pill drop with a floating `−N Buzz` delta when the job completes.
4. Generate stickers featuring your character — same flow, billed to your Buzz.

## Architecture

The job processor in `src/lib/server/job-processor.ts` resolves an orchestrator client per-job via `getCivitaiClientForUser(userId)`:

1. If the user signed in with Civitai, **their** OAuth token is used — Buzz debits from their account, and any failure (insufficient Buzz, denied scope, expired refresh) surfaces to the user.
2. Otherwise, the server-wide `CIVITAI_API_TOKEN` is used — Buzz debits from the token owner.
3. If neither is configured, the job falls back to the Gemini path.

The same `GenerationResult` shape flows through both paths so downstream code (background removal, image optimization, DB writes) doesn't care which provider ran.

## Key files for the integration

| File | Purpose |
|---|---|
| `src/lib/server/auth/civitai.ts` | OAuth (PKCE, sealed cookies, token refresh, Buzz balance fetcher) |
| `src/lib/server/civitai-orchestrator.ts` | Workflow body, submit/poll, image download, insufficient-Buzz detection |
| `src/routes/api/auth/oauth/civitai/+server.ts` | OAuth initiation |
| `src/routes/api/auth/oauth/civitai/callback/+server.ts` | OAuth callback → JWT session |
| `src/routes/api/civitai/buzz/+server.ts` | Buzz balance endpoint (proxies tRPC) |
| `src/lib/components/civitai/BuzzBalance.svelte` | Animated balance pill |
| `src/lib/server/job-processor.ts` | Provider selection + Buzz cost persistence |
| `src/lib/server/db/schema.ts` | `users.civitai_tokens` + `generation_jobs.buzz_cost` |

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server on http://localhost:5173 |
| `pnpm build` | Production build via `@sveltejs/adapter-node` (output: `build/`) |
| `pnpm preview` | Preview the production build |
| `pnpm check` | TypeScript + Svelte typecheck |
| `pnpm db:generate` | Generate a new drizzle migration from `src/lib/server/db/schema.ts` |
| `pnpm db:migrate` | Apply pending migrations to the SQLite file |
| `pnpm db:studio` | Browse the DB in Drizzle Studio |
| `pnpm visual-test` | Render every component's preview variants for visual regression |

## Troubleshooting

- **"Continue with Civitai" doesn't appear.** `OAUTH_CIVITAI_CLIENT_ID`, `OAUTH_CIVITAI_CLIENT_SECRET`, or `CIVITAI_SESSION_SECRET` is unset. The welcome page only renders the button when all three are present and `CIVITAI_SESSION_SECRET` is at least 32 chars.
- **OAuth callback returns 400.** The redirect URI in your Civitai OAuth app config doesn't match `${BASE_URL}/api/auth/oauth/civitai/callback`. Register the prod URL too if you deploy.
- **Generation fails with "You don't have enough Buzz".** Top up at https://civitai.com/purchase/buzz or use a server `CIVITAI_API_TOKEN` whose owner has Buzz.
- **Buzz pill shows nothing.** You're not OAuth-connected (only OAuth users see balance — server-token users would otherwise see the server's balance, which is hidden).

## License

MIT
