/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unused-vars, no-unused-vars, no-useless-escape, no-control-regex, no-empty -- Obsidian's API surface and several untyped third-party libraries force dynamic dispatch; floating promises are intentional in DOM/event handlers; matching enable at end of file */
import { App, normalizePath } from 'obsidian';

// ═══════════════════════════════════════════════════════
//  Universal Field Template Service
//
//  Stores field template definitions in the project's
//  System/field-templates.json so they sync across devices.
// ═══════════════════════════════════════════════════════

/** Type of input control for a universal field */
export type UniversalFieldType = 'text' | 'textarea' | 'dropdown' | 'multi-select';

/** A single universal field template definition */
export interface UniversalFieldTemplate {
    /** Unique ID (generated once, stable across edits) */
    id: string;
    /** Human-readable label shown in the UI */
    label: string;
    /** Which section this field belongs to (must match a category section title) */
    section: string;
    /** Which entity category this field belongs to (e.g. 'character', 'location', 'items', 'creatures'). Empty/undefined = 'character' for backward compat. */
    category?: string;
    /** Input type */
    type: UniversalFieldType;
    /** Dropdown options (used when type === 'dropdown' or 'multi-select') */
    options: string[];
    /** Optional vault folder path whose note names are used as selectable options */
    folderSource?: string;
    /** Placeholder / hint text */
    placeholder: string;
    /** Sort order within the section (higher = further down, default 0) */
    order: number;
    /**
     * Issue #71 — when set, the field's value is mirrored to a top-level
     * YAML key with this name (in addition to `universalFields[id]`).
     * This makes the value visible to Obsidian Properties, Bases, and
     * Dataview without requiring users to dig into nested objects.
     */
    topLevelKey?: string;
    /**
     * Issue #77 — optional default value applied when a new entity
     * (currently scenes) is created. For multi-select fields this can be
     * a comma-separated string; the consumer normalises it.
     */
    defaultValue?: string;
}

/** On-disk shape of field-templates.json */
export interface FieldTemplateFile {
    version: number;
    fields: UniversalFieldTemplate[];
}


/**
 * Change event fired by {@link FieldTemplateService} after a template is
 * added, updated, or removed. The plugin uses this to keep entity files'
 * top-level YAML in sync with the template's `topLevelKey` / `folderSource`
 * settings (issue #71 follow-up: existing entries should auto-migrate).
 */
export interface FieldTemplateChange {
    type: 'add' | 'update' | 'remove';
    id: string;
    /** Snapshot of the template *after* the change (undefined for `remove`). */
    template?: UniversalFieldTemplate;
    /** topLevelKey value *before* the change (set on update / remove). */
    oldTopLevelKey?: string;
    /** Whether the topLevelKey changed during this update. */
    topLevelKeyChanged?: boolean;
    /** Whether the folderSource flag changed during this update. */
    folderSourceChanged?: boolean;
}

/**
 * Manages universal field templates stored in the project's System/ folder.
 * Templates define extra fields that appear on *every* character sheet in the
 * chosen section.  The actual per-character data lives in the character's
 * `universalFields` record (keyed by template id).
 */
export class FieldTemplateService {
    private app: App;
    private templates: UniversalFieldTemplate[] = [];
    /** Resolver set by the plugin so we don't depend on main.ts directly */
    private getSystemFolder: () => string;
    private onChange?: (change: FieldTemplateChange) => void | Promise<void>;

    constructor(app: App, getSystemFolder: () => string) {
        this.app = app;
        this.getSystemFolder = getSystemFolder;
    }

    /** Register a callback to run after add/update/remove. Used for migrations. */
    setOnChange(fn: (change: FieldTemplateChange) => void | Promise<void>): void {
        this.onChange = fn;
    }


    // ── Accessors ──────────────────────────────────────

    /** All loaded templates */
    getAll(): UniversalFieldTemplate[] {
        return [...this.templates];
    }

    /** Templates belonging to a specific section, optionally scoped by category */
    getBySection(sectionTitle: string, category?: string): UniversalFieldTemplate[] {
        return this.templates
            .filter(t => {
                if (t.section !== sectionTitle) return false;
                // Scope by category if provided
                if (category !== undefined) {
                    const tCat = t.category || 'character';
                    return tCat === category;
                }
                return true;
            })
            .sort((a, b) => a.order - b.order);
    }

    /** Single template by ID */
    getById(id: string): UniversalFieldTemplate | undefined {
        return this.templates.find(t => t.id === id);
    }

    // ── CRUD ───────────────────────────────────────────

    /** Add a new template and persist */
    async add(template: UniversalFieldTemplate): Promise<void> {
        this.templates.push(template);
        await this.save();
        try {
            await this.onChange?.({
                type: 'add',
                id: template.id,
                template,
                topLevelKeyChanged: !!template.topLevelKey,
                folderSourceChanged: !!template.folderSource,
            });
        } catch (e) { console.error('[StoryLine] FieldTemplate onChange (add):', e); }
    }

