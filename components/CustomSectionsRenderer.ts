/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises -- Obsidian DOM API forces dynamic dispatch */
/**
 * Shared renderer for user-defined custom sections (#114, #120).
 *
 * Originally introduced for Codex categories; now lifted into a shared helper
 * so Character and Location views can reuse the same section / field UX
 * without copy-pasting the modals and persistence logic.
 *
 * A "draft" host object is expected to expose a `custom?: Record<string,string>`
 * map; field values for sections are stored there under a composite key:
 *   `${sectionTitle}${CUSTOM_SECTION_KEY_SEP}${fieldName}`
 * so the flat custom-fields list can filter them out.
 */

import { App, Modal, Notice, Setting, setIcon } from 'obsidian';
import { attachTooltip } from './Tooltip';

/** Composite-key separator used to namespace fields inside custom sections. */
export const CUSTOM_SECTION_KEY_SEP = ' :: ';

export interface CustomSection {
    title: string;
    fields: string[];
    /**
     * Slot at which this section renders within the host view.
     *   0                       → above the first built-in section
     *   k (1 ≤ k ≤ builtinCount) → after the k-th built-in section
     *   builtinCount (or undef) → at the end (legacy default)
     * Multiple custom sections may share the same slot; their order within
     * the slot is determined by their order in the `sections` array.
     */
    position?: number;
}

export interface CustomSectionsHost<TDraft extends { custom?: Record<string, string> }> {
    app: App;
    draft: TDraft;
    /**
     * Mutable section list backing this draft. The helper mutates this array
     * in place when the user adds / renames / deletes sections or fields.
     */
    sections: CustomSection[];
    /**
     * Number of built-in (non-custom) sections rendered by the host view.
     * Used to clamp `position` and to compute the final "end" slot.
     */
    builtinSectionCount: number;
    /** Set tracking which section bodies are currently collapsed. */
    collapsedSections: Set<string>;
    /**
     * Namespaces the collapsed-section keys so sections from different views
     * (or different codex categories) never collide.
     * Example: `codex::npc`, `character`, `location`.
     */
    collapseKeyPrefix: string;
    /**
     * CSS class prefix so the helper matches the host view's existing look.
     * Each view already styles `${cssPrefix}-section`, `${cssPrefix}-section-header`,
     * etc. — we reuse those rules instead of inventing a new design token.
     */
    cssPrefix: 'codex' | 'character' | 'location';
    /** Persist any change to the field VALUES on the draft. */
    scheduleSave: (draft: TDraft) => void;
    /** Persist the section STRUCTURE (titles / field lists / positions) to plugin settings. */
    persistSections: () => void;
    /** Trigger a full re-render of the host view. */
    requestRerender: () => void;
}

/** Effective position for a section (clamped to [0, builtinCount]). */
function effectivePosition(sec: CustomSection, builtinCount: number): number {
    const p = sec.position;
    if (p === undefined || p === null || isNaN(p)) return builtinCount;
    if (p < 0) return 0;
    if (p > builtinCount) return builtinCount;
    return p;
}

function compositeKey(sectionTitle: string, fieldName: string): string {
    return `${sectionTitle}${CUSTOM_SECTION_KEY_SEP}${fieldName}`;
}

/** True for any key that belongs to a custom section (so callers can skip it
 *  in their flat "Custom Fields" lists). */
export function isCustomSectionKey(key: string): boolean {
    return key.includes(CUSTOM_SECTION_KEY_SEP);
}

/**
 * Ensure draft.custom has entries for every section field. Idempotent.
 */
function seedDraftCustom<T extends { custom?: Record<string, string> }>(
    host: CustomSectionsHost<T>
): void {
    const { draft, sections } = host;
    if (sections.length === 0) return;
    if (!draft.custom) draft.custom = {};
    for (const sec of sections) {
        for (const fname of sec.fields) {
            const key = compositeKey(sec.title, fname);
            if (!(key in draft.custom)) draft.custom[key] = '';
        }
    }
}

/**
 * Compute the global ordering of sections grouped by slot. Returns an array
 * indexed by slot (0..builtinCount inclusive) where each entry is the list of
 * `CustomSection`s at that slot, in their array order.
 */
function bucketBySlot<T extends { custom?: Record<string, string> }>(
    host: CustomSectionsHost<T>
): CustomSection[][] {
    const buckets: CustomSection[][] = [];
    for (let i = 0; i <= host.builtinSectionCount; i++) buckets.push([]);
    for (const sec of host.sections) {
        const slot = effectivePosition(sec, host.builtinSectionCount);
        buckets[slot].push(sec);
    }
    return buckets;
}

