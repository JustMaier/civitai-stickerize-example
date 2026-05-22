/**
 * Authentication store for JWT token management
 * Uses Svelte 5 reactive state ($state) for reactivity
 */

import { browser } from '$app/environment';

const TOKEN_KEY = 'stickerize_auth_token';
const USER_KEY = 'stickerize_auth_user';

export interface AuthUser {
	id: string;
	email: string;
	name?: string;
	profilePhotoUrl?: string;
}

/**
 * Load initial values from localStorage (only in browser)
 */
function loadFromStorage(): { token: string | null; user: AuthUser | null } {
	if (!browser) {
		return { token: null, user: null };
	}

	const token = localStorage.getItem(TOKEN_KEY);
	const userJson = localStorage.getItem(USER_KEY);

	let user: AuthUser | null = null;
	if (userJson) {
		try {
			user = JSON.parse(userJson);
		} catch {
			// Invalid JSON, clear it
			localStorage.removeItem(USER_KEY);
		}
	}

	return { token, user };
}

// Load initial state
const initial = loadFromStorage();

// Reactive state - using object pattern to allow cross-module reactivity
// We cannot directly export reassigned $state, so we use an object wrapper
const authState = $state({
	token: initial.token as string | null,
	user: initial.user as AuthUser | null
});

/**
 * Persist token to localStorage
 */
function persistToken(token: string | null): void {
	if (!browser) return;

	if (token) {
		localStorage.setItem(TOKEN_KEY, token);
	} else {
		localStorage.removeItem(TOKEN_KEY);
	}
}

/**
 * Persist user to localStorage
 */
function persistUser(user: AuthUser | null): void {
	if (!browser) return;

	if (user) {
		localStorage.setItem(USER_KEY, JSON.stringify(user));
	} else {
		localStorage.removeItem(USER_KEY);
	}
}

/**
 * Set authentication token and user info
 */
export function setAuth(token: string, user: AuthUser): void {
	authState.token = token;
	authState.user = user;
	persistToken(token);
	persistUser(user);
}

/**
 * Clear authentication (for logout)
 */
export function clearAuth(): void {
	authState.token = null;
	authState.user = null;
	persistToken(null);
	persistUser(null);
}

/**
 * Get current token
 */
export function getToken(): string | null {
	return authState.token;
}

/**
 * Get current user info
 */
export function getUser(): AuthUser | null {
	return authState.user;
}

/**
 * Reactive token state - use in components for reactive access
 * Access as: authToken.value
 */
export const authToken = {
	get value(): string | null {
		return authState.token;
	}
};

/**
 * Reactive user state - use in components for reactive access
 * Access as: authUser.value
 */
export const authUser = {
	get value(): AuthUser | null {
		return authState.user;
	}
};

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
	return authState.token !== null;
}

/**
 * Get authenticated image URL
 * Appends token as query parameter for use with <img> tags
 */
export function getAuthImageUrl(url: string): string {
	const token = authState.token;
	if (!token || !url) return url;

	// Only add token to API image URLs
	if (!url.startsWith('/api/images/')) return url;

	const separator = url.includes('?') ? '&' : '?';
	return `${url}${separator}token=${encodeURIComponent(token)}`;
}
