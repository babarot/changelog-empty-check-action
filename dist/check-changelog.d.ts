import { getOctokit } from '@actions/github';
import { Context } from '@actions/github/lib/context';
import type * as coreType from '@actions/core';
interface CheckChangelogOptions {
    github: ReturnType<typeof getOctokit>;
    context: Context;
    core: typeof coreType;
    baseSha: string;
    headSha: string;
}
export declare function checkChangelog(options: CheckChangelogOptions): Promise<void>;
export {};
