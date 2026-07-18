/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises -- Obsidian API */
import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import type SceneCardsPlugin from '../main';
import { SceneManager } from '../services/SceneManager';
import { deriveProjectFoldersFromFilePath } from '../models/StoryLineProject';
import { AnchorManager } from '../services/AnchorManager';
import { ANCHOR_VIEW_TYPE } from '../constants';
import { renderViewSwitcher } from '../components/ViewSwitcher';
import { applyMobileClass } from '../components/MobileAdapter';
import { LABELS, PLUGIN_NAME } from '../terminology';
import {
    AnchorData,
    ANCHOR_BODY_SECTIONS,
    countFilledFields as countAnchorFields,
} from '../models/Anchor';

export class AnchorView extends ItemView {
    private plugin: SceneCardsPlugin;
    private sceneManager: SceneManager;
    private anchorManager: AnchorManager;
    private rootContainer: HTMLElement | null = null;
    private saveTimers: Map<string, number> = new Map();

    constructor(leaf: WorkspaceLeaf, plugin: SceneCardsPlugin, sceneManager: SceneManager, anchorManager: AnchorManager) {
        super(leaf);
        this.plugin = plugin;
        this.sceneManager = sceneManager;
        this.anchorManager = anchorManager;
    }

    getViewType(): string { return ANCHOR_VIEW_TYPE; }

    getDisplayText(): string {
        const title = this.plugin?.sceneManager?.activeProject?.title;
        return title ? `${LABELS.anchor} — ${title}` : LABELS.anchor;
    }

    getIcon(): string { return 'anchor'; }

    async onOpen(): Promise<void> {
        this.plugin.storyLeaf = this.leaf;
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('story-line-anchor-container');
        applyMobileClass(container);
        this.rootContainer = container;
        await this.sceneManager.initialize();
        await this.ensureAnchor();
        this.render();
    }

    async onClose(): Promise<void> {
        for (const t of this.saveTimers.values()) window.clearTimeout(t);
        this.saveTimers.clear();
    }

    async refresh(): Promise<void> {
        await this.ensureAnchor();
        this.render();
    }

    private async ensureAnchor(): Promise<void> {
        const project = this.sceneManager.activeProject;
        if (!project) return;
        const folder = deriveProjectFoldersFromFilePath(project.filePath).baseFolder;
        const path = this.anchorManager.anchorPathForProject(folder);
        const adapter = this.app.vault.adapter;
        if (!await adapter.exists(path)) {
            await this.anchorManager.create(folder, project.title);
        } else {
            await this.anchorManager.load(path);
        }
    }

    private render(): void {
        const container = this.rootContainer;
        if (!container) return;
        container.empty();

        const toolbar = container.createDiv('story-line-toolbar');
        const titleRow = toolbar.createDiv('story-line-title-row');
        titleRow.createEl('h3', { cls: 'story-line-view-title', text: PLUGIN_NAME });
        renderViewSwitcher(toolbar, ANCHOR_VIEW_TYPE, this.plugin, this.leaf);

        const anchor = this.anchorManager.getAnchor();
        if (!anchor) {
            container.createDiv({ cls: 'anchor-empty-state', text: `Open a ${LABELS.project.toLowerCase()} to edit the anchor.` });
            return;
        }

        const { filled, total } = countAnchorFields(anchor);
        const header = container.createDiv('anchor-header');
        header.createSpan({ cls: 'anchor-progress', text: `${filled} of ${total} fields filled` });

        const scroll = container.createDiv('anchor-scroll');

        this.renderSummaryCard(scroll, anchor);
        this.renderStakesCard(scroll, anchor);
        this.renderArgumentCard(scroll, anchor);
        this.renderScopeCard(scroll, anchor);
        this.renderLinksCard(scroll, anchor);
    }

    private renderCard(parent: HTMLElement, title: string): HTMLElement {
        const card = parent.createDiv('anchor-card');
        card.createEl('h4', { cls: 'anchor-card-title', text: title });
        return card.createDiv('anchor-card-body');
    }

    private renderScalarField(parent: HTMLElement, anchor: AnchorData, key: string, label: string, multiline = false): void {
        const row = parent.createDiv('anchor-field');
        row.createSpan({ cls: 'anchor-field-label', text: label });
        const value = String((anchor as Record<string, unknown>)[key] ?? '');
        if (multiline) {
            const ta = row.createEl('textarea', { cls: 'anchor-field-input anchor-field-textarea' });
            ta.value = value;
            ta.placeholder = label;
            ta.rows = 3;
            ta.addEventListener('blur', () => void this.debouncedSaveScalar(anchor.filePath, key, ta.value));
        } else if (key === 'confidence') {
            const sel = row.createEl('select', { cls: 'anchor-field-input' });
            for (const opt of ['', 'low', 'medium', 'high']) {
                const o = sel.createEl('option', { value: opt, text: opt || '—' });
                if (value === opt) o.selected = true;
            }
            sel.addEventListener('change', () => void this.debouncedSaveScalar(anchor.filePath, key, sel.value));
        } else {
            const input = row.createEl('input', { type: 'text', cls: 'anchor-field-input' });
            input.value = value;
            input.placeholder = label;
            input.addEventListener('blur', () => void this.debouncedSaveScalar(anchor.filePath, key, input.value));
        }
    }

