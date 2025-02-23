import { checkChangelog } from '../src/check-changelog';
import { getOctokit } from '@actions/github';
import * as core from '@actions/core';
import * as fs from 'fs';

jest.mock('@actions/core');
jest.mock('fs');
jest.mock('@actions/exec', () => ({
  exec: jest.fn()
}));

jest.mock('@actions/github', () => ({
  getOctokit: jest.fn(),
  context: {
    repo: {
      owner: 'babarot',
      repo: 'test-repo'
    }
  }
}));

describe('checkChangelog', () => {
  const mockCore = core as jest.Mocked<typeof core>;
  const mockOctokit = getOctokit as jest.MockedFunction<typeof getOctokit>;

  const defaultWarningMessage = '🚨 Empty changelog entries detected';
  const defaultSuccessMessage = '✅ Changelog entry has been filled';

  const baseGitHubClient = {
    rest: {
      issues: {
        addLabels: jest.fn().mockResolvedValue({}),
        createComment: jest.fn().mockResolvedValue({}),
        listComments: jest.fn().mockResolvedValue({ data: [] }),
        listLabelsOnIssue: jest.fn().mockResolvedValue({ data: [] }),
        removeLabel: jest.fn().mockResolvedValue({})
      }
    }
  };

  const setupExecMock = (diff: string) => {
    const execMock = jest.requireMock('@actions/exec').exec;
    execMock.mockImplementation(async (_cmd: string, _args: string[], options?: { listeners?: { stdout?: (data: Buffer) => void } }) => {
      if (options?.listeners?.stdout) {
        options.listeners.stdout(Buffer.from(diff));
      }
      return 0;
    });
    return execMock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockCore.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'github-token':
          return 'dummy-token';
        case 'pull-request-number':
          return '1';
        case 'label-name':
          return 'empty-changelog';
        case 'warning-message':
          return defaultWarningMessage;
        case 'success-message':
          return defaultSuccessMessage;
        default:
          return '';
      }
    });

    mockOctokit.mockReturnValue(baseGitHubClient as any);
  });

  it('should handle label addition error', async () => {
    setupExecMock(`+## [v1.4.2]`);
    (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
`);

    const client = {
      ...baseGitHubClient,
      rest: {
        issues: {
          ...baseGitHubClient.rest.issues,
          addLabels: jest.fn().mockRejectedValue(new Error('Failed to add label'))
        }
      }
    };
    mockOctokit.mockReturnValue(client as any);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.error).toHaveBeenCalledWith('Failed to add label');
    expect(mockCore.setFailed).toHaveBeenCalledWith('Action failed: Failed to add label');
  });

  it('should handle unknown error types', async () => {
    setupExecMock(`+## [v1.4.2]`);
    (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
`);

    const client = {
      ...baseGitHubClient,
      rest: {
        issues: {
          ...baseGitHubClient.rest.issues,
          addLabels: jest.fn().mockRejectedValue('Unknown error')
        }
      }
    };
    mockOctokit.mockReturnValue(client as any);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.error).toHaveBeenCalledWith('Unknown error during label addition');
  });

  it('should handle comment creation error', async () => {
    setupExecMock(`+## [v1.4.2]`);
    (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
`);

    const client = {
      ...baseGitHubClient,
      rest: {
        issues: {
          ...baseGitHubClient.rest.issues,
          createComment: jest.fn().mockRejectedValue(new Error('Failed to create comment'))
        }
      }
    };
    mockOctokit.mockReturnValue(client as any);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.error).toHaveBeenCalledWith('Failed to add comment');
    expect(mockCore.error).toHaveBeenCalledWith('Failed to create comment');
  });

  it('should handle label check error with non-404 status', async () => {
    setupExecMock(`+## [v1.4.2]\n+### Added\n+- New feature`);
    (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
### Added
- New feature
`);

    const error = new Error('API rate limit exceeded');
    const client = {
      ...baseGitHubClient,
      rest: {
        issues: {
          ...baseGitHubClient.rest.issues,
          listLabelsOnIssue: jest.fn().mockRejectedValue(error)
        }
      }
    };
    mockOctokit.mockReturnValue(client as any);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.error).toHaveBeenCalledWith('Failed to check/remove label');
    expect(mockCore.error).toHaveBeenCalledWith('API rate limit exceeded');
    expect(mockCore.setFailed).toHaveBeenCalledWith('Action failed: API rate limit exceeded');
  });

  it('should handle label removal error', async () => {
    setupExecMock(`+## [v1.4.2]\n+### Added\n+- New feature`);
    (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
### Added
- New feature
`);

    const client = {
      ...baseGitHubClient,
      rest: {
        issues: {
          ...baseGitHubClient.rest.issues,
          listLabelsOnIssue: jest.fn().mockResolvedValue({
            data: [{ name: 'empty-changelog' }]
          }),
          removeLabel: jest.fn().mockRejectedValue(new Error('Failed to remove label'))
        }
      }
    };
    mockOctokit.mockReturnValue(client as any);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.error).toHaveBeenCalledWith('Failed to check/remove label');
    expect(mockCore.error).toHaveBeenCalledWith('Failed to remove label');
  });

  it('should handle multiple version headers with mixed content', async () => {
    setupExecMock(`
+## [v1.4.2]
+### Added
+- New feature
+## [v1.4.1]
+## [v1.4.0]
+### Fixed
+- Bug fix`);

    (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
### Added
- New feature
## [v1.4.1]
## [v1.4.0]
### Fixed
- Bug fix
`);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.setOutput).toHaveBeenCalledWith('has_empty_changelog', 'true');
    expect(mockCore.setOutput).toHaveBeenCalledWith('empty_headers', '## [v1.4.1]');
    expect(baseGitHubClient.rest.issues.addLabels).toHaveBeenCalled();
  });

  it('should handle changelog with no new version headers', async () => {
    setupExecMock(`
+### Added
+- Some addition
+### Fixed
+- Some fix`);

    (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
### Added
- Some addition
### Fixed
- Some fix
`);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.setOutput).toHaveBeenCalledWith('has_empty_changelog', 'false');
    expect(mockCore.setOutput).toHaveBeenCalledWith('empty_headers', '');
  });

  it('should handle non-existent headers in current changelog', async () => {
    setupExecMock(`
+## [v1.4.2]
+## [v1.4.1]`);

    (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.0]
### Added
- Some old feature
`);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.debug).toHaveBeenCalledWith('Header not found in current CHANGELOG: ## [v1.4.2]');
    expect(mockCore.debug).toHaveBeenCalledWith('Header not found in current CHANGELOG: ## [v1.4.1]');
  });

  it('should handle changelog with headers at the end of file', async () => {
    setupExecMock(`+## [v1.4.2]`);

    (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.1]
### Added
- Old feature
## [v1.4.2]`);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.setOutput).toHaveBeenCalledWith('has_empty_changelog', 'true');
  });

  it('should handle success comment error', async () => {
    setupExecMock(`+## [v1.4.2]\n+### Added\n+- New feature`);
    (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
### Added
- New feature
`);

    const client = {
      ...baseGitHubClient,
      rest: {
        issues: {
          ...baseGitHubClient.rest.issues,
          listLabelsOnIssue: jest.fn().mockResolvedValue({
            data: [{ name: 'empty-changelog' }]
          }),
          removeLabel: jest.fn().mockResolvedValue({}),
          createComment: jest.fn().mockRejectedValue(new Error('Failed to create success comment'))
        }
      }
    };
    mockOctokit.mockReturnValue(client as any);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.error).toHaveBeenCalledWith('Failed to check/remove label');
    expect(mockCore.error).toHaveBeenCalledWith('Failed to create success comment');
  });
});
