<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	import { onMount } from 'svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import PhotoUpload from '$lib/components/character/PhotoUpload.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { error as showError } from '$lib/components/ui/Toaster.svelte';
	import { ChevronLeft, Plus, Minus } from 'lucide-svelte';
	import { authFetch } from '$lib/utils/api';
	import {
		getPendingState,
		setPendingPhoto,
		setPendingName,
		setPendingAdditionalDetails,
		clearPendingState
	} from '$lib/stores/character-creation.svelte';

	// Get any pending state from store (for when user navigates back from preview)
	const pending = getPendingState();

	// Form state - initialize from pending state if available
	let characterName = $state(pending.name);
	let additionalDetails = $state(pending.additionalDetails);
	let showAdditionalDetails = $state(pending.additionalDetails.length > 0);
	let selectedFile: File | null = $state(pending.photo);
	let initialPhotoUrl: string | null = $state(pending.photoUrl);
	let nameError = $state('');
	let isSubmitting = $state(false);

	// Permission states (would be set based on actual permission checks)
	let libraryPermissionDenied = $state(false);
	let cameraPermissionDenied = $state(false);

	// First-time instructional overlay - initialized from localStorage on mount
	let showInstructions = $state(false);

	// One-time initialization on mount to check if user has seen instructions
	$effect(() => {
		if (browser) {
			const hasSeenInstructions = localStorage.getItem('stickerize_seen_character_instructions');
			// Using untrack since this is one-time initialization, not a reactive dependency
			untrack(() => {
				if (!hasSeenInstructions) {
					showInstructions = true;
				}
			});
		}
	});

	function dismissInstructions() {
		showInstructions = false;
		if (browser) {
			localStorage.setItem('stickerize_seen_character_instructions', 'true');
		}
	}

	function handlePhotoSelect(file: File) {
		selectedFile = file;
		// Clear initial URL since we have a new selection
		initialPhotoUrl = null;
		// Save to store for restoration if user navigates back
		setPendingPhoto(file);
	}

	function handlePhotoClear() {
		selectedFile = null;
		initialPhotoUrl = null;
		setPendingPhoto(null);
	}

	function validateName(): boolean {
		const trimmedName = characterName.trim();

		if (!trimmedName) {
			nameError = 'Please enter a character name';
			return false;
		}

		if (trimmedName.length > 30) {
			nameError = 'Name must be 30 characters or less';
			return false;
		}

		// Only @ is disallowed (spaces are allowed per PRD)
		if (trimmedName.includes('@')) {
			nameError = 'Character names cannot contain @ signs';
			return false;
		}

		nameError = '';
		return true;
	}

	async function handleSubmit() {
		if (!selectedFile) {
			return;
		}
		if (!validateName()) {
			return;
		}

		isSubmitting = true;

		try {
			// Create FormData and submit to API
			const formData = new FormData();
			formData.append('photo', selectedFile);
			formData.append('name', characterName.trim());
			if (additionalDetails.trim()) {
				formData.append('additionalDetails', additionalDetails.trim());
			}

			const response = await authFetch('/api/characters', {
				method: 'POST',
				body: formData
			});

			const data = await response.json();

			if (!response.ok) {
				// Show appropriate error toast based on the error message
				const errorMessage = data.error || 'Something went wrong';
				showError(errorMessage, 5000);
				isSubmitting = false;
				return;
			}

			// Save form state to store in case user navigates back
			setPendingName(characterName.trim());
			setPendingAdditionalDetails(additionalDetails.trim());

			// Navigate to preview with jobId
			goto(`/character/preview?jobId=${data.jobId}`);
		} catch (err) {
			console.error('Failed to create character:', err);
			showError('Something went wrong', 5000);
			isSubmitting = false;
		}
	}

	// Character count for UI feedback
	let characterCount = $derived(characterName.length);
	let isNearLimit = $derived(characterCount >= 25);
	let detailsCount = $derived(additionalDetails.length);
	let isDetailsNearLimit = $derived(detailsCount >= 80);

	// Derived state for button disabled
	let isFormValid = $derived(selectedFile !== null && characterName.trim().length > 0);
</script>

