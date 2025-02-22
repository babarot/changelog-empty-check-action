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

  const baseGitHubClient = {
    request: jest.fn(),
    graphql: jest.fn(),
    log: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    hook: { before: jest.fn(), after: jest.fn(), error: jest.fn(), wrap: jest.fn() },
    auth: jest.fn(),
    paginate: jest.fn()
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
        default:
          return '';
      }
    });

    mockOctokit.mockReturnValue({
      ...baseGitHubClient,
      rest: {
        issues: {
          addLabels: jest.fn().mockResolvedValue({}),
          createComment: jest.fn().mockResolvedValue({})
        }
      }
    } as any);
  });

  it('should detect empty changelog entries', async () => {
    // Mock exec
    const execMock = jest.requireMock('@actions/exec').exec;
    execMock.mockImplementation(async (_commandLine: string, _args?: string[], options?: { listeners?: { stdout?: (data: Buffer) => void } }) => {
      const mockDiff = `
+## [v1.4.2](https://github.com/user/repo/compare/v1.4.1...v1.4.2)
 ## [v1.4.1](https://github.com/user/repo/compare/v1.4.0...v1.4.1)
 ### Added
 - New feature
`;
      if (options?.listeners?.stdout) {
        options.listeners.stdout(Buffer.from(mockDiff));
      }
      return 0;
    });

    // Mock fs
    const mockChangelog = `
# Changelog

## [v1.4.2](https://github.com/user/repo/compare/v1.4.1...v1.4.2)

## [v1.4.1](https://github.com/user/repo/compare/v1.4.0...v1.4.1)
### Added
- New feature
`;
    (fs.readFileSync as jest.Mock).mockReturnValue(mockChangelog);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.setOutput).toHaveBeenCalledWith('has_empty_changelog', 'true');
    expect(mockCore.setOutput).toHaveBeenCalledWith('empty_headers', expect.stringContaining('v1.4.2'));
    expect(mockCore.warning).toHaveBeenCalledWith(expect.stringContaining('Empty changelog entries detected'));

    const octokitInstance = mockOctokit.mock.results[0].value;
    expect(octokitInstance.rest.issues.addLabels).toHaveBeenCalled();
    expect(octokitInstance.rest.issues.createComment).toHaveBeenCalled();
  });

  it('should handle non-empty changelog entries', async () => {
    const execMock = jest.requireMock('@actions/exec').exec;
    execMock.mockImplementation(async (_commandLine: string, _args?: string[], options?: { listeners?: { stdout?: (data: Buffer) => void } }) => {
      const mockDiff = `
+## [v1.4.2](https://github.com/user/repo/compare/v1.4.1...v1.4.2)
+### Added
+- New feature v1.4.2
 ## [v1.4.1](https://github.com/user/repo/compare/v1.4.0...v1.4.1)
`;
      if (options?.listeners?.stdout) {
        options.listeners.stdout(Buffer.from(mockDiff));
      }
      return 0;
    });

    const mockChangelog = `
# Changelog

## [v1.4.2](https://github.com/user/repo/compare/v1.4.1...v1.4.2)
### Added
- New feature v1.4.2

## [v1.4.1](https://github.com/user/repo/compare/v1.4.0...v1.4.1)
`;
    (fs.readFileSync as jest.Mock).mockReturnValue(mockChangelog);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.setOutput).toHaveBeenCalledWith('has_empty_changelog', 'false');
    expect(mockCore.setOutput).toHaveBeenCalledWith('empty_headers', '');
    expect(mockCore.warning).not.toHaveBeenCalled();

    const octokitInstance = mockOctokit.mock.results[0].value;
    expect(octokitInstance.rest.issues.addLabels).not.toHaveBeenCalled();
    expect(octokitInstance.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('should handle git diff errors properly', async () => {
    const execMock = jest.requireMock('@actions/exec').exec;
    execMock.mockRejectedValue(new Error('Git diff failed'));

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.setFailed).toHaveBeenCalledWith('Action failed: Git diff failed');
  });

  it('should handle file read errors properly', async () => {
    const execMock = jest.requireMock('@actions/exec').exec;
    execMock.mockResolvedValue(0);

    (fs.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('File read failed');
    });

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.setFailed).toHaveBeenCalledWith('Action failed: File read failed');
  });

  it('should handle changelog entries when header is not found', async () => {
    const execMock = jest.requireMock('@actions/exec').exec;
    execMock.mockImplementation(async (_commandLine: string, _args?: string[], options?: { listeners?: { stdout?: (data: Buffer) => void } }) => {
      const mockDiff = `
+## [v1.4.2](https://github.com/user/repo/compare/v1.4.1...v1.4.2)
`;
      if (options?.listeners?.stdout) {
        options.listeners.stdout(Buffer.from(mockDiff));
      }
      return 0;
    });

    const mockChangelog = `
# Changelog

## [v1.4.1](https://github.com/user/repo/compare/v1.4.0...v1.4.1)
`;
    (fs.readFileSync as jest.Mock).mockReturnValue(mockChangelog);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.setOutput).toHaveBeenCalledWith('has_empty_changelog', 'false');
    expect(mockCore.setOutput).toHaveBeenCalledWith('empty_headers', '');
  });

  it('should handle changelog entries at the end of file', async () => {
    const execMock = jest.requireMock('@actions/exec').exec;
    execMock.mockImplementation(async (_commandLine: string, _args?: string[], options?: { listeners?: { stdout?: (data: Buffer) => void } }) => {
      const mockDiff = `
+## [v1.4.2](https://github.com/user/repo/compare/v1.4.1...v1.4.2)
`;
      if (options?.listeners?.stdout) {
        options.listeners.stdout(Buffer.from(mockDiff));
      }
      return 0;
    });

    const mockChangelog = `
# Changelog

## [v1.4.2](https://github.com/user/repo/compare/v1.4.1...v1.4.2)
`;
    (fs.readFileSync as jest.Mock).mockReturnValue(mockChangelog);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.setOutput).toHaveBeenCalledWith('has_empty_changelog', 'true');
    const octokitInstance = mockOctokit.mock.results[0].value;
    expect(octokitInstance.rest.issues.addLabels).toHaveBeenCalled();
    expect(octokitInstance.rest.issues.createComment).toHaveBeenCalled();
  });

  it('should handle unknown errors properly', async () => {
    const execMock = jest.requireMock('@actions/exec').exec;
    execMock.mockRejectedValue('Unknown error');

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.setFailed).toHaveBeenCalledWith('Action failed with unknown error');
  });

  it('should handle label API error with error object', async () => {
    const execMock = jest.requireMock('@actions/exec').exec;
    execMock.mockImplementation(async (_cmd: string, _args: string[], options?: { listeners?: { stdout?: (data: Buffer) => void } }) => {
      if (options?.listeners?.stdout) {
        options.listeners.stdout(Buffer.from(`+## [v1.4.2]`));
      }
      return 0;
    });

    (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
`);

    mockOctokit.mockReturnValue({
      ...baseGitHubClient,
      rest: {
        issues: {
          addLabels: jest.fn().mockRejectedValue(new Error('API Error')),
          createComment: jest.fn().mockResolvedValue({})
        }
      }
    } as any);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.error).toHaveBeenCalledWith('Failed to add label');
    expect(mockCore.error).toHaveBeenCalledWith(expect.stringContaining('API Error'));
  });

  it('should handle label API error with non-error object', async () => {
    const execMock = jest.requireMock('@actions/exec').exec;
    execMock.mockImplementation(async (_cmd: string, _args: string[], options?: { listeners?: { stdout?: (data: Buffer) => void } }) => {
      if (options?.listeners?.stdout) {
        options.listeners.stdout(Buffer.from(`+## [v1.4.2]`));
      }
      return 0;
    });

    (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
`);

    mockOctokit.mockReturnValue({
      ...baseGitHubClient,
      rest: {
        issues: {
          addLabels: jest.fn().mockRejectedValue('Unknown error object'),
          createComment: jest.fn().mockResolvedValue({})
        }
      }
    } as any);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.error).toHaveBeenCalledWith('Failed to add label');
    expect(mockCore.error).toHaveBeenCalledWith('Unknown error during label addition');
  });

  it('should handle comment API error', async () => {
    const execMock = jest.requireMock('@actions/exec').exec;
    execMock.mockImplementation(async (_cmd: string, _args: string[], options?: { listeners?: { stdout?: (data: Buffer) => void } }) => {
      if (options?.listeners?.stdout) {
        options.listeners.stdout(Buffer.from(`+## [v1.4.2]`));
      }
      return 0;
    });

    (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
`);

    mockOctokit.mockReturnValue({
      ...baseGitHubClient,
      rest: {
        issues: {
          addLabels: jest.fn().mockResolvedValue({}),
          createComment: jest.fn().mockRejectedValue(new Error('Comment Error'))
        }
      }
    } as any);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.error).toHaveBeenCalledWith('Failed to add comment');
  });

  it('should check for duplicate comments', async () => {
    const execMock = jest.requireMock('@actions/exec').exec;
    execMock.mockImplementation(async (_cmd: string, _args: string[], options?: { listeners?: { stdout?: (data: Buffer) => void } }) => {
      if (options?.listeners?.stdout) {
        options.listeners.stdout(Buffer.from(`+## [v1.4.2]`));
      }
      return 0;
    });

    (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
`);

    const warningMessage = '🚨 Empty changelog entries detected:\n- ## [v1.4.2] (No content provided)';
    mockOctokit.mockReturnValue({
      ...baseGitHubClient,
      rest: {
        issues: {
          addLabels: jest.fn().mockResolvedValue({}),
          createComment: jest.fn().mockResolvedValue({}),
          listComments: jest.fn().mockResolvedValue({
            data: [{ body: warningMessage }]
          })
        }
      }
    } as any);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    const octokitInstance = mockOctokit.mock.results[0].value;
    expect(octokitInstance.rest.issues.createComment).not.toHaveBeenCalled();
    expect(mockCore.info).toHaveBeenCalledWith('Similar comment already exists, skipping comment creation');
  });

  it('should handle listComments API error', async () => {
    const execMock = jest.requireMock('@actions/exec').exec;
    execMock.mockImplementation(async (_cmd: string, _args: string[], options?: { listeners?: { stdout?: (data: Buffer) => void } }) => {
      if (options?.listeners?.stdout) {
        options.listeners.stdout(Buffer.from(`+## [v1.4.2]`));
      }
      return 0;
    });

    (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
`);

    mockOctokit.mockReturnValue({
      ...baseGitHubClient,
      rest: {
        issues: {
          addLabels: jest.fn().mockResolvedValue({}),
          createComment: jest.fn().mockResolvedValue({}),
          listComments: jest.fn().mockRejectedValue(new Error('Failed to list comments'))
        }
      }
    } as any);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.warning).toHaveBeenCalledWith('Failed to check existing comments, proceeding with comment creation');
  });

  it('should handle label removal and success comment', async () => {
    const execMock = jest.requireMock('@actions/exec').exec;
    execMock.mockImplementation(async (_cmd: string, _args: string[], options?: { listeners?: { stdout?: (data: Buffer) => void } }) => {
      if (options?.listeners?.stdout) {
        options.listeners.stdout(Buffer.from(`+## [v1.4.2]\n+### Added\n+- New feature`));
      }
      return 0;
    });

    (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
### Added
- New feature
`);

    mockOctokit.mockReturnValue({
      ...baseGitHubClient,
      rest: {
        issues: {
          listLabelsOnIssue: jest.fn().mockResolvedValue({
            data: [{ name: 'empty-changelog' }]
          }),
          removeLabel: jest.fn().mockResolvedValue({}),
          createComment: jest.fn().mockResolvedValue({}),
          listComments: jest.fn().mockResolvedValue({ data: [] })
        }
      }
    } as any);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    const octokitInstance = mockOctokit.mock.results[0].value;
    expect(octokitInstance.rest.issues.removeLabel).toHaveBeenCalled();
    expect(octokitInstance.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: '✅ Changelog entry has been filled'
      })
    );
  });

  it('should handle non-existent label gracefully', async () => {
    const execMock = jest.requireMock('@actions/exec').exec;
    execMock.mockImplementation(async (_cmd: string, _args: string[], options?: { listeners?: { stdout?: (data: Buffer) => void } }) => {
      if (options?.listeners?.stdout) {
        options.listeners.stdout(Buffer.from(`+## [v1.4.2]\n+### Added\n+- New feature`));
      }
      return 0;
    });

    (fs.readFileSync as jest.Mock).mockReturnValue(`
# Changelog
## [v1.4.2]
### Added
- New feature
`);

    mockOctokit.mockReturnValue({
      ...baseGitHubClient,
      rest: {
        issues: {
          listLabelsOnIssue: jest.fn().mockResolvedValue({
            data: []
          }),
          removeLabel: jest.fn().mockRejectedValue(new Error('Label does not exist')),
          listComments: jest.fn().mockResolvedValue({ data: [] })
        }
      }
    } as any);

    await checkChangelog({
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    const octokitInstance = mockOctokit.mock.results[0].value;
    expect(octokitInstance.rest.issues.removeLabel).not.toHaveBeenCalled();
  });
});

