// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user?: {
				id: string;
				email: string;
			};
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	// Used to pass file data between Create Character and Preview pages
	// File objects cannot be stored in sessionStorage, so we use a window property
	interface Window {
		__stickerize_pending_character_file?: File;
	}
}

export {};
