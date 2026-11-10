// Compact encoding of chaining contextual rules (GSUB lookup type 6, GPOS lookup type 8).
// https://learn.microsoft.com/typography/opentype/spec/chapter2#chained-sequence-context-format-1-simple-glyph-contexts

/**
 * @typedef {object} ChainContextLookupRecord
 * @property {number} sequenceIndex
 * @property {number} lookupListIndex
 */

/**
 * A chaining contextual rule: glyph sets per position (backtrack closest glyph first) and
 * the lookups it applies.
 * @typedef {object} ChainContextRule
 * @property {number[][]} backtrack
 * @property {number[][]} input
 * @property {number[][]} lookahead
 * @property {ChainContextLookupRecord[]} lookupRecords
 */

/**
 * @typedef {object} ChainContextEncodeOptions
 * @property {'substFormat'|'posFormat'} [formatKey='substFormat'] - `posFormat` for GPOS
 * @property {number} [numGlyphs] - glyphs in the font: a set holding every glyph no other
 *   class of its class definition holds is written as class 0
 * @property {number} [maxSubtableSize=65000] - bytes a class-based subtable may take (its
 *   offsets are 16-bit)
 */

const DEFAULT_MAX_SUBTABLE_SIZE = 65000;

/**
 * @param {number[]} glyphs - sorted, unique
 * @returns {number}
 */
function rangeCount(glyphs) {
    let ranges = 0;
    for (let i = 0; i < glyphs.length; i++) if (i === 0 || glyphs[i] !== glyphs[i - 1] + 1) ranges++;
    return ranges;
}

/**
 * The smaller coverage table for sorted glyphs.
 * @param {number[]} glyphs - sorted, unique
 * @returns {{format: 1, glyphs: number[]} | {format: 2, ranges: Array<{start: number, end: number, index: number}>}}
 */
function makeCoverage(glyphs) {
    if (4 + 6 * rangeCount(glyphs) >= 4 + 2 * glyphs.length) return { format: 1, glyphs: glyphs.slice() };
    /** @type {Array<{start: number, end: number, index: number}>} */
    const ranges = [];
    for (let index = 0; index < glyphs.length; index++) {
        const glyph = glyphs[index];
        const last = ranges[ranges.length - 1];
        if (last && last.end + 1 === glyph) last.end = glyph;
        else ranges.push({ start: glyph, end: glyph, index });
    }
    return { format: 2, ranges };
}

/**
 * @param {number[]} glyphs - sorted, unique
 */
function coverageSize(glyphs) {
    return Math.min(4 + 2 * glyphs.length, 4 + 6 * rangeCount(glyphs));
}

/**
 * The smaller class definition table for a glyph → class map (class 0 entries left out).
 * @param {Map<number, number>} classes
 * @returns {{table: object, size: number}}
 */
function makeClassDef(classes) {
    const glyphs = [...classes.keys()].filter((glyph) => classes.get(glyph)).sort((a, b) => a - b);
    if (glyphs.length === 0) return { table: { format: 2, ranges: [] }, size: 4 };
    /** @type {Array<{start: number, end: number, classId: number}>} */
    const ranges = [];
    for (const glyph of glyphs) {
        const value = /** @type {number} */ (classes.get(glyph));
        const last = ranges[ranges.length - 1];
        if (last && last.end + 1 === glyph && last.classId === value) last.end = glyph;
        else ranges.push({ start: glyph, end: glyph, classId: value });
    }
    const first = glyphs[0];
    const span = glyphs[glyphs.length - 1] - first + 1;
    const size1 = 6 + 2 * span;
    const size2 = 4 + 6 * ranges.length;
    if (size1 < size2) {
        const values = new Array(span).fill(0);
        for (const glyph of glyphs) values[glyph - first] = /** @type {number} */ (classes.get(glyph));
        return { table: { format: 1, startGlyph: first, classes: values }, size: size1 };
    }
    return { table: { format: 2, ranges }, size: size2 };
}

/**
 * @param {number[]} glyphs
 * @returns {number[]}
 */
function sortedSet(glyphs) {
    return [...new Set(glyphs)].sort((a, b) => a - b);
}

/**
 * One class definition being built: its classes by glyph set and by glyph.
 */
class ClassPartition {
    constructor() {
        /** @type {Map<string, number>} */
        this.byKey = new Map();
        /** @type {Map<number, number>} */
        this.byGlyph = new Map();
        /** @type {number[][]} */
        this.members = [[]];
    }

