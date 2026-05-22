import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  fetchCivitaiBuzzBalance,
  fetchCivitaiMe,
  loadCivitaiSession,
} from '$lib/server/auth/civitai';

/**
 * GET /api/civitai/buzz
 *
 * Returns the logged-in user's Civitai Buzz balance, if they connected their
 * Civitai account. We only expose balance for OAuth-connected users —
 * `CIVITAI_API_TOKEN` fallback users shouldn't see the server's balance.
 *
 * Response shape:
 *   { connected: true,  balance: number }
 *   { connected: false, balance: null }
 */
export const GET: RequestHandler = async ({ locals }) => {
  const user = locals.user;
  if (!user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tokens = await loadCivitaiSession(user.id);
  if (!tokens) {
    return json({ connected: false, balance: null });
  }

  try {
    const me = await fetchCivitaiMe(tokens.access_token);
    const civitaiUserId = typeof me.id === 'number' ? me.id : null;
    const balance =
      civitaiUserId !== null ? await fetchCivitaiBuzzBalance(tokens.access_token, civitaiUserId) : null;
    return json({ connected: true, balance });
  } catch (error) {
    console.error('[civitai buzz] fetch failed:', error);
    return json({ connected: true, balance: null });
  }
};
