<script module lang="ts">
	import type { ComponentPreview } from '$lib/testing/preview.js';

	export const preview: ComponentPreview = {
		name: 'PhotoUpload',
		description: 'Photo picker for character creation with library and camera options',
		layout: 'column',
		variants: [
			{ label: 'Default', props: {} },
			{ label: 'Disabled', props: { disabled: true } },
			{ label: 'With Error', props: { error: 'Failed to access photo library' } },
			{
				label: 'Library Permission Denied',
				props: { libraryPermissionDenied: true }
			},
			{
				label: 'Camera Permission Denied',
				props: { cameraPermissionDenied: true }
			},
			{
				label: 'Both Permissions Denied',
				props: { libraryPermissionDenied: true, cameraPermissionDenied: true }
			}
		]
	};

	// Note: 'isCompressing' state cannot be set via props as it's internal.
	// The compressing state is shown when a file is being processed.
</script>

<script lang="ts">
	import { browser } from '$app/environment';
	import imageCompression from 'browser-image-compression';
	import Button from '$lib/components/ui/Button.svelte';
	import { Image, Camera, X, AlertCircle, Loader2 } from 'lucide-svelte';

	interface Props {
		onselect?: (file: File) => void;
		onclear?: () => void;
		disabled?: boolean;
		error?: string;
		libraryPermissionDenied?: boolean;
		cameraPermissionDenied?: boolean;
		/** Initial file to display (for restoring state) */
		initialFile?: File | null;
		/** Initial preview URL (for restoring state, avoids re-creating object URL) */
		initialPreviewUrl?: string | null;
	}

	let {
		onselect,
		onclear,
		disabled = false,
		error,
		libraryPermissionDenied = false,
		cameraPermissionDenied = false,
		initialFile = null,
		initialPreviewUrl = null
	}: Props = $props();

	let libraryInput: HTMLInputElement | undefined = $state();
	let cameraInput: HTMLInputElement | undefined = $state();
	let previewUrl: string | null = $state(initialPreviewUrl);
	let validationError: string | null = $state(null);
	let permissionAlert: string | null = $state(null);
	let isCompressing: boolean = $state(false);
	// Track if we created the URL ourselves (vs received from parent)
	let ownsPreviewUrl: boolean = $state(!initialPreviewUrl);

	const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
	// Accept JPEG only (iOS auto-converts HEIC to JPEG when not in accept)
	const ALLOWED_TYPES = ['image/jpeg'];
	const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg'];

	// Compression options for browser-image-compression
	const COMPRESSION_OPTIONS = {
		maxSizeMB: 1, // Target max file size
		maxWidthOrHeight: 2048, // Max dimension (matches server-side)
		useWebWorker: true, // Use web worker to avoid blocking UI
		fileType: 'image/jpeg' as const
	};

	function validateFile(file: File): string | null {
		const fileName = file.name.toLowerCase();
		const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext));
		const hasValidType = ALLOWED_TYPES.includes(file.type) || file.type === '';

		if (!hasValidExtension && !hasValidType) {
			return 'Please upload a JPEG image (.jpg or .jpeg).';
		}

		if (file.size > MAX_FILE_SIZE) {
			return 'Photo is too large (max 10MB). Please choose a smaller file.';
		}

		return null;
	}

	async function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		// Reset errors
		validationError = null;
		permissionAlert = null;

		// Validate file
		const validationResult = validateFile(file);
		if (validationResult) {
			validationError = validationResult;
			input.value = '';
			return;
		}

		// Clean up previous preview URL (only if we created it)
		if (previewUrl && ownsPreviewUrl) {
			URL.revokeObjectURL(previewUrl);
		}

		// Compress image before passing to parent
		isCompressing = true;
		try {
			const compressedFile = await imageCompression(file, COMPRESSION_OPTIONS);

			// Create preview from compressed file
			previewUrl = URL.createObjectURL(compressedFile);
			ownsPreviewUrl = true;

			// Notify parent with compressed file
			onselect?.(compressedFile);
		} catch (compressionError) {
			console.error('Image compression failed:', compressionError);
			// Fall back to original file if compression fails
			previewUrl = URL.createObjectURL(file);
			ownsPreviewUrl = true;
			onselect?.(file);
		} finally {
			isCompressing = false;
		}

		// Reset input to allow selecting same file again
		input.value = '';
	}

	function clearSelection(event: Event) {
		event.stopPropagation();
		if (previewUrl && ownsPreviewUrl) {
			URL.revokeObjectURL(previewUrl);
		}
		previewUrl = null;
		ownsPreviewUrl = true; // Reset for next selection
		validationError = null;
		permissionAlert = null;
		onclear?.();
	}

	function openLibrary() {
		if (disabled || libraryPermissionDenied) {
			if (libraryPermissionDenied) {
				permissionAlert =
					'Photo library access required to select photos. Please enable in your device settings.';
			}
			return;
		}
		permissionAlert = null;
		libraryInput?.click();
	}

	function openCamera() {
		if (disabled || cameraPermissionDenied) {
			if (cameraPermissionDenied) {
				permissionAlert =
					'Camera access required to take photos. Please enable in your device settings.';
			}
			return;
		}
		permissionAlert = null;
		cameraInput?.click();
	}

	function dismissAlert() {
		permissionAlert = null;
	}

	// Detect if on mobile for camera capture behavior
	let isMobile = $derived(
		browser &&
			/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
	);

	// Cleanup on unmount (only for URLs we created)
	$effect(() => {
		const url = previewUrl;
		const owns = ownsPreviewUrl;
		return () => {
			if (url && owns) {
				URL.revokeObjectURL(url);
			}
		};
	});

	let displayError = $derived(error || validationError);
	let libraryDisabled = $derived(disabled || libraryPermissionDenied);
	let cameraDisabled = $derived(disabled || cameraPermissionDenied);
