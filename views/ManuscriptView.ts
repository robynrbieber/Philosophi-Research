/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unused-vars, no-unused-vars, no-useless-escape, no-control-regex, no-empty -- Obsidian's API surface and several untyped third-party libraries force dynamic dispatch; floating promises are intentional in DOM/event handlers; matching enable at end of file */
import { ItemView, WorkspaceLeaf, WorkspaceSplit, MarkdownRenderer, TFile, setIcon } from 'obsidian';
import { EditorView, Decoration } from '@codemirror/view';
import { RangeSetBuilder, StateEffect, Compartment, EditorSelection } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { Scene, SceneFilter, SortConfig } from '../models/Scene';
import { SceneManager } from '../services/SceneManager';
import { renderViewSwitcher } from '../components/ViewSwitcher';
import { FiltersComponent } from '../components/Filters';
import { applyMobileClass, isMobile, isPhone, isTablet } from '../components/MobileAdapter';
import { buildFormattingToolbar } from '../components/FormattingToolbar';
import { compareActChapter, getActDisplayLabel } from '../utils/actChapter';
import SceneCardsPlugin from '../main';
import { MANUSCRIPT_VIEW_TYPE } from '../constants';

/**
 * Discussion #183 — module-level cursor/scroll snapshot.
 *
 * When the user switches from Manuscript to Codex (or any other view),
 * Obsidian destroys the ManuscriptView instance and creates a new one when
 * the user switches back. Any instance-level state is lost. We keep the
 * last cursor position + scroll offset here at module scope so the new
 * instance can restore it after its first render.
 */
let _lastManuscriptState: {
    scenePath: string;
    scrollTop: number;
    cursorAnchor?: number;
    cursorHead?: number;
} | null = null;

/**
 * Manuscript View — Scrivenings-style continuous document view.
 *
 * Embeds real Obsidian MarkdownView editors (Live Preview) for each scene
 * inside a single scrollable document with act/chapter dividers. Frontmatter
 * is hidden via CSS. Editors are lazy-loaded as scenes scroll into view.
 */
