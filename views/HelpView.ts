import { ItemView, WorkspaceLeaf, MarkdownRenderer, Component } from 'obsidian';
import type SceneCardsPlugin from '../main';
import { HELP_VIEW_TYPE } from '../constants';
import HELP_MARKDOWN from '../HELP.md';

/**
 * HelpView — displays the HELP.md documentation in a dedicated
 * right-split pane with clickable TOC and scrollable content.
 */
export class HelpView extends ItemView {
    private plugin: SceneCardsPlugin;
    private renderComponent: Component;

    constructor(leaf: WorkspaceLeaf, plugin: SceneCardsPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.renderComponent = new Component();
    }

    getViewType(): string {
        return HELP_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'StoryLine Help';
    }

    getIcon(): string {
        return 'help-circle';
    }

    async onOpen(): Promise<void> {
        this.renderComponent.load();
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('storyline-help-container');

        await this.renderHelp(container);
    }

    async onClose(): Promise<void> {
        this.renderComponent.unload();
    }

    /**
     * Render the bundled HELP.md content as native Obsidian markdown
     * inside the pane. The markdown source is embedded into main.js at
     * build time (esbuild text loader), so no separate file needs to ship.
     */
    private async renderHelp(container: HTMLElement): Promise<void> {
        const markdown = HELP_MARKDOWN;

        if (!markdown) {
            container.createEl('p', {
                text: 'Help content is unavailable.',
                cls: 'storyline-help-error',
            });
            return;
        }

        // Wrapper for rendered content
        const content = container.createDiv('storyline-help-content markdown-rendered');

        // Use Obsidian's MarkdownRenderer to get native styling
        await MarkdownRenderer.render(
            this.app,
            markdown,
            content,
            '',
            this.renderComponent,
        );

        // Make internal anchor links scroll within the pane
        content.querySelectorAll('a[href^="#"]').forEach((link) => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const href = link.getAttribute('href');
                if (!href) return;
                const targetId = href.slice(1);
                // Obsidian's renderer creates heading IDs from the heading text
                const target = content.querySelector(`[data-heading="${this.headingToDataAttr(targetId)}"]`)
                    || content.querySelector(`#${CSS.escape(targetId)}`);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
    }

    /**
     * Convert a URL-fragment slug back to the heading text format
     * Obsidian uses for data-heading attributes.
     * e.g. "board-view" → "Board View"
     */
    private headingToDataAttr(slug: string): string {
        return slug
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
    }
}