/**
 * Move a section one step earlier in the interleaved order (slot+slot-internal).
 * Returns true if the move was applied.
 */
function moveSectionUp(sec: CustomSection, host: CustomSectionsHost<any>): boolean {
    const builtinCount = host.builtinSectionCount;
    const buckets = bucketBySlot(host);
    const slot = effectivePosition(sec, builtinCount);
    const bucket = buckets[slot];
    const indexInBucket = bucket.indexOf(sec);
    if (indexInBucket > 0) {
        // Swap order within the same slot — i.e. swap positions of
        // sec and its predecessor in the global `sections` array.
        const prev = bucket[indexInBucket - 1];
        const a = host.sections.indexOf(sec);
        const b = host.sections.indexOf(prev);
        host.sections[a] = prev;
        host.sections[b] = sec;
        return true;
    }
    // First in this slot. Move to previous slot if any.
    if (slot > 0) {
        sec.position = slot - 1;
        return true;
    }
    return false;
}

/**
 * Move a section one step later. Returns true if applied.
 */
function moveSectionDown(sec: CustomSection, host: CustomSectionsHost<any>): boolean {
    const builtinCount = host.builtinSectionCount;
    const buckets = bucketBySlot(host);
    const slot = effectivePosition(sec, builtinCount);
    const bucket = buckets[slot];
    const indexInBucket = bucket.indexOf(sec);
    if (indexInBucket < bucket.length - 1) {
        const next = bucket[indexInBucket + 1];
        const a = host.sections.indexOf(sec);
        const b = host.sections.indexOf(next);
        host.sections[a] = next;
        host.sections[b] = sec;
        return true;
    }
    if (slot < builtinCount) {
        sec.position = slot + 1;
        return true;
    }
    return false;
}

/** True if `sec` is the very first section in interleaved order. */
function isFirstSection(sec: CustomSection, host: CustomSectionsHost<any>): boolean {
    if (effectivePosition(sec, host.builtinSectionCount) !== 0) return false;
    // Slot 0 — only first iff host has zero built-ins AND sec is index 0 of slot 0.
    if (host.builtinSectionCount > 0) return false;
    const buckets = bucketBySlot(host);
    return buckets[0][0] === sec;
}

/** True if `sec` is the very last section in interleaved order. */
function isLastSection(sec: CustomSection, host: CustomSectionsHost<any>): boolean {
    const builtinCount = host.builtinSectionCount;
    if (effectivePosition(sec, builtinCount) !== builtinCount) return false;
    const buckets = bucketBySlot(host);
    const lastBucket = buckets[builtinCount];
    return lastBucket[lastBucket.length - 1] === sec;
}

/**
 * Render every custom section assigned to `slot`. `slot` is the number of
 * built-in sections that have already been rendered; slot 0 = before any
 * built-in, slot host.builtinSectionCount = after the last built-in.
 *
 * Hosts that interleave should call this between each built-in:
 *
 *     renderCustomSectionsAtSlot(parent, host, 0);          // before
 *     for (let i = 0; i < cats.length; i++) {
 *         renderBuiltin(parent, cats[i]);
 *         renderCustomSectionsAtSlot(parent, host, i + 1);  // after each
 *     }
 *     renderAddCustomSectionButton(parent, host);
 */
export function renderCustomSectionsAtSlot<T extends { custom?: Record<string, string> }>(
    container: HTMLElement,
    host: CustomSectionsHost<T>,
    slot: number
): void {
    seedDraftCustom(host);
    const buckets = bucketBySlot(host);
    if (slot < 0 || slot >= buckets.length) return;
    for (const sec of buckets[slot]) {
        renderOneSection(container, host, sec);
    }
}

/**
 * Render the "+ Add custom section" button (placed once, at the bottom).
 */
export function renderAddCustomSectionButton<T extends { custom?: Record<string, string> }>(
    container: HTMLElement,
    host: CustomSectionsHost<T>
): void {
    const { app, sections } = host;
    const addSectionRow = container.createDiv('codex-add-custom-section-row');
    const addSectionBtn = addSectionRow.createEl('button', {
        cls: 'codex-add-custom-section-btn',
        text: '+ Add custom section',
    });
    addSectionBtn.addEventListener('click', () => {
        const modal = new AddCustomSectionModal(app, '', (title) => {
            const trimmed = title.trim();
            if (!trimmed) return;
            if (sections.some(s => s.title === trimmed)) {
                new Notice(`A section called "${trimmed}" already exists.`);
                return;
            }
            // New sections land at the end (legacy default).
            sections.push({ title: trimmed, fields: [], position: host.builtinSectionCount });
            host.persistSections();
            host.requestRerender();
        });
        modal.open();
    });
}

