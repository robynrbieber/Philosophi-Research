/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unused-vars, no-unused-vars, no-useless-escape, no-control-regex, no-empty -- Obsidian's API surface and several untyped third-party libraries force dynamic dispatch; floating promises are intentional in DOM/event handlers; matching enable at end of file */
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
    ANCHOR_VIEW_TYPE,
} from '../constants';
import { LABELS } from '../terminology';
import { getBuiltinCodexCategory, makeCustomCodexCategory, getAcademicCodexCategory } from '../models/Codex';

export interface ViewSwitcherEntry {
    type: string;
    label: string;
    icon: string;  // Lucide icon name
}

export const VIEW_ENTRIES: ViewSwitcherEntry[] = [
    { type: BOARD_VIEW_TYPE, label: LABELS.board, icon: 'layout-grid' },
    { type: ANCHOR_VIEW_TYPE, label: LABELS.anchor, icon: 'anchor' },
    { type: PLOTGRID_VIEW_TYPE, label: LABELS.plotgrid, icon: 'table' },
    { type: TIMELINE_VIEW_TYPE, label: LABELS.timeline, icon: 'clock' },
    { type: STORYLINE_VIEW_TYPE, label: LABELS.plotlines, icon: 'git-branch' },
    { type: MANUSCRIPT_VIEW_TYPE, label: LABELS.manuscript, icon: 'book-open-text' },
    { type: CODEX_VIEW_TYPE, label: LABELS.codex, icon: 'book-open' },
    { type: STATS_VIEW_TYPE, label: LABELS.stats, icon: 'bar-chart-2' },
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

    // v1.10.17 — collapse view-tab labels when the toolbar is too narrow
    // to fit everything on one row. CSS container queries on the switcher
    // itself don't work here because the switcher is `width: auto` (= its
    // natural content width). Instead we observe the parent toolbar and
    // toggle a class on the switcher when the labels would overflow.
    //
    // Opt-out: setting `autoHideViewLabels = false` clears the body class
    // `sl-auto-hide-tab-labels`; we honor that here by short-circuiting.
    if (plugin.settings.autoHideViewLabels !== false) {
        installAutoHideLabels(switcher);
    }

    return switcher;
}

/**
 * Toggle the `sl-collapsed` class on the switcher based on whether its
 * natural width would overflow its parent (the toolbar). Re-measured on
 * every parent resize and once after layout settles.
 */
function installAutoHideLabels(switcher: HTMLElement): void {
    const parent = switcher.parentElement;
    if (!parent) return;

    const measure = () => {
        // Temporarily remove the collapsed class so we can measure the
        // switcher's natural (uncollapsed) width.
        const wasCollapsed = switcher.classList.contains('sl-collapsed');
        switcher.classList.remove('sl-collapsed');
        // Force a reflow read.
        const naturalWidth = switcher.scrollWidth;
        const available = parent.clientWidth;
        // Reserve ~80px for the project selector / title that sits next to
        // the switcher in the toolbar so we don't fight for the last pixel.
        const shouldCollapse = naturalWidth > available - 80;
        if (shouldCollapse) {
            switcher.classList.add('sl-collapsed');
        } else if (wasCollapsed) {
            // Already removed above; nothing more to do.
        }
    };

    // Initial measure after layout.
    window.requestAnimationFrame(measure);

    // Re-measure on parent resize.
    const ro = new ResizeObserver(() => measure());
    ro.observe(parent);

    // Clean up when the switcher is removed from the DOM.
    const cleanup = () => ro.disconnect();
    const mo = new MutationObserver(() => {
        if (!switcher.isConnected) {
            cleanup();
            mo.disconnect();
        }
    });
    if (switcher.parentNode) {
        mo.observe(switcher.parentNode, { childList: true });
    }
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
    addDropdownItem(menu, 'book-open', LABELS.codex, activeViewType === CODEX_VIEW_TYPE, async () => {
        menu.remove();
        removeClickOutside();
        try {
            await leaf.setViewState({ type: CODEX_VIEW_TYPE, active: true, state: {} });
            plugin.app.workspace.revealLeaf(leaf);
            // Explicitly reset to hub state in case onOpen didn't re-fire
            const view = leaf.view as unknown as { setActiveCategory?: (id: string) => void };
            if (view && typeof view.setActiveCategory === 'function') {
                view.setActiveCategory('');
            }
        } catch { plugin.activateView(CODEX_VIEW_TYPE); }
    });

    // Divider
    menu.createDiv('codex-dropdown-divider');

    if (plugin.settings.showFictionCodexTabs) {
        addDropdownItem(menu, 'users', LABELS.character + 's', activeViewType === CHARACTER_VIEW_TYPE, () => switchTo(CHARACTER_VIEW_TYPE));
        addDropdownItem(menu, 'map-pin', LABELS.location + 's', activeViewType === LOCATION_VIEW_TYPE, () => switchTo(LOCATION_VIEW_TYPE));
    }

    // Enabled codex categories
    const enabledIds = plugin.settings.codexEnabledCategories || [];
    const customDefs = (plugin.settings.codexCustomCategories || []).map(
        (c: { id: string; label: string; icon: string }) => makeCustomCodexCategory(c.id, c.label, c.icon),
    );
    for (const id of enabledIds) {
        const def = getAcademicCodexCategory(id) || getBuiltinCodexCategory(id) || customDefs.find((c: { id: string }) => c.id === id);
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
                    const view = leaf.view as unknown as { setActiveCategory?: (id: string) => void };
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
/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unused-vars, no-unused-vars, no-useless-escape, no-control-regex, no-empty -- end of file-wide suppression block opened at line 1 */
