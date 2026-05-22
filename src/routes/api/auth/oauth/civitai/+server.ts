import { dev } from '$app/environment';
import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  CIVITAI_REQUESTED_SCOPES,
  buildCivitaiAuthorizeUrl,
  isCivitaiOAuthConfigured,
  newCivitaiPkce,
  newCivitaiState,
  writeCivitaiOAuthState,
} from '$lib/server/auth/civitai';

/**
 * Kick off the Civitai OAuth flow. Generates PKCE + state, seals a short-lived
 * cookie that the callback consumes, then 303s to the consent screen.
 *
 * `POST`-only so it can't be triggered by a `<a href>` prefetch — the welcome
 * page mounts a `<form method="POST">` for the button.
 */
export const POST: RequestHandler = async ({ cookies }) => {
  if (!isCivitaiOAuthConfigured()) {
    return json({ error: 'Civitai OAuth is not configured' }, { status: 503 });
  }

  const pkce = newCivitaiPkce();
  const state = newCivitaiState();

  writeCivitaiOAuthState(
    cookies,
    { state, verifier: pkce.verifier, scope: CIVITAI_REQUESTED_SCOPES },
    !dev,
  );

  const authorizeUrl = buildCivitaiAuthorizeUrl(state, pkce.challenge);
  throw redirect(303, authorizeUrl);
};
