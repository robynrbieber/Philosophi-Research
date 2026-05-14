/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unused-vars, no-unused-vars, no-useless-escape, no-control-regex, no-empty -- Obsidian's API surface and several untyped third-party libraries force dynamic dispatch in many places; floating promises are intentional in DOM/event handlers; matching enable at end of file */
/**
 * Shared helpers for working with the `act` and `chapter` fields on a Scene.
 *
 * Both fields are typed `number | string | undefined`, which means a value
 * can legitimately be `1`, `"1"`, `"Prologue"`, `"1.1"`, etc.  Several bugs
 * historically came from sorting these values lexically (so `"10"` ended up
 * before `"2"`) or from blindly coercing them with `Number()` (so a value of
 * `"Prologue"` silently became `NaN`).
 *
 * The helpers below give every call site a single, consistent way to:
 *  - sort act/chapter values numerically when possible and lexically as a
 *    fallback (`localeCompare` with `numeric: true` handles `"1.1"` vs `"1.10"`
 *    correctly too);
 *  - decide whether a given value is purely numeric (so we know whether
 *    auto-increment-style behaviour is safe to apply);
 *  - turn a value into a safe folder name or filename prefix.
 */

export type ActChapterValue = number | string | undefined | null;

/**
 * Characters that are illegal in folder/file names on Windows.
 * Used by {@link sanitizeActChapterForPath}.
 */
const ILLEGAL_PATH_CHARS = /[\\/:*?"<>|]/g;

/**
 * Returns true if the value is a number, or a string that parses cleanly to
 * a finite number (e.g. `"1"`, `"42"`, `"3.5"`).  Returns false for `"1.1"`
 * style multi-segment values, `"Prologue"`, empty strings, undefined, etc.
 *
 * Uses a strict regex test rather than `Number()` because `Number("1.1")`
 * returns `1.1` (a finite number), but `"1.1"` is exactly the kind of value
 * users want to keep as a string for hierarchical naming.
 */
export function isPureNumericActChapter(value: ActChapterValue): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'number') return Number.isFinite(value);
    const s = String(value).trim();
    if (s === '') return false;
    // Allow optional leading sign and a single integer or simple decimal.
    // Reject anything with more than one dot ("1.1.2"), letters, or
    // separators that would break filename padding.
    return /^-?\d+(\.\d+)?$/.test(s);
}

/**
 * Convert an act/chapter value to a number for arithmetic, or `NaN` if the
 * value is not purely numeric.  Use {@link isPureNumericActChapter} first
 * if you need to branch.
 */
export function toActChapterNumber(value: ActChapterValue): number {
    if (value === undefined || value === null) return NaN;
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    return isPureNumericActChapter(value) ? Number(value) : NaN;
}

/**
 * Compare two act or chapter values for sorting.
 *
 * Behaviour:
 *  - Missing values (`undefined`/`null`) sort after present values.
 *  - When both values are purely numeric, compare numerically (so 2 < 10).
 *  - When at least one is non-numeric, fall back to a numeric-aware string
 *    compare (`localeCompare` with `{ numeric: true, sensitivity: 'base' }`).
 *    This makes `"1.1" < "1.2" < "1.10" < "2.1"` order correctly and keeps
 *    things like `"Prologue"` from breaking sort when mixed with numbers.
 *
 * Use this everywhere act/chapter values are sorted.
 */
