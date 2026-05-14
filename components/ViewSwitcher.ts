/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unused-vars, no-unused-vars, no-useless-escape, no-control-regex, no-empty -- Obsidian's API surface and several untyped third-party libraries force `any` and dynamic dispatch in many places; floating promises are intentional in DOM/event handlers. Re-enabled at end of file. */
import { WorkspaceLeaf } from 'obsidian';
import * as obsidian from 'obsidian';
import type SceneCardsPlugin from '../main';
import { ExportModal } from './ExportModal';
import { isMobile, DESKTOP_ONLY_VIEWS } from './MobileAdapter';
import { attachTooltip } from './Tooltip';
import {
    BOARD_VIEW_TYPE,
    TIMELINE_VIEW_TYPE,
    STORYLINE_VIEW_TYPE,
    CHARACTER_VIEW_TYPE,
    STATS_VIEW_TYPE,
    PLOTGRID_VIEW_TYPE,
    LOCATION_VIEW_TYPE,
    CODEX_VIEW_TYPE,
    MANUSCRIPT_VIEW_TYPE,
} from '../constants';
import { getBuiltinCodexCategory, makeCustomCodexCategory } from '../models/Codex';

export interface ViewSwitcherEntry {
    type: string;
    label: string;
    icon: string;  // Lucide icon name
}

export const VIEW_ENTRIES: ViewSwitcherEntry[] = [
    { type: BOARD_VIEW_TYPE, label: 'Board', icon: 'layout-grid' },
    { type: PLOTGRID_VIEW_TYPE, label: 'Plotgrid', icon: 'table' },
    { type: TIMELINE_VIEW_TYPE, label: 'Timeline', icon: 'clock' },
    { type: STORYLINE_VIEW_TYPE, label: 'Plotlines', icon: 'git-branch' },
    { type: MANUSCRIPT_VIEW_TYPE, label: 'Manuscript', icon: 'book-open-text' },
    { type: CODEX_VIEW_TYPE, label: 'Codex', icon: 'book-open' },
    { type: STATS_VIEW_TYPE, label: 'Stats', icon: 'bar-chart-2' },
];

/** View types that are considered "inside" the Codex umbrella */
const CODEX_FAMILY = new Set([CODEX_VIEW_TYPE, CHARACTER_VIEW_TYPE, LOCATION_VIEW_TYPE]);

/**
 * Renders view-switcher tabs into a toolbar container.
 * Uses the leaf reference directly from the owning view so
 * setViewState always targets the correct leaf.
 */
export function renderViewSwitcher(
    container: HTMLElement,
    activeViewType: string,
    plugin: SceneCardsPlugin,
    leaf: WorkspaceLeaf
): HTMLElement {
    const switcher = container.createDiv('story-line-view-switcher');

    // Filter out desktop-only views on mobile
    const entries = isMobile
        ? VIEW_ENTRIES.filter(e => !DESKTOP_ONLY_VIEWS.has(e.type))
        : VIEW_ENTRIES;

    for (const entry of entries) {
        // The Codex tab should highlight when in Character or Location view too
        const isCodexEntry = entry.type === CODEX_VIEW_TYPE;
        const isActive = isCodexEntry
            ? CODEX_FAMILY.has(activeViewType)
            : entry.type === activeViewType;

        const tab = switcher.createEl('button', {
            cls: `story-line-view-tab ${isActive ? 'active' : ''}`,
        });
        attachTooltip(tab, entry.label);
        const iconSpan = tab.createSpan({ cls: 'view-tab-icon' });
        obsidian.setIcon(iconSpan, entry.icon);
        tab.createSpan({ cls: 'view-tab-label', text: entry.label });

        if (isCodexEntry) {
            // Dropdown chevron
            const chevron = tab.createSpan({ cls: 'codex-dropdown-chevron' });
            obsidian.setIcon(chevron, 'chevron-down');

            tab.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showCodexDropdown(tab, plugin, leaf, activeViewType);
            });
        } else if (entry.type !== activeViewType) {
            tab.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    await leaf.setViewState({
                        type: entry.type,
                        active: true,
                        state: {},
                    });
                    plugin.app.workspace.revealLeaf(leaf);
                } catch (err) {
                    console.error('StoryLine: view switch failed, falling back', err);
                    plugin.activateView(entry.type);
                }
            });
        }
    }

    // Export button (after all view tabs)
    const exportBtn = switcher.createEl('button', {
        cls: 'story-line-view-tab story-line-export-btn',
    });
    const exportIcon = exportBtn.createSpan({ cls: 'view-tab-icon' });
    obsidian.setIcon(exportIcon, 'download');
    exportBtn.createSpan({ cls: 'view-tab-label', text: 'Export' });
    attachTooltip(exportBtn, 'Export');
    exportBtn.addEventListener('click', (e) => {
        e.preventDefault();
        new ExportModal(plugin).open();
    });

    return switcher;
}

