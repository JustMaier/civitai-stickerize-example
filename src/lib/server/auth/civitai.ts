/**
 * Civitai OAuth helpers — additive third-party provider sitting next to the
 * existing Google / Apple OAuth and email+password flows.
 *
 * Tokens are stored *per user* in `users.civitai_tokens` as sealed JSON
 * (AES-256-GCM via the SDK's sealCookie). The plaintext blob is an
 * `OAuthTokens` from `@civitai/app-sdk`. Only this module decrypts it.
 */

import { env } from '$env/dynamic/private';
import { eq } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import {
  buildAuthorizeUrl,
  exchangeCode as sdkExchangeCode,
  fetchMe as sdkFetchMe,
  generatePkce,
  generateState,
  refreshToken as sdkRefreshToken,
  revokeToken as sdkRevokeToken,
  sealCookie,
  unsealCookie,
  type OAuthTokens,
} from '@civitai/app-sdk';
import { bitmaskFromScopes } from '@civitai/app-sdk/scopes';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';

const OAUTH_STATE_COOKIE = 'civ_oauth_state';
const OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10;

export const CIVITAI_REQUESTED_SCOPES = bitmaskFromScopes([
  'UserRead',
  'BuzzRead',
  'AIServicesRead',
  'AIServicesWrite',
]);

export interface CivitaiMe {
  id?: number;
  username?: string;
  email?: string;
  image?: string | null;
  profilePicture?: { url?: string } | null;
  /** Buzz balance shape varies — some endpoints return `{ user: number, generation: number }`. */
  buzz?: number | { user?: number; generation?: number } | null;
  [key: string]: unknown;
}

interface OAuthStatePayload {
  state: string;
  verifier: string;
  scope: number;
}

// ---------------------------------------------------------------------------
// Config gating
// ---------------------------------------------------------------------------

export function isCivitaiOAuthConfigured(): boolean {
  return Boolean(
    env.OAUTH_CIVITAI_CLIENT_ID &&
      env.OAUTH_CIVITAI_CLIENT_SECRET &&
      env.CIVITAI_SESSION_SECRET &&
      env.CIVITAI_SESSION_SECRET.length >= 32,
  );
}

function requireConfig(): {
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  baseUrl: string;
  orchestratorUrl: string;
  appUrl: string;
} {
  if (!isCivitaiOAuthConfigured()) {
    throw new Error('Civitai OAuth is not configured');
  }
  return {
    clientId: env.OAUTH_CIVITAI_CLIENT_ID!,
    clientSecret: env.OAUTH_CIVITAI_CLIENT_SECRET!,
    sessionSecret: env.CIVITAI_SESSION_SECRET!,
    baseUrl: env.CIVITAI_BASE_URL || 'https://civitai.com',
    orchestratorUrl: env.CIVITAI_ORCHESTRATOR_URL || 'https://orchestration.civitai.com',
    appUrl: env.BASE_URL || 'http://localhost:5173',
  };
}

export function getCivitaiBaseUrl(): string {
  return env.CIVITAI_BASE_URL || 'https://civitai.com';
}

export function getCivitaiOrchestratorUrl(): string {
  return env.CIVITAI_ORCHESTRATOR_URL || 'https://orchestration.civitai.com';
}

export function getCivitaiRedirectUri(): string {
  const cfg = requireConfig();
  return `${cfg.appUrl}/api/auth/oauth/civitai/callback`;
}

// ---------------------------------------------------------------------------
// OAuth round-trip helpers
// ---------------------------------------------------------------------------

export function buildCivitaiAuthorizeUrl(state: string, codeChallenge: string): string {
  const cfg = requireConfig();
  return buildAuthorizeUrl({
    baseUrl: cfg.baseUrl,
    clientId: cfg.clientId,
    redirectUri: getCivitaiRedirectUri(),
    scope: CIVITAI_REQUESTED_SCOPES,
    state,
    codeChallenge,
  });
}

export function newCivitaiPkce() {
  return generatePkce();
}

export function newCivitaiState(): string {
  return generateState();
}

export function writeCivitaiOAuthState(
  cookies: Cookies,
  payload: OAuthStatePayload,
  secure: boolean,
): void {
  const cfg = requireConfig();
  const sealed = sealCookie(JSON.stringify(payload), cfg.sessionSecret);
  cookies.set(OAUTH_STATE_COOKIE, sealed, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });
}

