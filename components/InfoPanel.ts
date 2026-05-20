/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises -- DOM/event handlers and Obsidian dynamic API */
import * as obsidian from 'obsidian';
import type SceneCardsPlugin from '../main';
import { SceneManager } from '../services/SceneManager';
import { Scene, SceneStatus, getStatusOrder, resolveStatusCfg } from '../models/Scene';
import { renderAutocompleteInput } from './InlineSuggest';

/**
 * Lightweight "Info" side panel — a planning-focused mini Inspector.
 *
 * Shows: Status · POV · Location · Synopsis · Word count · Notes
 * All fields are bound to the same Scene model the main Inspector edits,
 * so changes round-trip through the normal frontmatter pipeline.
 */
export class InfoPanelComponent {
    private plugin: SceneCardsPlugin;
    private sceneManager: SceneManager;
    private container: HTMLElement;
    private currentScene: Scene | null = null;

    constructor(container: HTMLElement, plugin: SceneCardsPlugin, sceneManager: SceneManager) {
        this.container = container;
        this.plugin = plugin;
        this.sceneManager = sceneManager;
    }

    show(scene: Scene): void {
        // Don't clobber active typing inside the panel
        if (this.container.querySelector('input:focus, textarea:focus, select:focus')) {
            this.currentScene = scene;
            return;
        }
        this.currentScene = scene;
        this.render();
    }

    hide(): void {
        this.currentScene = null;
        this.container.empty();
    }

    isVisible(): boolean {
        return this.currentScene !== null;
    }

    getCurrentScene(): Scene | null {
        return this.currentScene;
    }

    private render(): void {
        this.container.empty();
        const scene = this.currentScene;
        if (!scene) return;

        this.container.addClass('sl-info-panel');

        // Title
        const titleEl = this.container.createDiv('sl-info-title');
        titleEl.setText(scene.title || 'Untitled');

        // ── Status ──
        this.renderStatusRow(scene);

        // ── POV ──
        this.renderPovRow(scene);

        // ── Location ──
        this.renderLocationRow(scene);

        // ── Word count (read-only) ──
        this.renderWordCountRow(scene);

        // ── Synopsis ──
        this.renderSynopsis(scene);

        // ── Notes (linked to scene.notes) ──
        this.renderNotes(scene);
    }

