import * as core from '@actions/core';
import { context } from '@actions/github';
import { exec } from '@actions/exec';
import { checkChangelog } from './check-changelog';

export async function run(): Promise<void> {
  try {
    core.info('Starting empty changelog check action...');

    const prNumber = parseInt(core.getInput('pull-request-number', { required: true }), 10);
    core.info(`Pull Request Number: ${prNumber}`);

    let headSha = '';
    try {
      await exec('git', ['rev-parse', 'HEAD'], {
        listeners: {
          stdout: (data: Buffer) => {
            headSha += data.toString().trim();
          }
        }
      });
    } catch (error) {
      core.debug('Failed to get HEAD SHA, falling back to environment variable');
      headSha = process.env.GITHUB_SHA || context.sha;
    }

    let baseSha = '';
    try {
      await exec('git', ['rev-parse', 'HEAD^'], {
        listeners: {
          stdout: (data: Buffer) => {
            baseSha += data.toString().trim();
          }
        }
      });
    } catch (error) {
      core.debug('Failed to get BASE SHA, falling back to environment variable');
      baseSha = process.env.BASE_SHA || context.payload.before || '';
    }

    core.info(`Using base SHA: ${baseSha}`);
    core.info(`Using head SHA: ${headSha}`);

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

if (require.main === module) {
  run();
}
