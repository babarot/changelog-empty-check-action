import { checkChangelog } from '../src/check-changelog';
import * as core from '@actions/core';
import * as fs from 'fs';
import { getOctokit } from '@actions/github';
import { Context } from '@actions/github/lib/context';

jest.mock('@actions/core');
jest.mock('fs');
jest.mock('@actions/exec', () => ({
  exec: jest.fn()
}));

describe('checkChangelog', () => {
  const mockGithub = {} as ReturnType<typeof getOctokit>;
  const mockContext = {} as Context;

  beforeEach(() => {
    jest.clearAllMocks();
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
      github: mockGithub,
      context: mockContext,
      core,
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(core.setOutput).toHaveBeenCalledWith('has_empty_changelog', 'true');
    expect(core.setOutput).toHaveBeenCalledWith('empty_headers', expect.stringContaining('v1.4.2'));
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Empty changelog entries detected'));
  });

  it('should handle non-empty changelog entries', async () => {
    // Mock exec
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

    // Mock fs
    const mockChangelog = `
# Changelog

## [v1.4.2](https://github.com/user/repo/compare/v1.4.1...v1.4.2)
### Added
- New feature v1.4.2

## [v1.4.1](https://github.com/user/repo/compare/v1.4.0...v1.4.1)
`;
    (fs.readFileSync as jest.Mock).mockReturnValue(mockChangelog);

    await checkChangelog({
      github: mockGithub,
      context: mockContext,
      core,
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(core.setOutput).toHaveBeenCalledWith('has_empty_changelog', 'false');
    expect(core.setOutput).toHaveBeenCalledWith('empty_headers', '');
    expect(core.warning).not.toHaveBeenCalled();
  });

  it('should handle errors properly', async () => {
    // Mock exec to throw error
    const execMock = jest.requireMock('@actions/exec').exec;
    execMock.mockRejectedValue(new Error('Git diff failed'));

    await checkChangelog({
      github: mockGithub,
      context: mockContext,
      core,
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(core.setFailed).toHaveBeenCalledWith('Action failed: Git diff failed');
  });
});
