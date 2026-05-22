<script module lang="ts">
	import type { Snapshot } from './$types';

	interface FeedSnapshot {
		scrollTop: number;
	}

	export const snapshot: Snapshot<FeedSnapshot> = {
		capture: () => {
			// Get scroll position from the grid container
			const container = document.querySelector('[aria-label="Sticker feed"]');
			return {
				scrollTop: container?.scrollTop ?? 0
			};
		},
		restore: (value) => {
			// Restore scroll position after data loads
			requestAnimationFrame(() => {
				const container = document.querySelector('[aria-label="Sticker feed"]');
				if (container) {
					container.scrollTop = value.scrollTop;
				}
			});
		}
	};
</script>

<script lang="ts">
	import { goto, beforeNavigate } from '$app/navigation';
	import { updated } from '$app/state';
	import { onMount } from 'svelte';
	import { User } from 'lucide-svelte';
	import { authFetch } from '$lib/utils/api';
	import { clearAuth } from '$lib/stores/auth.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import BuzzBalance from '$lib/components/civitai/BuzzBalance.svelte';
	import StickerGrid from '$lib/components/sticker/StickerGrid.svelte';
	import StickerDetail from '$lib/components/sticker/StickerDetail.svelte';
	import JobDetail from '$lib/components/sticker/JobDetail.svelte';
	import CharacterSelectorInline from '$lib/components/character/CharacterSelectorInline.svelte';
	import { addToast } from '$lib/components/ui/Toaster.svelte';

	// Types for API responses
	interface Sticker {
		id: string;
		prompt: string;
		imageUrl: string;
		characterIds: string[];
		costCents: number;
		createdAt: Date;
	}

	interface Character {
		id: string;
		name: string;
		stickerImageUrl: string;
		createdAt: Date;
	}

	interface Job {
		id: string;
		type: string;
		status: 'queued' | 'processing' | 'failed';
		userPrompt: string;
		characterIds: string[] | null;
		error: string | null;
		isRetryable: boolean | null;
		createdAt: Date;
	}

	// Data state
	let userStickers = $state<Sticker[]>([]);
	let userCharacters = $state<Character[]>([]);
	let activeJobs = $state<Job[]>([]);
	let nextCursor = $state<string | null>(null);
	let isLoading = $state(true);
	let isLoadingMore = $state(false);
	let hasMore = $state(true);

	// UI state
	let profileDropdownOpen = $state(false);
	let characterSelectorOpen = $state(false);
	let detailModalOpen = $state(false);
	let selectedSticker = $state<Sticker | null>(null);
	let selectedJob = $state<Job | null>(null);
	let promptValue = $state('');
	let inputElement = $state<HTMLDivElement | null>(null);
	let isSending = $state(false);

	// @ autocomplete state
	let mentionStartIndex = $state<number | null>(null);
	let mentionFilterText = $state('');

	// Polling state
	let pollInterval = $state<ReturnType<typeof setInterval> | null>(null);
	let isMounted = $state(true);

	// Bound by <BuzzBalance bind:refetch> — invoked after a job completes so the
	// pill animates the Buzz deduction in real time.
	let refetchBuzz = $state<() => void>(() => {});

	// Network status
	let isOnline = $state(typeof navigator !== 'undefined' ? navigator.onLine : true);

	$effect(() => {
		const handleOnline = () => (isOnline = true);
		const handleOffline = () => (isOnline = false);

		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	});

	// Cycling placeholder state
	let currentPlaceholderIndex = $state(0);

	// Get the first character name for placeholder examples
	const firstCharacterName = $derived(userCharacters[0]?.name ?? 'Character');

	// Check if user has any characters
	const hasCharacters = $derived(userCharacters.length > 0);

	// Meme prompt ideas for cycling placeholder
	const placeholderTemplates = [
		(name: string) => `@${name} doing the This Is Fine meme`,
		(name: string) => `@${name} as Distracted Boyfriend`,
		(name: string) => `@${name} saying 'Shut up and take my money!'`,
		(name: string) => `@${name} in the Drake meme format`,
		(name: string) => `@${name} as the Surprised Pikachu`,
		(name: string) => `@${name} doing the Success Kid pose`,
		(name: string) => `@${name} in the Two Buttons meme`,
		(name: string) => `@${name} as the Galaxy Brain meme`
	];

	// Current placeholder text
	const currentPlaceholder = $derived(placeholderTemplates[currentPlaceholderIndex](firstCharacterName));

	// Cycle through placeholders every 5.5 seconds
	$effect(() => {
		const interval = setInterval(() => {
			currentPlaceholderIndex = (currentPlaceholderIndex + 1) % placeholderTemplates.length;
		}, 5500);

		return () => clearInterval(interval);
	});

	// Check for app updates and refresh data when app comes to foreground
	$effect(() => {
		const handleVisibility = () => {
			if (document.visibilityState === 'visible') {
				updated.check();
				handleRefresh();
			}
		};
		document.addEventListener('visibilitychange', handleVisibility);
		return () => document.removeEventListener('visibilitychange', handleVisibility);
	});

	// Auto-reload on navigation if update available
	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url) {
			location.href = to.url.href;
		}
	});

	// Get character names for mention highlighting
	const characterNames = $derived(userCharacters.map(c => c.name));

	// Combined feed items sorted by createdAt (newest first)
	type FeedItem =
		| { type: 'sticker'; id: string; sticker: { id: string; imagePath: string; prompt: string }; createdAt: Date }
		| { type: 'job'; id: string; job: { id: string; status: 'queued' | 'processing' | 'failed'; userPrompt: string; error: string | null; isRetryable: boolean | null }; createdAt: Date };

	const feedItems = $derived.by(() => {
		const stickerItems: FeedItem[] = userStickers.map(s => ({
			type: 'sticker' as const,
			id: s.id,
			sticker: { id: s.id, imagePath: s.imageUrl, prompt: s.prompt },
			createdAt: s.createdAt
		}));

		const jobItems: FeedItem[] = activeJobs
			.filter(j => j.type === 'sticker')
			.map(j => ({
				type: 'job' as const,
				id: j.id,
				job: { id: j.id, status: j.status, userPrompt: j.userPrompt, error: j.error, isRetryable: j.isRetryable },
				createdAt: j.createdAt
			}));

		// Combine and sort by createdAt descending (newest first)
		return [...stickerItems, ...jobItems].sort((a, b) =>
			new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
		);
	});

	// =========================================================================
	// API Functions
	// =========================================================================

	async function fetchStickers(cursor?: string) {
		const url = cursor ? `/api/stickers?cursor=${cursor}` : '/api/stickers';
		const res = await authFetch(url);
		if (!res.ok) throw new Error('Failed to fetch stickers');
		return res.json();
	}

	async function fetchCharacters() {
		const res = await authFetch('/api/characters');
		if (!res.ok) throw new Error('Failed to fetch characters');
		return res.json();
	}

	async function fetchActiveJobs() {
		const res = await authFetch('/api/jobs?status=queued,processing,failed');
		if (!res.ok) throw new Error('Failed to fetch jobs');
		return res.json();
	}

	async function createStickerJob(prompt: string, characterIds: string[]) {
		const res = await authFetch('/api/stickers', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ prompt, characterIds })
		});
		if (!res.ok) {
			const data = await res.json();
			throw new Error(data.error || 'Failed to create sticker');
		}
		return res.json();
	}

	async function regenerateSticker(stickerId: string) {
		const res = await authFetch(`/api/stickers/${stickerId}/regenerate`, { method: 'POST' });
		if (!res.ok) {
			const data = await res.json();
			throw new Error(data.error || 'Failed to regenerate sticker');
		}
		return res.json();
	}

	async function deleteSticker(stickerId: string) {
		const res = await authFetch(`/api/stickers/${stickerId}`, { method: 'DELETE' });
		if (!res.ok && res.status !== 204) {
			const data = await res.json();
			throw new Error(data.error || 'Failed to delete sticker');
		}
	}

	async function deleteCharacter(characterId: string) {
		const res = await authFetch(`/api/characters/${characterId}`, { method: 'DELETE' });
		if (!res.ok) {
			const data = await res.json();
			throw new Error(data.error || 'Failed to delete character');
		}
	}

	// =========================================================================
	// Data Loading
	// =========================================================================

	async function loadInitialData() {
		isLoading = true;
		try {
			const [stickersRes, charactersRes, jobsRes] = await Promise.all([
				fetchStickers(),
				fetchCharacters(),
				fetchActiveJobs()
			]);

			userStickers = stickersRes.stickers;
			nextCursor = stickersRes.nextCursor;
			hasMore = !!stickersRes.nextCursor;
			userCharacters = charactersRes.characters;
			activeJobs = jobsRes.jobs;

			// Start polling if there are active jobs
			if (activeJobs.length > 0) {
				startPolling();
			}
		} catch (error) {
			console.error('Failed to load feed data:', error);
			addToast({ type: 'error', message: 'Failed to load feed' });
		} finally {
			isLoading = false;
		}
	}

	async function loadMoreStickers() {
		if (!hasMore || isLoadingMore || !nextCursor) return;

		isLoadingMore = true;
		try {
			const data = await fetchStickers(nextCursor);
			userStickers = [...userStickers, ...data.stickers];
			nextCursor = data.nextCursor;
			hasMore = !!data.nextCursor;
		} catch (error) {
			console.error('Failed to load more stickers:', error);
		} finally {
			isLoadingMore = false;
		}
	}

	// =========================================================================
	// Polling for active jobs
	// =========================================================================

	function startPolling() {
		if (pollInterval) return; // Already polling

		pollInterval = setInterval(async () => {
			if (!isMounted) {
				stopPolling();
				return;
			}

			try {
				const prevJobCount = activeJobs.length;
				const jobsRes = await fetchActiveJobs();
				activeJobs = jobsRes.jobs;

				// If jobs completed (count decreased), refresh stickers and Buzz balance
				if (jobsRes.jobs.length < prevJobCount) {
					const stickersRes = await fetchStickers();
					userStickers = stickersRes.stickers;
					nextCursor = stickersRes.nextCursor;
					hasMore = !!stickersRes.nextCursor;
					refetchBuzz();
				}

				// Stop polling if no more active jobs
				if (jobsRes.jobs.length === 0) {
					stopPolling();
				}
			} catch (error) {
				console.error('Polling error:', error);
			}
		}, 5000); // 5 second interval per PRD
	}

	function stopPolling() {
		if (pollInterval) {
			clearInterval(pollInterval);
			pollInterval = null;
		}
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	onMount(() => {
		loadInitialData();

		return () => {
			isMounted = false;
			stopPolling();
		};
	});

	// =========================================================================
	// Text Input Helpers
	// =========================================================================

	function escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	function escapeHtml(str: string): string {
		const map: Record<string, string> = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#x27;',
			'/': '&#x2F;',
			'`': '&#x60;',
			'=': '&#x3D;'
		};
		return str.replace(/[&<>"'`=\/]/g, (char) => map[char]);
	}

	const highlightedHtml = $derived.by(() => {
		if (!promptValue || characterNames.length === 0) {
			return escapeHtml(promptValue);
		}

		const sortedNames = [...characterNames].sort((a, b) => b.length - a.length);
		const pattern = new RegExp(
			`(@(?:${sortedNames.map(escapeRegex).join('|')}))(?=\\s|$|[.,!?;:])`,
			'gi'
		);

		const parts: string[] = [];
		let lastIndex = 0;
		let match: RegExpExecArray | null;
		pattern.lastIndex = 0;

		while ((match = pattern.exec(promptValue)) !== null) {
			if (match.index > lastIndex) {
				parts.push(escapeHtml(promptValue.slice(lastIndex, match.index)));
			}
			parts.push(`<span class="mention-highlight">${escapeHtml(match[1])}</span>`);
			lastIndex = pattern.lastIndex;
		}

		if (lastIndex < promptValue.length) {
			parts.push(escapeHtml(promptValue.slice(lastIndex)));
		}

		return parts.join('');
	});

	function getCursorPosition(): { start: number; end: number } | null {
		if (!inputElement) return null;
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return null;

		const range = selection.getRangeAt(0);
		const preCaretRange = range.cloneRange();
		preCaretRange.selectNodeContents(inputElement);
		preCaretRange.setEnd(range.startContainer, range.startOffset);
		const start = preCaretRange.toString().length;

		const preCaretRangeEnd = range.cloneRange();
		preCaretRangeEnd.selectNodeContents(inputElement);
		preCaretRangeEnd.setEnd(range.endContainer, range.endOffset);
		const end = preCaretRangeEnd.toString().length;

		return { start, end };
	}

	function setCursorPosition(offset: number): void {
		if (!inputElement) return;
		const selection = window.getSelection();
		if (!selection) return;

		const walker = document.createTreeWalker(inputElement, NodeFilter.SHOW_TEXT, null);
		let currentOffset = 0;
		let targetNode: Text | null = null;
		let targetOffset = 0;

		while (walker.nextNode()) {
			const node = walker.currentNode as Text;
			const nodeLength = node.textContent?.length || 0;
			if (currentOffset + nodeLength >= offset) {
				targetNode = node;
				targetOffset = offset - currentOffset;
				break;
			}
			currentOffset += nodeLength;
		}

		if (targetNode) {
			const range = document.createRange();
			range.setStart(targetNode, Math.min(targetOffset, targetNode.textContent?.length || 0));
			range.collapse(true);
			selection.removeAllRanges();
			selection.addRange(range);
		} else if (inputElement.childNodes.length > 0) {
			const range = document.createRange();
			range.selectNodeContents(inputElement);
			range.collapse(false);
			selection.removeAllRanges();
			selection.addRange(range);
		}
	}

	$effect(() => {
		if (inputElement) {
			const html = highlightedHtml || '';
			if (inputElement.innerHTML !== html) {
				const cursorPos = getCursorPosition();
				inputElement.innerHTML = html;
				if (cursorPos) {
					setCursorPosition(cursorPos.start);
				}
			}
		}
	});

	$effect(() => {
		if (inputElement) {
			inputElement.style.height = 'auto';
			inputElement.style.height = `${Math.max(inputElement.scrollHeight, 44)}px`;
		}
		promptValue;
	});

	// =========================================================================
	// Event Handlers
	// =========================================================================

	function handleStickerSelect(sticker: { id: string; imagePath: string; prompt: string }) {
		const fullSticker = userStickers.find(s => s.id === sticker.id);
		if (fullSticker) {
			selectedSticker = fullSticker;
			detailModalOpen = true;
		} else {
			addToast({ type: 'error', message: 'Sticker not found. It may have been deleted.' });
		}
	}

	function handleJobClick(gridJob: { id: string; status: 'queued' | 'processing' | 'failed'; userPrompt: string; error: string | null }) {
		// Look up the full job from activeJobs using the ID
		const fullJob = activeJobs.find(j => j.id === gridJob.id);
		if (fullJob) {
			selectedJob = fullJob;
			detailModalOpen = true;
		}
	}

	async function handleJobRetry() {
		if (!selectedJob) return;

		const jobToRetry = selectedJob;

		// Close the modal
		detailModalOpen = false;
		selectedJob = null;

		// Remove the failed job from active jobs
		activeJobs = activeJobs.filter(j => j.id !== jobToRetry.id);

		// Create a new sticker job with the same prompt
		try {
			const characterIds = jobToRetry.characterIds || [];
			const result = await createStickerJob(jobToRetry.userPrompt, characterIds);

			// Add the new job to active jobs
			activeJobs = [{
				id: result.jobId,
				type: 'sticker',
				status: 'queued',
				userPrompt: jobToRetry.userPrompt,
				characterIds,
				error: null,
				isRetryable: null,
				createdAt: new Date()
			}, ...activeJobs];

			startPolling();
			addToast({ type: 'success', message: 'Retrying...' });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to retry';
			addToast({ type: 'error', message });
		}
	}

	function handleJobDismiss() {
		if (!selectedJob) return;

		const jobToDismiss = selectedJob;

		// Close the modal
		detailModalOpen = false;
		selectedJob = null;

		// Remove from active jobs (just hiding locally for now)
		activeJobs = activeJobs.filter(j => j.id !== jobToDismiss.id);
		addToast({ type: 'success', message: 'Job dismissed' });
	}

	function handleCharacterSelect(id: string) {
		const character = userCharacters.find(c => c.id === id);
		if (character) {
			if (mentionStartIndex !== null) {
				const cursorPos = getCursorPosition();
				const currentCursorPos = cursorPos?.start ?? promptValue.length;
				const textBefore = promptValue.slice(0, mentionStartIndex);
				const textAfter = promptValue.slice(currentCursorPos);
				promptValue = textBefore + `@${character.name} ` + textAfter;
			} else {
				promptValue = promptValue + `@${character.name} `;
			}
		}
		mentionStartIndex = null;
		mentionFilterText = '';
		characterSelectorOpen = false;

		setTimeout(() => {
			if (inputElement) {
				inputElement.focus();
				setCursorPosition(promptValue.length);
			}
		}, 0);
	}

	function handleAddCharacter() {
		characterSelectorOpen = false;
		goto('/character/new');
	}

	function handleEditCharacter(id: string) {
		characterSelectorOpen = false;
		goto(`/character/${id}/edit`);
	}

	async function handleDeleteCharacter(id: string) {
		try {
			await deleteCharacter(id);
			userCharacters = userCharacters.filter(c => c.id !== id);
			addToast({ type: 'success', message: 'Character deleted' });
		} catch (error) {
			addToast({ type: 'error', message: 'Failed to delete character' });
		}
	}

	function handleLogout() {
		profileDropdownOpen = false;
		// Clear local auth state and call logout endpoint
		clearAuth();
		authFetch('/api/auth/logout', { method: 'POST' }).finally(() => {
			goto('/');
		});
	}

	// Extract character IDs from @mentions in prompt
	function extractCharacterIds(prompt: string): string[] {
		const ids: string[] = [];
		for (const char of userCharacters) {
			const pattern = new RegExp(`@${escapeRegex(char.name)}(?=\\s|$|[.,!?;:])`, 'gi');
			if (pattern.test(prompt)) {
				ids.push(char.id);
			}
		}
		return [...new Set(ids)]; // Remove duplicates
	}

	async function handleSendPrompt() {
		if (!promptValue.trim() || isSending) return;

		const characterIds = extractCharacterIds(promptValue);
		if (characterIds.length === 0) {
			addToast({ type: 'error', message: 'Please mention at least one character with @' });
			return;
		}

		isSending = true;
		try {
			const result = await createStickerJob(promptValue, characterIds);

			// Add the new job to active jobs immediately
			activeJobs = [{
				id: result.jobId,
				type: 'sticker',
				status: 'queued',
				userPrompt: promptValue,
				characterIds,
				error: null,
				isRetryable: null,
				createdAt: new Date()
			}, ...activeJobs];

			promptValue = '';
			startPolling();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to create sticker';
			addToast({ type: 'error', message });
		} finally {
			isSending = false;
		}
	}

	function handlePromptKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSendPrompt();
		}
	}

	function handlePromptInput(event: Event) {
		const element = event.target as HTMLDivElement;
		const newText = element.innerText || '';
		promptValue = newText.replace(/\n$/, '');

		const cursorPos = getCursorPosition()?.start ?? promptValue.length;
		const textBeforeCursor = promptValue.slice(0, cursorPos);

		if (textBeforeCursor.endsWith('@')) {
			const charBeforeAt = textBeforeCursor.slice(-2, -1);
			if (charBeforeAt === '' || charBeforeAt === ' ' || charBeforeAt === '\n') {
				mentionStartIndex = cursorPos - 1;
				mentionFilterText = '';
				characterSelectorOpen = true;
				return;
			}
		}

		if (characterSelectorOpen && mentionStartIndex !== null) {
			const mentionText = textBeforeCursor.slice(mentionStartIndex + 1);
			if (cursorPos <= mentionStartIndex || mentionText.includes(' ')) {
				mentionStartIndex = null;
				mentionFilterText = '';
				characterSelectorOpen = false;
			} else {
				mentionFilterText = mentionText;
			}
		}
	}

	function handleBackdropClick() {
		profileDropdownOpen = false;
	}

	// Sticker detail actions
	async function handleShare() {
		if (!selectedSticker) return;

		try {
			// Fetch the image as blob for sharing
			const response = await authFetch(selectedSticker.imageUrl);
			const blob = await response.blob();
			const file = new File([blob], `sticker-${selectedSticker.id}.png`, { type: 'image/png' });

			if (navigator.share && navigator.canShare?.({ files: [file] })) {
				await navigator.share({
					files: [file],
					title: 'Check out my sticker!',
					text: selectedSticker.prompt
				});
			} else if (navigator.share) {
				// Fall back to sharing without file
				await navigator.share({
					title: 'Check out my sticker!',
					text: selectedSticker.prompt
				});
			} else {
				addToast({ type: 'info', message: 'Sharing not supported on this device' });
			}
		} catch (error) {
			if ((error as Error).name !== 'AbortError') {
				console.error('Share error:', error);
			}
		}
	}

	async function handleDownload() {
		if (!selectedSticker) return;

		try {
			const response = await authFetch(selectedSticker.imageUrl);
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);

			const link = document.createElement('a');
			link.href = url;
			link.download = `sticker-${selectedSticker.id}.png`;
			link.click();

			URL.revokeObjectURL(url);
			addToast({ type: 'success', message: 'Download started' });
		} catch (error) {
			addToast({ type: 'error', message: 'Failed to download sticker' });
		}
	}

	async function handleRegenerate() {
		if (!selectedSticker) return;

		try {
			const result = await regenerateSticker(selectedSticker.id);

			// Add the new job to active jobs
			activeJobs = [{
				id: result.jobId,
				type: 'sticker',
				status: 'queued',
				userPrompt: selectedSticker.prompt,
				characterIds: selectedSticker.characterIds,
				error: null,
				isRetryable: null,
				createdAt: new Date()
			}, ...activeJobs];

			detailModalOpen = false;
			selectedSticker = null;
			startPolling();
			addToast({ type: 'success', message: 'Creating a new version...' });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to regenerate';
			addToast({ type: 'error', message });
		}
	}

	async function handleDelete() {
		if (!selectedSticker) return;

		const stickerToDelete = selectedSticker;

		// Optimistically remove from UI
		userStickers = userStickers.filter(s => s.id !== stickerToDelete.id);
		detailModalOpen = false;
		selectedSticker = null;

		// Show toast with undo option
		let undone = false;
		addToast({
			type: 'success',
			message: 'Sticker deleted',
			action: {
				label: 'Undo',
				onClick: () => {
					undone = true;
					userStickers = [stickerToDelete, ...userStickers];
				}
			},
			duration: 5000
		});

		// Wait for undo window then delete
		setTimeout(async () => {
			if (!undone) {
				try {
					await deleteSticker(stickerToDelete.id);
				} catch (error) {
					// Restore on failure
					userStickers = [stickerToDelete, ...userStickers];
					addToast({ type: 'error', message: 'Failed to delete sticker' });
				}
			}
		}, 5000);
	}

	async function handleRefresh() {
		try {
			const [stickersRes, jobsRes] = await Promise.all([
				fetchStickers(),
				fetchActiveJobs()
			]);

			userStickers = stickersRes.stickers;
			nextCursor = stickersRes.nextCursor;
			hasMore = !!stickersRes.nextCursor;
			activeJobs = jobsRes.jobs;

			if (activeJobs.length > 0) {
				startPolling();
			}
		} catch (error) {
			addToast({ type: 'error', message: 'Failed to refresh' });
		}
	}

	function handleLoadMore() {
		loadMoreStickers();
	}