// ── Codex dropdown ─────────────────────────────────────

function showCodexDropdown(
    anchor: HTMLElement,
    plugin: SceneCardsPlugin,
    leaf: WorkspaceLeaf,
    activeViewType: string,
): void {
    // Close any existing dropdown
    activeDocument.querySelectorAll('.codex-dropdown-menu').forEach(el => el.remove());

    const menu = activeDocument.createElement('div');
    menu.classList.add('codex-dropdown-menu');

    // Position below the anchor tab
    const rect = anchor.getBoundingClientRect();
    menu.setCssStyles({
        top: `${rect.bottom + 2}px`,
        left: `${rect.left}px`,
    });

    const switchTo = async (viewType: string) => {
        menu.remove();
        removeClickOutside();
        try {
            await leaf.setViewState({ type: viewType, active: true, state: {} });
            plugin.app.workspace.revealLeaf(leaf);
        } catch { plugin.activateView(viewType); }
    };

    // "Codex" hub item — reset to hub (no category selected)
    addDropdownItem(menu, 'book-open', 'Codex', activeViewType === CODEX_VIEW_TYPE, async () => {
        menu.remove();
        removeClickOutside();
        try {
            await leaf.setViewState({ type: CODEX_VIEW_TYPE, active: true, state: {} });
            plugin.app.workspace.revealLeaf(leaf);
            // Explicitly reset to hub state in case onOpen didn't re-fire
            const view = leaf.view as any;
            if (view && typeof view.setActiveCategory === 'function') {
                view.setActiveCategory('');
            }
        } catch { plugin.activateView(CODEX_VIEW_TYPE); }
    });

    // Divider
    menu.createDiv('codex-dropdown-divider');

    // Characters
    addDropdownItem(menu, 'users', 'Characters', activeViewType === CHARACTER_VIEW_TYPE, () => switchTo(CHARACTER_VIEW_TYPE));

    // Locations
    addDropdownItem(menu, 'map-pin', 'Locations', activeViewType === LOCATION_VIEW_TYPE, () => switchTo(LOCATION_VIEW_TYPE));

    // Enabled codex categories
    const enabledIds = plugin.settings.codexEnabledCategories || [];
    const customDefs = (plugin.settings.codexCustomCategories || []).map(
        (c: { id: string; label: string; icon: string }) => makeCustomCodexCategory(c.id, c.label, c.icon),
    );
    for (const id of enabledIds) {
        const builtin = getBuiltinCodexCategory(id);
        const custom = customDefs.find((c: any) => c.id === id);
        const def = builtin || custom;
        if (def) {
            // Codex category — navigate to CodexView with this category active
            addDropdownItem(menu, def.icon, def.label, false, async () => {
                menu.remove();
                removeClickOutside();
                // Switch to CodexView, then set active category via the view instance
                try {
                    await leaf.setViewState({ type: CODEX_VIEW_TYPE, active: true, state: {} });
                    plugin.app.workspace.revealLeaf(leaf);
                    // Find the CodexView instance and set its category
                    const view = leaf.view as any;
                    if (view && typeof view.setActiveCategory === 'function') {
                        view.setActiveCategory(id);
                    }
                } catch { plugin.activateView(CODEX_VIEW_TYPE); }
            });
        }
    }

    activeDocument.body.appendChild(menu);

    // Close on click outside
    const onClickOutside = (ev: MouseEvent) => {
        if (!menu.contains(ev.target as Node) && !anchor.contains(ev.target as Node)) {
            menu.remove();
            removeClickOutside();
        }
    };
    const removeClickOutside = () => activeDocument.removeEventListener('click', onClickOutside, true);
    // Delay attaching so the current click doesn't immediately close it
    window.setTimeout(() => activeDocument.addEventListener('click', onClickOutside, true), 0);
}

function addDropdownItem(
    menu: HTMLElement,
    icon: string,
    label: string,
    isActive: boolean,
    onClick: () => void,
): void {
    const item = menu.createDiv(`codex-dropdown-item ${isActive ? 'active' : ''}`);
    const iconEl = item.createSpan({ cls: 'codex-dropdown-item-icon' });
    obsidian.setIcon(iconEl, icon);
    item.createSpan({ cls: 'codex-dropdown-item-label', text: label });
    item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
    });
}
/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unused-vars, no-unused-vars, no-useless-escape, no-control-regex, no-empty */
