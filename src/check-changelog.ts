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

// Helper function to check if a similar comment already exists
async function hasExistingComment(github: ReturnType<typeof getOctokit>, prNumber: number, content: string): Promise<boolean> {
  try {
    const { data: comments } = await github.rest.issues.listComments({
      ...context.repo,
      issue_number: prNumber,
    });
    return comments.some(comment => comment.body === content);
  } catch (error) {
    core.warning('Failed to check existing comments, proceeding with comment creation');
    return false;
  }
}

export async function checkChangelog(options: CheckChangelogOptions): Promise<void> {
  core.info('Starting changelog check action...');

  const { baseSha, headSha } = options;
  core.info(`Checking changelog between ${baseSha} and ${headSha}`);

  // Get input parameters
  core.info('Reading input parameters...');
  const token = core.getInput('github-token', { required: true });
  const prNumber = parseInt(core.getInput('pull-request-number', { required: true }), 10);
  const labelName = core.getInput('label-name', { required: false }) || 'empty-changelog';
  const warningMessage = core.getInput('warning-message');
  const successMessage = core.getInput('success-message');

  core.info(`Input parameters: PR #${prNumber}, Label: ${labelName}`);
  core.debug(`Using token: ${token.slice(0, 4)}...`);

  // Initialize GitHub client
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
    core.debug(`Diff output:\n${diffOutput}`);

    // Read current CHANGELOG
    core.info('Reading current CHANGELOG.md...');
    const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
    const lines = changelog.split('\n');
    core.debug(`CHANGELOG.md has ${lines.length} lines`);

    // Detect new version headers
    const newHeaders = diffOutput
      .split('\n')
      .filter(line => line.startsWith('+## ['))
      .map(line => line.substring(1)); // Remove the '+' prefix

    core.debug(`Found ${newHeaders.length} new version headers`);
    core.debug('New headers:');
    newHeaders.forEach(header => core.debug(`  ${header}`));

    const emptyEntries: ChangelogEntry[] = [];

    // Check content for each new header
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
      // Set outputs
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

      // Add comment if warning message is provided
      if (warningMessage) {
        core.info('Checking for existing comments...');
        try {
          const commentExists = await hasExistingComment(github, prNumber, warningMessage);

          if (!commentExists) {
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
          } else {
            core.info('Similar comment already exists, skipping comment creation');
          }
        } catch (e) {
          core.warning('Failed to check existing comments, proceeding with comment creation');
          await github.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: prNumber,
            body: warningMessage
          });
        }
      }

      core.warning('Empty changelog entries detected');
    } else {
      // No empty entries found
      core.info('No empty changelog entries found');
      core.setOutput('has_empty_changelog', 'false');
      core.setOutput('empty_headers', '');

      // Check if label exists and remove if found
      core.info(`Checking for existing label "${labelName}" on PR #${prNumber}...`);
      try {
        const { data: labels } = await github.rest.issues.listLabelsOnIssue({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: prNumber
        });

        if (labels.some(label => label.name === labelName)) {
          core.info(`Found "${labelName}" label, attempting to remove...`);
          await github.rest.issues.removeLabel({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: prNumber,
            name: labelName
          });
          core.info('Label removed successfully');

          // Add success comment if message is provided
          if (successMessage) {
            const commentExists = await hasExistingComment(github, prNumber, successMessage);

            if (!commentExists) {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: prNumber,
                body: successMessage
              });
              core.info('Success comment added');
            } else {
              core.info('Success comment already exists, skipping comment creation');
            }
          }
        }
      } catch (e) {
        // Ignore 404 errors when label doesn't exist
        if (e instanceof Error && !e.message.includes('Label does not exist')) {
          core.error('Failed to check/remove label');
          core.error(e.message);
          throw e;
        }
      }
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
