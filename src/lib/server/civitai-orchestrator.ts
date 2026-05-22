/**
 * Civitai orchestrator — primary image-gen path.
 *
 * Resolves an orchestrator client per-job (the user's own OAuth token if they
 * connected a Civitai account, otherwise the server-wide `CIVITAI_API_TOKEN`)
 * and runs a Nano Banana 2 `imageGen` workflow. The result is shaped to match
 * the Gemini fallback's `GenerationResult` so `job-processor` stays
 * provider-agnostic.
 */

import { existsSync } from 'fs';
import { env } from '$env/dynamic/private';
import {
  createOrchestratorClient,
  extractImageUrls,
  isTerminal,
  OrchestratorError,
  pollWorkflow,
  submitWorkflow,
  type OrchestratorClient,
  type WorkflowSnapshot,
} from '@civitai/app-sdk/orchestrator';
import { getCivitaiOrchestratorUrl, loadCivitaiSession } from '$lib/server/auth/civitai';
import { encodeFileToBase64 } from './ffmpeg';
import type { GenerationConfig, GenerationResult } from './image-generation';

const STICKERIZE_TAG = 'stickerize';

type CivitaiAspectRatio =
  | '21:9'
  | '16:9'
  | '3:2'
  | '4:3'
  | '5:4'
  | '1:1'
  | '4:5'
  | '3:4'
  | '2:3'
  | '9:16';

type CivitaiResolution = '1K' | '2K' | '4K';

interface CivitaiGenerateInput {
  prompt: string;
  referenceImages?: string[];
  aspectRatio?: CivitaiAspectRatio;
  numImages?: number; // 1-4
  resolution?: CivitaiResolution;
}

/**
 * Get an orchestrator client scoped to the user's connected Civitai account,
 * or `null` if the user hasn't connected one (or the connection expired).
 */
export async function getCivitaiClient(userId: string): Promise<OrchestratorClient | null> {
  const tokens = await loadCivitaiSession(userId);
  if (!tokens) return null;
  return createOrchestratorClient({
    accessToken: tokens.access_token,
    baseUrl: getCivitaiOrchestratorUrl(),
  });
}

function getCivitaiAppToken(): string | null {
  return env.CIVITAI_API_TOKEN || null;
}

function getCivitaiAppClient(): OrchestratorClient | null {
  const token = getCivitaiAppToken();
  if (!token) return null;
  return createOrchestratorClient({
    accessToken: token,
    baseUrl: getCivitaiOrchestratorUrl(),
  });
}

/**
 * Marker error for a Buzz-shortage failure. The job processor treats this as
 * non-retryable — re-running the same workflow won't make Buzz appear.
 */
export class InsufficientBuzzError extends Error {
  readonly code = 'insufficient_buzz' as const;
  constructor(message = "You don't have enough Buzz to run this generation. Top up at civitai.com.") {
    super(message);
    this.name = 'InsufficientBuzzError';
  }
}

/**
 * Detect the various shapes Civitai's orchestrator can use to signal that the
 * caller is out of Buzz: HTTP 402, a `transactions.insufficientBuzz=true` flag
 * in the response body, or any error message that mentions "buzz".
 */
function isInsufficientBuzz(err: unknown): boolean {
  if (!(err instanceof OrchestratorError)) return false;
  if (err.status === 402) return true;
  const body = err.body as
    | { transactions?: { insufficientBuzz?: boolean }; message?: string; error?: string }
    | null
    | undefined;
  if (body?.transactions?.insufficientBuzz === true) return true;
  const text = body?.message ?? body?.error ?? err.message;
  return typeof text === 'string' && /insufficient[ _-]?buzz|not enough buzz/i.test(text);
}

export interface ResolvedCivitaiClient {
  client: OrchestratorClient;
  /** Whose Buzz pays for this call. */
  owner: 'user' | 'app';
}

/**
 * Pick the orchestrator client to use for a generation:
 *   1. The user's own OAuth-connected Civitai account, if any.
 *   2. Otherwise, the server-wide `CIVITAI_API_TOKEN` if configured.
 *   3. Otherwise, `null` — caller should fall back to the Gemini path.
 */
export async function getCivitaiClientForUser(userId: string): Promise<ResolvedCivitaiClient | null> {
  const userClient = await getCivitaiClient(userId);
  if (userClient) return { client: userClient, owner: 'user' };
  const appClient = getCivitaiAppClient();
  if (appClient) return { client: appClient, owner: 'app' };
  return null;
}

