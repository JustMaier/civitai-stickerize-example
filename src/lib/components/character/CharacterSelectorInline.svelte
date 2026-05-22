<script module lang="ts">
	import type { ComponentPreview } from '$lib/testing/preview.js';

	// Sample character data for previews
	const sampleCharacters = [
		{ id: '1', name: 'Justin', stickerImagePath: '/images/stickers/justin.webp' },
		{ id: '2', name: 'JustinCool', stickerImagePath: '/images/stickers/justin-cool.webp' },
		{ id: '3', name: 'JustinFitness', stickerImagePath: '/images/stickers/justin-fitness.webp' },
		{ id: '4', name: 'JustinWork', stickerImagePath: '/images/stickers/justin-work.webp' }
	];

	const fewCharacters = [
		{ id: '1', name: 'Justin', stickerImagePath: '/images/stickers/justin.webp' },
		{ id: '2', name: 'JustinCool', stickerImagePath: '/images/stickers/justin-cool.webp' }
	];

	const charactersWithoutImages = [
		{ id: '1', name: 'Justin Cool', stickerImagePath: '' },
		{ id: '2', name: 'Justin Work', stickerImagePath: '' },
		{ id: '3', name: 'Justin Fitness', stickerImagePath: '' }
	];

	export const preview: ComponentPreview = {
		name: 'CharacterSelectorInline',
		description:
			'Floating popover for selecting a character, with edit/delete capabilities and add new option',
		layout: 'column',
		variants: [
			{
				label: 'Default (Open)',
				props: {
					open: true,
					characters: sampleCharacters
				},
				wrapperClass: 'relative h-[420px] w-[360px] flex items-end'
			},
			{
				label: 'Few Characters (shows Add card)',
				props: {
					open: true,
					characters: fewCharacters
				},
				wrapperClass: 'relative h-[280px] w-[360px] flex items-end'
			},
			{
				label: 'No Images (Initials Fallback)',
				props: {
					open: true,
					characters: charactersWithoutImages
				},
				wrapperClass: 'relative h-[280px] w-[360px] flex items-end'
			},
			{
				label: 'With Filter Text',
				props: {
					open: true,
					characters: sampleCharacters,
					filterText: 'cool'
				},
				wrapperClass: 'relative h-[280px] w-[360px] flex items-end'
			},
			{
				label: 'Closed State',
				props: {
					open: false,
					characters: sampleCharacters
				},
				wrapperClass: 'h-[50px] w-[360px] border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-sm'
			}
		]
	};
</script>

