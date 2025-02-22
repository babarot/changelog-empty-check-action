import * as core from '@actions/core';
import { context } from '@actions/github';
import { checkChangelog } from './check-changelog';

export async function run(): Promise<void> {
  try {
    core.info('Starting empty changelog check action...');

    const baseSha = context.payload.pull_request?.base.sha || '';
    const headSha = context.payload.pull_request?.head.sha || '';

    core.info(`Base SHA: ${baseSha}`);
    core.info(`Head SHA: ${headSha}`);

    if (!baseSha || !headSha) {
      throw new Error('Could not determine base or head SHA');
    }

    await checkChangelog({
      baseSha,
      headSha
    });

  } catch (error) {
    core.error('Action failed with an uncaught error');
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('Unknown error occurred');
    }
  }
}

run();
