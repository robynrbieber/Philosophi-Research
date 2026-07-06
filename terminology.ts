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
