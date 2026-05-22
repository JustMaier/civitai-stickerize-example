import type { Handle } from '@sveltejs/kit';
import { verifyToken, shouldRefreshToken, refreshToken, type JWTPayload } from '$lib/server/auth/jwt';
import { recoverStuckJobs, cleanupOrphanedTempFiles } from '$lib/server/job-processor';

// Run once on server startup: recover any stuck jobs from previous crashes
recoverStuckJobs()
  .then(count => {
    if (count > 0) {
      console.log(`[Startup] Recovered ${count} stuck job(s)`);
    }
  })
  .catch(err => console.error('[Startup] Failed to recover stuck jobs:', err));

// Clean up orphaned temp files (fire and forget)
cleanupOrphanedTempFiles().catch(err =>
  console.error('[Startup] Failed to cleanup orphaned files:', err)
);

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/api/auth/oauth/civitai',
];

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname, searchParams } = event.url;

  // Skip auth for public routes and non-API routes
  const isApiRoute = pathname.startsWith('/api/');
  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname.startsWith(route));

  if (!isApiRoute || isPublicRoute) {
    return resolve(event);
  }

  // Extract token from Authorization header or query parameter (for img tags)
  const authHeader = event.request.headers.get('Authorization');
  const queryToken = searchParams.get('token');

  let token: string | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7); // Remove 'Bearer ' prefix
  } else if (queryToken) {
    // Allow token via query parameter for image endpoints (img tags can't send headers)
    token = queryToken;
  }

  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const payload = verifyToken(token);
  
  if (!payload) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  // Set user info in event.locals for route handlers
  event.locals.user = {
    id: payload.userId,
    email: payload.email,
  };
  
  // Resolve the request
  const response = await resolve(event);
  
  // Sliding window token refresh - add new token to response header if needed
  if (shouldRefreshToken(payload)) {
    const newToken = refreshToken(payload);
    response.headers.set('X-Refreshed-Token', newToken);
  }
  
  return response;
};
