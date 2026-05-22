import { isCivitaiOAuthConfigured } from '$lib/server/auth/civitai';
import type { PageServerLoad } from './$types';

/**
 * Surface which optional auth providers are configured on the server side so
 * the welcome page can show the matching buttons. Mirrors the existing
 * pattern for Google/Apple (which are gated by env-var presence in their
 * helper modules).
 */
export const load: PageServerLoad = async () => {
  return {
    civitaiOAuthConfigured: isCivitaiOAuthConfigured(),
  };
};