    /**
     * The class of a glyph set, added when it shares no glyph with the classes so far;
     * -1 when it overlaps one without being it.
     * @param {number[]} glyphs - sorted, unique
     * @param {string} key
     */
    classOf(glyphs, key) {
        const known = this.byKey.get(key);
        if (known !== undefined) return known;
        if (glyphs.some((glyph) => this.byGlyph.has(glyph))) return -1;
        const value = this.members.length;
        this.members.push(glyphs);
        this.byKey.set(key, value);
        for (const glyph of glyphs) this.byGlyph.set(glyph, value);
        return value;
    }

    /** Remove the classes added after the first `count`. */
    truncate(count) {
        while (this.members.length > count) {
            const glyphs = /** @type {number[]} */ (this.members.pop());
            for (const glyph of glyphs) this.byGlyph.delete(glyph);
            for (const [key, value] of this.byKey) if (value >= count) this.byKey.delete(key);
        }
    }
}

/**
 * Bytes of a rule's sequence lists and lookup records (in a format 1 or 2 rule table).
 * @param {{backtrack: unknown[], input: unknown[], lookahead: unknown[], lookupRecords: unknown[]}} rule
 */
function ruleTableSize(rule) {
    return 8 + 2 * (rule.backtrack.length + rule.input.length - 1 + rule.lookahead.length) + 4 * rule.lookupRecords.length;
}

/**
 * Format 3 subtable of one rule.
 * @param {{backtrack: number[][], input: number[][], lookahead: number[][], lookupRecords: ChainContextLookupRecord[]}} rule
 * @param {string} formatKey
 */
function format3(rule, formatKey) {
    return {
        [formatKey]: 3,
        backtrackCoverage: rule.backtrack.map(makeCoverage),
        inputCoverage: rule.input.map(makeCoverage),
        lookaheadCoverage: rule.lookahead.map(makeCoverage),
        lookupRecords: rule.lookupRecords
    };
}

/**
 * @param {{backtrack: number[][], input: number[][], lookahead: number[][], lookupRecords: unknown[]}} rule
 */
function format3Size(rule) {
    const positions = [...rule.backtrack, ...rule.input, ...rule.lookahead];
    return 10 + 2 * positions.length + 4 * rule.lookupRecords.length + positions.reduce((sum, glyphs) => sum + coverageSize(glyphs), 0);
}

/**
 * Format 1 subtable (every position one glyph), rules keyed by their first glyph in order.
 * @param {Array<{backtrack: number[][], input: number[][], lookahead: number[][], lookupRecords: ChainContextLookupRecord[]}>} rules
 * @param {string} formatKey
 */
function format1(rules, formatKey) {
    /** @type {Map<number, Array<object>>} */
    const sets = new Map();
    for (const rule of rules) {
        const first = rule.input[0][0];
        if (!sets.has(first)) sets.set(first, []);
        /** @type {Array<object>} */ (sets.get(first)).push({
            backtrack: rule.backtrack.map((glyphs) => glyphs[0]),
            input: rule.input.slice(1).map((glyphs) => glyphs[0]),
            lookahead: rule.lookahead.map((glyphs) => glyphs[0]),
            lookupRecords: rule.lookupRecords
        });
    }
    const firsts = [...sets.keys()].sort((a, b) => a - b);
    return { [formatKey]: 1, coverage: makeCoverage(firsts), chainRuleSets: firsts.map((glyph) => sets.get(glyph)) };
}

/**
 * @param {Array<{backtrack: number[][], input: number[][], lookahead: number[][], lookupRecords: unknown[]}>} rules
 */
function format1Size(rules) {
    const firsts = sortedSet(rules.map((rule) => rule.input[0][0]));
    return 6 + 2 * firsts.length + coverageSize(firsts) + 4 * firsts.length + rules.reduce((sum, rule) => sum + 2 + ruleTableSize(rule), 0);
}

/**
 * A run of rules whose positions are classes of three class definitions (backtrack,
 * input, lookahead): written as one format 2 subtable, rules keyed by the class of their
 * first glyph in order.
 */
class ClassGroup {
    constructor() {
        this.partitions = { backtrack: new ClassPartition(), input: new ClassPartition(), lookahead: new ClassPartition() };
        /** @type {Array<{rule: {backtrack: number[][], input: number[][], lookahead: number[][], lookupRecords: ChainContextLookupRecord[]}, classes: {backtrack: number[], input: number[], lookahead: number[]}}>} */
        this.rules = [];
        this.firsts = new Set();
        this.ruleBytes = 0;
    }

