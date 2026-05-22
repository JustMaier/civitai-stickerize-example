/**
 * Authenticated fetch wrapper for API requests
 * Handles JWT token injection, token refresh, and 401 redirects
 */

import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { getToken, setAuth, clearAuth, getUser } from '$lib/stores/auth.svelte';

/**
 * Authenticated fetch wrapper with the same signature as native fetch.
 * - Automatically adds Authorization header if token exists
 * - Updates token if X-Refreshed-Token header is present in response
 * - Redirects to welcome page on 401 responses
 *
 * @param url - The URL to fetch
 * @param options - Optional RequestInit options
 * @returns Promise<Response>
 */
export async function authFetch(
	url: RequestInfo | URL,
	options?: RequestInit
): Promise<Response> {
	const token = getToken();

	// Build headers, preserving any existing headers
	const headers = new Headers(options?.headers);

	// Add Authorization header if we have a token
	if (token) {
		headers.set('Authorization', `Bearer ${token}`);
	}

	// Make the request with merged options
	const response = await fetch(url, {
		...options,
		headers
	});

	// Handle 401 Unauthorized - clear auth and redirect to welcome page
	// Check this BEFORE processing refresh token to avoid save-then-clear race
	if (response.status === 401) {
		clearAuth();

		// Only redirect in browser environment
		if (browser) {
			await goto('/');
		}
	} else {
		// Check for refreshed token in response header (only on non-401 responses)
		const refreshedToken = response.headers.get('X-Refreshed-Token');
		if (refreshedToken) {
			// Preserve existing user when updating token
			const currentUser = getUser();
			if (currentUser) {
				setAuth(refreshedToken, currentUser);
			} else {
				// Unexpected state: got refresh token but no user in store
				console.warn('Received refresh token but no user in auth store - skipping token update');
			}
		}
	}

	return response;
}

/**
 * Error thrown when an API request fails
 */
export class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
		public response: Response
	) {
		super(message);
		this.name = 'ApiError';
	}
}

/**
 * Convenience function for JSON API requests.
 * Calls authFetch, checks response.ok, and parses JSON.
 *
 * @param url - The URL to fetch
 * @param options - Optional RequestInit options
 * @returns Promise<T> - Parsed JSON response
 * @throws ApiError if response is not ok
 */
export async function authFetchJson<T>(
	url: string,
	options?: RequestInit
): Promise<T> {
	const response = await authFetch(url, options);

	if (!response.ok) {
		const message = `API request failed: ${response.status} ${response.statusText}`;
		throw new ApiError(message, response.status, response);
	}

	return response.json() as Promise<T>;
}
