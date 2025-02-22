interface CheckChangelogOptions {
    baseSha: string;
    headSha: string;
}
export declare function checkChangelog(options: CheckChangelogOptions): Promise<void>;
export {};