    /** Update an existing template in-place and persist */
    async update(id: string, patch: Partial<Omit<UniversalFieldTemplate, 'id'>>): Promise<void> {
        const t = this.templates.find(f => f.id === id);
        if (!t) return;
        const oldTopLevelKey = t.topLevelKey;
        const oldFolderSource = t.folderSource;
        Object.assign(t, patch);
        await this.save();
        try {
            await this.onChange?.({
                type: 'update',
                id,
                template: { ...t },
                oldTopLevelKey,
                topLevelKeyChanged: oldTopLevelKey !== t.topLevelKey,
                folderSourceChanged: oldFolderSource !== t.folderSource,
            });
        } catch (e) { console.error('[StoryLine] FieldTemplate onChange (update):', e); }
    }

    /** Remove a template by ID and persist */
    async remove(id: string): Promise<void> {
        const removed = this.templates.find(t => t.id === id);
        this.templates = this.templates.filter(t => t.id !== id);
        await this.save();
        try {
            await this.onChange?.({
                type: 'remove',
                id,
                oldTopLevelKey: removed?.topLevelKey,
                topLevelKeyChanged: !!removed?.topLevelKey,
            });
        } catch (e) { console.error('[StoryLine] FieldTemplate onChange (remove):', e); }
    }

    /** Reorder: move template to a new position within its section */
    async reorder(id: string, newOrder: number): Promise<void> {
        const t = this.templates.find(f => f.id === id);
        if (!t) return;
        t.order = newOrder;
        await this.save();
    }

    // ── Persistence ────────────────────────────────────

    /** Load templates from System/field-templates.json */
    async load(): Promise<void> {
        try {
            const adapter = this.app.vault.adapter;
            const filePath = normalizePath(`${this.getSystemFolder()}/field-templates.json`);
            if (!await adapter.exists(filePath)) {
                this.templates = [];
                return;
            }
            const txt = await adapter.read(filePath);
            const data: FieldTemplateFile = JSON.parse(txt);
            if (Array.isArray(data.fields)) {
                this.templates = data.fields.map(f => ({
                    id: f.id ?? generateId(),
                    label: f.label ?? 'Untitled',
                    section: f.section ?? 'Other',
                    category: f.category,
                    type: f.type ?? 'text',
                    options: Array.isArray(f.options) ? f.options : [],
                    folderSource: f.folderSource,
                    placeholder: f.placeholder ?? '',
                    order: typeof f.order === 'number' ? f.order : 0,
                    topLevelKey: typeof f.topLevelKey === 'string' && f.topLevelKey.trim() ? f.topLevelKey.trim() : undefined,
                    defaultValue: typeof f.defaultValue === 'string' && f.defaultValue.length > 0 ? f.defaultValue : undefined,
                }));
            } else {
                this.templates = [];
            }
        } catch {
            this.templates = [];
        }
    }

    /** Save templates to System/field-templates.json */
    async save(): Promise<void> {
        try {
            const adapter = this.app.vault.adapter;
            const systemFolder = normalizePath(this.getSystemFolder());
            if (!await adapter.exists(systemFolder)) {
                await this.app.vault.createFolder(systemFolder);
            }
            const data: FieldTemplateFile = {
                version: 1,
                fields: this.templates,
            };
            await adapter.write(
                normalizePath(`${systemFolder}/field-templates.json`),
                JSON.stringify(data, null, 2),
            );
        } catch (e) {
            console.error('[StoryLine] FieldTemplateService.save():', e);
        }
    }
}

// ── Helpers ────────────────────────────────────────────