    /**
     * Add a rule when its positions fit the class definitions; false otherwise (nothing
     * changes).
     * @param {{backtrack: number[][], input: number[][], lookahead: number[][], lookupRecords: ChainContextLookupRecord[], keys: {backtrack: string[], input: string[], lookahead: string[]}}} rule
     * @param {number} maxSize
     */
    add(rule, maxSize) {
        const contexts = /** @type {const} */ (['backtrack', 'input', 'lookahead']);
        const counts = contexts.map((context) => this.partitions[context].members.length);
        const rollback = () => {
            for (let i = 0; i < contexts.length; i++) this.partitions[contexts[i]].truncate(counts[i]);
        };
        /** @type {{backtrack: number[], input: number[], lookahead: number[]}} */
        const classes = { backtrack: [], input: [], lookahead: [] };
        for (const context of contexts) {
            for (let i = 0; i < rule[context].length; i++) {
                const value = this.partitions[context].classOf(rule[context][i], rule.keys[context][i]);
                if (value < 0) { rollback(); return false; }
                classes[context].push(value);
            }
        }
        const ruleBytes = this.ruleBytes + 2 + ruleTableSize(rule);
        if (this.rules.length > 0) {
            // A bound first (a class definition range per glyph), the exact size near the limit.
            const glyphs = contexts.reduce((sum, context) => sum + this.partitions[context].byGlyph.size, 0);
            const bound = 12 + 6 * glyphs + 4 + 2 * (this.firsts.size + rule.input[0].length) + 6 * this.partitions.input.members.length + ruleBytes;
            if (bound > maxSize && this.estimate(this.partitions, ruleBytes, rule.input[0]) > maxSize) { rollback(); return false; }
        }
        this.rules.push({ rule, classes });
        for (const glyph of rule.input[0]) this.firsts.add(glyph);
        this.ruleBytes = ruleBytes;
        return true;
    }

    /**
     * @param {{backtrack: ClassPartition, input: ClassPartition, lookahead: ClassPartition}} partitions
     * @param {number} ruleBytes
     * @param {number[]} [extraFirsts]
     */
    estimate(partitions, ruleBytes, extraFirsts = []) {
        const firsts = sortedSet([...this.firsts, ...extraFirsts]);
        const classDefs = ['backtrack', 'input', 'lookahead'].reduce((sum, context) => sum + makeClassDef(partitions[/** @type {'backtrack'|'input'|'lookahead'} */ (context)].byGlyph).size, 0);
        return 12 + 2 * partitions.input.members.length + coverageSize(firsts) + classDefs + 4 * partitions.input.members.length + ruleBytes;
    }

    size() {
        return this.estimate(this.partitions, this.ruleBytes);
    }

    /**
     * Class 0 for the set holding every glyph the other classes do not (with `numGlyphs`).
     * @param {number|undefined} numGlyphs
     * @returns {{backtrack: (value: number) => number, input: (value: number) => number, lookahead: (value: number) => number}}
     */
    renumber(numGlyphs) {
        /** @type {Record<string, (value: number) => number>} */
        const maps = {};
        for (const context of /** @type {const} */ (['backtrack', 'input', 'lookahead'])) {
            const partition = this.partitions[context];
            let zero = -1;
            if (numGlyphs && partition.byGlyph.size === numGlyphs) {
                // The largest class takes class 0 (it must hold every glyph the others do not).
                let largest = 0;
                for (let value = 1; value < partition.members.length; value++) if (partition.members[value].length > largest) { largest = partition.members[value].length; zero = value; }
            }
            maps[context] = zero < 0 ? (value) => value : (value) => value === zero ? 0 : value < zero ? value : value - 1;
            if (zero >= 0) {
                const map = maps[context];
                const byGlyph = new Map();
                for (const [glyph, value] of partition.byGlyph) if (value !== zero) byGlyph.set(glyph, map(value));
                partition.byGlyph = byGlyph;
                partition.members = partition.members.filter((_, value) => value !== zero);
            }
        }
        return /** @type {{backtrack: (value: number) => number, input: (value: number) => number, lookahead: (value: number) => number}} */ (maps);
    }

