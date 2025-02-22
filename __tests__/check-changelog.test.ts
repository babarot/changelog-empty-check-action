import { checkChangelog } from '../src/check-changelog';
import * as core from '@actions/core';
import * as fs from 'fs';

jest.mock('@actions/exec');
jest.mock('@actions/core');
jest.mock('fs');

describe('checkChangelog', () => {
  const mockGithub = {} as any;
  const mockContext = {} as any;
  let mockFs: jest.Mocked<typeof fs>;
  let mockCore: jest.Mocked<typeof core>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFs = fs as jest.Mocked<typeof fs>;
    mockCore = core as jest.Mocked<typeof core>;
  });

  it('should detect empty changelog entries', async () => {
    // モックの設定
    const mockDiff = `
+## [v1.4.2](https://github.com/user/repo/compare/v1.4.1...v1.4.2)
 ## [v1.4.1](https://github.com/user/repo/compare/v1.4.0...v1.4.1)
 ### Added
 - New feature
`;

    const mockChangelog = `
# Changelog

## [v1.4.2](https://github.com/user/repo/compare/v1.4.1...v1.4.2)

## [v1.4.1](https://github.com/user/repo/compare/v1.4.0...v1.4.1)
### Added
- New feature
`;

    require('@actions/exec').exec.mockImplementation((cmd, args, options) => {
      options.listeners.stdout(Buffer.from(mockDiff));
      return Promise.resolve(0);
    });

    mockFs.readFileSync.mockReturnValue(mockChangelog);

    await checkChangelog({
      github: mockGithub,
      context: mockContext,
      core: mockCore,
      baseSha: 'base-sha',
      headSha: 'head-sha'
    });

    expect(mockCore.setOutput).toHaveBeenCalledWith('has_empty_changelog', 'true');
    expect(mockCore.warning).toHaveBeenCalled();
  });

  // 他のテストケース（空でないエントリー、エラーケースなど）も追加
});
