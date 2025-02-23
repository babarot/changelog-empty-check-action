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
        removeLabel: jest.fn().mockResolvedValue({}),
        updateComment: jest.fn().mockResolvedValue({})
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
        case 'github-token': return 'dummy-token';
        case 'pull-request-number': return '1';
        case 'label-name': return 'empty-changelog';
        case 'warning-message': return defaultWarningMessage;
        case 'success-message': return defaultSuccessMessage;
        default: return '';
      }
    });
  });

  describe('findExistingComment function', () => {
    it('should handle comment list retrieval and matching', async () => {
      // Setup for an existing comment
      const client = {
        ...baseGitHubClient,
        rest: {
          issues: {
            ...baseGitHubClient.rest.issues,
            listComments: jest.fn().mockResolvedValue({
              data: [
                { id: 1, body: 'Some other comment' },
                { id: 2, body: defaultWarningMessage },
                { id: 3, body: 'Another comment' }
              ]
            })
          }
        }
      };
      mockOctokit.mockReturnValue(client as any);

      setupExecMock(`+## [v1.4.2]`);
      (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
`);

      await checkChangelog({ baseSha: 'base', headSha: 'head' });

      expect(client.rest.issues.listComments).toHaveBeenCalledWith({
        owner: 'babarot',
        repo: 'test-repo',
        issue_number: 1
      });
    });

    it('should handle comment list retrieval failure', async () => {
      const client = {
        ...baseGitHubClient,
        rest: {
          issues: {
            ...baseGitHubClient.rest.issues,
            listComments: jest.fn().mockRejectedValue(new Error('API error'))
          }
        }
      };
      mockOctokit.mockReturnValue(client as any);

      setupExecMock(`+## [v1.4.2]`);
      (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
`);

      await checkChangelog({ baseSha: 'base', headSha: 'head' });

      expect(mockCore.warning).toHaveBeenCalledWith('Failed to check existing comments');
    });
  });

  describe('updateOrCreateComment function', () => {
    it('should skip updating when trying to post the same warning message', async () => {
      const client = {
        ...baseGitHubClient,
        rest: {
          issues: {
            ...baseGitHubClient.rest.issues,
            listComments: jest.fn().mockResolvedValue({
              data: [{ id: 1, body: defaultWarningMessage }]
            }),
            updateComment: jest.fn().mockResolvedValue({})
          }
        }
      };
      mockOctokit.mockReturnValue(client as any);

      setupExecMock(`+## [v1.4.2]`);
      (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
`);

      await checkChangelog({ baseSha: 'base', headSha: 'head' });

      expect(client.rest.issues.updateComment).not.toHaveBeenCalled();
      expect(mockCore.info).toHaveBeenCalledWith('Skipping comment update - warning message already exists');
    });

    it('should create new comment when no matching comment exists', async () => {
      const client = {
        ...baseGitHubClient,
        rest: {
          issues: {
            ...baseGitHubClient.rest.issues,
            listComments: jest.fn().mockResolvedValue({ data: [] }),
            createComment: jest.fn().mockResolvedValue({})
          }
        }
      };
      mockOctokit.mockReturnValue(client as any);

      setupExecMock(`+## [v1.4.2]`);
      (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
`);

      await checkChangelog({ baseSha: 'base', headSha: 'head' });

      expect(client.rest.issues.createComment).toHaveBeenCalled();
      expect(mockCore.info).toHaveBeenCalledWith('Created new comment');
    });
  });

  describe('detailed error handling', () => {
    beforeEach(() => {
      setupExecMock(`+## [v1.4.2]\n+### Added\n+- Feature`);
      (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
### Added
- Feature
`);
    });

    describe('empty changelog detection', () => {
      it('should detect multiple empty changelog entries', async () => {
        setupExecMock(`
+## [v1.4.2]
+## [v1.4.1]
+### Added
+- Feature
+## [v1.4.0]`);

        (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
## [v1.4.1]
### Added
- Feature
## [v1.4.0]
`);

        await checkChangelog({ baseSha: 'base', headSha: 'head' });

        expect(mockCore.setOutput).toHaveBeenCalledWith('has_empty_changelog', 'true');
        expect(mockCore.setOutput).toHaveBeenCalledWith('empty_headers', expect.stringContaining('[v1.4.2]'));
        expect(mockCore.setOutput).toHaveBeenCalledWith('empty_headers', expect.stringContaining('[v1.4.0]'));
      });

      it('should handle non-empty changelog entries', async () => {
        setupExecMock(`
+## [v1.4.2]
+### Added
+- New feature`);

        (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
### Added
- New feature
`);

        await checkChangelog({ baseSha: 'base', headSha: 'head' });

        expect(mockCore.setOutput).toHaveBeenCalledWith('has_empty_changelog', 'false');
        expect(mockCore.setOutput).toHaveBeenCalledWith('empty_headers', '');
      });
    });

    describe('label management', () => {
      it('should add label and warning comment for empty changelog', async () => {
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
              addLabels: jest.fn().mockResolvedValue({}),
              createComment: jest.fn().mockResolvedValue({})
            }
          }
        };
        mockOctokit.mockReturnValue(client as any);

        await checkChangelog({ baseSha: 'base', headSha: 'head' });

        expect(client.rest.issues.addLabels).toHaveBeenCalledWith({
          owner: 'babarot',
          repo: 'test-repo',
          issue_number: 1,
          labels: ['empty-changelog']
        });
        expect(client.rest.issues.createComment).toHaveBeenCalled();
      });

      it('should handle label removal errors properly', async () => {
        setupExecMock(`+## [v1.4.2]\n+### Added\n+- Feature`);
        (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
### Added
- Feature
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

        await checkChangelog({ baseSha: 'base', headSha: 'head' });

        expect(mockCore.error).toHaveBeenCalledWith('Failed to check/remove label');
      });
    });

    describe('detailed error handling', () => {
      beforeEach(() => {
        setupExecMock(`+## [v1.4.2]`);
        (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
`);
      });

      it('should handle label API response debug logging', async () => {
        const labelResponse = { data: { id: 123 } };
        const client = {
          ...baseGitHubClient,
          rest: {
            issues: {
              ...baseGitHubClient.rest.issues,
              addLabels: jest.fn().mockResolvedValue(labelResponse)
            }
          }
        };
        mockOctokit.mockReturnValue(client as any);

        await checkChangelog({ baseSha: 'base', headSha: 'head' });

        expect(mockCore.debug).toHaveBeenCalledWith(`Label API Response: ${JSON.stringify(labelResponse)}`);
      });

      it('should fully handle the success comment flow', async () => {
        setupExecMock(`+## [v1.4.2]\n+### Added\n+- Feature`);
        (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
### Added
- Feature
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
              createComment: jest.fn().mockResolvedValue({}),
              listComments: jest.fn().mockResolvedValue({ data: [] })
            }
          }
        };
        mockOctokit.mockReturnValue(client as any);

        await checkChangelog({ baseSha: 'base', headSha: 'head' });

        expect(client.rest.issues.removeLabel).toHaveBeenCalled();
        expect(mockCore.info).toHaveBeenCalledWith('Label removed successfully');
        expect(mockCore.info).toHaveBeenCalledWith('Updating/creating success comment...');
        expect(client.rest.issues.createComment).toHaveBeenCalledWith({
          owner: 'babarot',
          repo: 'test-repo',
          issue_number: 1,
          body: defaultSuccessMessage
        });
      });

      it('should handle unknown error types properly', async () => {
        setupExecMock('');
        (fs.readFileSync as jest.Mock).mockImplementation(() => {
          throw 'Unknown error'; // Throwing non-Error type
        });

        await checkChangelog({ baseSha: 'base', headSha: 'head' });

        expect(mockCore.error).toHaveBeenCalledWith('Unknown error type received');
        expect(mockCore.setFailed).toHaveBeenCalledWith('Action failed with unknown error');
      });
    });
    it('should handle error with stack trace', async () => {
      const error = new Error('Test error');
      error.stack = 'Test stack trace';

      setupExecMock('');
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw error;
      });

      mockOctokit.mockReturnValue(baseGitHubClient as any);

      await checkChangelog({ baseSha: 'base', headSha: 'head' });

      expect(mockCore.error).toHaveBeenCalledWith('An error occurred during changelog check');
      expect(mockCore.error).toHaveBeenCalledWith('Error details: Test error');
      expect(mockCore.error).toHaveBeenCalledWith('Test stack trace');
    });

    it('should handle error without stack trace', async () => {
      const error = new Error('Test error');
      delete error.stack;

      setupExecMock('');
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw error;
      });

      mockOctokit.mockReturnValue(baseGitHubClient as any);

      await checkChangelog({ baseSha: 'base', headSha: 'head' });

      expect(mockCore.error).toHaveBeenCalledWith('An error occurred during changelog check');
      expect(mockCore.error).toHaveBeenCalledWith('Error details: Test error');
      expect(mockCore.error).toHaveBeenCalledWith('No stack trace available');
    });
  });
});
