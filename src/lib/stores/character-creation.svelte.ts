/**
 * Temporary store for character creation state
 * Preserves form data when navigating between /character/new and /character/preview
 * Should be cleared when character creation completes or user exits the flow
 */

// Store the pending character creation data
let pendingPhoto: File | null = $state(null);
let pendingPhotoUrl: string | null = $state(null);
let pendingName: string = $state('');
let pendingAdditionalDetails: string = $state('');

export function setPendingPhoto(file: File | null) {
	// Clean up old URL
	if (pendingPhotoUrl) {
		URL.revokeObjectURL(pendingPhotoUrl);
		pendingPhotoUrl = null;
	}

	pendingPhoto = file;

	// Create new URL for preview
	if (file) {
		pendingPhotoUrl = URL.createObjectURL(file);
	}
}

export function setPendingName(name: string) {
	pendingName = name;
}

export function setPendingAdditionalDetails(details: string) {
	pendingAdditionalDetails = details;
}

export function getPendingState() {
	return {
		photo: pendingPhoto,
		photoUrl: pendingPhotoUrl,
		name: pendingName,
		additionalDetails: pendingAdditionalDetails
	};
}

export function clearPendingState() {
	if (pendingPhotoUrl) {
		URL.revokeObjectURL(pendingPhotoUrl);
	}
	pendingPhoto = null;
	pendingPhotoUrl = null;
	pendingName = '';
	pendingAdditionalDetails = '';
}

export function hasPendingState(): boolean {
	return pendingPhoto !== null || pendingName !== '';
}
