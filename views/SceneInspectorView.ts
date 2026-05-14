/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unused-vars, no-unused-vars, no-useless-escape, no-control-regex, no-empty -- Obsidian's API surface and several untyped third-party libraries force `any` and dynamic dispatch in many places; floating promises are intentional in DOM/event handlers. Re-enabled at end of file. */
import { ItemView, WorkspaceLeaf, TFile, MarkdownView } from 'obsidian';
import type SceneCardsPlugin from '../main';
import { SceneManager } from '../services/SceneManager';
import { InspectorComponent } from '../components/Inspector';
import { SCENE_INSPECTOR_VIEW_TYPE } from '../constants';

/**
 * Standalone Scene Inspector sidebar view.
 *
 * Automatically shows scene details for the active editor file,
 * allowing users to view and edit metadata while writing in the editor.
 */
export class SceneInspectorView extends ItemView {
    private plugin: SceneCardsPlugin;
    private sceneManager: SceneManager;
    private inspectorComponent: InspectorComponent | null = null;
    private emptyEl: HTMLElement | null = null;
    /** Timestamp (ms) of last user-initiated edit inside the inspector.
     *  Used to suppress competing refresh triggers for a short window. */
    private lastEditTime = 0;

    constructor(leaf: WorkspaceLeaf, plugin: SceneCardsPlugin, sceneManager: SceneManager) {
        super(leaf);
        this.plugin = plugin;
        this.sceneManager = sceneManager;
    }

    getViewType(): string {
        return SCENE_INSPECTOR_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Scene Details';
    }

    getIcon(): string {
        return 'file-search';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('sl-scene-inspector-sidebar');

        // Inspector component container
        const inspectorEl = container.createDiv('story-line-inspector-panel sl-sidebar-inspector');
        inspectorEl.setCssStyles({ display: 'none' });

        // Empty state
        this.emptyEl = container.createDiv('sl-scene-inspector-empty');
        this.emptyEl.createEl('p', { text: 'Open a scene file to see its details here.' });

        this.inspectorComponent = new InspectorComponent(
            inspectorEl,
            this.plugin,
            this.sceneManager,
            {
                onEdit: (scene) => {
                    const file = this.app.vault.getAbstractFileByPath(scene.filePath);
                    if (file instanceof TFile) {
                        this.app.workspace.getLeaf('tab').openFile(file);
                    }
                },
                onDelete: async (scene) => {
                    await this.sceneManager.deleteScene(scene.filePath);
                    this.inspectorComponent?.hide();
                    if (this.emptyEl) this.emptyEl.setCssStyles({ display: 'block' });
                },
                onRefresh: () => {
                    this.lastEditTime = Date.now();
                    this.refreshCurrentScene();
                },
                onStatusChange: async (scene, status) => {
                    this.lastEditTime = Date.now();
                    await this.sceneManager.updateScene(scene.filePath, { status });
                    this.refreshCurrentScene();
                },
            }
        );

        // Listen for active file changes — only switch/hide when user
        // navigates to a real editor showing a different file.
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                if (!leaf) return;
                // Ignore if the new active leaf is this inspector itself
                if (leaf === this.leaf) return;
                // Only react when the user activates a MarkdownView (an actual file editor).
                // StoryLine views (Manuscript, Board, etc.) don't own files, so
                // switching to them should NOT hide the inspector — the Manuscript
                // focus observer handles scene changes via events instead.
                if (!(leaf.view instanceof MarkdownView)) return;
                this.updateForActiveFile();
            })
        );

        // Refresh scene data when files are modified (e.g. frontmatter
        // updated by inspector itself). Never hide — just re-show the
        // current scene with fresh data.  Skip if we just edited
        // (the callback already refreshed synchronously).
        this.registerEvent(
            this.app.vault.on('modify', () => {
                if (!this.inspectorComponent?.isVisible()) return;
                if (Date.now() - this.lastEditTime < 2000) return;
                window.setTimeout(() => this.refreshCurrentScene(), 600);
            })
        );

        // Listen for Manuscript view focused-scene changes.
        // Suppress during the cooldown window after an edit so the
        // Manuscript rebuild doesn't clobber the inspector mid-interaction.
        this.registerEvent(
            (this.app.workspace as any).on('storyline:manuscript-focus', (filePath: string) => {
                if (Date.now() - this.lastEditTime < 2000) return;
                const scene = this.sceneManager.getScene(filePath);
                if (scene) {
                    if (this.emptyEl) this.emptyEl.setCssStyles({ display: 'none' });
                    this.inspectorComponent?.show(scene);
                }
            })
        );

        // Listen for scene-focus from any StoryLine view (Board, Timeline, Plotgrid, etc.)
        this.registerEvent(
            (this.app.workspace as any).on('storyline:scene-focus', (filePath: string) => {
                if (Date.now() - this.lastEditTime < 2000) return;
                const scene = this.sceneManager.getScene(filePath);
                if (scene) {
                    if (this.emptyEl) this.emptyEl.setCssStyles({ display: 'none' });
                    this.inspectorComponent?.show(scene);
                }
            })
        );

        // Initial update
        this.updateForActiveFile();
    }

    async onClose(): Promise<void> {
        this.inspectorComponent = null;
    }

    private updateForActiveFile(): void {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === 'md') {
            const scene = this.sceneManager.getScene(activeFile.path);
            if (scene) {
                if (this.emptyEl) this.emptyEl.setCssStyles({ display: 'none' });
                this.inspectorComponent?.show(scene);
                return;
            }
        }
        // Active file is not a scene — show empty state
        this.inspectorComponent?.hide();
        if (this.emptyEl) this.emptyEl.setCssStyles({ display: 'block' });
    }

    /**
     * Re-show the currently displayed scene with refreshed data.
     * Used after file modifications to pick up frontmatter changes
     * without risking hiding the panel.
     */
    private refreshCurrentScene(): void {
        const currentScene = this.inspectorComponent?.getCurrentScene?.();
        if (!currentScene) return;
        const fresh = this.sceneManager.getScene(currentScene.filePath);
        if (fresh) {
            this.inspectorComponent?.show(fresh);
        }
    }
}
/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unused-vars, no-unused-vars, no-useless-escape, no-control-regex, no-empty */
