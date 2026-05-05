import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { writeValidationFonts } from './validation-fonts.mjs';
import { MissingValidatorError } from './validator-paths.mjs';

const PYTHON = process.env.FONTTOOLS_PYTHON || 'python3';

function runPython(args, options = {}) {
    return spawnSync(PYTHON, args, {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        ...options
    });
}

function requireFontTools() {
    const result = runPython(['-c', 'from fontTools.ttLib import TTFont; print("ok")']);
    if (result.status !== 0) {
        throw new MissingValidatorError(
            'FontTools',
            `Install it with "python3 -m pip install fonttools" or set FONTTOOLS_PYTHON to a Python executable that has fontTools installed.\n\nstderr:\n${result.stderr || result.stdout || '(none)'}`
        );
    }
}

function validateFont(path) {
    const script = `
import json
import sys
from io import BytesIO
from fontTools.ttLib import TTFont

font_path = sys.argv[1]
issues = []

try:
    font = TTFont(font_path)
    required_tables = ['head', 'hhea', 'maxp', 'OS/2', 'name', 'cmap', 'post']
    for tag in required_tables:
        if tag not in font:
            issues.append({'severity': 'ERROR', 'test': 'required-tables', 'message': f'Missing {tag} table'})

    try:
        buffer = BytesIO()
        font.save(buffer)
        buffer.seek(0)
        TTFont(buffer)
    except Exception as e:
        issues.append({'severity': 'ERROR', 'test': 'roundtrip-save-load', 'message': str(e)})

    name = font.get('name')
    if name:
        for name_id in [1, 2, 4, 5, 6]:
            if not name.getDebugName(name_id):
                issues.append({'severity': 'ERROR', 'test': 'name-table', 'message': f'Missing nameID {name_id}'})

    if 'fvar' in font:
        for axis in font['fvar'].axes:
            if axis.minValue > axis.defaultValue or axis.defaultValue > axis.maxValue:
                issues.append({'severity': 'ERROR', 'test': 'fvar-axis-range', 'message': axis.axisTag})

        if not font['fvar'].instances:
            issues.append({'severity': 'ERROR', 'test': 'fvar-instances', 'message': 'Missing named instances'})

        try:
            from fontTools.varLib import instancer
            for axis in font['fvar'].axes:
                for value in [axis.minValue, axis.defaultValue, axis.maxValue]:
                    buffer = BytesIO()
                    font.save(buffer)
                    buffer.seek(0)
                    instance = TTFont(buffer)
                    instancer.instantiateVariableFont(instance, {axis.axisTag: value}, inplace=True)
        except Exception as e:
            issues.append({'severity': 'ERROR', 'test': 'vf-instantiation', 'message': str(e)})
except Exception as e:
    issues.append({'severity': 'FATAL', 'test': 'load', 'message': str(e)})

print(json.dumps(issues))
`;

    const result = runPython(['-c', script, path]);
    if (result.status !== 0) {
        return [{ severity: 'FATAL', test: 'python', message: result.stderr || result.stdout }];
    }
    return JSON.parse(result.stdout || '[]');
}

export function runFontToolsValidation() {
    requireFontTools();
    const fonts = writeValidationFonts('fonttools');
    let failures = 0;

    for (const font of fonts) {
        const issues = validateFont(font.path);
        const errors = issues.filter(issue => issue.severity === 'ERROR' || issue.severity === 'FATAL');
        if (errors.length > 0) {
            failures += errors.length;
            console.error(`FontTools failed for ${font.name}:`);
            for (const error of errors) {
                console.error(`  [${error.test}] ${error.message}`);
            }
        } else {
            console.log(`FontTools passed for ${font.name} (${font.byteLength} bytes)`);
        }
    }

    if (failures > 0) {
        throw new Error(`FontTools validation failed with ${failures} issue${failures === 1 ? '' : 's'}.`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    try {
        runFontToolsValidation();
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}