    private renderBodyField(parent: HTMLElement, anchor: AnchorData, heading: string, label: string): void {
        const sec = ANCHOR_BODY_SECTIONS.find(s => s.heading === heading);
        if (!sec) return;
        const row = parent.createDiv('anchor-field');
        row.createSpan({ cls: 'anchor-field-label', text: label });
        const ta = row.createEl('textarea', { cls: 'anchor-field-input anchor-field-textarea' });
        ta.value = String((anchor as Record<string, unknown>)[sec.key] ?? '');
        ta.placeholder = label;
        ta.rows = 4;
        ta.addEventListener('blur', () => void this.debouncedSaveBody(anchor.filePath, heading, ta.value));
    }

    private renderListField(parent: HTMLElement, anchor: AnchorData, key: string, label: string): void {
        const row = parent.createDiv('anchor-field');
        row.createSpan({ cls: 'anchor-field-label', text: label });
        const values = ((anchor as Record<string, unknown>)[key] as string[]) ?? [];
        const input = row.createEl('input', { type: 'text', cls: 'anchor-field-input' });
        input.value = values.join(', ');
        input.placeholder = '[[wikilinks]] comma-separated';
        input.addEventListener('blur', () => {
            const parsed = input.value.split(',').map(s => s.trim()).filter(Boolean);
            void this.debouncedSaveList(anchor.filePath, key, parsed);
        });
    }

    private renderSummaryCard(parent: HTMLElement, anchor: AnchorData): void {
        const body = this.renderCard(parent, 'Summary');
        this.renderScalarField(body, anchor, 'question', 'Question', true);
        this.renderScalarField(body, anchor, 'thesis', 'Thesis', true);
        this.renderScalarField(body, anchor, 'confidence', 'Confidence');
        const wordRow = body.createDiv('anchor-field');
        wordRow.createSpan({ cls: 'anchor-field-label', text: 'Word target' });
        const num = wordRow.createEl('input', { type: 'number', cls: 'anchor-field-input' });
        num.value = anchor.word_target != null ? String(anchor.word_target) : '';
        num.addEventListener('blur', () => {
            const v = num.value.trim();
            void this.debouncedSaveScalar(anchor.filePath, 'word_target', v ? Number(v) : null);
        });
    }

    private renderStakesCard(parent: HTMLElement, anchor: AnchorData): void {
        const body = this.renderCard(parent, 'Stakes');
        this.renderScalarField(body, anchor, 'problem', 'Problem', true);
        this.renderBodyField(body, anchor, 'Significance', 'Significance');
        this.renderScalarField(body, anchor, 'audience', 'Audience');
        this.renderScalarField(body, anchor, 'lens', 'Lens');
    }

    private renderArgumentCard(parent: HTMLElement, anchor: AnchorData): void {
        const body = this.renderCard(parent, 'Argument');
        this.renderBodyField(body, anchor, 'Conversation', 'Conversation');
        this.renderBodyField(body, anchor, 'They', 'They');
        this.renderBodyField(body, anchor, 'Response', 'Response');
        this.renderBodyField(body, anchor, 'Takeaway', 'Takeaway');
    }

    private renderScopeCard(parent: HTMLElement, anchor: AnchorData): void {
        const body = this.renderCard(parent, 'Scope');
        this.renderBodyField(body, anchor, 'Included', 'Included');
        this.renderBodyField(body, anchor, 'Excluded', 'Excluded');
        this.renderListField(body, anchor, 'themes', 'Themes');
    }

    private renderLinksCard(parent: HTMLElement, anchor: AnchorData): void {
        const body = this.renderCard(parent, 'Linked objects');
        for (const key of ['outlines', 'sections', 'claims', 'evidence', 'questions', 'sources'] as const) {
            this.renderListField(body, anchor, key, key.charAt(0).toUpperCase() + key.slice(1));
        }
    }

    private showSaveFeedback(el: HTMLElement): void {
        const check = el.createSpan({ cls: 'anchor-save-check', text: '✓' });
        window.setTimeout(() => check.remove(), 1200);
    }

    private debouncedSaveScalar(filePath: string, key: string, value: string | number | null): void {
        const k = `s:${key}`;
        const prev = this.saveTimers.get(k);
        if (prev) window.clearTimeout(prev);
        this.saveTimers.set(k, window.setTimeout(() => {
            void this.anchorManager.saveScalarField(filePath, key, value).then(() => {
                new Notice('Anchor saved', 1500);
            });
        }, 300));
    }

    private debouncedSaveList(filePath: string, key: string, values: string[]): void {
        const k = `l:${key}`;
        const prev = this.saveTimers.get(k);
        if (prev) window.clearTimeout(prev);
        this.saveTimers.set(k, window.setTimeout(() => {
            void this.anchorManager.saveListField(filePath, key, values);
        }, 300));
    }

    private debouncedSaveBody(filePath: string, heading: string, content: string): void {
        const k = `b:${heading}`;
        const prev = this.saveTimers.get(k);
        if (prev) window.clearTimeout(prev);
        this.saveTimers.set(k, window.setTimeout(() => {
            void this.anchorManager.saveBodySectionSafe(filePath, heading, content);
        }, 400));
    }
}
