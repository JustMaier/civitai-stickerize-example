import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { generationJobs } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return json({ error: 'Job ID is required' }, { status: 400 });
    }

    // Fetch job, ensuring it belongs to the current user
    const jobResults = await db.select()
      .from(generationJobs)
      .where(and(
        eq(generationJobs.id, id),
        eq(generationJobs.userId, user.id)
      ))
      .limit(1);

    const job = jobResults[0];

    if (!job) {
      return json({ error: 'Job not found' }, { status: 404 });
    }

    // Return job status with appropriate fields based on status
    const response: Record<string, unknown> = {
      id: job.id,
      type: job.type,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      attempts: job.attempts
    };

    // For character jobs, include the character name from metadata
    if (job.type === 'character' && job.refinedPrompt) {
      try {
        const metadata = JSON.parse(job.refinedPrompt);
        if (metadata.name) {
          response.characterName = metadata.name;
        }
      } catch {
        // Old format: refinedPrompt is the name directly
        response.characterName = job.refinedPrompt;
      }
    }

    if (job.status === 'complete') {
      response.resultId = job.resultId;
      response.costCents = (job.llmCostCents || 0) + (job.imageCostCents || 0);
    }

    if (job.status === 'failed') {
      response.error = job.error;
      response.isRetryable = job.isRetryable;
    }

    return json(response);
  } catch (error) {
    console.error('Job polling error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};
