import { json, type RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { generationJobs } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { existsSync } from 'fs';
import { createCharacterJob } from '$lib/server/job-processor';

/**
 * POST /api/jobs/:id/retry
 * Retry a failed character generation job using the same photo
 */
export async function POST({ params, locals }: RequestEvent) {
  try {
    const user = locals.user;
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return json({ error: 'Job ID is required' }, { status: 400 });
    }

    // Fetch the failed job
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

    // Only allow retrying failed character jobs
    if (job.status !== 'failed') {
      return json({ error: 'Can only retry failed jobs' }, { status: 400 });
    }

    if (job.type !== 'character') {
      return json({ error: 'Can only retry character generation jobs' }, { status: 400 });
    }

    // Check if the photo still exists
    const photoPath = job.userPrompt; // Photo path is stored in userPrompt
    if (!photoPath || !existsSync(photoPath)) {
      return json({
        error: 'Original photo no longer available. Please upload a new photo.',
        code: 'photo_not_found'
      }, { status: 410 }); // 410 Gone
    }

    // Get the character name from refinedPrompt (where it was stored)
    const characterName = job.refinedPrompt || 'New Character';

    // Create a new job with the same photo
    const newJobId = await createCharacterJob(user.id, photoPath);

    // Update the new job with the character name
    await db.update(generationJobs)
      .set({ refinedPrompt: characterName })
      .where(eq(generationJobs.id, newJobId));

    return json({ jobId: newJobId }, { status: 202 });
  } catch (error) {
    console.error('Job retry error:', error);
    return json({ error: 'Something went wrong' }, { status: 500 });
  }
};