</script>

<svelte:head>
	<title>StickerFeed - Stickerize</title>
</svelte:head>

<!-- Backdrop for closing dropdown -->
{#if profileDropdownOpen}
	<button
		type="button"
		class="fixed inset-0 z-30"
		onclick={handleBackdropClick}
		aria-label="Close menu"
	></button>
{/if}

<!-- Update available banner -->
{#if updated.current}
	<div class="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-[#8B5CF6] to-[#C91977] px-4 py-2 text-center text-white text-sm font-medium shadow-lg">
		<span>New version available!</span>
		<button
			onclick={() => location.reload()}
			class="ml-3 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 transition-colors"
		>
			Update now
		</button>
	</div>
{/if}

<div class="flex flex-col h-full min-h-screen bg-[#FDF2F8]">
	<!-- Header -->
	<header class="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-white shadow-sm">
		<h1 class="flex items-center gap-2">
			<Badge variant="pink" size="lg">Stickerize</Badge>
		</h1>

		<!-- Buzz balance, offline indicator, and profile avatar -->
		<div class="flex items-center gap-3">
			<BuzzBalance bind:refetch={refetchBuzz} />

			{#if !isOnline}
				<div
					class="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700"
					role="status"
					aria-live="polite"
				>
					<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m-3.536-3.536a4 4 0 010-5.656m-7.072 7.072a9 9 0 010-12.728m3.536 3.536a4 4 0 010 5.656" />
					</svg>
					Offline
				</div>
			{/if}

			<!-- Profile avatar with dropdown -->
			<div class="relative">
				<button
				type="button"
				class="focus:outline-none focus:ring-2 focus:ring-[#C91977] focus:ring-offset-2 rounded-full"
				onclick={() => profileDropdownOpen = !profileDropdownOpen}
				aria-expanded={profileDropdownOpen}
				aria-haspopup="true"
				aria-label="Profile menu"
			>
				<div class="w-11 h-11 rounded-full border border-gray-200 bg-pink-100 flex items-center justify-center">
					<User class="w-5 h-5 text-pink-600" />
				</div>
			</button>

			<!-- Dropdown menu -->
			{#if profileDropdownOpen}
				<div
					class="absolute right-0 top-full mt-2 w-52 rounded-lg bg-white py-2 shadow-lg ring-1 ring-black/5 z-50"
					role="menu"
				>
					<button
						type="button"
						class="flex w-full items-center gap-3 px-5 py-3 text-left text-base text-gray-700 hover:bg-gray-100 transition-colors"
						onclick={handleLogout}
						role="menuitem"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
						</svg>
						Logout
					</button>
				</div>
			{/if}
			</div>
		</div>
	</header>

	<!-- No characters banner -->
	{#if !hasCharacters && !isLoading}
		<button
			type="button"
			onclick={() => goto('/character/new')}
			class="mx-4 mt-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] p-4 text-white shadow-lg transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:ring-offset-2"
		>
			<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
				</svg>
			</div>
			<div class="text-left">
				<p class="font-bold text-lg">Create Your First Character</p>
				<p class="text-sm text-white/80">You need a character to make stickers</p>
			</div>
			<svg xmlns="http://www.w3.org/2000/svg" class="ml-auto h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
			</svg>
		</button>
	{/if}

	<!-- Main content: sticker grid -->
	<main class="flex-1 flex flex-col overflow-hidden">
		{#if isLoading}
			<div class="flex-1 flex flex-col items-center justify-center gap-3">
				<div class="w-8 h-8 border-3 border-[#C91977] border-t-transparent rounded-full animate-spin"></div>
				<div class="text-gray-500 text-sm">Loading your stickers...</div>
			</div>
		{:else}
			<StickerGrid
				items={feedItems}
				onselect={handleStickerSelect}
				onjobclick={handleJobClick}
				onloadmore={handleLoadMore}
				onrefresh={handleRefresh}
			/>
		{/if}
	</main>

	<!-- Bottom prompt input area -->
	<div class="sticky bottom-0 z-40 bg-white border-t border-gray-200 px-4 py-3">
		<!-- Relative container for positioning the inline selector above the input -->
		<div class="relative">
			<!-- Character Selector Inline (appears above the input) -->
			<CharacterSelectorInline
				bind:open={characterSelectorOpen}
				characters={userCharacters.map(c => ({ id: c.id, name: c.name, stickerImagePath: c.stickerImageUrl }))}
				filterText={mentionFilterText}
				onselect={handleCharacterSelect}
				onedit={handleEditCharacter}
				ondelete={handleDeleteCharacter}
				onadd={handleAddCharacter}
				onclose={() => characterSelectorOpen = false}
			/>

			<div class="flex items-center gap-2">
				<!-- @ button to open character selector (44px touch target for accessibility) -->
				<button
					type="button"
					class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FDF2F8] text-[#C91977] font-bold text-lg transition-colors hover:bg-pink-100 focus:outline-none focus:ring-2 focus:ring-[#C91977] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#FDF2F8]"
					onclick={() => characterSelectorOpen = !characterSelectorOpen}
					disabled={!hasCharacters}
					aria-label="Select character"
					aria-expanded={characterSelectorOpen}
				>
					@
				</button>

				<!-- Prompt input container (contenteditable with highlighting) -->
				<div class="relative flex-1 min-h-[44px] max-h-[104px]">
					<!-- Contenteditable input with @mention highlighting -->
					<div
						bind:this={inputElement}
						contenteditable={hasCharacters}
						role="textbox"
						tabindex={hasCharacters ? 0 : -1}
						aria-label="Meme prompt"
						aria-placeholder={currentPlaceholder}
						aria-multiline="true"
						aria-disabled={!hasCharacters}
						class="prompt-input w-full resize-none rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-base text-gray-800 focus:border-[#C91977] focus:outline-none focus:ring-2 focus:ring-[#C91977]/20 leading-6 min-h-[44px] max-h-[104px] overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words {!hasCharacters ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}"
						onkeydown={handlePromptKeydown}
						oninput={handlePromptInput}
					></div>
					<!-- Placeholder overlay (shown when empty) -->
					{#if !promptValue}
						<div
							class="pointer-events-none absolute inset-0 px-4 py-2.5 text-base text-gray-400 leading-6 whitespace-nowrap overflow-hidden text-ellipsis"
							aria-hidden="true"
						>
							{hasCharacters ? currentPlaceholder : 'Create a character to start...'}
						</div>
					{/if}
				</div>

				<!-- Send button (44px touch target for accessibility) -->
				<button
					type="button"
					class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#C91977] to-[#A91566] text-white shadow-md transition-all hover:shadow-lg hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#C91977] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-md"
					onclick={handleSendPrompt}
					disabled={!promptValue.trim() || isSending || !isOnline || !hasCharacters}
					aria-label={!hasCharacters ? 'Send prompt (create a character first)' : !isOnline ? 'Send prompt (unavailable while offline)' : 'Send prompt'}
					title={!hasCharacters ? 'Create a character first' : !isOnline ? 'Unavailable while offline' : undefined}
				>
					{#if isSending}
						<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
						</svg>
					{/if}
				</button>
			</div>
		</div>
	</div>
</div>

<!-- Sticker Detail Overlay -->
{#if detailModalOpen && selectedSticker}
	<StickerDetail
		sticker={{
			id: selectedSticker.id,
			imagePath: selectedSticker.imageUrl,
			prompt: selectedSticker.prompt,
			characterIds: selectedSticker.characterIds,
			createdAt: selectedSticker.createdAt
		}}
		{characterNames}
		{isOnline}
		onshare={handleShare}
		ondownload={handleDownload}
		onregenerate={handleRegenerate}
		ondelete={handleDelete}
		onclose={() => { detailModalOpen = false; selectedSticker = null; }}
	/>
{/if}

<!-- Job Detail Overlay (for loading/failed jobs) -->
{#if detailModalOpen && selectedJob}
	<JobDetail
		job={selectedJob}
		{characterNames}
		{isOnline}
		isRetryable={selectedJob.isRetryable ?? true}
		onretry={handleJobRetry}
		ondismiss={handleJobDismiss}
		onclose={() => { detailModalOpen = false; selectedJob = null; }}
	/>
{/if}

<style>
	/* Mention highlighting styles */
	.prompt-input :global(.mention-highlight) {
		color: #C91977;
		font-weight: 500;
	}

	/* Ensure contenteditable doesn't show outline in some browsers */
	.prompt-input:empty::before {
		content: '';
	}

	/* Hide scrollbar but keep functionality */
	.prompt-input {
		scrollbar-width: none; /* Firefox */
		-ms-overflow-style: none; /* IE and Edge */
	}

	.prompt-input::-webkit-scrollbar {
		display: none; /* Chrome, Safari, Opera */
	}
</style>