/** Generate a short unique ID */
export function generateId(): string {
    return `uf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Issue #71 — top-level YAML mirror for custom fields ──

/**
 * Reserved frontmatter keys that universal-field topLevelKey values must
 * never collide with. Editing these from a custom field would corrupt
 * core StoryLine data.
 */
export const RESERVED_TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
    'type', 'name', 'title', 'created', 'modified',
    'act', 'chapter', 'sequence', 'chronologicalOrder', 'chronological_order',
    'pov', 'characters', 'location', 'tags', 'status',
    'storyDate', 'story_date', 'storyTime', 'story_time', 'timeline',
    'conflict', 'emotion', 'intensity', 'wordcount', 'target_wordcount',
    'setup_scenes', 'payoff_scenes', 'codexLinks', 'beatsheet',
    'corkboardNote', 'corkboardNoteColor', 'corkboardNoteImage',
    'corkboardNoteCaption', 'plotgridOrigin', 'subtitle', 'color',
    'timeline_mode', 'timeline_strand',
    'image', 'gallery', 'tagline', 'role', 'occupation', 'residency',
    'family', 'appearance', 'personality', 'goal', 'belief', 'misbelief',
    'fears', 'flaws', 'strengths', 'relations', 'books',
    'world', 'parent', 'description', 'geography', 'culture', 'politics',
    'magicTechnology', 'beliefs', 'economy', 'history', 'locationType',
    'atmosphere', 'significance', 'inhabitants', 'connectedLocations',
    'mapNotes',
    'custom', 'universalFields', 'notes',
]);

/** Slugify a label into a YAML-safe top-level key. */
export function suggestTopLevelKey(label: string): string {
    return String(label || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40)
        || 'field';
}

/** True if a top-level key is safe to use (not reserved). */
export function isReservedTopLevelKey(key: string): boolean {
    return RESERVED_TOP_LEVEL_KEYS.has(String(key || '').trim());
}

/** Module-level template provider so parsers don't depend on plugin instance. */
let _templatesProvider: () => UniversalFieldTemplate[] = () => [];
let _topLevelMirrorEnabled = true;
export function setActiveTemplatesProvider(fn: () => UniversalFieldTemplate[]): void {
    _templatesProvider = fn;
}
export function setTopLevelMirrorEnabled(on: boolean): void {
    _topLevelMirrorEnabled = !!on;
}
export function getActiveTemplates(): UniversalFieldTemplate[] {
    try { return _templatesProvider() || []; } catch { return []; }
}

/**
 * Strip Obsidian wikilink brackets and any pipe-aliases off a value, leaving
 * just the target name. Safe to call on plain strings, wikilink strings, or
 * arrays mixing both. Used when reading universal-field values back from a
 * top-level YAML key that may have been written as `[[Note]]` for a
 * folder-sourced field.
 */
export function stripWikilinks(value: unknown): unknown {
    const strip = (s: string): string => {
        const m = s.match(/^\[\[([^\]]+)\]\]$/);
        if (!m) return s;
        const inner = m[1];
        const pipeIdx = inner.indexOf('|');
        return (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner).trim();
    };
    if (Array.isArray(value)) {
        return value.map(v => (typeof v === 'string' ? strip(v) : v));
    }
    if (typeof value === 'string') return strip(value);
    return value;
}

/**
 * Wrap a folder-sourced field value as Obsidian wikilink(s) for top-level
 * YAML mirroring, so the property becomes clickable in Properties / Bases /
 * Dataview. The internal `universalFields[id]` representation stays as plain
 * names to keep the dropdown UI matching its options. Already-wikilinked
 * input is left untouched.
 */
function wrapAsWikilinks(value: unknown): unknown {
    const wrap = (s: string): string => {
        const trimmed = s.trim();
        if (!trimmed) return s;
        if (/^\[\[[^\]]+\]\]$/.test(trimmed)) return trimmed;
        return `[[${trimmed}]]`;
    };
    if (Array.isArray(value)) {
        return value.map(v => (typeof v === 'string' && v.trim() ? wrap(v) : v));
    }
    if (typeof value === 'string') return wrap(value);
    return value;
}

/**
 * Hydrate `universalFields` from any matching top-level YAML keys. If a
 * template's `topLevelKey` is present in fm and the corresponding
 * universalFields[id] is missing, copy the value across. Issue #71.
 *
 * For folder-sourced templates, top-level YAML may store `[[Wikilinks]]`
 * (so Obsidian Properties shows them as clickable links). We strip the
 * brackets when copying back so the in-memory value matches the dropdown
 * option strings.
 */
export function hydrateUniversalFieldsFromTopLevel(
    fm: Record<string, unknown>,
    universalFields: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
    const templates = getActiveTemplates();
    if (!templates.length) return universalFields;
    let result = universalFields ? { ...universalFields } : undefined;
    for (const t of templates) {
        const k = t.topLevelKey;
        if (!k || isReservedTopLevelKey(k)) continue;
        const top = fm[k];
        if (top === undefined || top === null || top === '') continue;
        if (!result) result = {};
        if (result[t.id] === undefined || result[t.id] === '' || result[t.id] === null) {
            const isFolderSourced = !!t.folderSource && (t.type === 'dropdown' || t.type === 'multi-select');
            result[t.id] = isFolderSourced ? stripWikilinks(top) : top;
        }
    }
    return result;
}

/**
 * Mirror universal-field values back to top-level YAML keys for templates
 * that opt in via `topLevelKey`. Mutates `fm` in place. Issue #71.
 * Removes the top-level key when the value is empty so the YAML stays clean.
 *
 * For folder-sourced dropdown / multi-select templates, the mirrored value
 * is wrapped in `[[wikilinks]]` so it becomes clickable in Obsidian
 * Properties / Bases / Dataview.
 */
export function mirrorUniversalFieldsToTopLevel(
    fm: Record<string, unknown>,
    universalFields: Record<string, unknown> | undefined,
): void {
    if (!_topLevelMirrorEnabled) return;
    const templates = getActiveTemplates();
    if (!templates.length) return;
    for (const t of templates) {
        const k = t.topLevelKey;
        if (!k || isReservedTopLevelKey(k)) continue;
        const v = universalFields ? universalFields[t.id] : undefined;
        if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
            delete fm[k];
        } else {
            const isFolderSourced = !!t.folderSource && (t.type === 'dropdown' || t.type === 'multi-select');
            fm[k] = isFolderSourced ? wrapAsWikilinks(v) : v;
        }
    }
}
/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unused-vars, no-unused-vars, no-useless-escape, no-control-regex, no-empty -- end of file-wide suppression block opened at line 1 */