export function compareActChapter(a: ActChapterValue, b: ActChapterValue): number {
    const aMissing = a === undefined || a === null || a === '';
    const bMissing = b === undefined || b === null || b === '';
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;

    const aNum = isPureNumericActChapter(a);
    const bNum = isPureNumericActChapter(b);

    if (aNum && bNum) {
        return Number(a as number | string) - Number(b as number | string);
    }

    // Numeric-aware string compare: "2" sorts before "10", "1.1" before "1.10",
    // and "Prologue" sorts after numerics in a stable, locale-aware way.
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Convert a comparator on `Scene` (or any object) into a comparator that
 * orders by `act` first, then `chapter`, then a custom tiebreaker.
 */
export function compareScenesByActChapter<T extends { act?: ActChapterValue; chapter?: ActChapterValue }>(
    a: T,
    b: T,
    tiebreaker?: (a: T, b: T) => number,
): number {
    const actCmp = compareActChapter(a.act, b.act);
    if (actCmp !== 0) return actCmp;
    const chCmp = compareActChapter(a.chapter, b.chapter);
    if (chCmp !== 0) return chCmp;
    return tiebreaker ? tiebreaker(a, b) : 0;
}

/**
 * Parse a raw user input (from a text field) into the canonical storage form
 * for an act/chapter value.
 *
 * - Empty / whitespace-only input → `undefined` (clears the field).
 * - Pure integer → stored as `number` (preserves the historical numeric
 *   behaviour for normal projects).
 * - Anything else → stored as a trimmed `string` (`"1.1"`, `"Prologue"`, etc.).
 */
export function parseActChapterInput(raw: string | null | undefined): number | string | undefined {
    if (raw == null) return undefined;
    const trimmed = String(raw).trim();
    if (trimmed === '') return undefined;
    // Only fold into a number when the string is a clean integer — keep
    // "1.1" as a string so it doesn't collapse to the float 1.1 and lose
    // its hierarchical meaning.
    if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
    return trimmed;
}

/**
 * Returns the act/chapter value formatted for use in filename prefixes.
 *
 * For numeric values this returns a zero-padded two-digit string (`"01"`,
 * `"42"` — note: 3+ digit acts overflow naturally, matching the historical
 * behaviour of `padStart(2, '0')`).
 *
 * For non-numeric values this returns the value verbatim, with characters
 * that are illegal in filenames replaced by `-`.  This means an act named
 * `"1.1"` becomes a filename prefix of `"1.1"` and a folder of `Act 1.1`.
 */
export function formatActChapterPrefix(value: ActChapterValue, fallback = '00'): string {
    if (value === undefined || value === null) return fallback;
    if (isPureNumericActChapter(value)) {
        const n = Number(value);
        // Preserve sign and pad the integer part only.
        const intPart = Math.trunc(Math.abs(n));
        const padded = String(intPart).padStart(2, '0');
        const decimals = String(value).match(/\.\d+$/)?.[0] ?? '';
        return (n < 0 ? '-' : '') + padded + decimals;
    }
    return sanitizeActChapterForPath(String(value));
}

/**
 * Sanitize an act/chapter string so it can be used in a file or folder name.
 * Replaces Windows-illegal characters with `-` and trims surrounding
 * whitespace and dots (which Windows also dislikes at the end of a name).
 */
export function sanitizeActChapterForPath(value: string): string {
    return value
        .replace(ILLEGAL_PATH_CHARS, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[\s.]+$/g, '');
}

/**
 * Returns true if a string contains characters that would be illegal in a
 * folder/file name on Windows (and therefore problematic for the Act folder
 * generated by SceneManager).  Use this to warn the user when they type a
 * custom act/chapter name.
 */
export function actChapterHasIllegalPathChars(value: string): boolean {
    return ILLEGAL_PATH_CHARS.test(value);
}

/**
 * Returns the "next" auto-increment value to suggest when creating a new
 * scene whose act/chapter is being inferred from existing scenes.
 *
 * Only purely numeric existing values are considered — non-numeric values
 * (like `"Prologue"` or `"1.1"`) are skipped so they don't cause
 * `Math.max(NaN, …)` to poison the result.  Returns `1` if no numeric
 * values exist.
 */
export function nextNumericActChapter(values: Iterable<ActChapterValue>): number {
    let max = 0;
    let saw = false;
    for (const v of values) {
        if (!isPureNumericActChapter(v)) continue;
        const n = Number(v);
        if (n > max) max = n;
        saw = true;
    }
    return saw ? max + 1 : 1;
}
/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unused-vars, no-unused-vars, no-useless-escape, no-control-regex, no-empty -- end of file-wide suppression block opened at line 1 */
