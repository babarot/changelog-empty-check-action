"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkChangelog = checkChangelog;
const exec_1 = require("@actions/exec");
const fs = __importStar(require("fs"));
async function checkChangelog(options) {
    const { core, baseSha, headSha } = options;
    try {
        // Get diff with base branch
        let diffOutput = '';
        await (0, exec_1.exec)('git', ['diff', baseSha, headSha, '--', 'CHANGELOG.md'], {
            listeners: {
                stdout: (data) => {
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
        const emptyEntries = [];
        for (const header of newHeaders) {
            const headerIndex = lines.findIndex(line => line === header);
            if (headerIndex === -1)
                continue;
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
        }
        else {
            core.setOutput('has_empty_changelog', 'false');
            core.setOutput('empty_headers', '');
        }
    }
    catch (error) {
        if (error instanceof Error) {
            core.setFailed(`Action failed: ${error.message}`);
        }
        else {
            core.setFailed('Action failed with unknown error');
        }
    }
}
