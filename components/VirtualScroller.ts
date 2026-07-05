/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unused-vars, no-unused-vars, no-useless-escape, no-control-regex, no-empty -- Obsidian's API surface and several untyped third-party libraries force dynamic dispatch; floating promises are intentional in DOM/event handlers; matching enable at end of file */
/**
 * VirtualScroller — lightweight windowed renderer for lists inside a
 * scrollable container.
 *
 * Instead of creating DOM nodes for every item, it renders only the visible
 * window (plus a small overscan buffer) and uses padding to maintain the
 * correct scroll height.
 *
 * Usage:
 *   const vs = new VirtualScroller({ container, itemHeight, items, renderItem, overscan });
 *   vs.mount();          // starts observing scroll
 *   vs.destroy();        // cleanup
 *   vs.setItems(items);  // swap items and re-render
 */

export interface VirtualScrollerOptions<T> {
    /** The scrollable container element (must have overflow-y: auto/scroll) */
    container: HTMLElement;
    /** Fixed height per row (px). For variable-height cards, pick a good average. */
    itemHeight: number;
    /** Array of data items */
    items: T[];
    /** Render a single item and append it to parent. Should return the created element. */
    renderItem: (item: T, index: number, parent: HTMLElement) => HTMLElement;
    /** How many extra items to render above/below the viewport (default 5) */
    overscan?: number;
    /** Minimum item count before virtualisation kicks in (default 40) */
    threshold?: number;
}

export class VirtualScroller<T> {
    private container: HTMLElement;
    private itemHeight: number;
    private items: T[];
    private renderItem: (item: T, index: number, parent: HTMLElement) => HTMLElement;
    private overscan: number;
    private threshold: number;

    /** Inner wrapper that holds the spacer and the visible items */
    private innerEl: HTMLElement | null = null;
    /** Top spacer */
    private topSpacer: HTMLElement | null = null;
    /** Bottom spacer */
    private bottomSpacer: HTMLElement | null = null;
    /** Currently rendered items container */
    private contentEl: HTMLElement | null = null;

    private scrollHandler: (() => void) | null = null;
    private lastStart = -1;
    private lastEnd = -1;

    constructor(opts: VirtualScrollerOptions<T>) {
        this.container = opts.container;
        this.itemHeight = opts.itemHeight;
        this.items = opts.items;
        this.renderItem = opts.renderItem;
        this.overscan = opts.overscan ?? 5;
        this.threshold = opts.threshold ?? 40;
    }

    /** Build and start observing scroll events */
    mount(): void {
        // If below threshold, render everything normally (no virtualization)
        if (this.items.length < this.threshold) {
            for (let i = 0; i < this.items.length; i++) {
                this.renderItem(this.items[i], i, this.container);
            }
            return;
        }

        this.innerEl = this.container.createDiv({ cls: 'virtual-scroll-inner' });
        this.topSpacer = this.innerEl.createDiv({ cls: 'virtual-scroll-spacer' });
        this.contentEl = this.innerEl.createDiv({ cls: 'virtual-scroll-content' });
        this.bottomSpacer = this.innerEl.createDiv({ cls: 'virtual-scroll-spacer' });

        this.scrollHandler = () => this.onScroll();
        this.container.addEventListener('scroll', this.scrollHandler, { passive: true });

        // Initial render
        this.onScroll();
    }

    /** Replace items and re-render visible window */
    setItems(items: T[]): void {
        this.items = items;
        this.lastStart = -1;
        this.lastEnd = -1;
        if (this.innerEl) {
            this.onScroll();
        }
    }

    /** Cleanup */
    destroy(): void {
        if (this.scrollHandler) {
            this.container.removeEventListener('scroll', this.scrollHandler);
            this.scrollHandler = null;
        }
    }

    private onScroll(): void {
        if (!this.contentEl || !this.topSpacer || !this.bottomSpacer) return;

        const scrollTop = this.container.scrollTop;
        const viewHeight = this.container.clientHeight;

        let start = Math.floor(scrollTop / this.itemHeight) - this.overscan;
        let end = Math.ceil((scrollTop + viewHeight) / this.itemHeight) + this.overscan;
        start = Math.max(0, start);
        end = Math.min(this.items.length, end);

        // Skip re-render if window hasn't actually changed
        if (start === this.lastStart && end === this.lastEnd) return;

        // If a focusable element inside the visible window currently has
        // focus, re-rendering would unmount it and kick the user out of the
        // text box (issue #211). Defer the re-render until the focused
        // element is blurred or the window drifts far enough that the
        // focused item would scroll out anyway.
        const active = activeDocument.activeElement as HTMLElement | null;
        if (active && this.contentEl?.contains(active) &&
            active.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) {
            // Check whether the focused item's index is still in the new
            // window. If it is, skip this re-render entirely. If it has
            // scrolled out of range, we must re-render (and the focus loss
            // is unavoidable).
            const focusedIndex = (active.closest('[data-vs-index]') as HTMLElement | null)
                ?.getAttribute('data-vs-index');
            const idx = focusedIndex ? parseInt(focusedIndex, 10) : -1;
            if (idx >= 0 && idx >= start && idx < end) {
                // Focused item is still visible — skip the rebuild.
                this.lastStart = start;
                this.lastEnd = end;
                return;
            }
        }

        this.lastStart = start;
        this.lastEnd = end;

        // Update spacers
        this.topSpacer.setCssStyles({ height: `${start * this.itemHeight}px` });
        this.bottomSpacer.setCssStyles({ height: `${(this.items.length - end) * this.itemHeight}px` });

        // Render visible items
        this.contentEl.empty();
        for (let i = start; i < end; i++) {
            const el = this.renderItem(this.items[i], i, this.contentEl);
            // Tag each rendered item with its index so we can detect when
            // the focused element is still in view (see focus-preservation
            // guard above).
            if (el) el.setAttribute('data-vs-index', String(i));
        }
    }
}
/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unused-vars, no-unused-vars, no-useless-escape, no-control-regex, no-empty -- end of file-wide suppression block opened at line 1 */