export function consumeCivitaiOAuthState(
  cookies: Cookies,
  secure: boolean,
): OAuthStatePayload | null {
  const cfg = requireConfig();
  const sealed = cookies.get(OAUTH_STATE_COOKIE);
  cookies.delete(OAUTH_STATE_COOKIE, { path: '/', httpOnly: true, secure, sameSite: 'lax' });
  if (!sealed) return null;
  const raw = unsealCookie(sealed, cfg.sessionSecret);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OAuthStatePayload;
  } catch {
    return null;
  }
}

export async function exchangeCivitaiCode(code: string, codeVerifier: string): Promise<OAuthTokens> {
  const cfg = requireConfig();
  return sdkExchangeCode({
    baseUrl: cfg.baseUrl,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    redirectUri: getCivitaiRedirectUri(),
    code,
    codeVerifier,
  });
}

export async function refreshCivitaiTokens(refreshTokenValue: string): Promise<OAuthTokens> {
  const cfg = requireConfig();
  return sdkRefreshToken({
    baseUrl: cfg.baseUrl,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    refreshToken: refreshTokenValue,
  });
}

export async function revokeCivitaiToken(token: string): Promise<void> {
  const cfg = requireConfig();
  return sdkRevokeToken({
    baseUrl: cfg.baseUrl,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    token,
  });
}

export async function fetchCivitaiMe(accessToken: string): Promise<CivitaiMe> {
  const cfg = requireConfig();
  return (await sdkFetchMe({
    baseUrl: cfg.baseUrl,
    accessToken,
  })) as CivitaiMe;
}

/**
 * Fetch the Civitai user's Buzz balance.
 *
 * `/api/v1/me` doesn't expose Buzz — the balance lives on a tRPC procedure
 * (`buzz.getUserAccount`) that returns one row per account type. Yellow is
 * the main user balance shown across the Civitai UI; if the user has other
 * pools (blue/generation, red, etc.) they're summed for a single display
 * number.
 */
export async function fetchCivitaiBuzzBalance(
  accessToken: string,
  userId: number,
): Promise<number | null> {
  const cfg = requireConfig();
  const input = encodeURIComponent(JSON.stringify({ json: { accountId: userId, accountType: 'user' } }));
  const url = `${cfg.baseUrl}/api/trpc/buzz.getUserAccount?input=${input}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    result?: { data?: { json?: Array<{ balance?: number }> } };
  };
  const accounts = data?.result?.data?.json;
  if (!Array.isArray(accounts)) return null;
  return accounts.reduce(
    (sum, account) => sum + (typeof account.balance === 'number' ? account.balance : 0),
    0,
  );
}

// ---------------------------------------------------------------------------
// Per-user sealed-token storage
// ---------------------------------------------------------------------------

export function sealTokens(tokens: OAuthTokens): string {
  const cfg = requireConfig();
  return sealCookie(JSON.stringify(tokens), cfg.sessionSecret);
}

function unsealTokens(sealed: string): OAuthTokens | null {
  const cfg = requireConfig();
  const raw = unsealCookie(sealed, cfg.sessionSecret);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OAuthTokens;
  } catch {
    return null;
  }
}

/**
 * Load the user's Civitai OAuth tokens, refreshing transparently if they're
 * within 30 seconds of expiry. Returns `null` if the user has no Civitai
 * session or the refresh fails (e.g. refresh token revoked).
 */
export async function loadCivitaiSession(userId: string): Promise<OAuthTokens | null> {
  if (!isCivitaiOAuthConfigured()) return null;

  const rows = await db
    .select({ civitaiTokens: users.civitaiTokens })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const sealed = rows[0]?.civitaiTokens;
  if (!sealed) return null;

  const tokens = unsealTokens(sealed);
  if (!tokens) return null;

  // Still fresh?
  if (tokens.expires_at > Date.now() + 30_000) return tokens;

  if (!tokens.refresh_token) return null;
  try {
    const fresh = await refreshCivitaiTokens(tokens.refresh_token);
    await persistCivitaiTokens(userId, fresh);
    return fresh;
  } catch {
    // Refresh failed — wipe the bad blob so we don't keep retrying.
    await db.update(users).set({ civitaiTokens: null }).where(eq(users.id, userId));
    return null;
  }
}

export async function persistCivitaiTokens(userId: string, tokens: OAuthTokens): Promise<void> {
  const sealed = sealTokens(tokens);
  await db.update(users).set({ civitaiTokens: sealed }).where(eq(users.id, userId));
}

export async function clearCivitaiTokens(userId: string): Promise<void> {
  await db.update(users).set({ civitaiTokens: null }).where(eq(users.id, userId));
}