/**
 * Legacy entry point — renders ALL sections in interleaved order (so position
 * is still respected, but without inlining built-in sections in between).
 * Hosts that want true interleaving should use `renderCustomSectionsAtSlot`
 * between their built-in render calls.
 */
export function renderCustomSections<T extends { custom?: Record<string, string> }>(
    container: HTMLElement,
    host: CustomSectionsHost<T>
): void {
    seedDraftCustom(host);
    for (let slot = 0; slot <= host.builtinSectionCount; slot++) {
        renderCustomSectionsAtSlot(container, host, slot);
    }
    renderAddCustomSectionButton(container, host);
}

/**
 * Render a single custom section (header + body + add-field row).
 * Used internally by `renderCustomSectionsAtSlot`.
 */
function renderOneSection<T extends { custom?: Record<string, string> }>(
    container: HTMLElement,
    host: CustomSectionsHost<T>,
    sec: CustomSection
): void {
    const { app, draft, sections, collapsedSections, collapseKeyPrefix, cssPrefix } = host;

    const headerLabel = `${cssPrefix}-section-header`;
    const bodyLabel = `${cssPrefix}-section-body`;
    const sectionLabel = `${cssPrefix}-section`;
    const chevronLabel = `${cssPrefix}-section-chevron`;
    const iconLabel = `${cssPrefix}-section-icon`;
    const titleLabel = `${cssPrefix}-section-title`;
    const fieldRowLabel = `${cssPrefix}-field-row`;
    const fieldLabelLabel = `${cssPrefix}-field-label`;
    const fieldInputLabel = `${cssPrefix}-field-input`;
    const customRowLabel = `${cssPrefix}-custom-field-row`;
    const customRemoveLabel = `${cssPrefix}-custom-field-remove`;

    {
        const section = container.createDiv(`${sectionLabel} ${cssPrefix}-section-custom`);
        const header = section.createDiv(headerLabel);
        const chevron = header.createSpan({ cls: chevronLabel });

        const sectionKey = `custom-section::${collapseKeyPrefix}::${sec.title}`;
        const isCollapsed = collapsedSections.has(sectionKey);
        setIcon(chevron, isCollapsed ? 'chevron-right' : 'chevron-down');

        const icon = header.createSpan({ cls: iconLabel });
        setIcon(icon, 'layout-grid');
        header.createSpan({ cls: titleLabel, text: sec.title });

        // Move up / move down / rename / delete actions — icon-only spans
        // matching the rest of the app (no <button> elements).
        const actions = header.createSpan({ cls: 'codex-section-actions' });
        const stop = (e: Event) => e.stopPropagation();
        const disabledAttr = 'data-disabled';

        // Move section up — walks the interleaved order (across built-in slots)
        const moveUpBtn = actions.createSpan({
            cls: 'codex-section-action-btn',
            attr: { 'aria-label': 'Move section up', role: 'button' },
        });
        setIcon(moveUpBtn, 'chevron-up');
        attachTooltip(moveUpBtn, 'Move section up');
        if (isFirstSection(sec, host)) moveUpBtn.setAttr(disabledAttr, 'true');
        moveUpBtn.addEventListener('click', (e) => {
            stop(e);
            if (moveUpBtn.hasAttribute(disabledAttr)) return;
            if (moveSectionUp(sec, host)) {
                host.persistSections();
                host.requestRerender();
            }
        });

        // Move section down — walks the interleaved order
        const moveDownBtn = actions.createSpan({
            cls: 'codex-section-action-btn',
            attr: { 'aria-label': 'Move section down', role: 'button' },
        });
        setIcon(moveDownBtn, 'chevron-down');
        attachTooltip(moveDownBtn, 'Move section down');
        if (isLastSection(sec, host)) moveDownBtn.setAttr(disabledAttr, 'true');
        moveDownBtn.addEventListener('click', (e) => {
            stop(e);
            if (moveDownBtn.hasAttribute(disabledAttr)) return;
            if (moveSectionDown(sec, host)) {
                host.persistSections();
                host.requestRerender();
            }
        });

        const renameBtn = actions.createSpan({
            cls: 'codex-section-action-btn',
            attr: { 'aria-label': 'Rename section', role: 'button' },
        });
        setIcon(renameBtn, 'pencil');
        attachTooltip(renameBtn, 'Rename section');
        renameBtn.addEventListener('click', (e) => {
            stop(e);
            const modal = new AddCustomSectionModal(app, sec.title, (newTitle) => {
                const trimmed = newTitle.trim();
                if (!trimmed || trimmed === sec.title) return;
                if (sections.some(s => s !== sec && s.title === trimmed)) {
                    new Notice(`A section called "${trimmed}" already exists.`);
                    return;
                }
                // Migrate composite keys in draft.custom from old → new title.
                if (draft.custom) {
                    for (const fname of sec.fields) {
                        const oldKey = compositeKey(sec.title, fname);
                        const newKey = compositeKey(trimmed, fname);
                        if (oldKey in draft.custom) {
                            draft.custom[newKey] = draft.custom[oldKey];
                            delete draft.custom[oldKey];
                        }
                    }
                }
                sec.title = trimmed;
                host.persistSections();
                host.scheduleSave(draft);
                host.requestRerender();
            });
            modal.open();
        });

        const deleteBtn = actions.createSpan({
            cls: 'codex-section-action-btn',
            attr: { 'aria-label': 'Remove section', role: 'button' },
        });
        setIcon(deleteBtn, 'trash');
        attachTooltip(deleteBtn, 'Remove section');
        deleteBtn.addEventListener('click', (e) => {
            stop(e);
            const choice = window.confirm(
                `Remove section "${sec.title}"?\n\n` +
                `OK = remove from ALL entries that share this section list.\n` +
                `Cancel = keep section.`
            );
            if (!choice) return;
            if (draft.custom) {
                for (const fname of sec.fields) {
                    delete draft.custom[compositeKey(sec.title, fname)];
                }
                if (Object.keys(draft.custom).length === 0) draft.custom = undefined;
            }
            const idx = sections.indexOf(sec);
            if (idx >= 0) sections.splice(idx, 1);
            host.persistSections();
            host.scheduleSave(draft);
            host.requestRerender();
        });

        header.addEventListener('click', () => {
            if (collapsedSections.has(sectionKey)) {
                collapsedSections.delete(sectionKey);
            } else {
                collapsedSections.add(sectionKey);
            }
            host.requestRerender();
        });

        if (isCollapsed) return;

        const body = section.createDiv(bodyLabel);

        for (let fIdx = 0; fIdx < sec.fields.length; fIdx++) {
            const fname = sec.fields[fIdx];
            const key = compositeKey(sec.title, fname);
            const row = body.createDiv(`${fieldRowLabel} ${customRowLabel}`);
            row.createEl('label', { cls: fieldLabelLabel, text: fname });

            const input = row.createEl('input', {
                cls: fieldInputLabel,
                attr: { type: 'text', placeholder: `Value for ${fname}` },
            });
            input.value = (draft.custom && draft.custom[key]) || '';
            input.addEventListener('input', () => {
                if (!draft.custom) draft.custom = {};
                draft.custom[key] = input.value;
                host.scheduleSave(draft);
            });

            // Move field up — icon-only span
            const fUpBtn = row.createSpan({
                cls: customRemoveLabel,
                attr: { 'aria-label': 'Move field up', role: 'button' },
            });
            setIcon(fUpBtn, 'chevron-up');
            if (fIdx === 0) fUpBtn.setAttr('data-disabled', 'true');
            fUpBtn.addEventListener('click', () => {
                if (fUpBtn.hasAttribute('data-disabled')) return;
                const tmp = sec.fields[fIdx - 1];
                sec.fields[fIdx - 1] = fname;
                sec.fields[fIdx] = tmp;
                host.persistSections();
                host.requestRerender();
            });

            // Move field down — icon-only span
            const fDownBtn = row.createSpan({
                cls: customRemoveLabel,
                attr: { 'aria-label': 'Move field down', role: 'button' },
            });
            setIcon(fDownBtn, 'chevron-down');
            if (fIdx === sec.fields.length - 1) fDownBtn.setAttr('data-disabled', 'true');
            fDownBtn.addEventListener('click', () => {
                if (fDownBtn.hasAttribute('data-disabled')) return;
                const tmp = sec.fields[fIdx + 1];
                sec.fields[fIdx + 1] = fname;
                sec.fields[fIdx] = tmp;
                host.persistSections();
                host.requestRerender();
            });

            const removeBtn = row.createSpan({
                cls: customRemoveLabel,
                attr: { 'aria-label': 'Remove field', role: 'button' },
            });
            setIcon(removeBtn, 'x');
            removeBtn.addEventListener('click', () => {
                const choice = window.confirm(
                    `Remove "${fname}" from section "${sec.title}"?\n\n` +
                    `OK = remove from ALL entries that share this section list.\n` +
                    `Cancel = keep field.`
                );
                if (!choice) return;
                sec.fields = sec.fields.filter(n => n !== fname);
                if (draft.custom) delete draft.custom[key];
                host.persistSections();
                host.scheduleSave(draft);
                host.requestRerender();
            });
        }

        // "+ Add field to this section"
        const addRow = body.createDiv('codex-add-custom-field-row');
        const addFieldBtn = addRow.createEl('button', {
            cls: 'codex-add-custom-btn',
            text: '+ Add field to this section',
        });
        addFieldBtn.addEventListener('click', () => {
            const modal = new AddSectionFieldModal(app, (name) => {
                const trimmed = name.trim();
                if (!trimmed) return;
                if (sec.fields.includes(trimmed)) {
                    new Notice(`Field "${trimmed}" already exists in this section.`);
                    return;
                }
                sec.fields.push(trimmed);
                if (!draft.custom) draft.custom = {};
                draft.custom[compositeKey(sec.title, trimmed)] = '';
                host.persistSections();
                host.scheduleSave(draft);
                host.requestRerender();
            });
            modal.open();
        });
    }
}

