<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import LoadingSpinner from '$lib/components/ui/LoadingSpinner.svelte';
	import { success, error as errorToast } from '$lib/components/ui/Toaster.svelte';
	import { ChevronLeft } from 'lucide-svelte';
	import { authFetch } from '$lib/utils/api';

	interface Character {
		id: string;
		name: string;
		stickerImageUrl: string;
		createdAt: string;
	}

	const characterId = $derived($page.params.id ?? '');

	// Loading and error states
	let isLoading = $state(true);
	let isSaving = $state(false);
	let loadError = $state('');

	// Character data
	let character = $state<Character | null>(null);
	let name = $state('');
	let nameError = $state('');

	// Track if name has been modified
	let originalName = $state('');

	// Fetch character data on mount
	$effect(() => {
		if (!characterId) return;

		let cancelled = false;

		async function fetchData() {
			isLoading = true;
			loadError = '';

			try {
				const response = await authFetch(`/api/characters/${characterId}`);
				if (cancelled) return;

				const data = await response.json();
				if (cancelled) return;

				if (!response.ok) {
					if (response.status === 401) {
						goto('/');
						return;
					}
					loadError = data.error || 'Failed to load character';
					return;
				}

				character = data.character;
				name = character?.name ?? '';
				originalName = name;
			} catch (err) {
				if (cancelled) return;
				console.error('Failed to fetch character:', err);
				loadError = 'Failed to load character. Please try again.';
			} finally {
				if (!cancelled) {
					isLoading = false;
				}
			}
		}

		fetchData();

		return () => {
			cancelled = true;
		};
	});

	async function refetchCharacter() {
		isLoading = true;
		loadError = '';

		try {
			const response = await authFetch(`/api/characters/${characterId}`);
			const data = await response.json();

			if (!response.ok) {
				if (response.status === 401) {
					goto('/');
					return;
				}
				loadError = data.error || 'Failed to load character';
				return;
			}

			character = data.character;
			name = character?.name ?? '';
			originalName = name;
		} catch (err) {
			console.error('Failed to fetch character:', err);
			loadError = 'Failed to load character. Please try again.';
		} finally {
			isLoading = false;
		}
	}

	function validateName(): boolean {
		if (!name.trim()) {
			nameError = 'Character name is required';
			return false;
		}
		if (name.length > 30) {
			nameError = 'Character name must be 30 characters or less';
			return false;
		}
		if (/@/.test(name)) {
			nameError = 'Character names cannot contain @ signs';
			return false;
		}
		nameError = '';
		return true;
	}

	async function handleSave() {
		if (!validateName()) {
			return;
		}

		// No changes made
		if (name === originalName) {
			goto('/feed');
			return;
		}

		isSaving = true;

		try {
			const response = await authFetch(`/api/characters/${characterId}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ name: name.trim() })
			});

			const data = await response.json();

			if (!response.ok) {
				if (response.status === 401) {
					errorToast('Session expired. Please log in again.');
					goto('/');
					return;
				}
				errorToast(data.error || 'Failed to update character');
				return;
			}

			success('Character updated!');
			goto('/feed');
		} catch (err) {
			console.error('Failed to save character:', err);
			errorToast('Failed to update character. Please try again.');
		} finally {
			isSaving = false;
		}
	}

	function handleBack() {
		goto('/feed');
	}
</script>

<div class="flex min-h-screen flex-col bg-[#FDF2F8]">
	<!-- Header with Back Button and Title -->
	<header class="flex items-center justify-between p-4">
		<button
			type="button"
			onclick={handleBack}
			disabled={isSaving}
			class="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-white/50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#C91977] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
			aria-label="Go back"
		>
			<ChevronLeft class="h-6 w-6" />
		</button>
		<h1 class="text-xl font-bold text-gray-900">Edit Character</h1>
		<!-- Invisible spacer to center the title -->
		<div class="h-10 w-10"></div>
	</header>

	{#if isLoading}
		<!-- Loading State -->
		<main class="flex flex-1 items-center justify-center px-4">
			<LoadingSpinner size="lg" showMessage={false} />
		</main>
	{:else if loadError}
		<!-- Error State -->
		<main class="flex flex-1 flex-col items-center justify-center px-4 text-center">
			<p class="text-gray-500 mb-4">{loadError}</p>
			<Button variant="secondary" onclick={refetchCharacter}>
				Try Again
			</Button>
		</main>
	{:else if character}
		<main class="flex flex-1 flex-col items-center px-6 pb-8">
			<!-- Character Image Preview -->
			<div class="mt-6 flex w-full max-w-sm justify-center">
				<img
					src={character.stickerImageUrl}
					alt={character.name}
					class="h-64 w-64 object-contain"
				/>
			</div>

			<!-- Name Input -->
			<div class="mt-8 w-full max-w-sm">
				<Input
					label="Character Name"
					placeholder="e.g. SuperSam"
					bind:value={name}
					error={nameError}
					disabled={isSaving}
				/>
				<p class="mt-2 text-center text-sm text-gray-500">
					Max 30 characters ({name.length}/30)
				</p>
			</div>

			<!-- Save Button -->
			<div class="mt-auto flex w-full max-w-sm flex-col pt-8">
				<Button variant="primary" fullWidth onclick={handleSave} disabled={isSaving}>
					{#if isSaving}
						SAVING...
					{:else}
						SAVE
					{/if}
				</Button>
			</div>
		</main>
	{:else}
		<main class="flex flex-1 items-center justify-center px-4">
			<p class="text-gray-500">Character not found</p>
		</main>
	{/if}
</div>
