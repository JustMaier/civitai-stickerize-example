import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { generationJobs } from '$lib/server/db/schema';
import { eq, and, or, desc, inArray } from 'drizzle-orm';
import { parseCharacterIds } from '$lib/server/utils';

const VALID_STATUSES = ['queued', 'processing', 'complete', 'failed'] as const;
type JobStatus = typeof VALID_STATUSES[number];

/**
 * GET /api/jobs
 * List user's jobs, optionally filtered by status
 * Query params:
 *   - status: comma-separated list of statuses (default: 'queued,processing')
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse status filter
    const statusParam = url.searchParams.get('status') || 'queued,processing';
    const requestedStatuses = statusParam.split(',').map(s => s.trim()).filter(Boolean);

    // Validate statuses
    const validStatuses = requestedStatuses.filter((s): s is JobStatus =>
      VALID_STATUSES.includes(s as JobStatus)
    );

    if (validStatuses.length === 0) {
      return json({ error: 'Invalid status filter' }, { status: 400 });
    }

    // Build status conditions
    const statusConditions = validStatuses.map(s => eq(generationJobs.status, s));

    // Fetch jobs
    const jobs = await db.select({
      id: generationJobs.id,
      type: generationJobs.type,
      status: generationJobs.status,
      userPrompt: generationJobs.userPrompt,
      characterIds: generationJobs.characterIds,
      resultId: generationJobs.resultId,
      error: generationJobs.error,
      isRetryable: generationJobs.isRetryable,
      createdAt: generationJobs.createdAt,
      updatedAt: generationJobs.updatedAt
    })
      .from(generationJobs)
      .where(and(
        eq(generationJobs.userId, user.id),
        or(...statusConditions)
      ))
      .orderBy(desc(generationJobs.createdAt));

    // Parse characterIds for each job
    const jobsWithParsedIds = jobs.map(job => ({
      ...job,
      characterIds: job.characterIds ? parseCharacterIds(job.characterIds) : null
    }));

    return json({ jobs: jobsWithParsedIds });
  } catch (error) {
    console.error('Job listing error:', error);
    return json({ error: 'Something went wrong' }, { status: 500 });
  }
};
