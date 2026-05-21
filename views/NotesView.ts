/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises -- Obsidian's API surface forces dynamic dispatch; floating promises are intentional in DOM/event handlers */
import { EventRef, ItemView, MarkdownView, WorkspaceLeaf } from 'obsidian';
import type SceneCardsPlugin from '../main';
import { SceneManager } from '../services/SceneManager';
import { InfoPanelComponent } from '../components/InfoPanel';
import { ManuscriptView } from './ManuscriptView';
import { MANUSCRIPT_VIEW_TYPE, NOTES_VIEW_TYPE } from '../constants';

/**
 * Standalone Notes sidebar view (#116).
 *
 * Mirrors the focused scene's `notes` field in a dedicated sidebar leaf,
 * so writers can keep notes visible alongside the manuscript without
 * having the full Inspector open. Reuses InfoPanelComponent in 'notes'
 * mode so all editing round-trips through the same frontmatter pipeline.
 */
export class NotesView extends ItemView {
    private plugin: SceneCardsPlugin;
    private sceneManager: SceneManager;
    private notesPanel: InfoPanelComponent | null = null;
    private emptyEl: HTMLElement | null = null;
    private lastEditTime = 0;

    constructor(leaf: WorkspaceLeaf, plugin: SceneCardsPlugin, sceneManager: SceneManager) {
        super(leaf);
        this.plugin = plugin;
        this.sceneManager = sceneManager;
    }

    getViewType(): string {
        return NOTES_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Scene Notes';
    }

    getIcon(): string {
        return 'sticky-note';
    }

    async onOpen(): Promise<void> {
        const viewContent = this.containerEl.children[1] as HTMLElement;
        viewContent.empty();
        viewContent.addClass('sl-notes-view-host');

        const container = viewContent.createDiv('sl-notes-view');

        // Notes panel host — flex-fills the sidebar so the textarea grows.
        const panelEl = container.createDiv('sl-inspector-panel is-active sl-inspector-panel-notes sl-info-panel-host');
        this.notesPanel = new InfoPanelComponent(panelEl, this.plugin, this.sceneManager, 'notes');

        // Empty state
        this.emptyEl = container.createDiv('sl-scene-inspector-empty');
        this.emptyEl.createEl('p', { text: 'Open a scene file to edit its notes here.' });

        // Follow active markdown / manuscript leaves.
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                if (!leaf || leaf === this.leaf) return;
                if (leaf.view instanceof MarkdownView || leaf.view instanceof ManuscriptView) {
                    this.updateForActiveFile();
                }
            })
        );

        // Refresh on external file modifications (skip while user is typing).
        this.registerEvent(
            this.app.vault.on('modify', () => {
                if (!this.notesPanel?.getCurrentScene()) return;
                if (Date.now() - this.lastEditTime < 2000) return;
                window.setTimeout(() => this.refreshCurrentScene(), 600);
            })
        );

        // Listen for scene-focus events from other StoryLine views.
        this.registerEvent(
            (this.app.workspace as unknown as { on: (ev: string, cb: (filePath: string) => void) => EventRef }).on(
                'storyline:scene-focus',
                (filePath: string) => {
                    if (Date.now() - this.lastEditTime < 2000) return;
                    this.showScene(filePath);
                },
            ),
        );
        this.registerEvent(
            (this.app.workspace as unknown as { on: (ev: string, cb: (filePath: string) => void) => EventRef }).on(
                'storyline:manuscript-focus',
                (filePath: string) => {
                    if (Date.now() - this.lastEditTime < 2000) return;
                    this.showScene(filePath);
                },
            ),
        );

        this.updateForActiveFile();
    }

    async onClose(): Promise<void> {
        this.notesPanel = null;
    }

    private showScene(filePath: string): void {
        const scene = this.sceneManager.getScene(filePath);
        if (!scene) return;
        this.notesPanel?.show(scene);
        this.refreshEmptyState();
    }

    private updateForActiveFile(): void {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === 'md') {
            const scene = this.sceneManager.getScene(activeFile.path);
            if (scene) {
                this.notesPanel?.show(scene);
                this.refreshEmptyState();
                return;
            }
        }

        const manuscriptLeaves = this.app.workspace.getLeavesOfType(MANUSCRIPT_VIEW_TYPE);
        for (const leaf of manuscriptLeaves) {
            const view = leaf.view;
            if (view instanceof ManuscriptView && view.focusedScenePath) {
                const scene = this.sceneManager.getScene(view.focusedScenePath);
                if (scene) {
                    this.notesPanel?.show(scene);
                    this.refreshEmptyState();
                    return;
                }
            }
        }

        this.notesPanel?.hide();
        this.refreshEmptyState();
    }

    private refreshCurrentScene(): void {
        const current = this.notesPanel?.getCurrentScene();
        if (!current) return;
        const fresh = this.sceneManager.getScene(current.filePath);
        if (fresh) this.notesPanel?.show(fresh);
    }

    private refreshEmptyState(): void {
        if (!this.emptyEl) return;
        const hasScene = !!this.notesPanel?.getCurrentScene();
        this.emptyEl.setCssStyles({ display: hasScene ? 'none' : 'block' });
    }
}
/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises -- end of file-wide suppression block opened at line 1 */