    /**
     * @param {string} formatKey
     * @param {number|undefined} numGlyphs
     */
    encode(formatKey, numGlyphs) {
        const maps = this.renumber(numGlyphs);
        /** @type {Array<Array<object>|null>} */
        const sets = new Array(this.partitions.input.members.length).fill(null);
        for (const { rule, classes } of this.rules) {
            const first = maps.input(classes.input[0]);
            if (!sets[first]) sets[first] = [];
            /** @type {Array<object>} */ (sets[first]).push({
                backtrack: classes.backtrack.map(maps.backtrack),
                input: classes.input.slice(1).map(maps.input),
                lookahead: classes.lookahead.map(maps.lookahead),
                lookupRecords: rule.lookupRecords
            });
        }
        while (sets.length > 1 && sets[sets.length - 1] === null) sets.pop();
        return {
            [formatKey]: 2,
            coverage: makeCoverage(sortedSet([...this.firsts])),
            backtrackClassDef: makeClassDef(this.partitions.backtrack.byGlyph).table,
            inputClassDef: makeClassDef(this.partitions.input.byGlyph).table,
            lookaheadClassDef: makeClassDef(this.partitions.lookahead.byGlyph).table,
            chainClassSet: sets
        };
    }
}

/**
 * Encode chaining contextual rules into the smallest valid subtables that apply them in
 * the same order (the first rule matching at a position applies). Consecutive rules whose
 * positions are classes of shared class definitions (each position set equal to or
 * disjoint from the sets the same context already uses) share a class-based subtable
 * (format 2); such a run becomes a glyph-based subtable (format 1) when every position is
 * one glyph and that is smaller, or one coverage-based subtable per rule (format 3) when
 * that is smaller. A subtable at a position that matches no rule passes to the next one,
 * so splitting the rules into runs keeps their order.
 *
 * The subtables are in the form the GSUB lookup type 6 and GPOS lookup type 8 writers
 * take. Each rule's `lookupRecords` array is referenced, not copied, by the subtable (or
 * rule) it becomes, so records filled in later (lookup indexes known only once every
 * lookup is placed) reach the encoded subtables.
 * @param {ChainContextRule[]} rules
 * @param {ChainContextEncodeOptions} [options]
 * @returns {Array<object>}
 */
export function encodeChainContextRules(rules, options = {}) {
    const formatKey = options.formatKey || 'substFormat';
    const maxSize = options.maxSubtableSize || DEFAULT_MAX_SUBTABLE_SIZE;
    const numGlyphs = options.numGlyphs;
    /** @type {Map<string, string>} */
    const keys = new Map();
    const keyOf = (/** @type {number[]} */ glyphs) => {
        const raw = glyphs.join(',');
        let key = keys.get(raw);
        if (key === undefined) keys.set(raw, key = raw);
        return key;
    };
    const normalized = rules
        .filter((rule) => rule && Array.isArray(rule.input) && rule.input.length > 0)
        .map((rule) => {
            const backtrack = (rule.backtrack || []).map(sortedSet);
            const input = rule.input.map(sortedSet);
            const lookahead = (rule.lookahead || []).map(sortedSet);
            return {
                backtrack, input, lookahead,
                lookupRecords: rule.lookupRecords || [],
                keys: { backtrack: backtrack.map(keyOf), input: input.map(keyOf), lookahead: lookahead.map(keyOf) }
            };
        })
        // A position no glyph can fill never matches: the rule can never apply.
        .filter((rule) => [...rule.backtrack, ...rule.input, ...rule.lookahead].every((glyphs) => glyphs.length > 0));

    /** @type {Array<ClassGroup | {lone: typeof normalized[number]}>} */
    const groups = [];
    let group = new ClassGroup();
    for (const rule of normalized) {
        if (group.add(rule, maxSize)) continue;
        if (group.rules.length > 0) groups.push(group);
        group = new ClassGroup();
        // A rule whose own sets overlap within a context has coverages of its own.
        if (!group.add(rule, Infinity)) groups.push({ lone: rule });
    }
    if (group.rules.length > 0) groups.push(group);

    /** @type {Array<object>} */
    const subtables = [];
    for (const run of groups) {
        if (!(run instanceof ClassGroup)) {
            subtables.push(format3(run.lone, formatKey));
            continue;
        }
        const runRules = run.rules.map((entry) => entry.rule);
        const single = runRules.every((rule) => [...rule.backtrack, ...rule.input, ...rule.lookahead].every((glyphs) => glyphs.length === 1));
        /** @type {Array<{size: number, make: () => Array<object>}>} */
        const candidates = [
            { size: run.size(), make: () => [run.encode(formatKey, numGlyphs)] },
            { size: runRules.reduce((sum, rule) => sum + format3Size(rule), 0), make: () => runRules.map((rule) => format3(rule, formatKey)) }
        ];
        if (single) candidates.push({ size: format1Size(runRules), make: () => [format1(runRules, formatKey)] });
        candidates.sort((a, b) => a.size - b.size);
        subtables.push(...candidates[0].make());
    }
    return subtables;
}
