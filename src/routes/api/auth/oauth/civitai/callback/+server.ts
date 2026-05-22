import { dev } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { randomUUID } from 'crypto';
import { eq, or } from 'drizzle-orm';
import { OAuthError } from '@civitai/app-sdk';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { generateToken } from '$lib/server/auth/jwt';
import {
  consumeCivitaiOAuthState,
  exchangeCivitaiCode,
  fetchCivitaiMe,
  isCivitaiOAuthConfigured,
  persistCivitaiTokens,
} from '$lib/server/auth/civitai';

/**
 * OAuth callback. Consumes the sealed state cookie, exchanges the auth code
 * for tokens, fetches the user's Civitai profile, upserts a stickerize user
 * with `oauthProvider: 'civitai'`, persists the encrypted token blob, then
 * issues a stickerize JWT in the redirect URL so the existing client-side
 * auth store can pick it up.
 *
 * Token blob never leaves the server; the JWT in the redirect is the
 * regular short-lived stickerize session token.
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
  if (!isCivitaiOAuthConfigured()) {
    throw redirect(303, '/?error=civitai_not_configured');
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const expected = consumeCivitaiOAuthState(cookies, !dev);

  if (error) {
    throw redirect(303, `/?error=${encodeURIComponent('civitai_oauth:' + error)}`);
  }
  if (!code || !state) {
    throw redirect(303, '/?error=civitai_missing_code_or_state');
  }
  if (!expected || expected.state !== state) {
    throw redirect(303, '/?error=civitai_state_mismatch');
  }

  try {
    const tokens = await exchangeCivitaiCode(code, expected.verifier);
    const me = await fetchCivitaiMe(tokens.access_token);

    const civitaiId = me.id != null ? String(me.id) : null;
    if (!civitaiId) {
      throw redirect(303, '/?error=civitai_missing_user_id');
    }

    const civitaiEmail = (typeof me.email === 'string' && me.email.length > 0
      ? me.email.toLowerCase().trim()
      : null);
    // Civitai users don't always have a verified email exposed; fall back to a
    // synthetic local-only address so the existing unique-email constraint is
    // satisfied. The user can edit it later via the existing profile flow.
    const fallbackEmail = `civitai-${civitaiId}@users.civitai.local`;
    const email = civitaiEmail ?? fallbackEmail;
    const displayName = me.username || (civitaiEmail ? civitaiEmail.split('@')[0]! : `civitai-${civitaiId}`);
    const profilePhotoUrl =
      (typeof me.image === 'string' ? me.image : null) ||
      me.profilePicture?.url ||
      null;

    // Match the Google/Apple pattern: link by oauthId-or-email.
    const existing = await db
      .select()
      .from(users)
      .where(or(eq(users.oauthId, civitaiId), eq(users.email, email)))
      .limit(1);

    let user: { id: string; email: string; name: string; profilePhotoUrl: string | null };
    const existingUser = existing[0];

    if (existingUser) {
      // Link / refresh OAuth fields if needed.
      const needsLink =
        !existingUser.oauthId ||
        existingUser.oauthProvider !== 'civitai' ||
        existingUser.oauthId !== civitaiId;
      if (needsLink) {
        await db
          .update(users)
          .set({
            oauthProvider: 'civitai',
            oauthId: civitaiId,
            profilePhotoUrl: profilePhotoUrl ?? existingUser.profilePhotoUrl,
          })
          .where(eq(users.id, existingUser.id));
      }
      user = {
        id: existingUser.id,
        email: existingUser.email,
        name: existingUser.name,
        profilePhotoUrl: existingUser.profilePhotoUrl,
      };
    } else {
      const userId = randomUUID();
      await db.insert(users).values({
        id: userId,
        email,
        name: displayName,
        profilePhotoUrl,
        oauthProvider: 'civitai',
        oauthId: civitaiId,
      });
      user = { id: userId, email, name: displayName, profilePhotoUrl };
    }

    await persistCivitaiTokens(user.id, tokens);

    const jwt = generateToken({ userId: user.id, email: user.email });

    // The existing OAuth flows return JSON to a fetch() call. The Civitai flow
    // is a full redirect, so we hand the token back via URL fragment — the
    // client-side `/civitai-callback` page consumes it and pushes into the
    // auth store. Use the fragment (#) so the JWT is never sent to the server
    // in subsequent navigations.
    const params = new URLSearchParams({
      token: jwt,
      userId: user.id,
      email: user.email,
      name: user.name,
    });
    if (user.profilePhotoUrl) params.set('profilePhotoUrl', user.profilePhotoUrl);
    throw redirect(303, `/auth/civitai-complete#${params.toString()}`);
  } catch (err) {
    // SvelteKit's `redirect()` throws a Redirect — propagate.
    if (err && typeof err === 'object' && 'status' in err && 'location' in err) throw err;
    if (err instanceof OAuthError) {
      throw redirect(303, `/?error=${encodeURIComponent('civitai_token_exchange:' + err.status)}`);
    }
    console.error('[Civitai OAuth] callback failed:', err);
    throw redirect(303, '/?error=civitai_token_exchange_failed');
  }
};
