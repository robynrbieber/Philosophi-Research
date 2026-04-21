import { Scene, STATUS_CONFIG, SceneStatus, TIMELINE_MODE_LABELS, TIMELINE_MODE_ICONS, TimelineMode, TIMELINE_MODES, getStatusOrder, getStatusConfig, resolveStatusCfg } from '../models/Scene';
import { Modal, App, FuzzySuggestModal, Notice } from 'obsidian';
import * as obsidian from 'obsidian';
import { openConfirmModal } from './ConfirmModal';
import { SplitSceneModal } from './SplitMergeModals';
import { isMobile } from './MobileAdapter';
import { SceneManager } from '../services/SceneManager';
import type SceneCardsPlugin from '../main';
import { resolveTagColor, getPlotlineHSL, contrastTextColor } from '../settings';
import { LocationManager } from '../services/LocationManager';
import type { SnapshotManager, SceneSnapshot } from '../services/SnapshotManager';
import { LinkScanner, LinkScanResult } from '../services/LinkScanner';
import { renderTagPillInput, renderAutocompleteInput } from './InlineSuggest';
import { AddFieldModal } from './AddFieldModal';
import { UniversalFieldTemplate } from '../services/FieldTemplateService';
import { parseActChapterInput, actChapterHasIllegalPathChars } from '../utils/actChapter';

/**
 * Scene inspector sidebar component
 */
export class InspectorComponent {
    private plugin: SceneCardsPlugin;
    private sceneManager: SceneManager;
    private container: HTMLElement;
    private currentScene: Scene | null = null;
    private onEdit: (scene: Scene) => void;
    private onDelete: (scene: Scene) => void;
    private onRefresh: () => void;
    private onStatusChange: (scene: Scene, newStatus: SceneStatus) => void;

    /**
     * Format intensity value for display (-10 to +10)
     */
    private formatIntensity(val: number): string {
        if (val > 0) return `+${val}`;
        if (val < 0) return `${val}`;
        return '0';
    }

    constructor(
        container: HTMLElement,
        plugin: SceneCardsPlugin,
        sceneManager: SceneManager,
        callbacks: {
            onEdit: (scene: Scene) => void;
            onDelete: (scene: Scene) => void;
            onRefresh: () => void;
            onStatusChange: (scene: Scene, newStatus: SceneStatus) => void;
        }
    ) {
        this.container = container;
        this.plugin = plugin;
        this.sceneManager = sceneManager;
        this.onEdit = callbacks.onEdit;
        this.onDelete = callbacks.onDelete;
        this.onRefresh = callbacks.onRefresh;
        this.onStatusChange = callbacks.onStatusChange;
    }

    /**
     * Show inspector for a scene
     */
    show(scene: Scene): void {
        // If the user is actively editing inside the inspector, skip the
        // re-render to avoid destroying their in-progress input.  Just
        // update the backing scene reference so the next blur/change
        // handler writes to the correct object.
        if (this.container.querySelector('input:focus, textarea:focus, select:focus')) {
            this.currentScene = scene;
            return;
        }
        this.currentScene = scene;
        this.render();
        this.container.style.display = 'block';
    }

    /**
     * Whether the inspector panel is currently visible
     */
    isVisible(): boolean {
        return this.container.style.display !== 'none';
    }

    /**
     * Return the scene currently shown in the inspector (if any).
     */
    getCurrentScene(): Scene | null {
        return this.currentScene;
    }

    /**
     * Hide inspector
     */
    hide(): void {
        this.currentScene = null;
        this.container.style.display = 'none';
    }