<script lang="ts">
	import { fly } from 'svelte/transition';

	interface Character {
		id: string;
		name: string;
		stickerImagePath: string;
	}

	interface Props {
		open: boolean;
		characters: Character[];
		filterText?: string;
		onselect?: (id: string) => void;
		onedit?: (id: string) => void;
		ondelete?: (id: string) => void;
		onadd?: () => void;
		onclose?: () => void;
	}

	import { getAuthImageUrl } from '$lib/stores/auth.svelte';

	let {
		open = $bindable(false),
		characters,
		filterText = '',
		onselect,
		onedit,
		ondelete,
		onadd,
		onclose
	}: Props = $props();

	// Show "Add new character" card in grid only if fewer than 6 characters (to fill 2 rows of 3)
	const showAddCardInGrid = $derived(characters.length < 6);

	// Filter characters based on filterText (case-insensitive)
	const filteredCharacters = $derived(
		filterText
			? characters.filter(c => c.name.toLowerCase().includes(filterText.toLowerCase()))
			: characters
	);

	// Edit mode to show edit/delete options
	let editMode = $state(false);

	function handleSelect(id: string) {
		if (editMode) return;
		onselect?.(id);
	}

	function handleEdit(id: string) {
		editMode = false;
		onedit?.(id);
	}

	function handleDelete(id: string) {
		editMode = false;
		ondelete?.(id);
	}

	function handleClose() {
		editMode = false;
		onclose?.();
	}

	function toggleEditMode() {
		editMode = !editMode;
	}

	function getInitials(name: string): string {
		return name
			.split(' ')
			.map((word) => word[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			handleClose();
		}
	}

	let errorImages = $state<Set<string>>(new Set());

	function handleImageError(id: string) {
		errorImages = new Set([...errorImages, id]);
	}

	function hasImageError(id: string): boolean {
		return errorImages.has(id);
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- Floating popover positioned above the prompt input -->
	<div
		class="absolute bottom-full left-0 right-0 mb-2 z-50"
		role="dialog"
		aria-label="Select a character"
		transition:fly={{ y: 20, duration: 200 }}
	>
		<div class="mx-2 rounded-2xl bg-white shadow-xl ring-1 ring-black/10 overflow-hidden">
			<!-- Header with close button, add button, and edit toggle -->
			<div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
				<h3 class="text-sm font-semibold text-gray-900">Select Character</h3>
				<div class="flex items-center gap-2">
					<!-- Add button -->
					<button
						type="button"
						class="flex h-7 items-center gap-1 px-2 rounded-full text-xs font-medium transition-colors text-gray-500 hover:bg-gray-100 hover:text-gray-700"
						onclick={onadd}
						aria-label="Add new character"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-3.5 w-3.5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
						</svg>
						Add
					</button>
					<!-- Edit mode toggle -->
					<button
						type="button"
						class="flex h-7 items-center gap-1 px-2 rounded-full text-xs font-medium transition-colors {editMode
							? 'bg-[#C91977] text-white'
							: 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}"
						onclick={toggleEditMode}
						aria-label={editMode ? 'Exit edit mode' : 'Enter edit mode'}
						aria-pressed={editMode}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-3.5 w-3.5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
							/>
						</svg>
						{editMode ? 'Done' : 'Edit'}
					</button>
					<!-- Close button -->
					<button
						type="button"
						class="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
						onclick={handleClose}
						aria-label="Close character selector"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			</div>

			<!-- Character grid with max height and scroll -->
			<div class="max-h-[320px] overflow-y-auto p-3">
				<div class="grid grid-cols-3 gap-3">
					{#each filteredCharacters as character (character.id)}
						<div class="relative">
							<!-- Character card -->
							<button
								type="button"
								class="group flex w-full flex-col items-center gap-2 rounded-xl p-2 transition-all hover:bg-gray-50"
								onclick={() => handleSelect(character.id)}
								aria-label="Select {character.name}"
								disabled={editMode}
							>
								<!-- Character image - larger size, zoomed to show face -->
								<div
									class="relative h-20 w-20 rounded-full overflow-hidden bg-pink-100 ring-2 ring-gray-200 group-hover:ring-gray-300"
								>
									{#if character.stickerImagePath && !hasImageError(character.id)}
										<img
											src={getAuthImageUrl(character.stickerImagePath)}
											alt={character.name}
											class="h-full w-full object-cover object-top scale-125"
											onerror={() => handleImageError(character.id)}
										/>
									{:else}
										<div
											class="flex h-full w-full items-center justify-center text-lg font-semibold text-pink-600"
										>
											{getInitials(character.name)}
										</div>
									{/if}
								</div>

								<!-- Character name -->
								<span
									class="text-center text-xs font-medium leading-tight text-gray-700 line-clamp-2 max-w-full"
								>
									{character.name}
								</span>
							</button>

							<!-- Edit mode overlay with actions -->
							{#if editMode}
								<div
									class="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-black/50"
								>
									<button
										type="button"
										class="flex h-11 w-11 items-center justify-center rounded-full bg-white text-blue-600 shadow-lg hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
										onclick={() => handleEdit(character.id)}
										aria-label="Edit {character.name}"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
											/>
										</svg>
									</button>
									<button
										type="button"
										class="flex h-11 w-11 items-center justify-center rounded-full bg-white text-red-600 shadow-lg hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
										onclick={() => handleDelete(character.id)}
										aria-label="Delete {character.name}"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
											/>
										</svg>
									</button>
								</div>
							{/if}
						</div>
					{/each}

					<!-- Add new character card - only shown if fewer than 6 characters (to fill 2 rows of 3) -->
					{#if showAddCardInGrid}
						<button
							type="button"
							class="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 p-2 transition-colors hover:border-[#C91977] hover:bg-pink-50 group"
							onclick={onadd}
						>
							<div
								class="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-gray-300 group-hover:border-[#C91977] transition-colors"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-8 w-8 text-gray-400 group-hover:text-[#C91977] transition-colors"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
								</svg>
							</div>
							<span
								class="text-center text-xs font-medium text-gray-500 group-hover:text-[#C91977] transition-colors"
							>
								Add New
							</span>
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
