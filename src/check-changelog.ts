import { exec } from '@actions/exec';
import { getOctokit } from '@actions/github';
import { Context } from '@actions/github/lib/context';
import type * as coreType from '@actions/core';
import * as fs from 'fs';

interface CheckChangelogOptions {
  github: ReturnType<typeof getOctokit>;
  context: Context;
  core: typeof coreType;
  baseSha: string;
  headSha: string;
}

interface ChangelogEntry {
  header: string;
  content: string[];
  lineNumber: number;
}

export async function checkChangelog(options: CheckChangelogOptions): Promise<void> {
  const { core, baseSha, headSha } = options;

  try {
    // Get diff with base branch
    let diffOutput = '';
    await exec('git', ['diff', baseSha, headSha, '--', 'CHANGELOG.md'], {
      listeners: {
        stdout: (data: Buffer) => {
          diffOutput += data.toString();
        }
      }
    });

    // Read current CHANGELOG
    const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
    const lines = changelog.split('\n');

    // Find new headers in diff
    const newHeaders = diffOutput
      .split('\n')
      .filter(line => line.startsWith('+## ['))
      .map(line => line.substring(1)); // Remove the '+' prefix

    const emptyEntries: ChangelogEntry[] = [];

    for (const header of newHeaders) {
      const headerIndex = lines.findIndex(line => line === header);
      if (headerIndex === -1) continue;

      const nextHeaderIndex = lines
        .slice(headerIndex + 1)
        .findIndex(line => line.startsWith('## ['));

      const endIndex = nextHeaderIndex === -1
        ? lines.length
        : headerIndex + 1 + nextHeaderIndex;

      const content = lines
        .slice(headerIndex + 1, endIndex)
        .filter(line => line.trim() && !line.startsWith('## ['));

      if (content.length === 0) {
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

      const warningMessage = [
        '🚨 Empty changelog entries detected:',
        ...headers.map(h => `- ${h} (No content provided)`)
      ].join('\n');

      core.warning(warningMessage);
    } else {
      core.setOutput('has_empty_changelog', 'false');
      core.setOutput('empty_headers', '');
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Action failed: ${error.message}`);
    } else {
      core.setFailed('Action failed with unknown error');
    }
  }
}