    /**
     * Render the inspector content
     */
    private render(): void {
        const scene = this.currentScene;
        if (!scene) return;

        this.container.empty();
        this.container.addClass('story-line-inspector');

        // Mobile: drag handle for bottom-sheet UX
        if (isMobile) {
            this.container.addClass('sl-mobile');
            this.container.createDiv('inspector-drag-handle');
        }

        // Header
        const header = this.container.createDiv('inspector-header');
        header.createEl('h3', { text: 'Scene Details' });
        const closeBtn = header.createEl('button', {
            cls: 'clickable-icon inspector-close',
            text: '×'
        });
        closeBtn.addEventListener('click', () => this.hide());

        // ── Shared input style helper ──
        const styleInput = (el: HTMLElement) => {
            el.style.width = '100%';
            el.style.marginTop = '4px';
            el.style.padding = '4px 8px';
            el.style.border = '1px solid var(--background-modifier-border)';
            el.style.borderRadius = '4px';
            el.style.background = 'var(--background-primary)';
            el.style.color = 'var(--text-normal)';
            el.style.font = 'inherit';
            el.style.fontSize = '13px';
            el.style.boxSizing = 'border-box';
        };
        const styleSelect = (el: HTMLSelectElement) => {
            el.style.width = '100%';
            el.style.marginTop = '4px';
            el.style.padding = '4px 8px';
            el.style.border = '1px solid var(--background-modifier-border)';
            el.style.borderRadius = '4px';
            el.style.background = 'var(--background-primary)';
            el.style.color = 'var(--text-normal)';
            el.style.fontSize = '13px';
            el.style.boxSizing = 'border-box';
        };

        // ── Title (editable) ──
        const titleSection = this.container.createDiv('inspector-title-section');
        const titleInput = titleSection.createEl('input', {
            cls: 'inspector-title-input',
            attr: { type: 'text', placeholder: 'Scene title…' },
        });
        titleInput.value = scene.title || '';
        titleInput.style.width = '100%';
        titleInput.style.fontSize = '16px';
        titleInput.style.fontWeight = '600';
        titleInput.style.padding = '4px 8px';
        titleInput.style.border = '1px solid var(--background-modifier-border)';
        titleInput.style.borderRadius = '4px';
        titleInput.style.background = 'var(--background-primary)';
        titleInput.style.color = 'var(--text-normal)';
        titleInput.style.boxSizing = 'border-box';
        titleInput.addEventListener('change', async () => {
            const val = titleInput.value.trim();
            if (val && val !== scene.title) {
                const oldTitle = scene.title;
                // Rename the file to match the new title
                const oldPath = scene.filePath;
                const dir = oldPath.substring(0, oldPath.lastIndexOf('/'));
                const newPath = `${dir}/${val}.md`;
                const file = this.plugin.app.vault.getAbstractFileByPath(oldPath);
                if (file) {
                    await this.plugin.app.fileManager.renameFile(file, newPath);
                }
                await this.sceneManager.updateScene(newPath, { title: val } as any);
                scene.title = val;
                scene.filePath = newPath;

                // Cascade rename: update setup_scenes / payoff_scenes in other scenes
                const updated = await this.plugin.cascadeRename.cascadeSceneTitleRename(oldTitle, val);
                if (updated > 0) {
                    new Notice(`Updated ${updated} setup/payoff link${updated !== 1 ? 's' : ''}`);
                }
            }
        });

        // ── Subtitle (optional) ──
        const subtitleInput = titleSection.createEl('input', {
            cls: 'inspector-subtitle-input',
            attr: { type: 'text', placeholder: 'Subtitle (optional)…' },
        });
        subtitleInput.value = scene.subtitle || '';
        styleInput(subtitleInput);
        subtitleInput.style.fontStyle = 'italic';
        subtitleInput.addEventListener('change', async () => {
            const val = subtitleInput.value.trim() || undefined;
            await this.sceneManager.updateScene(scene.filePath, { subtitle: val } as any);
            scene.subtitle = val;
        });

        // ── Act / Chapter / Sequence row ──
        const acRow = this.container.createDiv('inspector-section');
        acRow.style.display = 'grid';
        acRow.style.gridTemplateColumns = '1fr 1fr 1fr';
        acRow.style.gap = '8px';

        // Act
        const actGroup = acRow.createDiv();
        actGroup.createSpan({ cls: 'inspector-label', text: 'Act' });
        // Use a free-text input (not a dropdown) so users can name acts
        // however they like — "1", "1.1", "Prologue", etc.  parseActChapterInput
        // keeps integers as numbers and anything else as a trimmed string.
        const actInput = actGroup.createEl('input', { attr: { type: 'text', placeholder: '#' } });
        styleInput(actInput);
        actInput.value = scene.act !== undefined ? String(scene.act) : '';
        actInput.addEventListener('change', async () => {
            const val = parseActChapterInput(actInput.value);
            // Warn (don't block) if the value would create a folder name with
            // characters that are illegal on Windows. SceneManager sanitizes
            // the folder name itself, but the user should know the on-disk
            // name will differ from what they typed.
            if (typeof val === 'string' && actChapterHasIllegalPathChars(val)) {
                new Notice(`Act name contains characters that aren't allowed in folder names; they'll be replaced with "-".`);
            }
            await this.sceneManager.updateScene(scene.filePath, { act: val } as any);
            scene.act = val;
        });

        // Chapter
        const chGroup = acRow.createDiv();
        chGroup.createSpan({ cls: 'inspector-label', text: 'Chapter' });
        const chInput = chGroup.createEl('input', { attr: { type: 'text', placeholder: '#' } });
        styleInput(chInput);
        chInput.value = scene.chapter !== undefined ? String(scene.chapter) : '';
        chInput.addEventListener('change', async () => {
            const val = parseActChapterInput(chInput.value);
            if (typeof val === 'string' && actChapterHasIllegalPathChars(val)) {
                new Notice(`Chapter name contains characters that aren't allowed in folder names; they'll be replaced with "-".`);
            }
            await this.sceneManager.updateScene(scene.filePath, { chapter: val } as any);
            scene.chapter = val;
        });

        // Sequence
        const seqGroup = acRow.createDiv();
        seqGroup.createSpan({ cls: 'inspector-label', text: 'Sequence' });
        const seqInput = seqGroup.createEl('input', { attr: { type: 'number', placeholder: '#' } });
        styleInput(seqInput);
        seqInput.value = scene.sequence !== undefined ? String(scene.sequence) : '';
        seqInput.addEventListener('change', async () => {
            const val = seqInput.value.trim() ? Number(seqInput.value) : undefined;
            await this.sceneManager.updateScene(scene.filePath, { sequence: val } as any);
            scene.sequence = val;
        });

        // ── Chronological Order ──
        const chronoSection = this.container.createDiv('inspector-section');
        chronoSection.createSpan({ cls: 'inspector-label', text: 'Chronological Order: ' });
        const chronoInput = chronoSection.createEl('input', { attr: { type: 'number', placeholder: 'Same as sequence if blank' } });
        styleInput(chronoInput);
        chronoInput.value = scene.chronologicalOrder !== undefined ? String(scene.chronologicalOrder) : '';
        chronoInput.addEventListener('change', async () => {
            const val = chronoInput.value.trim() ? Number(chronoInput.value) : undefined;
            await this.sceneManager.updateScene(scene.filePath, { chronologicalOrder: val } as any);
            scene.chronologicalOrder = val;
        });

        // ── Status dropdown (custom with Lucide icons) ──
        const statusSection = this.container.createDiv('inspector-section');
        statusSection.createSpan({ cls: 'inspector-label', text: 'Status: ' });
        
        const statusDropdown = statusSection.createDiv('inspector-status-dropdown');
        const currentStatus = scene.status || 'idea';
        const currentCfg = resolveStatusCfg(currentStatus);
        
        const statusButton = statusDropdown.createEl('button', {
            cls: 'inspector-status-button',
        });
        const btnIcon = statusButton.createSpan({ cls: 'inspector-status-icon' });
        obsidian.setIcon(btnIcon, currentCfg.icon);
        const btnLabel = statusButton.createSpan({ text: currentCfg.label });
        const btnChevron = statusButton.createSpan({ cls: 'inspector-status-chevron' });
        obsidian.setIcon(btnChevron, 'chevron-down');

        const statusMenu = statusDropdown.createDiv('inspector-status-menu');
        statusMenu.style.display = 'none';

        const statusValues = getStatusOrder();
        statusValues.forEach(s => {
            const cfg = resolveStatusCfg(s);
            const item = statusMenu.createDiv({
                cls: `inspector-status-item ${s === currentStatus ? 'active' : ''}`
            });
            const itemIcon = item.createSpan({ cls: 'inspector-status-icon' });
            obsidian.setIcon(itemIcon, cfg.icon);
            item.createSpan({ text: cfg.label });

            item.addEventListener('click', () => {
                statusMenu.style.display = 'none';
                this.onStatusChange(scene, s);
            });
        });

        statusButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = statusMenu.style.display !== 'none';
            statusMenu.style.display = isVisible ? 'none' : 'block';
        });

        // Close menu when clicking outside
        const closeMenu = (e: MouseEvent) => {
            if (!statusDropdown.contains(e.target as Node)) {
                statusMenu.style.display = 'none';
                document.removeEventListener('click', closeMenu);
            }
        };
        statusButton.addEventListener('click', () => {
            setTimeout(() => document.addEventListener('click', closeMenu), 0);
        });

        // ── POV (autocomplete input) ──
        const povSection = this.container.createDiv('inspector-section');
        povSection.createSpan({ cls: 'inspector-label', text: 'POV: ' });
        const povContainer = povSection.createDiv('inspector-pov-autocomplete');
        renderAutocompleteInput({
            container: povContainer,
            value: scene.pov || '',
            getSuggestions: () => {
                const allCharNames = this.sceneManager.getAllCharacters();
                // Also include characters from CharacterManager
                const cm = this.plugin.characterManager;
                const names = new Map<string, string>();
                for (const c of allCharNames) names.set(c.toLowerCase(), c);
                if (cm) {
                    for (const ch of cm.getAllCharacters()) {
                        if (!names.has(ch.name.toLowerCase())) names.set(ch.name.toLowerCase(), ch.name);
                    }
                }
                return Array.from(names.values()).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
            },
            onChange: async (val) => {
                await this.sceneManager.updateScene(scene.filePath, { pov: val } as any);
                scene.pov = val;
            },
            placeholder: 'Search characters…',
        });

        // ── Characters (autocomplete tag-pill input) ──
        const charSection = this.container.createDiv('inspector-section');
        charSection.createSpan({ cls: 'inspector-label', text: 'Characters:' });
        const charPillContainer = charSection.createDiv('inspector-chip-list');

        renderTagPillInput({
            container: charPillContainer,
            values: scene.characters || [],
            getSuggestions: () => {
                const allCharNames = this.sceneManager.getAllCharacters();
                const cm = this.plugin.characterManager;
                const names = new Map<string, string>();
                for (const c of allCharNames) names.set(c.toLowerCase(), c);
                if (cm) {
                    for (const ch of cm.getAllCharacters()) {
                        if (!names.has(ch.name.toLowerCase())) names.set(ch.name.toLowerCase(), ch.name);
                    }
                }
                return Array.from(names.values()).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
            },
            onChange: async (values) => {
                await this.sceneManager.updateScene(scene.filePath, { characters: values } as any);
                scene.characters = values;
            },
            placeholder: 'Add character…',
            highlightValue: scene.pov,
            highlightLabel: '(POV)',
        });

        // ── Location (autocomplete input) ──
        const locSection = this.container.createDiv('inspector-section');
        locSection.createSpan({ cls: 'inspector-label', text: 'Location: ' });
        const locContainer = locSection.createDiv('inspector-location-autocomplete');
        renderAutocompleteInput({
            container: locContainer,
            value: scene.location || '',
            getSuggestions: () => this.getLocationNames(),
            onChange: async (val) => {
                await this.sceneManager.updateScene(scene.filePath, { location: val } as any);
                scene.location = val;
            },
            placeholder: 'Search locations…',
            getDisplayLabel: this.getLocationDisplayLabel(),
        });

        // ── Dynamic Codex sections (categories with showInSidebar) ──
        this.renderCodexSections(scene);

        // ── Timeline Mode / Strand ──
        const tmRow = this.container.createDiv('inspector-section');
        tmRow.style.display = 'grid';
        tmRow.style.gridTemplateColumns = '1fr 1fr';
        tmRow.style.gap = '8px';

        const tmGroup = tmRow.createDiv();
        tmGroup.createSpan({ cls: 'inspector-label', text: 'Timeline Mode' });
        const tmSelect = tmGroup.createEl('select');
        styleSelect(tmSelect);
        for (const m of TIMELINE_MODES) {
            const opt = tmSelect.createEl('option', { text: TIMELINE_MODE_LABELS[m], value: m });
            if ((scene.timeline_mode || 'linear') === m) opt.selected = true;
        }
        tmSelect.addEventListener('change', async () => {
            const val = tmSelect.value as TimelineMode;
            await this.sceneManager.updateScene(scene.filePath, { timeline_mode: val } as any);
            scene.timeline_mode = val;
        });

        const strandGroup = tmRow.createDiv();
        strandGroup.createSpan({ cls: 'inspector-label', text: 'Strand' });
        const strandInput = strandGroup.createEl('input', { attr: { type: 'text', placeholder: 'e.g. "1943", "outer"' } });
        styleInput(strandInput);
        strandInput.value = scene.timeline_strand || '';
        strandInput.addEventListener('change', async () => {
            const val = strandInput.value.trim() || undefined;
            await this.sceneManager.updateScene(scene.filePath, { timeline_strand: val } as any);
            scene.timeline_strand = val;
        });

        // ── Story Date / Time ──
        const dtRow = this.container.createDiv('inspector-section');
        dtRow.style.display = 'grid';
        dtRow.style.gridTemplateColumns = '1fr 1fr';
        dtRow.style.gap = '8px';

        const dateGroup = dtRow.createDiv();
        dateGroup.createSpan({ cls: 'inspector-label', text: 'Story Date' });
        const dateInput = dateGroup.createEl('input', { attr: { type: 'text', placeholder: 'e.g. 2026-02-17, Day 3' } });
        styleInput(dateInput);
        dateInput.value = scene.storyDate || scene.timeline || '';
        dateInput.addEventListener('change', async () => {
            const val = dateInput.value.trim() || undefined;
            await this.sceneManager.updateScene(scene.filePath, { storyDate: val } as any);
            scene.storyDate = val;
        });

        const timeGroup = dtRow.createDiv();
        timeGroup.createSpan({ cls: 'inspector-label', text: 'Story Time' });
        const timeInput = timeGroup.createEl('input', { attr: { type: 'text', placeholder: 'e.g. morning, 14:00' } });
        styleInput(timeInput);
        timeInput.value = scene.storyTime || '';
        timeInput.addEventListener('change', async () => {
            const val = timeInput.value.trim() || undefined;
            await this.sceneManager.updateScene(scene.filePath, { storyTime: val } as any);
            scene.storyTime = val;
        });

        // ── Word count + Target ──
        const wcRow = this.container.createDiv('inspector-section');
        wcRow.style.display = 'grid';
        wcRow.style.gridTemplateColumns = '1fr 1fr';
        wcRow.style.gap = '8px';

        const wcGroup = wcRow.createDiv();
        wcGroup.createSpan({ cls: 'inspector-label', text: 'Words' });
        const wcDisplay = wcGroup.createDiv();
        wcDisplay.style.marginTop = '4px';
        wcDisplay.style.fontSize = '13px';
        wcDisplay.textContent = String(scene.wordcount || 0);

        const targetGroup = wcRow.createDiv();
        targetGroup.createSpan({ cls: 'inspector-label', text: 'Target' });
        const targetInput = targetGroup.createEl('input', { attr: { type: 'number', placeholder: String(this.plugin.settings.defaultTargetWordCount || '') } });
        styleInput(targetInput);
        targetInput.value = scene.target_wordcount ? String(scene.target_wordcount) : '';
        targetInput.addEventListener('change', async () => {
            const val = targetInput.value.trim() ? Number(targetInput.value) : undefined;
            await this.sceneManager.updateScene(scene.filePath, { target_wordcount: val } as any);
            scene.target_wordcount = val;
        });

        // ── Tags / Plotlines (editable chip list) ──
        const tagSection = this.container.createDiv('inspector-section');
        tagSection.createSpan({ cls: 'inspector-label', text: 'Plotlines / Tags:' });
        const tagChips = tagSection.createDiv('inspector-chip-list');
        tagChips.style.display = 'flex';
        tagChips.style.flexWrap = 'wrap';
        tagChips.style.gap = '4px';
        tagChips.style.marginTop = '4px';

        const tagColors = this.plugin.settings.tagColors || {};
        const scheme = this.plugin.settings.colorScheme;
        const allTagsSorted = this.sceneManager.getAllTags().sort();
        const renderTagChips = () => {
            tagChips.empty();
            (scene.tags || []).forEach((t, idx) => {
                const chip = tagChips.createSpan({ cls: 'inspector-chip', text: t });
                chip.style.padding = '2px 8px';
                chip.style.borderRadius = '10px';
                chip.style.fontSize = '12px';
                chip.style.display = 'inline-flex';
                chip.style.alignItems = 'center';
                chip.style.gap = '4px';
                const chipColor = resolveTagColor(t, Math.max(0, allTagsSorted.indexOf(t)), scheme, tagColors, getPlotlineHSL(this.plugin.settings));
                chip.style.background = chipColor;
                chip.style.color = contrastTextColor(chipColor);
                const removeBtn = chip.createSpan({ text: '×', cls: 'inspector-chip-remove' });
                removeBtn.style.cursor = 'pointer';
                removeBtn.style.marginLeft = '2px';
                removeBtn.addEventListener('click', async () => {
                    const updated = (scene.tags || []).filter((_, i) => i !== idx);
                    await this.sceneManager.updateScene(scene.filePath, { tags: updated } as any);
                    scene.tags = updated;
                    renderTagChips();
                });
            });
            // Add button
            const addChip = tagChips.createSpan({ cls: 'inspector-chip inspector-chip-add', text: '+' });
            addChip.style.padding = '2px 8px';
            addChip.style.borderRadius = '10px';
            addChip.style.fontSize = '12px';
            addChip.style.background = 'var(--background-modifier-border)';
            addChip.style.cursor = 'pointer';
            addChip.style.opacity = '0.7';
            addChip.addEventListener('click', () => {
                const input = tagSection.createEl('input', { attr: { type: 'text', placeholder: 'plotline/main, theme/hope…' } });
                styleInput(input);
                input.focus();
                const commitAdd = async () => {
                    const raw = input.value.trim();
                    if (raw) {
                        const newTags = raw.split(',').map(t => t.trim()).filter(Boolean);
                        const updated = [...(scene.tags || []), ...newTags.filter(t => !(scene.tags || []).includes(t))];
                        await this.sceneManager.updateScene(scene.filePath, { tags: updated } as any);
                        scene.tags = updated;
                    }
                    input.remove();
                    renderTagChips();
                };
                input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') { input.remove(); } });
                input.addEventListener('blur', commitAdd);
            });
        };
        renderTagChips();

        // ── Scene Draft (body text — editable) ──
        {
            const descSection = this.container.createDiv('inspector-section');
            descSection.createSpan({ cls: 'inspector-label', text: 'Scene Draft:' });
            const descInput = descSection.createEl('textarea', {
                cls: 'inspector-description-input',
                attr: { placeholder: 'Write your scene draft here…', rows: '12' },
            });
            descInput.value = scene.body || '';
            styleInput(descInput);
            descInput.style.padding = '6px 8px';
            descInput.style.resize = 'vertical';
            descInput.addEventListener('change', async () => {
                const val = descInput.value;
                await this.sceneManager.updateScene(scene.filePath, { body: val } as any);
                scene.body = val;
            });
        }

        // ── Detected in text (LinkScanner results) ──
        this.renderDetectedLinks(scene);

        // ── Conflict (editable) ──
        const conflictSection = this.container.createDiv('inspector-section');
        conflictSection.createSpan({ cls: 'inspector-label', text: 'Conflict:' });
        const conflictInput = conflictSection.createEl('textarea', {
            cls: 'inspector-conflict-input',
            attr: { placeholder: 'What is the main conflict?', rows: '12' },
        });
        conflictInput.value = scene.conflict || '';
        styleInput(conflictInput);
        conflictInput.style.padding = '6px 8px';
        conflictInput.style.resize = 'vertical';
        conflictInput.addEventListener('change', async () => {
            const val = conflictInput.value.trim() || undefined;
            await this.sceneManager.updateScene(scene.filePath, { conflict: val } as any);
            scene.conflict = val;
        });

        // ── Emotion (editable) ──
        const emotionSection = this.container.createDiv('inspector-section');
        emotionSection.createSpan({ cls: 'inspector-label', text: 'Emotion: ' });
        const emotionInput = emotionSection.createEl('input', {
            cls: 'inspector-emotion-input',
            attr: { type: 'text', placeholder: 'e.g. tense, hopeful, melancholic' },
        });
        emotionInput.value = scene.emotion || '';
        styleInput(emotionInput);
        emotionInput.addEventListener('change', async () => {
            const val = emotionInput.value.trim() || undefined;
            await this.sceneManager.updateScene(scene.filePath, { emotion: val } as any);
            scene.emotion = val;
        });

        // Intensity slider (always shown, editable)
        const intensitySection = this.container.createDiv('inspector-section inspector-intensity');
        intensitySection.createSpan({ cls: 'inspector-label', text: 'Intensity: ' });
        const intensityRow = intensitySection.createDiv('inspector-intensity-row');
        const slider = intensityRow.createEl('input', {
            attr: {
                type: 'range',
                min: '-10',
                max: '10',
                step: '1',
                value: String(scene.intensity ?? 0),
            },
            cls: 'inspector-intensity-slider',
        });
        const valueLabel = intensityRow.createSpan({
            cls: 'inspector-intensity-value',
            text: this.formatIntensity(scene.intensity ?? 0),
        });
        slider.addEventListener('input', () => {
            const val = Number(slider.value);
            valueLabel.textContent = this.formatIntensity(val);
            valueLabel.className = 'inspector-intensity-value ' +
                (val > 0 ? 'intensity-positive' : val < 0 ? 'intensity-negative' : 'intensity-neutral');
        });
        slider.addEventListener('change', async () => {
            const val = Number(slider.value);
            await this.sceneManager.updateScene(scene.filePath, { intensity: val } as any);
        });
        // Set initial color class
        const initVal = scene.intensity ?? 0;
        valueLabel.className = 'inspector-intensity-value ' +
            (initVal > 0 ? 'intensity-positive' : initVal < 0 ? 'intensity-negative' : 'intensity-neutral');

        // ── Custom (universal) fields for scenes ──
        this.renderUniversalFields(scene);

        // Setup / Payoff tracking
        this.renderSetupPayoff(scene);

        // Editorial Notes / Revision Comments
        this.renderNotes(scene);

        // Snapshots / Version History
        this.renderSnapshots(scene);

        // Action buttons
        const actions = this.container.createDiv('inspector-actions');

        const editBtn = actions.createEl('button', {
            cls: 'mod-cta',
            text: 'Edit Scene'
        });
        editBtn.addEventListener('click', () => this.onEdit(scene));

        const splitBtn = actions.createEl('button', {
            text: 'Split Scene'
        });
        splitBtn.addEventListener('click', () => {
            new SplitSceneModal(this.plugin, scene, () => {
                // After split, hide inspector and refresh the board
                this.hide();
                this.onRefresh();
            }).open();
        });

        const deleteBtn = actions.createEl('button', {
            cls: 'mod-warning',
            text: 'Delete'
        });
        deleteBtn.addEventListener('click', () => {
            openConfirmModal(this.plugin.app, {
                title: 'Delete Scene',
                message: `Delete scene "${scene.title || 'Untitled'}"?`,
                confirmLabel: 'Delete',
                onConfirm: () => {
                    this.onDelete(scene);
                    this.hide();
                },
            });
        });
    }

    /**
     * Render custom (universal) fields for scenes.
     */
    private renderUniversalFields(scene: Scene): void {
        const templates = this.plugin.fieldTemplates.getBySection('Scene', 'scene');
        // Also gather templates from any section that targets scenes
        const allTemplates = this.plugin.fieldTemplates.getAll().filter(t => (t.category || 'character') === 'scene');

        if (allTemplates.length === 0 && !this.plugin.fieldTemplates) return;

        const section = this.container.createDiv('inspector-section inspector-universal-fields');
        const header = section.createDiv('inspector-universal-header');
        header.createSpan({ cls: 'inspector-label', text: 'Custom Fields' });

        const addBtn = header.createEl('button', {
            cls: 'inspector-universal-add-btn clickable-icon',
            attr: { title: 'Add custom field', 'aria-label': 'Add custom field' },
        });
        obsidian.setIcon(addBtn, 'plus');
        addBtn.addEventListener('click', () => {
            const modal = new AddFieldModal(
                this.plugin.app,
                'Scene',
                null,
                async (template) => {
                    template.category = 'scene';
                    await this.plugin.fieldTemplates.add(template);
                    const fresh = this.sceneManager.getAllScenes().find(s => s.filePath === scene.filePath);
                    if (fresh) this.show(fresh);
                },
                undefined,
                ['Scene'],
            );
            modal.open();
        });

        if (!scene.universalFields) scene.universalFields = {};

        for (const tpl of allTemplates) {
            this.renderSingleUniversalField(section, tpl, scene);
        }
    }

    /**
     * Render a single universal field input in the inspector.
     */
    private renderSingleUniversalField(
        parent: HTMLElement,
        tpl: UniversalFieldTemplate,
        scene: Scene,
    ): void {
        if (!scene.universalFields) scene.universalFields = {};
        const value = (scene.universalFields[tpl.id] ?? '') as string;

        const row = parent.createDiv('inspector-universal-field-row');

        const labelWrap = row.createDiv('inspector-universal-label-wrap');
        labelWrap.createEl('label', { cls: 'inspector-label', text: tpl.label });

        const editBtn = labelWrap.createEl('button', {
            cls: 'inspector-universal-edit-btn clickable-icon',
            attr: { title: 'Edit or remove this field', 'aria-label': 'Edit field' },
        });
        obsidian.setIcon(editBtn, 'pencil');
        editBtn.addEventListener('click', () => {
            const modal = new AddFieldModal(
                this.plugin.app,
                tpl.section,
                tpl,
                async (updated) => {
                    await this.plugin.fieldTemplates.update(tpl.id, updated);
                    const fresh = this.sceneManager.getAllScenes().find(s => s.filePath === scene.filePath);
                    if (fresh) this.show(fresh);
                },
                async () => {
                    await this.plugin.fieldTemplates.remove(tpl.id);
                    const fresh = this.sceneManager.getAllScenes().find(s => s.filePath === scene.filePath);
                    if (fresh) this.show(fresh);
                },
                ['Scene'],
            );
            modal.open();
        });

        if (tpl.type === 'textarea') {
            const ta = row.createEl('textarea', {
                cls: 'inspector-universal-textarea',
                attr: { placeholder: tpl.placeholder || '', rows: '4' },
            });
            ta.value = String(value);
            ta.addEventListener('change', async () => {
                scene.universalFields![tpl.id] = ta.value.trim() || '';
                await this.sceneManager.updateScene(scene.filePath, { universalFields: { ...scene.universalFields } } as any);
            });
        } else if (tpl.type === 'dropdown') {
            const sel = row.createEl('select', { cls: 'inspector-universal-select' });
            sel.createEl('option', { text: tpl.placeholder || '— Select —', value: '' });
            for (const opt of tpl.options) {
                const o = sel.createEl('option', { text: opt, value: opt });
                if (value === opt) o.selected = true;
            }
            sel.addEventListener('change', async () => {
                scene.universalFields![tpl.id] = sel.value;
                await this.sceneManager.updateScene(scene.filePath, { universalFields: { ...scene.universalFields } } as any);
            });
        } else if (tpl.type === 'multi-select') {
            const raw = scene.universalFields[tpl.id];
            const selected: string[] = Array.isArray(raw) ? [...raw] : (typeof raw === 'string' && raw ? [raw] : []);
            const allOptions = [...tpl.options].sort((a, b) => a.localeCompare(b));

            const msContainer = row.createDiv('inspector-universal-multi');
            const pillsEl = msContainer.createDiv('inspector-universal-pills');

            const renderPills = () => {
                pillsEl.empty();
                for (const item of selected) {
                    const pill = pillsEl.createSpan({ cls: 'story-line-chip' });
                    pill.createSpan({ text: item });
                    const x = pill.createSpan({ cls: 'inspector-sp-remove', text: '×' });
                    x.addEventListener('click', async () => {
                        const idx = selected.indexOf(item);
                        if (idx >= 0) selected.splice(idx, 1);
                        scene.universalFields![tpl.id] = [...selected];
                        await this.sceneManager.updateScene(scene.filePath, { universalFields: { ...scene.universalFields } } as any);
                        renderPills();
                    });
                }
            };
            renderPills();

            const inputRow = msContainer.createDiv('inspector-universal-input-row');
            const msInput = inputRow.createEl('input', {
                cls: 'inspector-universal-input',
                type: 'text',
                attr: { placeholder: tpl.placeholder || 'Type to add…' },
            });
            msInput.addEventListener('keydown', async (e: KeyboardEvent) => {
                if (e.key === 'Enter' && msInput.value.trim()) {
                    e.preventDefault();
                    const val = msInput.value.trim();
                    if (!selected.includes(val)) {
                        selected.push(val);
                        scene.universalFields![tpl.id] = [...selected];
                        await this.sceneManager.updateScene(scene.filePath, { universalFields: { ...scene.universalFields } } as any);
                        renderPills();
                    }
                    msInput.value = '';
                }
            });
        } else {
            // Default: text input
            const input = row.createEl('input', {
                cls: 'inspector-universal-input',
                type: 'text',
                attr: { placeholder: tpl.placeholder || '' },
            });
            input.value = String(value);
            input.addEventListener('change', async () => {
                scene.universalFields![tpl.id] = input.value.trim();
                await this.sceneManager.updateScene(scene.filePath, { universalFields: { ...scene.universalFields } } as any);
            });
        }
    }

    /**
     * Render the Setup / Payoff tracking section
     */
    private renderSetupPayoff(scene: Scene): void {
        const section = this.container.createDiv('inspector-section inspector-setup-payoff');
        section.createSpan({ cls: 'inspector-label', text: 'Setup / Payoff:' });

        // --- "Sets up" list (scenes this scene sets up) ---
        const payoffLabel = section.createDiv('inspector-sp-row');
        const payoffIcon = payoffLabel.createSpan();
        obsidian.setIcon(payoffIcon, 'arrow-right');
        payoffLabel.createSpan({ text: ' Sets up:', cls: 'inspector-sp-label' });

        const payoffList = section.createDiv('inspector-sp-list');
        if (scene.payoff_scenes?.length) {
            scene.payoff_scenes.forEach(target => {
                const chip = payoffList.createDiv('inspector-sp-chip');
                chip.createSpan({ text: target.replace(/^\[\[|\]\]$/g, '') });
                const removeBtn = chip.createEl('button', { cls: 'inspector-sp-remove clickable-icon', text: '×' });
                removeBtn.addEventListener('click', async () => {
                    const updated = (scene.payoff_scenes || []).filter(s => s !== target);
                    await this.sceneManager.updateScene(scene.filePath, { payoff_scenes: updated } as any);
                    // Also remove reverse link
                    const targetScene = this.sceneManager.getAllScenes().find(s => s.title === target);
                    if (targetScene && targetScene.setup_scenes?.includes(scene.title)) {
                        const rev = targetScene.setup_scenes.filter(s => s !== scene.title);
                        await this.sceneManager.updateScene(targetScene.filePath, { setup_scenes: rev } as any);
                    }
                    // Refresh inspector
                    const fresh = this.sceneManager.getAllScenes().find(s => s.filePath === scene.filePath);
                    if (fresh) this.show(fresh);
                });
            });
        } else {
            payoffList.createSpan({ cls: 'inspector-sp-empty', text: 'None' });
        }

        const addPayoffBtn = section.createEl('button', { cls: 'story-line-chip inspector-sp-add', text: '+ Link payoff scene' });
        addPayoffBtn.addEventListener('click', () => {
            this.openScenePicker(scene, 'payoff');
        });

        // --- "Set up by" list (scenes that set this one up) ---
        const setupLabel = section.createDiv('inspector-sp-row');
        const setupIcon = setupLabel.createSpan();
        obsidian.setIcon(setupIcon, 'arrow-left');
        setupLabel.createSpan({ text: ' Set up by:', cls: 'inspector-sp-label' });

        const setupList = section.createDiv('inspector-sp-list');
        if (scene.setup_scenes?.length) {
            scene.setup_scenes.forEach(source => {
                const chip = setupList.createDiv('inspector-sp-chip');
                chip.createSpan({ text: source.replace(/^\[\[|\]\]$/g, '') });
                const removeBtn = chip.createEl('button', { cls: 'inspector-sp-remove clickable-icon', text: '×' });
                removeBtn.addEventListener('click', async () => {
                    const updated = (scene.setup_scenes || []).filter(s => s !== source);
                    await this.sceneManager.updateScene(scene.filePath, { setup_scenes: updated } as any);
                    // Also remove reverse link
                    const sourceScene = this.sceneManager.getAllScenes().find(s => s.title === source);
                    if (sourceScene && sourceScene.payoff_scenes?.includes(scene.title)) {
                        const rev = sourceScene.payoff_scenes.filter(s => s !== scene.title);
                        await this.sceneManager.updateScene(sourceScene.filePath, { payoff_scenes: rev } as any);
                    }
                    const fresh = this.sceneManager.getAllScenes().find(s => s.filePath === scene.filePath);
                    if (fresh) this.show(fresh);
                });
            });
        } else {
            setupList.createSpan({ cls: 'inspector-sp-empty', text: 'None' });
        }

        const addSetupBtn = section.createEl('button', { cls: 'story-line-chip inspector-sp-add', text: '+ Link setup scene' });
        addSetupBtn.addEventListener('click', () => {
            this.openScenePicker(scene, 'setup');
        });

        // Warning: dangling setup (this scene sets up something but the target doesn't exist or has no payoff back)
        if (scene.payoff_scenes?.length) {
            const allScenes = this.sceneManager.getAllScenes();
            const dangling = scene.payoff_scenes.filter(target => {
                const targetScene = allScenes.find(s => s.title === target);
                return !targetScene; // Target scene doesn't exist in project
            });
            if (dangling.length > 0) {
                const warn = section.createDiv('inspector-sp-warning');
                const warnIcon = warn.createSpan();
                obsidian.setIcon(warnIcon, 'alert-triangle');
                warn.createSpan({ text: ` Missing payoff target: ${dangling.join(', ')}` });
            }
        }
    }

    /**
     * Open a fuzzy picker to select a scene for setup/payoff linking
     */
    private openScenePicker(scene: Scene, direction: 'setup' | 'payoff'): void {
        const allScenes = this.sceneManager.getAllScenes().filter(s => s.filePath !== scene.filePath);
        const modal = new ScenePickerModal(this.plugin.app, allScenes, async (picked) => {
            if (direction === 'payoff') {
                // "This scene sets up picked scene"
                const currentPayoff = scene.payoff_scenes ? [...scene.payoff_scenes] : [];
                if (!currentPayoff.includes(picked.title)) {
                    currentPayoff.push(picked.title);
                    await this.sceneManager.updateScene(scene.filePath, { payoff_scenes: currentPayoff } as any);
                }
                // Add reverse link: picked scene is set up by this scene
                const pickedSetup = picked.setup_scenes ? [...picked.setup_scenes] : [];
                if (!pickedSetup.includes(scene.title)) {
                    pickedSetup.push(scene.title);
                    await this.sceneManager.updateScene(picked.filePath, { setup_scenes: pickedSetup } as any);
                }
            } else {
                // "This scene is set up by picked scene"
                const currentSetup = scene.setup_scenes ? [...scene.setup_scenes] : [];
                if (!currentSetup.includes(picked.title)) {
                    currentSetup.push(picked.title);
                    await this.sceneManager.updateScene(scene.filePath, { setup_scenes: currentSetup } as any);
                }
                // Add reverse link: picked scene pays off in this scene
                const pickedPayoff = picked.payoff_scenes ? [...picked.payoff_scenes] : [];
                if (!pickedPayoff.includes(scene.title)) {
                    pickedPayoff.push(scene.title);
                    await this.sceneManager.updateScene(picked.filePath, { payoff_scenes: pickedPayoff } as any);
                }
            }
            // Refresh inspector with updated scene data
            const fresh = this.sceneManager.getAllScenes().find(s => s.filePath === scene.filePath);
            if (fresh) this.show(fresh);
        });
        modal.open();
    }

    /**
     * Render dynamic Codex sections for categories that have showInSidebar enabled.
     * Each enabled category gets a tag-pill input populated with codex entry names.
     */
    private renderCodexSections(scene: Scene): void {
        const codexMgr = this.plugin.codexManager;
        if (!codexMgr) return;

        const sidebarCatIds = this.plugin.settings.codexSidebarCategories || [];
        if (sidebarCatIds.length === 0) return;

        for (const catId of sidebarCatIds) {
            const catDef = codexMgr.getCategoryDef(catId);
            if (!catDef) continue;

            const section = this.container.createDiv('inspector-section');
            const labelRow = section.createDiv();
            labelRow.style.display = 'flex';
            labelRow.style.alignItems = 'center';
            labelRow.style.gap = '4px';
            const iconEl = labelRow.createSpan();
            obsidian.setIcon(iconEl, catDef.icon);
            labelRow.createSpan({ cls: 'inspector-label', text: `${catDef.label}:` });

            const pillContainer = section.createDiv('inspector-chip-list');

            const currentLinks = scene.codexLinks?.[catId] || [];
            renderTagPillInput({
                container: pillContainer,
                values: currentLinks,
                getSuggestions: () => codexMgr.getEntries(catId).map(e => e.name),
                onChange: async (values) => {
                    if (!scene.codexLinks) scene.codexLinks = {};
                    scene.codexLinks[catId] = values;
                    await this.sceneManager.updateScene(scene.filePath, { codexLinks: scene.codexLinks } as any);
                },
                placeholder: `Add ${catDef.label.toLowerCase()}…`,
            });
        }
    }

    /**
     * Render detected wikilinks from scene body text (via LinkScanner).
     */
    private renderDetectedLinks(scene: Scene): void {
        const scanner = this.plugin.linkScanner;
        const result = scanner.getResult(scene.filePath) ?? scanner.scan(scene);

        if (result.links.length === 0) return;

        const overrides = this.plugin.settings.tagTypeOverrides;

        // Exclude links that are already listed in frontmatter characters / location / codexLinks
        const fmChars = new Set((scene.characters || []).map(c => c.toLowerCase()));
        const fmLoc = scene.location?.toLowerCase();
        const fmCodex = new Set<string>();
        if (scene.codexLinks) {
            for (const names of Object.values(scene.codexLinks)) {
                for (const n of names) fmCodex.add(n.toLowerCase());
            }
        }
        const novel = result.links.filter(l => {
            const key = l.name.toLowerCase();
            if (l.type === 'character' && fmChars.has(key)) return false;
            if (l.type === 'location' && key === fmLoc) return false;
            if (fmCodex.has(key)) return false;
            return true;
        });

        if (novel.length === 0) return;

        const section = this.container.createDiv('inspector-section inspector-detected-links');
        const headerRow = section.createDiv('inspector-detected-header');
        const hdrIcon = headerRow.createSpan();
        obsidian.setIcon(hdrIcon, 'scan-search');
        headerRow.createSpan({ cls: 'inspector-label', text: ' Detected in text' });

        const pillContainer = section.createDiv('inspector-detected-pills');
        const typeIcons: Record<string, string> = {
            character: 'user',
            location: 'map-pin',
            prop: 'gem',
            other: 'file-text',
        };
        // Add codex category icons
        const codexMgr = this.plugin.codexManager;
        if (codexMgr) {
            for (const cat of codexMgr.getCategories()) {
                typeIcons[`codex:${cat.id}`] = cat.icon;
            }
        }

        for (const link of novel) {
            const low = link.name.toLowerCase();
            const resolvedType = overrides[low] || link.type;
            const pill = pillContainer.createDiv(`inspector-detected-pill detected-type-${resolvedType}`);
            if (overrides[low]) pill.addClass('tag-overridden');
            const icon = pill.createSpan({ cls: 'inspector-detected-icon' });
            obsidian.setIcon(icon, typeIcons[resolvedType] || 'file-text');
            pill.createSpan({ text: link.name });

            // Right-click to override type
            pill.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showTagTypeMenu(e, link.name, () => {
                    if (this.currentScene) this.render();
                });
            });
        }
    }

    /**
     * Show a context menu to override the type of a detected link / tag.
     */
    private showTagTypeMenu(e: MouseEvent, tagName: string, onUpdate: () => void): void {
        const low = tagName.toLowerCase();
        const current = this.plugin.settings.tagTypeOverrides[low];

        const types: { label: string; value: string | null; icon: string }[] = [
            { label: 'Prop', value: 'prop', icon: 'gem' },
            { label: 'Location', value: 'location', icon: 'map-pin' },
            { label: 'Character', value: 'character', icon: 'user' },
            { label: 'Other', value: 'other', icon: 'file-text' },
        ];

        // Add codex categories that are shown in sidebar
        const codexMgr = this.plugin.codexManager;
        const sidebarCatIds = this.plugin.settings.codexSidebarCategories || [];
        if (codexMgr) {
            for (const catId of sidebarCatIds) {
                const catDef = codexMgr.getCategoryDef(catId);
                if (catDef) {
                    types.push({ label: catDef.label, value: `codex:${catId}`, icon: catDef.icon });
                }
            }
        }

        types.push({ label: 'Reset to Auto', value: null, icon: 'rotate-ccw' });

        const menu = new obsidian.Menu();
        menu.addItem(item => item.setTitle(tagName).setDisabled(true));
        menu.addSeparator();
        for (const t of types) {
            menu.addItem(item => {
                item.setTitle(t.label)
                    .setIcon(t.icon)
                    .setChecked(t.value !== null && current === t.value)
                    .onClick(async () => {
                        if (t.value === null) {
                            delete this.plugin.settings.tagTypeOverrides[low];
                        } else if (t.value.startsWith('codex:')) {
                            // Add to scene.codexLinks for this category
                            const catId = t.value.slice(6);
                            const scene = this.currentScene;
                            if (scene) {
                                if (!scene.codexLinks) scene.codexLinks = {};
                                const arr = scene.codexLinks[catId] || [];
                                if (!arr.some(n => n.toLowerCase() === low)) {
                                    arr.push(tagName);
                                    scene.codexLinks[catId] = arr;
                                    await this.sceneManager.updateScene(scene.filePath, { codexLinks: scene.codexLinks } as any);
                                }
                            }
                            // Also set the type override for display
                            this.plugin.settings.tagTypeOverrides[low] = t.value;
                        } else {
                            this.plugin.settings.tagTypeOverrides[low] = t.value;
                        }
                        await this.plugin.saveSettings();
                        onUpdate();
                    });
            });
        }
        menu.showAtMouseEvent(e);
    }

    /**
     * Render an editable editorial notes / revision comments textarea.
     */
    private renderNotes(scene: Scene): void {
        const section = this.container.createDiv('inspector-section inspector-notes');
        const labelRow = section.createDiv('inspector-notes-header');
        const icon = labelRow.createSpan();
        obsidian.setIcon(icon, 'message-square');
        labelRow.createSpan({ cls: 'inspector-label', text: ' Notes / Comments' });

        const textarea = section.createEl('textarea', {
            cls: 'inspector-notes-textarea',
            attr: { placeholder: 'Add revision notes or editorial comments…', rows: '4' },
        });
        textarea.value = scene.notes || '';

        // Save on blur (when the user leaves the field) so typing isn't interrupted
        textarea.addEventListener('change', async () => {
            const val = textarea.value.trim();
            await this.sceneManager.updateScene(scene.filePath, { notes: val || undefined } as any);
            scene.notes = val || undefined;
        });
    }

    /**
     * Render the Snapshots / Version History section.
     */
    private renderSnapshots(scene: Scene): void {
        const section = this.container.createDiv('inspector-section inspector-snapshots');
        const headerRow = section.createDiv('inspector-snapshots-header');
        const hdrIcon = headerRow.createSpan();
        obsidian.setIcon(hdrIcon, 'history');
        headerRow.createSpan({ cls: 'inspector-label', text: ' Snapshots' });

        const saveBtn = headerRow.createEl('button', {
            cls: 'inspector-snapshot-save-btn clickable-icon',
            attr: { title: 'Save snapshot' },
        });
        obsidian.setIcon(saveBtn, 'save');

        const listEl = section.createDiv('inspector-snapshot-list');

        // Load existing snapshots
        const mgr = this.plugin.snapshotManager;
        const loadList = async () => {
            listEl.empty();
            const snapshots = await mgr.listSnapshots(scene.filePath);
            if (snapshots.length === 0) {
                listEl.createSpan({ cls: 'inspector-sp-empty', text: 'No snapshots yet' });
                return;
            }
            for (const snap of snapshots) {
                const row = listEl.createDiv('inspector-snapshot-row');
                const info = row.createDiv('inspector-snapshot-info');
                info.createSpan({ cls: 'inspector-snapshot-label', text: snap.label });
                const dateStr = snap.timestamp.split('T')[0];
                const wcStr = snap.wordcount ? ` · ${snap.wordcount}w` : '';
                info.createSpan({ cls: 'inspector-snapshot-meta', text: `${dateStr}${wcStr}` });

                const btns = row.createDiv('inspector-snapshot-btns');
                const restoreBtn = btns.createEl('button', {
                    cls: 'clickable-icon',
                    attr: { title: 'Restore this snapshot' },
                });
                obsidian.setIcon(restoreBtn, 'undo-2');
                restoreBtn.addEventListener('click', () => {
                    openConfirmModal(this.plugin.app, {
                        title: 'Restore Snapshot',
                        message: `Replace scene with snapshot "${snap.label}"? Save a snapshot first to avoid losing current content.`,
                        confirmLabel: 'Restore',
                        onConfirm: async () => {
                            await mgr.restoreSnapshot(snap.filePath, scene.filePath);
                            // Refresh scene from disk
                            const fresh = this.sceneManager.getAllScenes().find(s => s.filePath === scene.filePath);
                            if (fresh) this.show(fresh);
                        },
                    });
                });

                const delBtn = btns.createEl('button', {
                    cls: 'clickable-icon',
                    attr: { title: 'Delete snapshot' },
                });
                obsidian.setIcon(delBtn, 'trash-2');
                delBtn.addEventListener('click', async () => {
                    await mgr.deleteSnapshot(snap.filePath);
                    await loadList();
                });
            }
        };

        saveBtn.addEventListener('click', () => {
            // Prompt for label
            const modal = new SnapshotLabelModal(this.plugin.app, async (label) => {
                await mgr.saveSnapshot(scene.filePath, label);
                await loadList();
            });
            modal.open();
        });

        loadList();
    }

    /**
     * Collect all known location names from LocationManager + scene metadata.
     */
    private getLocationNames(): string[] {
        const names = new Map<string, string>(); // lowercase → display

        // From LocationManager on the plugin
        const lm = this.plugin.locationManager;
        if (lm) {
            for (const loc of lm.getAllLocations()) {
                const key = loc.name.toLowerCase();
                if (!names.has(key)) names.set(key, loc.name);
            }
        }

        // From scene metadata (catches locations not yet profiled)
        const sceneLocations = this.sceneManager.getUniqueValues('location');
        for (const name of sceneLocations) {
            const key = name.toLowerCase();
            if (!names.has(key)) names.set(key, name);
        }

        return Array.from(names.values()).sort((a, b) =>
            a.toLowerCase().localeCompare(b.toLowerCase())
        );
    }

    /**
     * Build a display-label function for locations (e.g., "Parent > Child").
     */
    private getLocationDisplayLabel(): (value: string) => string {
        const lm = this.plugin.locationManager;
        if (!lm) return (v) => v;
        const displayMap = lm.getDisplayNameMap();
        return (value: string) => displayMap.get(value) || value;
    }
}

