import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { ensureValidatorOutputDir, writeValidationFonts } from './validation-fonts.mjs';
import { localValidatorPath, resolveExecutable } from './validator-paths.mjs';

function resolveFontspector() {
    return resolveExecutable({
        envVar: 'FONTSPECTOR_BIN',
        localPath: localValidatorPath('fontspector'),
        command: 'fontspector',
        toolName: 'Fontspector',
        setupMessage: 'Install Fontspector from https://github.com/fonttools/fontspector, place the executable at test/validators/bin/fontspector, put it on PATH, or set FONTSPECTOR_BIN.'
    });
}

function runFontspector(binary, font, outputDir) {
    const jsonPath = join(outputDir, `${font.name}.json`);
    const args = [
        font.path,
        '--json',
        jsonPath,
        '--quiet',
        '--profile',
        process.env.FONTSPECTOR_PROFILE || 'opentype'
    ];

    const checks = (process.env.FONTSPECTOR_CHECKS || '').split(',').map(check => check.trim()).filter(Boolean);
    for (const check of checks) {
        args.push('-c', check);
    }

    const result = spawnSync(binary, args, {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024
    });

    if (!existsSync(jsonPath)) {
        return {
            ok: false,
            message: result.stderr || result.stdout || `Fontspector did not write ${jsonPath}`
        };
    }

    const report = JSON.parse(readFileSync(jsonPath, 'utf8'));
    const summary = report.summary || {};
    const errors = summary.ERROR || 0;
    const failures = summary.FAIL || 0;
    return {
        ok: result.status === 0 && errors === 0 && failures === 0,
        summary,
        message: result.stderr || result.stdout
    };
}

export function runFontspectorValidation() {
    const binary = resolveFontspector();
    const outputDir = ensureValidatorOutputDir('fontspector');
    const fonts = writeValidationFonts('fontspector');
    let failures = 0;

    for (const font of fonts) {
        const result = runFontspector(binary, font, outputDir);
        if (!result.ok) {
            failures++;
            console.error(`Fontspector failed for ${font.name}:`);
            console.error(result.message || JSON.stringify(result.summary));
        } else {
            console.log(`Fontspector passed for ${font.name}: ${JSON.stringify(result.summary)}`);
        }
    }

    if (failures > 0) {
        throw new Error(`Fontspector validation failed for ${failures} font${failures === 1 ? '' : 's'}.`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    try {
        runFontspectorValidation();
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}