<div class="flex min-h-screen flex-col bg-[#FDF2F8]">
	<!-- Header with Back Button and Badge -->
	<header class="flex items-center justify-between p-4">
		<button
			type="button"
			onclick={() => goto('/feed')}
			class="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-white/50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#C91977] focus:ring-offset-2"
			aria-label="Go back"
		>
			<ChevronLeft class="h-6 w-6" />
		</button>
		<Badge variant="pink" size="md">
			CREATE CHARACTER
		</Badge>
		<!-- Invisible spacer to center the badge -->
		<div class="h-10 w-10"></div>
	</header>

	<main class="flex flex-1 flex-col gap-6 p-4">
		<!-- Photo Upload Section -->
		<PhotoUpload
			onselect={handlePhotoSelect}
			onclear={handlePhotoClear}
			{libraryPermissionDenied}
			{cameraPermissionDenied}
			disabled={isSubmitting}
			initialFile={selectedFile}
			initialPreviewUrl={initialPhotoUrl}
		/>

		<!-- Name Input Section -->
		<div class="flex flex-col gap-2">
			<div class="flex items-center justify-between">
				<label
					for="character-name"
					class="text-xs font-medium uppercase tracking-wider text-gray-600"
				>
					Character Name
				</label>
				<span
					class="text-xs {isNearLimit ? 'text-amber-600' : 'text-gray-400'}"
					aria-live="polite"
				>
					{characterCount}/30
				</span>
			</div>
			<input
				id="character-name"
				type="text"
				bind:value={characterName}
				placeholder="e.g. Super Sam"
				maxlength={30}
				disabled={isSubmitting}
				class="w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-4 text-xl font-medium text-gray-900 placeholder:text-gray-400 focus:border-[#C91977] focus:outline-none focus:ring-2 focus:ring-[#C91977]/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
			/>
			{#if nameError}
				<p class="text-sm text-red-500" role="alert">{nameError}</p>
			{/if}
		</div>

		<!-- Additional Details Section (Collapsible) -->
		{#if showAdditionalDetails}
			<div class="flex flex-col gap-2">
				<div class="flex items-center justify-between">
					<label
						for="additional-details"
						class="text-xs font-medium uppercase tracking-wider text-gray-600"
					>
						Additional Details
					</label>
					<span
						class="text-xs {isDetailsNearLimit ? 'text-amber-600' : 'text-gray-400'}"
						aria-live="polite"
					>
						{detailsCount}/100
					</span>
				</div>
				<textarea
					id="additional-details"
					bind:value={additionalDetails}
					placeholder="e.g. a muscular build, wearing a red cap, and black cowboy boots"
					maxlength={100}
					rows={2}
					disabled={isSubmitting}
					class="w-full resize-none rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-[#C91977] focus:outline-none focus:ring-2 focus:ring-[#C91977]/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
				></textarea>
				<button
					type="button"
					onclick={() => {
						showAdditionalDetails = false;
						additionalDetails = '';
					}}
					disabled={isSubmitting}
					class="flex items-center gap-2 self-start text-base font-medium text-[#C91977] transition-colors hover:text-[#A01562] disabled:cursor-not-allowed disabled:text-gray-400"
				>
					<Minus class="h-5 w-5" />
					Remove additional details
				</button>
			</div>
		{:else}
			<button
				type="button"
				onclick={() => (showAdditionalDetails = true)}
				disabled={isSubmitting}
				class="flex items-center gap-2 self-start text-base font-medium text-[#C91977] transition-colors hover:text-[#A01562] disabled:cursor-not-allowed disabled:text-gray-400"
			>
				<Plus class="h-5 w-5" />
				Add additional details
			</button>
		{/if}

		<!-- Spacer to push button to bottom -->
		<div class="flex-1"></div>

		<!-- CTA Button with purple gradient -->
		<Button
			onclick={handleSubmit}
			disabled={!isFormValid || isSubmitting}
			fullWidth
			class="!bg-gradient-to-r !from-[#8B5CF6] !to-[#7C3AED] !focus:ring-[#8B5CF6]"
		>
			{#if isSubmitting}
				<span class="flex items-center gap-2">
					<span class="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
					Preparing...
				</span>
			{:else}
				<span class="flex items-center gap-1">
					<span aria-hidden="true">&#10024;</span>
					Generate Character
				</span>
			{/if}
		</Button>
	</main>

	<!-- First-time instructional modal -->
	<Modal bind:open={showInstructions} title="Welcome to Character Creation">
		<div class="flex flex-col gap-4">
			<p>
				To create your stickers, create your first character. Start by choosing an image or taking one now.
			</p>
			<Button onclick={dismissInstructions} fullWidth>
				Got it!
			</Button>
		</div>
	</Modal>
</div>
