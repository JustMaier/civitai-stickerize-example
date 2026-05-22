<script module lang="ts">
	import type { ComponentPreview } from '$lib/testing/preview.js';

	const sampleCharacters = [
		{ id: '1', name: 'Justin', stickerImagePath: '/images/stickers/justin.webp' },
		{ id: '2', name: 'JustinCool', stickerImagePath: '/images/stickers/justin-cool.webp' },
		{ id: '3', name: 'JustinFitness', stickerImagePath: '/images/stickers/justin-fitness.webp' },
		{ id: '4', name: 'JustinWork', stickerImagePath: '/images/stickers/justin-work.webp' }
	];

	export const preview: ComponentPreview = {
		name: 'CharacterSelector',
		description:
			'Bottom sheet for selecting, editing, or deleting characters with swipe-to-reveal actions',
		layout: 'column',
		isolate: true,
		variants: [
			{
				label: 'Closed',
				props: {
					open: false,
					characters: sampleCharacters,
					activeId: '1'
				}
			},
			{
				label: 'Open - Multiple Characters',
				props: {
					open: true,
					characters: sampleCharacters,
					activeId: '1'
				}
			},
			{
				label: 'Open - Single Character',
				props: {
					open: true,
					characters: [sampleCharacters[0]],
					activeId: '1'
				}
			},
			{
				label: 'Open - No Active Character',
				props: {
					open: true,
					characters: sampleCharacters,
					activeId: ''
				}
			},
			{
				label: 'Open - Empty List',
				props: {
					open: true,
					characters: [],
					activeId: ''
				}
			}
		]
	};
</script>

<script lang="ts">
	import BottomSheet from '$lib/components/layout/BottomSheet.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';

	interface Character {
		id: string;
		name: string;
		stickerImagePath: string;
	}

	interface Props {
		open: boolean;
		characters: Character[];
		activeId: string;
		onselect?: (id: string) => void;
		onedit?: (id: string) => void;
		ondelete?: (id: string) => void;
		onadd?: () => void;
		onclose?: () => void;
	}

	let {
		open = $bindable(false),
		characters,
		activeId,
		onselect,
		onedit,
		ondelete,
		onadd,
		onclose
	}: Props = $props();

	// Track which row is swiped open
	let swipedRowId = $state<string | null>(null);

	// Touch tracking state per row
	let touchStartX = $state(0);
	let currentTranslateX = $state(0);
	let isDragging = $state(false);
	let draggingRowId = $state<string | null>(null);

	const SWIPE_THRESHOLD = 80;
	const ACTION_BUTTON_WIDTH = 140; // Width for Edit + Delete buttons

	function handleTouchStart(event: TouchEvent, characterId: string) {
		touchStartX = event.touches[0].clientX;
		isDragging = true;
		draggingRowId = characterId;

		// If tapping on a different row, close the currently swiped one
		if (swipedRowId && swipedRowId !== characterId) {
			swipedRowId = null;
		}

		// Start from current position if this row is already swiped
		currentTranslateX = swipedRowId === characterId ? -ACTION_BUTTON_WIDTH : 0;
	}

	function handleTouchMove(event: TouchEvent) {
		if (!isDragging || !draggingRowId) return;

		const deltaX = event.touches[0].clientX - touchStartX;
		const startOffset = swipedRowId === draggingRowId ? -ACTION_BUTTON_WIDTH : 0;

		// Calculate new position (only allow left swipe)
		let newTranslate = startOffset + deltaX;
		newTranslate = Math.max(-ACTION_BUTTON_WIDTH, Math.min(0, newTranslate));

		currentTranslateX = newTranslate;
	}

	function handleTouchEnd() {
		if (!isDragging || !draggingRowId) return;

		// Determine if we should snap open or closed
		if (currentTranslateX < -SWIPE_THRESHOLD) {
			swipedRowId = draggingRowId;
		} else {
			swipedRowId = null;
		}

		isDragging = false;
		draggingRowId = null;
		currentTranslateX = 0;
	}

	function getRowTransform(characterId: string): string {
		if (isDragging && draggingRowId === characterId) {
			return `translateX(${currentTranslateX}px)`;
		}
		if (swipedRowId === characterId) {
			return `translateX(-${ACTION_BUTTON_WIDTH}px)`;
		}
		return 'translateX(0)';
	}

	function handleSelect(id: string) {
		if (swipedRowId) {
			swipedRowId = null;
			return;
		}
		onselect?.(id);
	}

	function handleEdit(id: string) {
		swipedRowId = null;
		onedit?.(id);
	}

	function handleDelete(id: string) {
		swipedRowId = null;
		ondelete?.(id);
	}

	function handleClose() {
		swipedRowId = null;
		onclose?.();
	}

	function getInitials(name: string): string {
		return name
			.split(' ')
			.map((word) => word[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}
</script>

<BottomSheet bind:open title="Select Character" onclose={handleClose}>
	<div class="flex flex-col gap-1">
		{#each characters as character (character.id)}
			<div class="relative overflow-hidden rounded-lg">
				<!-- Action buttons (revealed on swipe) -->
				<div class="absolute inset-y-0 right-0 flex items-stretch">
					<button
						type="button"
						class="flex w-[70px] items-center justify-center bg-blue-500 text-white font-medium text-sm hover:bg-blue-600 transition-colors"
						onclick={() => handleEdit(character.id)}
						aria-label="Edit {character.name}"
					>
						Edit
					</button>
					<button
						type="button"
						class="flex w-[70px] items-center justify-center bg-red-500 text-white font-medium text-sm hover:bg-red-600 transition-colors"
						onclick={() => handleDelete(character.id)}
						aria-label="Delete {character.name}"
					>
						Delete
					</button>
				</div>

				<!-- Swipeable row content -->
				<button
					type="button"
					class="relative flex w-full items-center gap-3 bg-white p-3 text-left transition-transform"
					style="transform: {getRowTransform(character.id)}"
					ontouchstart={(e) => handleTouchStart(e, character.id)}
					ontouchmove={handleTouchMove}
					ontouchend={handleTouchEnd}
					onclick={() => handleSelect(character.id)}
					aria-label="Select {character.name}"
				>
					<!-- Character thumbnail -->
					<Avatar
						src={character.stickerImagePath}
						alt={character.name}
						size="md"
						fallback={getInitials(character.name)}
					/>

					<!-- Character name -->
					<span class="flex-1 font-medium text-gray-900">
						{character.name}
					</span>

					<!-- Active badge -->
					{#if character.id === activeId}
						<Badge variant="pink" size="sm">Active</Badge>
					{/if}
				</button>
			</div>
		{/each}

		<!-- Add new character button -->
		<button
			type="button"
			class="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-3 text-gray-600 transition-colors hover:border-[#C91977] hover:text-[#C91977]"
			onclick={onadd}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
			</svg>
			<span class="font-medium">Add new character</span>
		</button>
	</div>
</BottomSheet>
