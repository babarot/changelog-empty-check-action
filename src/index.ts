import * as core from '@actions/core';
import { checkChangelog } from './check-changelog';

async function run(): Promise<void> {
  try {
    core.info('Starting empty changelog check action...');

    const baseSha = process.env.GITHUB_BASE_REF || '';
    const headSha = process.env.GITHUB_HEAD_REF || '';

    core.info(`Base SHA: ${baseSha}`);
    core.info(`Head SHA: ${headSha}`);

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