/**
 * Fuzzy search modal to pick a scene
 */
class ScenePickerModal extends FuzzySuggestModal<Scene> {
    private scenes: Scene[];
    private onChoose: (scene: Scene) => void;

    constructor(app: App, scenes: Scene[], onChoose: (scene: Scene) => void) {
        super(app);
        this.scenes = scenes;
        this.onChoose = onChoose;
        this.setPlaceholder('Search for a scene…');
    }

    getItems(): Scene[] {
        return this.scenes;
    }

    getItemText(scene: Scene): string {
        const act = scene.act !== undefined ? `Act ${scene.act} — ` : '';
        return `${act}${scene.title || 'Untitled'}`;
    }

    onChooseItem(scene: Scene): void {
        this.onChoose(scene);
    }
}

/**
 * Simple modal to enter a snapshot label
 */
class SnapshotLabelModal extends Modal {
    private onSubmit: (label: string) => void;

    constructor(app: App, onSubmit: (label: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: 'Save Snapshot' });
        contentEl.createEl('p', { text: 'Enter a name for this snapshot (e.g. "before major rewrite")' });

        const input = contentEl.createEl('input', {
            attr: { type: 'text', placeholder: 'Snapshot label…' },
            cls: 'snapshot-label-input',
        });
        input.style.width = '100%';
        input.style.marginBottom = '12px';
        setTimeout(() => input.focus(), 50);

        const btnRow = contentEl.createDiv({ cls: 'snapshot-label-btns' });
        btnRow.style.display = 'flex';
        btnRow.style.gap = '8px';
        btnRow.style.justifyContent = 'flex-end';

        const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        const saveBtn = btnRow.createEl('button', { text: 'Save', cls: 'mod-cta' });
        const doSave = () => {
            const label = input.value.trim() || `Snapshot ${new Date().toLocaleDateString()}`;
            this.onSubmit(label);
            this.close();
        };
        saveBtn.addEventListener('click', doSave);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doSave();
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