// ═══════════════════════════════════════════════════
//  Add / Rename a custom section
// ═══════════════════════════════════════════════════

export class AddCustomSectionModal extends Modal {
    private callback: (title: string) => void;
    private initialTitle: string;

    constructor(app: App, initialTitle: string, callback: (title: string) => void) {
        super(app);
        this.initialTitle = initialTitle;
        this.callback = callback;
    }

    onOpen(): void {
        this.titleEl.setText(this.initialTitle ? 'Rename Section' : 'Add Custom Section');
        let title = this.initialTitle;
        let nameInput: HTMLInputElement | null = null;
        new Setting(this.contentEl)
            .setName('Section title')
            .addText(text => {
                text.setPlaceholder('e.g. Misbelief, Voice, Wardrobe…');
                text.setValue(this.initialTitle);
                text.onChange(v => { title = v; });
                nameInput = text.inputEl;
                text.inputEl.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const v = (nameInput?.value || title).trim();
                        if (v) {
                            e.preventDefault();
                            this.close();
                            this.callback(v);
                        }
                    }
                });
                window.setTimeout(() => { text.inputEl.focus(); text.inputEl.select(); }, 50);
            });

        new Setting(this.contentEl)
            .addButton(btn => btn
                .setButtonText(this.initialTitle ? 'Save' : 'Add')
                .setCta()
                .onClick(() => {
                    const v = (nameInput?.value || title).trim();
                    if (v) {
                        this.close();
                        this.callback(v);
                    }
                }));
    }
}

// ═══════════════════════════════════════════════════
//  Add a field to an existing custom section
// ═══════════════════════════════════════════════════

export class AddSectionFieldModal extends Modal {
    private callback: (name: string) => void;

    constructor(app: App, callback: (name: string) => void) {
        super(app);
        this.callback = callback;
    }

    onOpen(): void {
        this.titleEl.setText('Add Field to Section');
        let fieldName = '';
        let nameInput: HTMLInputElement | null = null;
        new Setting(this.contentEl)
            .setName('Field name')
            .addText(text => {
                text.setPlaceholder('e.g. The Lie, The Truth…');
                text.onChange(v => { fieldName = v; });
                nameInput = text.inputEl;
                text.inputEl.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const v = (nameInput?.value || fieldName).trim();
                        if (v) {
                            e.preventDefault();
                            this.close();
                            this.callback(v);
                        }
                    }
                });
                window.setTimeout(() => text.inputEl.focus(), 50);
            });

        new Setting(this.contentEl)
            .addButton(btn => btn
                .setButtonText('Add')
                .setCta()
                .onClick(() => {
                    const v = (nameInput?.value || fieldName).trim();
                    if (v) {
                        this.close();
                        this.callback(v);
                    }
                }));
    }
}
/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises */
