import { exec } from '@actions/exec';
import { getOctokit, context } from '@actions/github';
import * as core from '@actions/core';
import * as fs from 'fs';

interface CheckChangelogOptions {
  baseSha: string;
  headSha: string;
}

interface ChangelogEntry {
  header: string;
  content: string[];
  lineNumber: number;
}

export async function checkChangelog(options: CheckChangelogOptions): Promise<void> {
  core.info('Starting changelog check action...');

  const { baseSha, headSha } = options;
  core.info(`Checking changelog between ${baseSha} and ${headSha}`);

  core.info('Reading input parameters...');
  const token = core.getInput('github-token', { required: true });
  const prNumber = parseInt(core.getInput('pull-request-number', { required: true }), 10);
  const labelName = core.getInput('label-name', { required: false }) || 'empty-changelog';

  core.info(`Input parameters: PR #${prNumber}, Label: ${labelName}`);
  core.debug(`Using token: ${token.slice(0, 4)}...`);

  core.info('Initializing GitHub client...');
  const github = getOctokit(token);
  core.debug('GitHub client initialized');

  try {
    // Get diff with base branch
    core.info('Getting diff for CHANGELOG.md...');
    let diffOutput = '';
    await exec('git', ['diff', baseSha, headSha, '--', 'CHANGELOG.md'], {
      listeners: {
        stdout: (data: Buffer) => {
          diffOutput += data.toString();
        }
      }
    });
    core.debug(`Diff output length: ${diffOutput.length} characters`);

    // Read current CHANGELOG
    core.info('Reading current CHANGELOG.md...');
    const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
    const lines = changelog.split('\n');
    core.debug(`CHANGELOG.md has ${lines.length} lines`);

    // Find new headers in diff
    core.info('Analyzing changelog entries...');
    const newHeaders = diffOutput
      .split('\n')
      .filter(line => line.startsWith('+## ['))
      .map(line => line.substring(1)); // Remove the '+' prefix

    core.debug(`Found ${newHeaders.length} new version headers`);
    core.debug('New headers:');
    newHeaders.forEach(header => core.debug(`  ${header}`));

    const emptyEntries: ChangelogEntry[] = [];

    for (const header of newHeaders) {
      core.debug(`Checking content for header: ${header}`);
      const headerIndex = lines.findIndex(line => line === header);
      if (headerIndex === -1) {
        core.debug(`Header not found in current CHANGELOG: ${header}`);
        continue;
      }

      const nextHeaderIndex = lines
        .slice(headerIndex + 1)
        .findIndex(line => line.startsWith('## ['));

      const endIndex = nextHeaderIndex === -1
        ? lines.length
        : headerIndex + 1 + nextHeaderIndex;

      const content = lines
        .slice(headerIndex + 1, endIndex)
        .filter(line => line.trim() && !line.startsWith('## ['));

      core.debug(`Found ${content.length} content lines for header ${header}`);

      if (content.length === 0) {
        core.debug(`Empty content detected for header: ${header}`);
        emptyEntries.push({
          header: header.trim(),
          content: [],
          lineNumber: headerIndex + 1
        });
      }
    }

    if (emptyEntries.length > 0) {
      const headers = emptyEntries.map(entry => entry.header);
      core.setOutput('has_empty_changelog', 'true');
      core.setOutput('empty_headers', headers.join('\n'));

      core.info(`Found ${emptyEntries.length} empty changelog entries`);

      // Add label to PR
      core.info(`Adding label "${labelName}" to PR #${prNumber}...`);
      core.debug(`Repository: ${context.repo.owner}/${context.repo.repo}`);
      try {
        const labelResponse = await github.rest.issues.addLabels({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: prNumber,
          labels: [labelName]
        });
        core.debug(`Label API Response: ${JSON.stringify(labelResponse)}`);
        core.info('Label added successfully');
      } catch (e) {
        core.error('Failed to add label');
        core.error(e instanceof Error ? e.message : 'Unknown error during label addition');
        throw e;
      }

      const warningMessage = [
        '🚨 Empty changelog entries detected:',
        ...headers.map(h => `- ${h} (No content provided)`)
      ].join('\n');

      // Add comment to PR
      core.info('Adding comment to PR...');
      try {
        const commentResponse = await github.rest.issues.createComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: prNumber,
          body: warningMessage
        });
        core.debug(`Comment API Response: ${JSON.stringify(commentResponse)}`);
        core.info('Comment added successfully');
      } catch (e) {
        core.error('Failed to add comment');
        core.error(e instanceof Error ? e.message : 'Unknown error during comment addition');
        throw e;
      }

      core.warning(warningMessage);
    } else {
      core.info('No empty changelog entries found');
      core.setOutput('has_empty_changelog', 'false');
      core.setOutput('empty_headers', '');
    }
  } catch (error) {
    core.error('An error occurred during changelog check');
    if (error instanceof Error) {
      core.error(`Error details: ${error.message}`);
      core.error(error.stack || 'No stack trace available');
      core.setFailed(`Action failed: ${error.message}`);
    } else {
      core.error('Unknown error type received');
      core.setFailed('Action failed with unknown error');
    }
  }
}
