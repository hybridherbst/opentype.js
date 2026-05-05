import { runFontToolsValidation } from './fonttools-runner.mjs';
import { runFontspectorValidation } from './fontspector-runner.mjs';
import { runOtsValidation } from './ots-runner.mjs';

const VALIDATORS = new Map([
    ['fonttools', {
        label: 'FontTools',
        run: runFontToolsValidation
    }],
    ['fontspector', {
        label: 'Fontspector',
        run: runFontspectorValidation
    }],
    ['ots', {
        label: 'OpenType Sanitizer',
        run: runOtsValidation
    }]
]);

function usage() {
    const tools = [...VALIDATORS.keys()].join(', ');
    return `Usage: npm run test:validate -- [--tool ${tools}]

Runs all validators by default. Pass --tool more than once or use a comma list
to run a subset, for example:

  npm run test:validate -- --tool fonttools
  npm run test:validate -- --tool fonttools,ots`;
}

function parseTools(argv) {
    const requested = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') {
            console.log(usage());
            process.exit(0);
        }
        if (arg === '--tool' || arg === '--validator') {
            const value = argv[++i];
            if (!value) {
                throw new Error(`${arg} requires a validator name.\n\n${usage()}`);
            }
            requested.push(...value.split(','));
            continue;
        }
        if (arg.startsWith('--tool=') || arg.startsWith('--validator=')) {
            requested.push(...arg.slice(arg.indexOf('=') + 1).split(','));
            continue;
        }
        if (arg.startsWith('--')) {
            throw new Error(`Unknown validator option: ${arg}\n\n${usage()}`);
        }
        requested.push(...arg.split(','));
    }

    const normalized = requested.map(tool => tool.trim().toLowerCase()).filter(Boolean);
    const tools = normalized.length > 0 ? normalized : [...VALIDATORS.keys()];
    const unknown = tools.filter(tool => !VALIDATORS.has(tool));
    if (unknown.length > 0) {
        throw new Error(`Unknown validator: ${unknown.join(', ')}\n\n${usage()}`);
    }

    return [...new Set(tools)];
}

function main() {
    const tools = parseTools(process.argv.slice(2));
    let failures = 0;

    for (const tool of tools) {
        const validator = VALIDATORS.get(tool);
        console.log(`\n== ${validator.label} ==`);
        try {
            validator.run();
        } catch (error) {
            failures++;
            console.error(error.message);
        }
    }

    if (failures > 0) {
        process.exit(1);
    }
}

main();
