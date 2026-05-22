<script module lang="ts">
	import type { ComponentPreview } from '$lib/testing/preview.js';

	interface CharacterCardProps {
		character: {
			id: string;
			name: string;
			stickerImagePath: string;
		};
		active?: boolean;
		onclick?: () => void;
	}

	export const preview: ComponentPreview<CharacterCardProps> = {
		name: 'CharacterCard',
		description: 'Displays a character thumbnail with name, used for character selection',
		layout: 'row',
		variants: [
			{
				label: 'Default',
				props: {
					character: {
						id: '1',
						name: 'Justin',
						stickerImagePath: '/images/stickers/justin.webp'
					}
				}
			},
			{
				label: 'Active',
				props: {
					character: {
						id: '2',
						name: 'JustinCool',
						stickerImagePath: '/images/stickers/justin-cool.webp'
					},
					active: true
				}
			},
			{
				label: 'No Image (Initials Fallback)',
				props: {
					character: {
						id: '3',
						name: 'Justin Maier',
						stickerImagePath: ''
					}
				}
			},
			{
				label: 'Active + No Image',
				props: {
					character: {
						id: '4',
						name: 'Justin',
						stickerImagePath: ''
					},
					active: true
				}
			},
			{
				label: 'Long Name (Truncation)',
				props: {
					character: {
						id: '5',
						name: 'Alexander Hamilton',
						stickerImagePath: '/images/stickers/justin.webp'
					}
				}
			}
		]
	};
</script>

<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import { getAuthImageUrl } from '$lib/stores/auth.svelte';

	interface Character {
		id: string;
		name: string;
		stickerImagePath: string;
	}

	interface Props {
		character: Character;
		active?: boolean;
		onclick?: () => void;
	}

	let { character, active = false, onclick }: Props = $props();

	function getInitials(name: string): string {
		return name
			.split(' ')
			.map((word) => word[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}

	let errorForSrc = $state<string | null>(null);
	let authImageUrl = $derived(getAuthImageUrl(character.stickerImagePath));
	let showImage = $derived(character.stickerImagePath && errorForSrc !== character.stickerImagePath);

	function handleImageError() {
		errorForSrc = character.stickerImagePath;
	}
</script>

<button
	type="button"
	class="group flex flex-col items-center gap-2 p-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#C91977] focus:ring-offset-2 hover:bg-[#FDF2F8] active:scale-95"
	onclick={onclick}
	aria-label="Select character: {character.name}{active ? ' (active)' : ''}"
>
	<!-- Thumbnail Container -->
	<div class="relative">
		<div
			class="relative w-16 h-16 rounded-full border-2 overflow-hidden transition-all duration-200 {active
				? 'border-[#C91977] ring-2 ring-[#C91977]/30'
				: 'border-gray-200 group-hover:border-[#C91977]/50'}"
		>
			{#if showImage}
				<img
					src={authImageUrl}
					alt="{character.name} character sticker"
					class="w-full h-full object-cover"
					loading="lazy"
					onerror={handleImageError}
				/>
			{:else}
				<div
					class="w-full h-full bg-pink-100 flex items-center justify-center text-pink-600 font-semibold text-lg"
				>
					{getInitials(character.name)}
				</div>
			{/if}
		</div>

		<!-- Active Badge -->
		{#if active}
			<div class="absolute -bottom-1 left-1/2 -translate-x-1/2">
				<Badge variant="pink" size="sm">Active</Badge>
			</div>
		{/if}
	</div>

	<!-- Character Name -->
	<span
		class="text-sm font-medium text-[#1F2937] truncate max-w-[80px] text-center group-hover:text-[#C91977] transition-colors"
	>
		{character.name}
	</span>
</button>
