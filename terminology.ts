/**
 * Centralized user-facing terminology for Philosophi.
 * Internal IDs, view types, and settings keys remain StoryLine-compatible.
 */

export const PLUGIN_NAME = 'Philosophi';

export const LABELS = {
    project: 'Writing project',
    scene: 'Section',
    scenes: 'Sections',
    board: 'Board',
    plotgrid: 'Claimgrid',
    timeline: 'Structure',
    plotlines: 'Arguments',
    manuscript: 'Draft',
    codex: 'Research',
    researchSidebar: 'Snippets',
    stats: 'Stats',
    export: 'Export',
    anchor: 'Anchor',
    character: 'Character',
    location: 'Location',
} as const;

export type LabelKey = keyof typeof LABELS;

export function label(key: LabelKey): string {
    return LABELS[key];
}

/** Status labels for academic workflow (Phase 6). */
export const STATUS_LABELS: Record<string, string> = {
    idea: 'Seed',
    outlined: 'Framed',
    draft: 'Drafting',
    written: 'Written',
    revised: 'Revised',
    final: 'Ready',
};

export function statusLabel(status: string): string {
    return STATUS_LABELS[status] ?? status;
}

/** Window/tab title for a project-scoped view. */
export function viewTitle(projectTitle?: string | null): string {
    return projectTitle ? `${PLUGIN_NAME} — ${projectTitle}` : PLUGIN_NAME;
}

/** Singular or plural section label. */
export function sectionLabel(count?: number): string {
    if (count === 1) return LABELS.scene;
    if (count !== undefined) return LABELS.scenes;
    return LABELS.scene;
}

export function newSectionAction(): string {
    return `+ New ${LABELS.scene}`;
}

export function addSectionAction(): string {
    return `+ Add ${LABELS.scene}`;
}

export function createSectionTitle(): string {
    return `Create New ${LABELS.scene}`;
}

export function sectionDetailsTitle(): string {
    return `${LABELS.scene} Details`;
}

export function sectionDraftLabel(): string {
    return `${LABELS.scene} Draft`;
}

export function editSectionAction(): string {
    return `Edit ${LABELS.scene}`;
}

export function splitSectionAction(): string {
    return `Split ${LABELS.scene}`;
}

export function deleteSectionAction(): string {
    return `Delete ${LABELS.scene}`;
}

export function deleteSectionsAction(): string {
    return `Delete ${LABELS.scenes}`;
}

export function createNewSectionAction(): string {
    return `Create New ${LABELS.scene}…`;
}

export const RESERVED_KEYS_NOTICE = `Reserved ${PLUGIN_NAME} keys are not allowed.`;

export function reservedKeyNotice(key: string): string {
    return `"${key}" is reserved by ${PLUGIN_NAME}. Choose a different key.`;
}