/**
 * Run an `imageGen` workflow on Civitai's orchestrator and return the result
 * in the same shape the Gemini path produces.
 *
 * Errors surface to the caller — the product call is that auth / scope / Buzz
 * failures should be visible to the user rather than silently fall through.
 */
export async function generateImageViaCivitai(
  client: OrchestratorClient,
  prompt: string,
  referenceImages: string[] = [],
  config: GenerationConfig = {},
): Promise<GenerationResult> {
  try {
    const aspectRatio = (config.aspectRatio as CivitaiAspectRatio | undefined) ?? '1:1';
    const resolution = (config.imageSize as CivitaiResolution | undefined) ?? '2K';

    const body = await buildBody({
      prompt,
      referenceImages,
      aspectRatio,
      resolution,
      numImages: 1,
    });

    const submitted = await submitWorkflow(client, body);
    const workflowId = submitted.id;
    if (!workflowId) {
      throw new Error('Civitai orchestrator did not return a workflow id');
    }

    const final = isTerminal(submitted)
      ? submitted
      : await pollWorkflow(client, workflowId, { timeoutMs: 60_000 });

    if (final.status !== 'succeeded') {
      throw new Error(`Civitai workflow ${final.status}: ${workflowId}`);
    }

    const buzzCost = typeof final.cost?.total === 'number' ? final.cost.total : undefined;
    if (typeof buzzCost === 'number') {
      console.log(`[Civitai Gen] workflow ${workflowId} succeeded, cost=${buzzCost} Buzz`);
    }

    const url = pickFirstImageUrl(final);
    if (!url) {
      throw new Error('Civitai workflow succeeded but returned no image url');
    }

    const { data, mimeType } = await downloadAsBase64(url);
    return { success: true, imageData: data, mimeType, buzzCost };
  } catch (error) {
    if (isInsufficientBuzz(error)) {
      console.warn('[Civitai Gen] insufficient buzz');
      return {
        success: false,
        code: 'insufficient_buzz',
        error: "You don't have enough Buzz to run this generation. Top up at civitai.com.",
      };
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Civitai Gen] failed:', message);
    return { success: false, error: message };
  }
}

function pickFirstImageUrl(snapshot: WorkflowSnapshot): string | null {
  const urls = extractImageUrls(snapshot);
  return urls[0] || null;
}

async function downloadAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download orchestrator image (${res.status} ${res.statusText})`);
  }
  const mimeType = res.headers.get('content-type') || 'image/png';
  const buf = Buffer.from(await res.arrayBuffer());
  return { data: buf.toString('base64'), mimeType };
}

/**
 * Normalize the reference-image inputs into the shape the orchestrator
 * accepts. Local file paths get encoded to data URLs in place; URLs and
 * already-encoded data URLs pass through.
 */
async function normalizeReferenceImages(images: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const img of images) {
    if (!img) continue;
    if (img.startsWith('data:') || img.startsWith('http://') || img.startsWith('https://')) {
      out.push(img);
      continue;
    }
    if (existsSync(img)) {
      const encoded = await encodeFileToBase64(img);
      if (encoded.success && encoded.data) {
        const mime = encoded.mimeType || 'image/png';
        out.push(`data:${mime};base64,${encoded.data}`);
      } else {
        console.warn(`[civitai-orchestrator] Failed to encode reference image: ${img}`);
      }
      continue;
    }
    // Assume raw base64 if it doesn't look like anything else.
    out.push(img);
  }
  return out.slice(0, 10);
}

/**
 * Build a Nano Banana 2 `imageGen` workflow body.
 *
 * Constructed manually because `@civitai/app-sdk@0.1.0` only ships
 * `buildTextToImageBody` (for SDXL) — no helper exists for the `imageGen`
 * workflow type used by Nano Banana 2 yet.
 */
async function buildBody(input: CivitaiGenerateInput): Promise<unknown> {
  const images = input.referenceImages?.length
    ? await normalizeReferenceImages(input.referenceImages)
    : undefined;

  return {
    steps: [
      {
        $type: 'imageGen',
        name: 'step_0',
        timeout: '00:10:00',
        input: {
          engine: 'google',
          model: 'nano-banana-2',
          prompt: input.prompt,
          ...(images && images.length > 0 ? { images } : {}),
          aspectRatio: input.aspectRatio ?? '1:1',
          numImages: Math.max(1, Math.min(4, input.numImages ?? 1)),
          resolution: input.resolution ?? '2K',
        },
      },
    ],
    tags: [STICKERIZE_TAG],
  };
}