export class ManuscriptView extends ItemView {
    private plugin: SceneCardsPlugin;
    private sceneManager: SceneManager;
    private rootContainer: HTMLElement | null = null;
    private scrollArea: HTMLElement | null = null;
    private footerEl: HTMLElement | null = null;
    private filtersComponent: FiltersComponent | null = null;
    private currentFilter: SceneFilter = {};
    private currentSort: SortConfig = { field: 'sequence', direction: 'asc' };
    private focusObserver: IntersectionObserver | null = null;
    private lazyObserver: IntersectionObserver | null = null;
    private embeddedLeaves: Map<string, WorkspaceLeaf> = new Map();
    private editorResizeObservers: Map<string, ResizeObserver> = new Map();
    /** Paths currently being mounted (prevents duplicate async mounts) */
    private mountingPaths: Set<string> = new Set();
    private _hasActiveFocus = false;
    /** Prevents refresh() from running during initial mount sequence */
    private _isMounting = false;
    /** When true, hide wiki-link/tag styling so text reads as plain prose */
    private _plainText = true;
    /** When true, links/tags are atomic (cursor skips over them) */
    private _lockLinks = true;
    /** Cached sorted scene list from last renderManuscript */
    private _lastScenes: Scene[] = [];
    /** Filter/sort key for the cached scene list */
    private _lastFilterKey = '';
    /** CM6 compartment for toggling atomic-link extension */
    private atomicCompartment = new Compartment();
    /** Whether focus mode is active (hides non-writing UI, dims inactive scenes) */
    private _focusMode = false;
    /** File path of the scene currently most visible in the scroll area */
    focusedScenePath: string | null = null;
    /** File path of the scene whose editor currently has focus (being edited).
     *  Distinct from focusedScenePath which tracks the most-visible scene. */
    private editingScenePath: string | null = null;
    /** Formatting toolbar element */
    private fmtToolbar: HTMLElement | null = null;
    /** The currently focused embedded leaf (for toolbar commands) */
    private activeLeaf: WorkspaceLeaf | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: SceneCardsPlugin, sceneManager: SceneManager) {
        super(leaf);
        this.plugin = plugin;
        this.sceneManager = sceneManager;
    }

    getViewType(): string {
        return MANUSCRIPT_VIEW_TYPE;
    }

    getDisplayText(): string {
        const title = this.plugin?.sceneManager?.activeProject?.title;
        return title ? `Manuscript - ${title}` : 'Manuscript';
    }

    getIcon(): string {
        return 'book-open-text';
    }

    async onOpen(): Promise<void> {
        this.plugin.storyLeaf = this.leaf;
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('story-line-manuscript-container');
        applyMobileClass(container);
        this.rootContainer = container;

        await this.sceneManager.initialize();
        this.renderView(container);
    }

    async onClose(): Promise<void> {
        // Discussion #183 — capture cursor + scroll to the module-level
        // variable so the next ManuscriptView instance can restore it.
        this.captureCurrentState();
        this.captureAndPersistState();
        this.detachAllEmbedded();
        this.focusObserver?.disconnect();
        this.lazyObserver?.disconnect();
        this.focusObserver = null;
        this.lazyObserver = null;
        // Clean up focus mode body class and CSS variables on close
        const body = activeDocument.body;
        body.removeClass('sl-focus-active-global');
        body.removeClass('sl-focus-has-darken');
        body.style.removeProperty('--sl-focus-toolbar-opacity');
        body.style.removeProperty('--sl-focus-bg');
        body.style.removeProperty('--sl-focus-filter');
    }


    /** Called by refreshOpenViews() */
    refresh(): void {
        // Don't re-render while user is editing or during mount sequence
        if (this._hasActiveFocus || this._isMounting) {
            this.updateFooter();
            return;
        }
        if (this.rootContainer) {
            this.renderView(this.rootContainer);
        }
    }

    private detachAllEmbedded(): void {
        for (const [, leaf] of this.embeddedLeaves) {
            leaf.detach();
        }
        this.embeddedLeaves.clear();
        for (const [, ro] of this.editorResizeObservers) {
            ro.disconnect();
        }
        this.editorResizeObservers.clear();
        this.mountingPaths.clear();
    }

    private renderView(container: HTMLElement): void {
        this.detachAllEmbedded();
        container.empty();

        // Toolbar
        const toolbar = container.createDiv('story-line-toolbar');
        const titleRow = toolbar.createDiv('story-line-title-row');
        titleRow.createEl('h3', { cls: 'story-line-view-title', text: 'StoryLine' });

        // View switcher tabs
        renderViewSwitcher(toolbar, MANUSCRIPT_VIEW_TYPE, this.plugin, this.leaf);

        // Filters
        const filterContainer = container.createDiv('story-line-filters-container');
        this.filtersComponent = new FiltersComponent(
            filterContainer,
            this.sceneManager,
            (filter, sort) => {
                this.currentFilter = filter;
                this.currentSort = sort;
                this.renderManuscript();
            },
            this.plugin
        );
        this.filtersComponent.render();

        // Plain-text toggle (same style as Board view's Scenes on/off)
        const filterBar = filterContainer.querySelector('.story-line-filter-bar');
        if (filterBar) {
            // Focus mode icon — insert before the search wrapper
            const searchWrapper = filterBar.querySelector('.story-line-search-wrapper');
            const focusBtn = createEl('button', {
                cls: 'sl-focus-btn clickable-icon',
                attr: { 'aria-label': 'Focus mode' },
            });
            setIcon(focusBtn, 'glasses');
            if (this._focusMode) focusBtn.addClass('is-active');
            focusBtn.addEventListener('click', () => {
                this._focusMode = !this._focusMode;
                focusBtn.toggleClass('is-active', this._focusMode);
                container.toggleClass('sl-manuscript-focus', this._focusMode);
                this.applyFocusCssVars(container);
                this.toggleSidebarVisibility(!this._focusMode);
                if (!this._focusMode) {
                    this.scrollArea?.querySelectorAll('.sl-focus-active').forEach(
                        el => el.removeClass('sl-focus-active'),
                    );
                }
            });
            if (searchWrapper) {
                filterBar.insertBefore(focusBtn, searchWrapper);
            } else {
                (filterBar as HTMLElement).prepend(focusBtn);
            }
            if (this._focusMode) {
                container.addClass('sl-manuscript-focus');
                this.applyFocusCssVars(container);
                this.toggleSidebarVisibility(false);
            }

            const plainWrap = (filterBar as HTMLElement).createEl('label', { cls: 'sl-toggle-wrap' });
            plainWrap.createSpan({ cls: 'sl-toggle-label', text: 'Plain text' });
            const plainCb = plainWrap.createEl('input', { type: 'checkbox' });
            plainCb.checked = this._plainText;
            plainWrap.createSpan({ cls: 'sl-toggle-track' });
            plainCb.addEventListener('change', () => {
                this._plainText = plainCb.checked;
                this.scrollArea?.toggleClass('sl-manuscript-plain', this._plainText);
            });

            const lockWrap = (filterBar as HTMLElement).createEl('label', { cls: 'sl-toggle-wrap' });
            lockWrap.createSpan({ cls: 'sl-toggle-label', text: 'Lock links' });
            const lockCb = lockWrap.createEl('input', { type: 'checkbox' });
            lockCb.checked = this._lockLinks;
            lockWrap.createSpan({ cls: 'sl-toggle-track' });
            lockCb.addEventListener('change', () => {
                this._lockLinks = lockCb.checked;
                this.updateAtomicLinks();
            });
        }

        // Formatting toolbar (hidden until an editor is focused)
        if (this.plugin.settings.showFormattingToolbar) {
            this.fmtToolbar = container.createDiv('sl-fmt-toolbar');
            this.fmtToolbar.setCssStyles({ display: 'none' });
            this.buildFormattingToolbar(this.fmtToolbar);
        }

        // Manuscript scroll area
        this.scrollArea = container.createDiv('sl-manuscript-scroll');
        if (this._plainText) this.scrollArea.addClass('sl-manuscript-plain');

        // Track focus in embedded editors — show/hide formatting toolbar
        this.scrollArea.addEventListener('focusin', (e) => {
            this._hasActiveFocus = true;
            // Find which embedded leaf owns the focused element
            const target = e.target as HTMLElement;
            for (const [path, leaf] of this.embeddedLeaves) {
                const splitEl = (leaf as unknown as { containerEl?: { parentElement?: HTMLElement | null } }).containerEl?.parentElement;
                if (splitEl?.contains(target)) {
                    this.activeLeaf = leaf;
                    // Discussion #183 — track which scene is being edited so
                    // we can restore focus to it after a view switch.
                    this.editingScenePath = path;
                    // In focus mode, highlight the active scene block
                    if (this._focusMode) {
                        this.scrollArea?.querySelectorAll('.sl-focus-active').forEach(
                            el => el.removeClass('sl-focus-active'),
                        );
                        const block = splitEl.closest('.sl-manuscript-scene-block');
                        if (block) block.addClass('sl-focus-active');
                    }
                    break;
                }
            }
            if (this.fmtToolbar) this.fmtToolbar.setCssStyles({ display: '' });
        });
        this.scrollArea.addEventListener('focusout', () => {
            // Discussion #183 — capture the cursor + scroll position the
            // instant the editor loses focus, so a subsequent re-render
            // (triggered by switching to Codex and back) can restore it.
            this.captureCurrentState();
            window.setTimeout(() => {
                if (!this.scrollArea?.contains(activeDocument.activeElement)) {
                    this._hasActiveFocus = false;
                    this.activeLeaf = null;
                    if (this.fmtToolbar) this.fmtToolbar.setCssStyles({ display: 'none' });
                }
            }, 100);
        });

        // Footer word count
        this.footerEl = container.createDiv('sl-manuscript-footer');

        // Set up IntersectionObserver to track which scene is in view
        this.setupFocusObserver();

        this.renderManuscript();
    }

    /** Build a cache key from the current filter + sort configuration */
    private computeFilterKey(): string {
        return JSON.stringify(this.currentFilter) + '|' + JSON.stringify(this.currentSort);
    }

    private async renderManuscript(): Promise<void> {
        if (!this.scrollArea || !this.footerEl) return;
        this.detachAllEmbedded();
        this.scrollArea.empty();
        this.footerEl.empty();

        const filterKey = this.computeFilterKey();
        let scenes: Scene[];

        // Re-use cached scene list if filter/sort unchanged and count matches
        const allCount = this.sceneManager.getAllScenes().length;
        if (
            filterKey === this._lastFilterKey &&
            this._lastScenes.length > 0 &&
            this._lastScenes.length <= allCount
        ) {
            scenes = this._lastScenes;
        } else {
            scenes = this.sceneManager.queryService.getFilteredScenes(this.currentFilter, this.currentSort)
                .filter(s => !s.corkboardNote);

            // When user picks a non-structural sort (e.g. "title"), respect it
            // directly from getFilteredScenes. Otherwise default to act → chapter
            // → sequence so scenes are grouped properly under act/chapter dividers.
            const sortField = this.currentSort?.field;
            if (!sortField || sortField === 'sequence' || sortField === 'status') {
                scenes.sort((a, b) => {
                    // Numeric-aware compare so 10 sorts after 2 and "1.1" / "1.10"
                    // / "2.1" stay in order.  Missing values sort last.
                    const actCmp = compareActChapter(a.act, b.act);
                    if (actCmp !== 0) return actCmp;
                    const chCmp = compareActChapter(a.chapter, b.chapter);
                    if (chCmp !== 0) return chCmp;
                    return (a.sequence ?? 9999) - (b.sequence ?? 9999);
                });
            }

            this._lastScenes = scenes;
            this._lastFilterKey = filterKey;
        }

        if (scenes.length === 0) {
            this.scrollArea.createDiv({
                cls: 'sl-manuscript-empty',
                text: 'No scenes match the current filters.',
            });
            this.footerEl.setText('0 words');
            return;
        }

        // Lazy loading observer — mount editors as they scroll into view
        this.lazyObserver?.disconnect();
        this.lazyObserver = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        const el = entry.target as HTMLElement;
                        const path = el.dataset.scenePath;
                        if (path && !this.embeddedLeaves.has(path) && !this.mountingPaths.has(path)) {
                            this.mountEditor(el, path);
                        }
                    }
                }
            },
            { root: this.scrollArea, rootMargin: '400px 0px' }
        );

        let totalWords = 0;
        let lastAct: string | number | undefined;
        let lastChapter: string | number | undefined;
        // Issue #105 — track the previous scene block so we can mark it
        // when followed by an act/chapter divider (replaces a former
        // :has() rule, which is expensive due to broad invalidation).
        let prevBlock: HTMLElement | null = null;

        const editorContainers: { el: HTMLElement; path: string }[] = [];

        for (const scene of scenes) {
            // Act divider
            if (scene.act !== undefined && scene.act !== lastAct) {
                lastAct = scene.act;
                lastChapter = undefined;
                if (prevBlock) prevBlock.classList.add('is-before-divider');
                const actDiv = this.scrollArea.createDiv('sl-manuscript-act-divider');
                const actLabel = this.sceneManager.getActLabel(Number(scene.act));
                const actDisplay = getActDisplayLabel(scene.act);
                actDiv.createEl('span', {
                    cls: 'sl-manuscript-act-label',
                    text: actLabel ? `${actDisplay}: ${actLabel}` : actDisplay,
                });
            }

            // Chapter divider
            if (scene.chapter !== undefined && scene.chapter !== lastChapter) {
                lastChapter = scene.chapter;
                if (prevBlock) prevBlock.classList.add('is-before-divider');
                const chapDiv = this.scrollArea.createDiv('sl-manuscript-chapter-divider');
                const chapLabel = this.sceneManager.getChapterLabel(Number(scene.chapter));
                chapDiv.createEl('span', {
                    cls: 'sl-manuscript-chapter-label',
                    text: chapLabel ? `Chapter ${scene.chapter}: ${chapLabel}` : `Chapter ${scene.chapter}`,
                });
            }

            // Scene block
            const block = this.scrollArea.createDiv('sl-manuscript-scene-block');
            prevBlock = block;
            block.dataset.scenePath = scene.filePath;
            if (this.focusObserver) this.focusObserver.observe(block);

            // Scene header: title + status badge
            const header = block.createDiv('sl-manuscript-scene-header');
            const titleEl = header.createEl('span', {
                cls: 'sl-manuscript-scene-title',
                text: scene.title,
            });
            titleEl.addEventListener('click', () => {
                const file = this.app.vault.getAbstractFileByPath(scene.filePath);
                if (file instanceof TFile) {
                    this.app.workspace.getLeaf('tab').openFile(file);
                }
            });
            if (scene.status) {
                header.createEl('span', {
                    cls: `sl-manuscript-status sl-status-${scene.status}`,
                    text: scene.status,
                });
            }
            if (scene.subtitle) {
                header.createEl('span', {
                    cls: 'sl-manuscript-scene-subtitle',
                    text: scene.subtitle,
                });
            }

            // Editor container — track for eager mounting, observe for lazy loading
            const editorWrap = block.createDiv('sl-manuscript-editor-wrap');
            editorWrap.dataset.scenePath = scene.filePath;
            editorWrap.createDiv({ cls: 'sl-manuscript-loading', text: 'Loading…' });
            this.lazyObserver.observe(editorWrap);
            editorContainers.push({ el: editorWrap, path: scene.filePath });

            if (!(this.plugin.settings.excludeArcAnchorFromWordcount && scene.arcAnchor)) {
                totalWords += scene.wordcount ?? 0;
            }
        }

        // Footer
        const wordLabel = totalWords === 1 ? 'word' : 'words';
        this.footerEl.setText(`${scenes.length} scenes · ${totalWords.toLocaleString()} ${wordLabel}`);

        // Eagerly mount the first few editors immediately (don't wait for IntersectionObserver)
        this._isMounting = true;
        const eagerCount = Math.min(3, editorContainers.length);
        for (let i = 0; i < eagerCount; i++) {
            await this.mountEditor(editorContainers[i].el, editorContainers[i].path);
        }
        this._isMounting = false;

        // Discussion #183 — after the initial render, restore the saved
        // scroll position and cursor. On a fresh open (no in-memory state)
        // we fall back to the persisted state on disk.
        this.restoreStateAfterRender();
    }

    /** Mount a real Obsidian MarkdownView (Live Preview) inside the given container */
    private async mountEditor(container: HTMLElement, filePath: string): Promise<void> {
        if (this.embeddedLeaves.has(filePath) || this.mountingPaths.has(filePath)) return;
        this.mountingPaths.add(filePath);

        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            this.mountingPaths.delete(filePath);
            return;
        }

        container.empty(); // Remove "Loading…" placeholder

        // On mobile (phone + tablet), embedded WorkspaceSplit editors
        // don't render reliably. Fall back to static rendered markdown.
        if (isPhone || isTablet) {
            this.mountingPaths.delete(filePath);
            await this.mountReadOnlyPreview(container, filePath);
            return;
        }

        try {
            // Create a detached WorkspaceSplit to host the embedded leaf
            const split = new (WorkspaceSplit as unknown as new (workspace: unknown, dir: string) => WorkspaceSplit)(this.app.workspace, 'vertical');
            const splitEl: HTMLElement = (split as unknown as { containerEl: HTMLElement }).containerEl;
            container.appendChild(splitEl);
            splitEl.classList.add('sl-manuscript-embedded-split');

            // Initial height seed so the absolute-positioned workspace-leaf
            // chain has a viewport for CM6 to render into.
            splitEl.setCssStyles({ height: '300px' });

            const leaf = this.app.workspace.createLeafInParent(split, 0);

            await leaf.openFile(file, {
                state: { mode: 'source', source: false },
            });

            this.embeddedLeaves.set(filePath, leaf);
            this.mountingPaths.delete(filePath);

            // Inject the atomic-links extension into the CM6 editor
            this.injectAtomicExtension(leaf);

            // Measurement strategy:
            //   Read cm-content's actual rendered DOM height. Because we set
            //   `.cm-scroller { overflow: visible }` in CSS, CM6 lays out
            //   every line into the DOM at its true (wrapped) height, so
            //   `cm-content.getBoundingClientRect().height` is the ground
            //   truth — no need to expand splitEl to 8000px to force render.
            //
            //   We deliberately avoid `EditorView.contentHeight` here:
            //   CM6's internal height map adds the scrollPastEnd extension's
            //   ~70vh of padding, which we strip visually via CSS but cannot
            //   remove from the height map. Using it would make every scene
            //   block ~70vh too tall (the empty gap users reported).
            let rafPending = false;
            let syncing = false;
            const syncHeight = () => {
                if (syncing) return;
                const cm = this.getCmView(leaf);
                if (!cm) return;
                syncing = true;
                cm.requestMeasure({
                    read: () => {
                        const content = splitEl.querySelector('.cm-content') as HTMLElement | null;
                        if (!content) return 0;
                        const contentRect = content.getBoundingClientRect();
                        const splitTop = splitEl.getBoundingClientRect().top;
                        // Offset of cm-content from splitEl's top (chrome /
                        // padding above the editor body — normally ~0 after
                        // our chrome strip, but kept as a safety term).
                        const offset = Math.max(0, contentRect.top - splitTop);
                        return contentRect.height + offset;
                    },
                    write: (h) => {
                        if (h > 0) {
                            const px = Math.ceil(h) + 'px';
                            splitEl.setCssStyles({ height: px });
                            container.setCssStyles({ height: px });
                        }
                        syncing = false;
                    },
                });
            };

            const debouncedSync = () => {
                if (rafPending) return;
                rafPending = true;
                window.requestAnimationFrame(() => {
                    rafPending = false;
                    syncHeight();
                });
            };

            // CM6 may render lazily; sync across multiple frames.
            window.requestAnimationFrame(() => {
                syncHeight();
                window.requestAnimationFrame(() => {
                    syncHeight();
                    window.setTimeout(syncHeight, 300);
                });
            });

            // On mobile/tablet, poll until height stabilises (CM6 can
            // take a long time to lay out content on mobile browsers).
            if (isMobile) {
                let lastH = 0;
                let stableCount = 0;
                const poll = window.setInterval(() => {
                    syncHeight();
                    const sizer = splitEl.querySelector('.cm-sizer') as HTMLElement | null;
                    const h = sizer
                        ? Math.max(sizer.getBoundingClientRect().height, sizer.offsetHeight)
                        : 0;
                    if (h > 0 && Math.abs(h - lastH) < 2) {
                        stableCount++;
                        if (stableCount >= 3) window.clearInterval(poll);
                    } else {
                        stableCount = 0;
                        lastH = h;
                    }
                }, 250);
                window.setTimeout(() => window.clearInterval(poll), 10000);
            }

            // Keep height synced as user edits (content grows/shrinks).
            // Observe both .cm-editor and .cm-content — the inner content
            // node may resize independently.
            const cmEl = splitEl.querySelector('.cm-editor') as HTMLElement | null;
            const cmContent = splitEl.querySelector('.cm-content') as HTMLElement | null;
            if (cmEl) {
                const ro = new ResizeObserver(() => debouncedSync());
                ro.observe(cmEl);
                if (cmContent && cmContent !== cmEl) ro.observe(cmContent);
                this.editorResizeObservers.set(filePath, ro);
            }

            // Discussion #183 — capture the cursor position on blur so it
            // survives the view switch. The scrollArea-level focusout can
            // fire too late (after the view is being torn down), so we
            // also listen on the CM6 content element directly.
            if (cmContent) {
                cmContent.addEventListener('blur', () => {
                    this.editingScenePath = filePath;
                    this.captureCurrentState();
                });
                // Also capture on keyup/click so the module-level state always
                // has the latest cursor position, even if blur never fires
                // (e.g. the user switches tabs via a keyboard shortcut).
                cmContent.addEventListener('keyup', () => {
                    this.editingScenePath = filePath;
                    this.captureCurrentState();
                });
                cmContent.addEventListener('click', () => {
                    this.editingScenePath = filePath;
                    this.captureCurrentState();
                });
            }
        } catch (err) {
            this.mountingPaths.delete(filePath);
            console.warn('StoryLine: embedded editor failed, falling back to preview', err);
            await this.mountReadOnlyPreview(container, filePath);
        }
    }

    /** Render scene body as static markdown (read-only fallback for mobile) */
    private async mountReadOnlyPreview(
        container: HTMLElement,
        filePath: string,
    ): Promise<void> {
        const scene = this.sceneManager.getScene(filePath);
        const text = (scene?.body ?? '').trim();
        if (text) {
            const previewEl = container.createDiv('sl-manuscript-preview');
            await MarkdownRenderer.render(this.app, text, previewEl, filePath, this);
        } else {
            container.createDiv({ cls: 'sl-manuscript-scene-empty', text: 'Empty scene' });
        }
    }

    /** Get the CM6 EditorView from an embedded workspace leaf */
    private getCmView(leaf: WorkspaceLeaf): EditorView | null {
        const editor = (leaf.view as unknown as { editor?: { cm?: EditorView } })?.editor;
        return editor?.cm ?? null;
    }

    /**
     * Build a CM6 extension that makes wiki-link and tag ranges atomic.
     * When enabled, the cursor skips over link/tag text.
     */
    private buildAtomicExtension(): ReturnType<typeof EditorView.atomicRanges.of> {
        return EditorView.atomicRanges.of((view) => {
            const builder = new RangeSetBuilder<Decoration>();
            const tree = syntaxTree(view.state);
            // Walk the syntax tree and mark internal-link and tag nodes
            tree.iterate({
                enter(node: { name: string; from: number; to: number }) {
                    // Obsidian uses these node names for wiki-links and tags
                    // in its markdown parser. Internal links are typically
                    // "hmd-internal-link" ranges; tags are "hashtag" ranges.
                    const name = node.name;
                    if (
                        name.includes('hmd-internal-link') ||
                        name.includes('internal-link') ||
                        name === 'hashtag' ||
                        name.includes('HyperMD-internal-link') ||
                        name.includes('formatting-link')
                    ) {
                        // Avoid duplicate overlapping ranges — only mark leaf nodes
                        if (node.from < node.to) {
                            builder.add(node.from, node.to, Decoration.mark({}));
                        }
                    }
                },
            });
            return builder.finish();
        });
    }

    /** Inject the atomic-links compartment into a single embedded editor */
    private injectAtomicExtension(leaf: WorkspaceLeaf): void {
        const cm = this.getCmView(leaf);
        if (!cm) return;
        const ext = this._lockLinks ? this.buildAtomicExtension() : [];
        cm.dispatch({
            effects: StateEffect.appendConfig.of(
                this.atomicCompartment.of(ext)
            ),
        });
    }

    /** Toggle atomic links on/off in all currently mounted editors */
    private updateAtomicLinks(): void {
        const ext = this._lockLinks ? this.buildAtomicExtension() : [];
        for (const [, leaf] of this.embeddedLeaves) {
            const cm = this.getCmView(leaf);
            if (!cm) continue;
            cm.dispatch({
                effects: this.atomicCompartment.reconfigure(ext),
            });
        }
    }

    /** Get the CM6 EditorView from the currently focused embedded editor */
    private getActiveCm(): EditorView | null {
        if (!this.activeLeaf) return null;
        return this.getCmView(this.activeLeaf);
    }

    /** Build the formatting toolbar buttons */
    private buildFormattingToolbar(el: HTMLElement): void {
        buildFormattingToolbar(el, () => this.getActiveCm());
    }

    /** Recalculate the footer word count from SceneManager data */
    private updateFooter(): void {
        if (!this.footerEl || this._focusMode) return;
        // Re-use cached scene list when filter/sort hasn't changed (avoids
        // re-filtering during editing when refresh() is called frequently)
        const key = this.computeFilterKey();
        const scenes = (key === this._lastFilterKey && this._lastScenes.length > 0)
            ? this._lastScenes
            : this.sceneManager.queryService.getFilteredScenes(this.currentFilter, this.currentSort)
                .filter(s => !s.corkboardNote);
        let totalWords = 0;
        for (const s of scenes) {
            if (!(this.plugin.settings.excludeArcAnchorFromWordcount && s.arcAnchor)) {
                totalWords += s.wordcount ?? 0;
            }
        }
        const wordLabel = totalWords === 1 ? 'word' : 'words';
        this.footerEl.setText(`${scenes.length} scenes · ${totalWords.toLocaleString()} ${wordLabel}`);
    }

    /** Apply focus-mode effects via CSS custom properties; static rules live in styles.css. */
    private applyFocusCssVars(_container: HTMLElement): void {
        const s = this.plugin.settings;
        const opacity = 0.25;
        const darken = (s.focusDarkenAmount ?? 0) / 100;
        const blur = s.focusBlurAmount ?? 0;

        const body = activeDocument.body;

        if (this._focusMode) {
            body.addClass('sl-focus-active-global');

            const darkenFilter = darken > 0 ? `brightness(${1 - darken})` : '';
            const blurFilter = blur > 0 ? `blur(${blur}px)` : '';
            const combinedFilter = [darkenFilter, blurFilter].filter(Boolean).join(' ') || 'none';

            const bgBright = Math.round(255 * (1 - darken));
            const darkBg = `rgb(${bgBright}, ${bgBright}, ${bgBright})`;

            body.style.setProperty('--sl-focus-toolbar-opacity', String(opacity));
            body.style.setProperty('--sl-focus-bg', darkBg);
            body.style.setProperty('--sl-focus-filter', combinedFilter);
            body.toggleClass('sl-focus-has-darken', darken > 0);
        } else {
            body.removeClass('sl-focus-active-global');
            body.removeClass('sl-focus-has-darken');
            body.style.removeProperty('--sl-focus-toolbar-opacity');
            body.style.removeProperty('--sl-focus-bg');
            body.style.removeProperty('--sl-focus-filter');
        }
    }

    /** Stub — sidebar dimming now handled via CSS filter */
    private toggleSidebarVisibility(_visible: boolean): void { }

    /** IntersectionObserver to detect which scene block is most visible (for Inspector sync) */
    private setupFocusObserver(): void {
        this.focusObserver?.disconnect();
        if (!this.scrollArea) return;

        const visibleEntries = new Map<string, number>();

        this.focusObserver = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const path = (entry.target as HTMLElement).dataset.scenePath;
                    if (!path) continue;
                    visibleEntries.set(path, entry.intersectionRatio);
                    if (!entry.isIntersecting) visibleEntries.delete(path);
                }

                // Pick the scene with the highest intersection ratio
                let best: string | null = null;
                let bestRatio = 0;
                for (const [path, ratio] of visibleEntries) {
                    if (ratio > bestRatio) {
                        best = path;
                        bestRatio = ratio;
                    }
                }

                if (best && best !== this.focusedScenePath) {
                    this.focusedScenePath = best;
                    // Notify Inspector sidebar
                    this.app.workspace.trigger('storyline:manuscript-focus', best);
                }
            },
            {
                root: this.scrollArea,
                threshold: [0, 0.25, 0.5, 0.75, 1],
            }
        );
    }

    /**
     * Scroll the manuscript to bring the given scene into view.
     * Called by the Navigator when a scene is clicked while Manuscript is active.
     */
    scrollToScene(filePath: string): void {
        if (!this.scrollArea) return;
        const block = this.scrollArea.querySelector(
            `[data-scene-path="${CSS.escape(filePath)}"]`
        ) as HTMLElement | null;
        if (block) {
            block.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // ── Discussion #183 — cursor / scroll position resume ────────────
    //
    // When the user switches to another StoryLine view (Codex, Plotgrid, etc.)
    // Obsidian destroys this ManuscriptView instance and creates a new one on
    // return. We keep the last cursor + scroll position in a module-level
    // variable (`_lastManuscriptState`) so the new instance can restore it.
    // We also persist to System/manuscript-state.json for the Obsidian-restart
    // case.

    private getManuscriptStateFile(): string {
        const base = this.plugin.getProjectSystemFolder();
        return `${base}/manuscript-state.json`;
    }

    /**
     * Capture the current cursor position + scroll position from the active
     * embedded editor into the module-level `_lastManuscriptState` variable.
     * Called on `focusout` and on `onClose` so the state survives view
     * instance destruction.
     */
    private captureCurrentState(): void {
        try {
            const scrollTop = this.scrollArea?.scrollTop ?? 0;
            // Use the editing scene (the one whose editor had focus), not
            // focusedScenePath (which is the most-visible scene and may be
            // different from the one being edited).
            const scenePath = this.editingScenePath ?? this.focusedScenePath;
            if (!scenePath) return;

            // Try to read the CM6 selection from the active leaf.
            let cursorAnchor: number | undefined;
            let cursorHead: number | undefined;
            const leaf = this.activeLeaf ?? this.embeddedLeaves.get(scenePath);
            if (leaf) {
                const cm = this.getCmView(leaf);
                if (cm) {
                    const sel = cm.state.selection.main;
                    cursorAnchor = sel.anchor;
                    cursorHead = sel.head;
                }
            }

            _lastManuscriptState = {
                scenePath,
                scrollTop,
                cursorAnchor,
                cursorHead,
            };
        } catch {
            // best-effort — ignore
        }
    }

    /**
     * Persist the module-level state to disk (called on close so it survives
     * an Obsidian restart).
     */
    private captureAndPersistState(): void {
        this.captureCurrentState();
        try {
            const adapter = this.app.vault.adapter;
            const path = this.getManuscriptStateFile();
            const payload = _lastManuscriptState
                ? { ..._lastManuscriptState, savedAt: Date.now() }
                : {
                      scenePath: this.editingScenePath ?? this.focusedScenePath ?? '',
                      scrollTop: this.scrollArea?.scrollTop ?? 0,
                      savedAt: Date.now(),
                  };
            void adapter.write(path, JSON.stringify(payload));
        } catch {
            // best-effort — never block close on a save failure
        }
    }

    /**
     * After renderManuscript() finishes, restore the saved scroll position
     * and cursor. Uses the module-level `_lastManuscriptState` if available
     * (view switch case); otherwise falls back to the persisted state on disk
     * (Obsidian restart case).
     */
    private restoreStateAfterRender(): void {
        if (_lastManuscriptState) {
            // In-memory state from a view switch — restore immediately.
            this.applyRestore(_lastManuscriptState);
            return;
        }

        // No in-memory state — try the persisted file (fresh open / restart).
        try {
            if (!this.scrollArea) return;
            const adapter = this.app.vault.adapter;
            const path = this.getManuscriptStateFile();
            void adapter.exists(path).then(exists => {
                if (!exists) return;
                void adapter.read(path).then(txt => {
                    try {
                        const data = JSON.parse(txt) as {
                            scenePath?: string | null;
                            scrollTop?: number;
                            cursorAnchor?: number;
                            cursorHead?: number;
                        };
                        if (data && (data.scenePath || typeof data.scrollTop === 'number')) {
                            this.applyRestore({
                                scenePath: data.scenePath ?? '',
                                scrollTop: data.scrollTop ?? 0,
                                cursorAnchor: data.cursorAnchor,
                                cursorHead: data.cursorHead,
                            });
                        }
                    } catch {
                        // corrupt state file — ignore
                    }
                });
            });
        } catch {
            // best-effort — ignore
        }
    }

    /**
     * Apply a saved restore snapshot: scroll to the position, ensure the
     * focused scene's editor is mounted, focus it, and restore the cursor.
     */
    private applyRestore(state: {
        scenePath: string;
        scrollTop: number;
        cursorAnchor?: number;
        cursorHead?: number;
    }): void {
        if (!this.scrollArea) return;

        // Restore scroll position as a first approximation — the final
        // restore happens after the editor mounts and layout settles.
        if (typeof state.scrollTop === 'number' && state.scrollTop > 0) {
            this.scrollArea.scrollTop = state.scrollTop;
        }

        if (!state.scenePath) return;

        // Find the scene block. If its editor isn't mounted yet (lazy),
        // mount it eagerly so we can focus it.
        const block = this.scrollArea.querySelector(
            `[data-scene-path="${CSS.escape(state.scenePath)}"]`
        ) as HTMLElement | null;
        if (!block) return;

        const editorWrap = block.querySelector('.sl-manuscript-editor-wrap') as HTMLElement | null;
        if (!editorWrap) return;

        const mountAndFocus = async (): Promise<void> => {
            // If the editor isn't mounted yet, mount it now.
            if (!this.embeddedLeaves.has(state.scenePath)) {
                await this.mountEditor(editorWrap, state.scenePath);
            }
            const leaf = this.embeddedLeaves.get(state.scenePath);
            if (!leaf) return;

            // Focus the CM6 editor and restore the selection.
            const restoreCm = (cm: import('@codemirror/view').EditorView) => {
                if (typeof state.cursorAnchor === 'number' && typeof state.cursorHead === 'number') {
                    try {
                        cm.dispatch({
                            selection: EditorSelection.single(
                                state.cursorAnchor,
                                state.cursorHead
                            ),
                            scrollIntoView: true,
                        });
                    } catch {
                        // selection out of range (file changed) — just focus
                    }
                }
                cm.focus();

                // After CM6 has restored the cursor, scroll the outer
                // container so the cursor is actually visible.  CM6's
                // `scrollIntoView: true` only affects the editor's own
                // viewport; the manuscript view uses a single outer scroll
                // container, so we need to scroll that as well.
                const scrollToCursor = (): void => {
                    if (!this.scrollArea) return;
                    const pos = typeof state.cursorAnchor === 'number'
                        ? state.cursorAnchor
                        : cm.state.selection.main.head;
                    try {
                        const coords = cm.coordsAtPos(pos);
                        if (!coords) return;
                        const rect = this.scrollArea.getBoundingClientRect();
                        const margin = 80;
                        if (coords.top < rect.top + margin) {
                            // Cursor is above the visible area — scroll up.
                            this.scrollArea.scrollTop -= rect.top + margin - coords.top;
                        } else if (coords.bottom > rect.bottom - margin) {
                            // Cursor is below the visible area — scroll down.
                            this.scrollArea.scrollTop += coords.bottom - (rect.bottom - margin);
                        }
                    } catch {
                        // coordsAtPos can throw if the position is invalid
                    }
                };

                // Give CM6 a frame to process the dispatch + reflow, then
                // adjust the outer scroll container.
                window.requestAnimationFrame(scrollToCursor);
            };

            const cm = this.getCmView(leaf);
            if (cm) {
                restoreCm(cm);
            } else {
                // CM6 not ready yet — retry on the next frame.
                window.requestAnimationFrame(() => {
                    const cm2 = this.getCmView(leaf);
                    if (cm2) restoreCm(cm2);
                });
            }
        };

        void mountAndFocus();
    }
}
/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unused-vars, no-unused-vars, no-useless-escape, no-control-regex, no-empty -- end of file-wide suppression block opened at line 1 */
