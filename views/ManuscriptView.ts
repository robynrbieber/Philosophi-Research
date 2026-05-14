/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unused-vars, no-unused-vars, no-useless-escape, no-control-regex, no-empty -- Obsidian's API surface and several untyped third-party libraries force `any` and dynamic dispatch in many places; floating promises are intentional in DOM/event handlers. Re-enabled at end of file. */
import { ItemView, WorkspaceLeaf, WorkspaceSplit, MarkdownRenderer, TFile, setIcon } from 'obsidian';
import { EditorView, Decoration } from '@codemirror/view';
import { RangeSetBuilder, StateEffect, Compartment } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { Scene, SceneFilter, SortConfig } from '../models/Scene';
import { SceneManager } from '../services/SceneManager';
import { renderViewSwitcher } from '../components/ViewSwitcher';
import { FiltersComponent } from '../components/Filters';
import { applyMobileClass, isMobile, isPhone, isTablet } from '../components/MobileAdapter';
import { buildFormattingToolbar } from '../components/FormattingToolbar';
import { compareActChapter } from '../utils/actChapter';
import SceneCardsPlugin from '../main';
import { MANUSCRIPT_VIEW_TYPE } from '../constants';

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
            for (const [_path, leaf] of this.embeddedLeaves) {
                const splitEl = (leaf as any).containerEl?.parentElement;
                if (splitEl?.contains(target)) {
                    this.activeLeaf = leaf;
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

        const editorContainers: { el: HTMLElement; path: string }[] = [];

        for (const scene of scenes) {
            // Act divider
            if (scene.act !== undefined && scene.act !== lastAct) {
                lastAct = scene.act;
                lastChapter = undefined;
                const actDiv = this.scrollArea.createDiv('sl-manuscript-act-divider');
                actDiv.createEl('span', {
                    cls: 'sl-manuscript-act-label',
                    text: `Act ${scene.act}`,
                });
            }

            // Chapter divider
            if (scene.chapter !== undefined && scene.chapter !== lastChapter) {
                lastChapter = scene.chapter;
                const chapDiv = this.scrollArea.createDiv('sl-manuscript-chapter-divider');
                chapDiv.createEl('span', {
                    cls: 'sl-manuscript-chapter-label',
                    text: `Chapter ${scene.chapter}`,
                });
            }

            // Scene block
            const block = this.scrollArea.createDiv('sl-manuscript-scene-block');
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

            totalWords += scene.wordcount ?? 0;
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
            const split = new (WorkspaceSplit as any)(this.app.workspace, 'vertical');
            const splitEl: HTMLElement = (split as any).containerEl;
            container.appendChild(splitEl);
            splitEl.classList.add('sl-manuscript-embedded-split');

            // Give the split an initial height so the absolute-positioned
            // workspace-leaf chain has a viewport for CM6 to render into.
            splitEl.setCssStyles({ height: '300px' });

            const leaf = this.app.workspace.createLeafInParent(split, 0);

            await leaf.openFile(file, {
                state: { mode: 'source', source: false },
            });

            this.embeddedLeaves.set(filePath, leaf);
            this.mountingPaths.delete(filePath);

            // Inject the atomic-links extension into the CM6 editor
            this.injectAtomicExtension(leaf);

            // Obsidian's workspace-leaf uses position:absolute + inset:0,
            // which collapses to 0 in a detached split because splitEl has
            // no explicit height. Fix: measure the actual content height
            // and set splitEl to that pixel height.
            let rafPending = false;
            const syncHeight = () => {
                // Measure the inner content height.
                // cm-sizer holds the actual content; cm-scroller's scrollHeight
                // captures full content even when clipped by overflow:hidden.
                const sizer = splitEl.querySelector('.cm-sizer') as HTMLElement | null;
                const scroller = splitEl.querySelector('.cm-scroller') as HTMLElement | null;
                const cmEl = splitEl.querySelector('.cm-editor') as HTMLElement | null;
                const el = sizer || cmEl;
                if (!el) return;
                const rect = el.getBoundingClientRect().height;
                const offset = el.offsetHeight;
                const scroll = scroller ? scroller.scrollHeight : 0;
                const h = Math.max(rect, offset, scroll);
                if (h > 0) {
                    const px = Math.ceil(h) + 'px';
                    splitEl.setCssStyles({ height: px });
                    container.setCssStyles({ height: px });
                }
            };

            // Debounced version for ResizeObserver
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

            // On tablet, poll until height stabilises (CM6 can take
            // a long time to lay out content on mobile browsers).
            if (isMobile) {
                let lastH = 0;
                let stableCount = 0;
                const poll = window.setInterval(() => {
                    syncHeight();
                    const sizer = splitEl.querySelector('.cm-sizer') as HTMLElement | null;
                    const h = sizer ? Math.max(sizer.getBoundingClientRect().height, sizer.offsetHeight) : 0;
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
            // Observe both .cm-editor and .cm-content — on mobile the
            // inner content node may resize independently.
            const cmEl = splitEl.querySelector('.cm-editor') as HTMLElement | null;
            const cmContent = splitEl.querySelector('.cm-content') as HTMLElement | null;
            if (cmEl) {
                const ro = new ResizeObserver(() => debouncedSync());
                ro.observe(cmEl);
                if (cmContent && cmContent !== cmEl) ro.observe(cmContent);
                this.editorResizeObservers.set(filePath, ro);
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
        const editor = (leaf.view as any)?.editor;
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
            totalWords += s.wordcount ?? 0;
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
}
/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unused-vars, no-unused-vars, no-useless-escape, no-control-regex, no-empty */
