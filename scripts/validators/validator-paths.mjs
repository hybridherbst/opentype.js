import { accessSync, constants } from 'fs';
import { delimiter, join } from 'path';

export class MissingValidatorError extends Error {
    constructor(toolName, setupMessage) {
        super(`${toolName} is not available.\n\n${setupMessage}`);
        this.name = 'MissingValidatorError';
    }
}

function isExecutable(path) {
    try {
        accessSync(path, constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

function findOnPath(command) {
    for (const dir of (process.env.PATH || '').split(delimiter)) {
        if (!dir) continue;
        const candidate = join(dir, command);
        if (isExecutable(candidate)) {
            return candidate;
        }
    }
    return null;
}

export function resolveExecutable({ envVar, localPath, command, toolName, setupMessage }) {
    const candidates = [
        process.env[envVar],
        localPath,
        findOnPath(command)
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (isExecutable(candidate)) {
            return candidate;
        }
    }

    throw new MissingValidatorError(toolName, setupMessage);
}

export function localValidatorPath(...parts) {
    return join(process.cwd(), 'test', 'validators', 'bin', ...parts);
}