</script>

<div class="flex flex-col gap-4">
	<!-- Hidden file inputs -->
	<!-- Library input: accepts JPEG only (iOS auto-converts HEIC when not in accept) -->
	<input
		bind:this={libraryInput}
		type="file"
		accept="image/jpeg,.jpg,.jpeg"
		class="hidden"
		onchange={handleFileSelect}
		disabled={libraryDisabled}
	/>
	<!-- Camera input: on mobile opens camera with front-facing preference, on desktop falls back to file picker -->
	{#if isMobile}
		<input
			bind:this={cameraInput}
			type="file"
			accept="image/*"
			capture="user"
			class="hidden"
			onchange={handleFileSelect}
			disabled={cameraDisabled}
		/>
	{:else}
		<!-- Desktop fallback: just open file picker -->
		<input
			bind:this={cameraInput}
			type="file"
			accept="image/jpeg,.jpg,.jpeg"
			class="hidden"
			onchange={handleFileSelect}
			disabled={cameraDisabled}
		/>
	{/if}

	<!-- Permission alert -->
	{#if permissionAlert}
		<div
			class="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4"
			role="alert"
		>
			<AlertCircle class="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
			<div class="flex-1">
				<p class="text-sm text-amber-800">{permissionAlert}</p>
			</div>
			<button
				type="button"
				onclick={dismissAlert}
				class="flex-shrink-0 rounded p-1 text-amber-600 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
				aria-label="Dismiss alert"
			>
				<X class="h-4 w-4" />
			</button>
		</div>
	{/if}

	<!-- Photo zone -->
	<div class="relative">
		<button
			type="button"
			class="flex aspect-square w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-colors {libraryDisabled ||
			isCompressing
				? 'cursor-not-allowed border-gray-200 bg-gray-50'
				: previewUrl
					? 'border-[#C91977] bg-pink-50'
					: 'border-gray-300 bg-white hover:border-[#C91977] hover:bg-pink-50'}"
			onclick={openLibrary}
			disabled={libraryDisabled || isCompressing}
			aria-label={previewUrl ? 'Change photo' : 'Select photo from library'}
		>
			{#if isCompressing}
				<!-- Compressing state -->
				<div class="flex flex-col items-center justify-center gap-3 text-gray-400">
					<Loader2 size={48} strokeWidth={1.5} class="animate-spin" />
					<span class="text-sm font-medium">Optimizing photo...</span>
				</div>
			{:else if previewUrl}
				<!-- Preview -->
				<img
					src={previewUrl}
					alt="Your selected upload"
					class="h-full w-full rounded-xl object-cover p-2"
				/>
			{:else}
				<!-- Placeholder -->
				<div
					class="flex flex-col items-center justify-center gap-3 {libraryDisabled
						? 'text-gray-300'
						: 'text-gray-400'}"
				>
					<Image size={48} strokeWidth={1.5} />
					<span class="text-sm font-medium">Tap to select a photo</span>
				</div>
			{/if}
		</button>
		<!-- Clear button (outside the photo zone button) -->
		{#if previewUrl && !disabled}
			<button
				type="button"
				class="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-gray-800 text-white shadow-lg transition-colors hover:bg-gray-700"
				onclick={clearSelection}
				aria-label="Remove selected photo"
			>
				<X size={16} />
			</button>
		{/if}
	</div>

	<!-- Error message -->
	{#if displayError}
		<p class="text-center text-sm text-red-500" role="alert">{displayError}</p>
	{/if}

	<!-- Action buttons -->
	<div class="flex gap-3">
		<Button
			variant="outlined"
			onclick={openLibrary}
			disabled={libraryDisabled || isCompressing}
			class="flex-1 {libraryPermissionDenied ? 'opacity-50' : ''}"
		>
			<span class="flex items-center justify-center gap-2">
				<Image size={18} />
				Library
			</span>
		</Button>
		<Button
			variant="primary"
			onclick={openCamera}
			disabled={cameraDisabled || isCompressing}
			class="flex-1 {cameraPermissionDenied ? 'opacity-50' : ''}"
		>
			<span class="flex items-center justify-center gap-2">
				<Camera size={18} />
				Camera
			</span>
		</Button>
	</div>
</div>