    private renderStatusRow(scene: Scene): void {
        const row = this.container.createDiv('sl-info-row');
        row.createSpan({ cls: 'sl-info-label', text: 'Status' });

        const dropdown = row.createDiv('sl-info-status-dropdown');
        const currentStatus = scene.status || 'idea';
        const currentCfg = resolveStatusCfg(currentStatus);

        const button = dropdown.createEl('button', { cls: 'sl-info-status-button' });
        const icon = button.createSpan({ cls: 'sl-info-status-icon' });
        obsidian.setIcon(icon, currentCfg.icon);
        button.createSpan({ cls: 'sl-info-status-label', text: currentCfg.label });
        const chevron = button.createSpan({ cls: 'sl-info-status-chevron' });
        obsidian.setIcon(chevron, 'chevron-down');

        const menu = dropdown.createDiv('sl-info-status-menu');
        menu.setCssStyles({ display: 'none' });

        for (const s of getStatusOrder()) {
            const cfg = resolveStatusCfg(s);
            const item = menu.createDiv({
                cls: `sl-info-status-item ${s === currentStatus ? 'active' : ''}`,
            });
            const itemIcon = item.createSpan({ cls: 'sl-info-status-icon' });
            obsidian.setIcon(itemIcon, cfg.icon);
            item.createSpan({ text: cfg.label });
            item.addEventListener('click', async () => {
                menu.setCssStyles({ display: 'none' });
                await this.sceneManager.updateScene(scene.filePath, { status: s as SceneStatus });
                scene.status = s as SceneStatus;
                this.render();
            });
        }

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const visible = menu.style.display !== 'none';
            menu.setCssStyles({ display: visible ? 'none' : 'block' });
        });
        const closeMenu = (e: MouseEvent) => {
            if (!dropdown.contains(e.target as Node)) {
                menu.setCssStyles({ display: 'none' });
            }
        };
        button.addEventListener('click', () => {
            window.setTimeout(() => activeDocument.addEventListener('click', closeMenu), 0);
        });
    }

    private renderPovRow(scene: Scene): void {
        const row = this.container.createDiv('sl-info-row');
        row.createSpan({ cls: 'sl-info-label', text: 'POV' });
        const field = row.createDiv('sl-info-field');
        renderAutocompleteInput({
            container: field,
            value: scene.pov || '',
            getSuggestions: () => this.getCharacterNames(),
            onChange: async (val) => {
                await this.sceneManager.updateScene(scene.filePath, { pov: val });
                scene.pov = val;
            },
            placeholder: 'Search characters…',
        });
    }

    private renderLocationRow(scene: Scene): void {
        const row = this.container.createDiv('sl-info-row');
        row.createSpan({ cls: 'sl-info-label', text: 'Location' });
        const field = row.createDiv('sl-info-field');
        renderAutocompleteInput({
            container: field,
            value: scene.location || '',
            getSuggestions: () => this.getLocationNames(),
            onChange: async (val) => {
                await this.sceneManager.updateScene(scene.filePath, { location: val });
                scene.location = val;
            },
            placeholder: 'Search locations…',
        });
    }

    private renderWordCountRow(scene: Scene): void {
        const row = this.container.createDiv('sl-info-row');
        row.createSpan({ cls: 'sl-info-label', text: 'Words' });
        const value = row.createSpan({ cls: 'sl-info-value' });
        const current = scene.wordcount ?? 0;
        const target = scene.target_wordcount;
        value.setText(target ? `${current} / ${target}` : `${current}`);
    }

    private renderSynopsis(scene: Scene): void {
        const section = this.container.createDiv('sl-info-section');
        section.createDiv({ cls: 'sl-info-section-label', text: 'Synopsis' });

        const textarea = section.createEl('textarea', {
            cls: 'sl-info-synopsis-textarea',
            attr: { placeholder: 'Brief scene synopsis…', rows: '6' },
        });
        textarea.value = scene.synopsis || '';
        textarea.addEventListener('change', async () => {
            const val = textarea.value.trim();
            await this.sceneManager.updateScene(scene.filePath, { synopsis: val || undefined });
            scene.synopsis = val || undefined;
        });
    }

    private renderNotes(scene: Scene): void {
        const section = this.container.createDiv('sl-info-section');
        section.createDiv({ cls: 'sl-info-section-label', text: 'Notes' });

        const textarea = section.createEl('textarea', {
            cls: 'sl-info-notes-textarea',
            attr: { placeholder: 'Notes & comments…', rows: '6' },
        });
        textarea.value = scene.notes || '';
        textarea.addEventListener('change', async () => {
            const val = textarea.value.trim();
            await this.sceneManager.updateScene(scene.filePath, { notes: val || undefined });
            scene.notes = val || undefined;
        });
    }

    // ── helpers ────────────────────────────────────────────────────

    private getCharacterNames(): string[] {
        const names = new Map<string, string>();
        for (const c of this.sceneManager.queryService.getAllCharacters()) {
            names.set(c.toLowerCase(), c);
        }
        const cm = this.plugin.characterManager;
        if (cm) {
            for (const ch of cm.getAllCharacters()) {
                if (!names.has(ch.name.toLowerCase())) names.set(ch.name.toLowerCase(), ch.name);
            }
        }
        return Array.from(names.values()).sort((a, b) =>
            a.toLowerCase().localeCompare(b.toLowerCase())
        );
    }

    private getLocationNames(): string[] {
        const names = new Map<string, string>();
        const lm = this.plugin.locationManager;
        if (lm) {
            for (const loc of lm.getAllLocations()) {
                names.set(loc.name.toLowerCase(), loc.name);
            }
        }
        for (const name of this.sceneManager.queryService.getUniqueValues('location')) {
            if (!names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
        }
        return Array.from(names.values()).sort((a, b) =>
            a.toLowerCase().localeCompare(b.toLowerCase())
        );
    }
}
/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises */
