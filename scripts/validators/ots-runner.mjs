import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { writeValidationFonts } from './validation-fonts.mjs';
import { localValidatorPath, resolveExecutable } from './validator-paths.mjs';

function resolveOtsSanitize() {
    return resolveExecutable({
        envVar: 'OTS_SANITIZE_BIN',
        localPath: localValidatorPath('ots', 'ots-sanitize'),
        command: 'ots-sanitize',
        toolName: 'OpenType Sanitizer',
        setupMessage: 'Download OTS from https://github.com/khaledhosny/ots/releases and place ots-sanitize at test/validators/bin/ots/ots-sanitize, put it on PATH, or set OTS_SANITIZE_BIN.'
    });
}

export function runOtsValidation() {
    const binary = resolveOtsSanitize();
    const fonts = writeValidationFonts('ots');
    let failures = 0;

    for (const font of fonts) {
        const result = spawnSync(binary, [font.path], {
            encoding: 'utf8',
            maxBuffer: 16 * 1024 * 1024
        });
        if (result.status !== 0) {
            failures++;
            console.error(`OTS failed for ${font.name}:`);
            console.error(result.stderr || result.stdout || `exit code ${result.status}`);
        } else {
            console.log(`OTS passed for ${font.name} (${font.byteLength} bytes)`);
        }
    }

    if (failures > 0) {
        throw new Error(`OTS validation failed for ${failures} font${failures === 1 ? '' : 's'}.`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    try {
        runOtsValidation();
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}
