import { Modal, Setting, Notice } from 'obsidian';
import { ExportService, ExportFormat, ExportScope } from '../services/ExportService';
import type SceneCardsPlugin from '../main';

/**
 * Modal that lets the user pick format (MD / JSON / HTML) and scope
 * (manuscript / outline), then triggers the export.
 */
export class ExportModal extends Modal {
    private plugin: SceneCardsPlugin;
    private exportService: ExportService;

    private format: ExportFormat = 'md';
    private exportScope: ExportScope = 'manuscript';

    // Per-export options (issues #85 / #87)
    private includeSceneTitles = true;
    private numberScenesOnExport = false;
    private includeCorkboardNotes = false;

    constructor(plugin: SceneCardsPlugin) {
        super(plugin.app);
        this.plugin = plugin;
        this.exportService = new ExportService(plugin.app, plugin.sceneManager, plugin.characterManager, plugin.locationManager);
        // Pass DOCX settings to the export service
        if (plugin.settings.docxSettings) {
            this.exportService.setDocxSettings(plugin.settings.docxSettings);
        }
        // Pass PDF settings to the export service
        if (plugin.settings.pdfSettings) {
            this.exportService.setPdfSettings(plugin.settings.pdfSettings);
        }
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('storyline-export-modal');

        contentEl.createEl('h2', { text: 'Export Project' });

        const project = this.plugin.sceneManager.activeProject;
        if (!project) {
            contentEl.createEl('p', { text: 'No active project. Open a project first.' });
            return;
        }

        contentEl.createEl('p', {
            text: `Project: ${project.title}`,
            cls: 'storyline-export-project-name',
        });

        // Scope selection
        let scopeDropdown: any;
        let renderManuscriptOptions: () => void = () => {};
        new Setting(contentEl)
            .setName('Content')
            .setDesc('What to include in the export')
            .addDropdown(dd => {
                scopeDropdown = dd;
                dd.addOption('outline', 'Outline (metadata, stats, table)');
                dd.addOption('manuscript', 'Manuscript (scene text in order)');
                dd.setValue(this.exportScope);
                dd.onChange(v => {
                    this.exportScope = v as ExportScope;
                    renderManuscriptOptions();
                });
            });

        // Format selection
        new Setting(contentEl)
            .setName('Format')
            .addDropdown(dd => {
                dd.addOption('md', 'Markdown (.md)');
                dd.addOption('docx', 'Word (.docx)');
                dd.addOption('pdf', 'PDF (.pdf)');
                dd.addOption('html', 'HTML (.html)');
                dd.addOption('csv', 'CSV (.csv)');
                dd.addOption('json', 'JSON (.json)');
                dd.setValue(this.format);
                dd.onChange(v => {
                    this.format = v as ExportFormat;
                    // Auto-switch to Manuscript when DOCX or PDF is selected
                    if ((v === 'docx' || v === 'pdf') && this.exportScope !== 'manuscript') {
                        this.exportScope = 'manuscript';
                        scopeDropdown?.setValue('manuscript');
                        renderManuscriptOptions();
                    }
                });
            });

        // Actions
        const actions = contentEl.createDiv({ cls: 'storyline-export-actions' });

        // Manuscript-only options (scene titles / numbering / corkboard notes).
        // Issues #85 and #87.
        const manuscriptOptions = contentEl.createDiv({ cls: 'storyline-export-options' });

        renderManuscriptOptions = () => {
            manuscriptOptions.empty();
            if (this.exportScope !== 'manuscript') return;

            let titlesToggle: any;
            let numberToggle: any;

            new Setting(manuscriptOptions)
                .setName('Include scene titles')
                .setDesc('Show "#### Scene Title" before each scene. Disable for a clean reader copy.')
                .addToggle(t => {
                    titlesToggle = t;
                    t.setValue(this.includeSceneTitles && !this.numberScenesOnExport);
                    t.onChange(v => {
                        this.includeSceneTitles = v;
                        if (v) {
                            this.numberScenesOnExport = false;
                            numberToggle?.setValue(false);
                        }
                    });
                });

            new Setting(manuscriptOptions)
                .setName('Number scenes (1, 2, 3\u2026)')
                .setDesc('Replace scene titles with sequential numbers in the export.')
                .addToggle(t => {
                    numberToggle = t;
                    t.setValue(this.numberScenesOnExport);
                    t.onChange(v => {
                        this.numberScenesOnExport = v;
                        if (v) {
                            this.includeSceneTitles = false;
                            titlesToggle?.setValue(false);
                        }
                    });
                });

            new Setting(manuscriptOptions)
                .setName('Include corkboard notes')
                .setDesc('Include sticky / brainstorm notes from the corkboard. Off by default.')
                .addToggle(t => {
                    t.setValue(this.includeCorkboardNotes);
                    t.onChange(v => { this.includeCorkboardNotes = v; });
                });
        };
        renderManuscriptOptions();

        const exportBtn = actions.createEl('button', { text: 'Export', cls: 'mod-cta' });
        exportBtn.setAttr('type', 'button');
        exportBtn.addEventListener('click', async () => {
            exportBtn.disabled = true;
            exportBtn.textContent = 'Exporting…';
            try {
                this.exportService.setExportOptions({
                    includeSceneTitles: this.includeSceneTitles,
                    numberScenesOnExport: this.numberScenesOnExport,
                    includeCorkboardNotes: this.includeCorkboardNotes,
                });
                await this.exportService.export(this.format, this.exportScope);
                this.close();
            } catch (err) {
                new Notice('Export failed: ' + String(err));
                exportBtn.disabled = false;
                exportBtn.textContent = 'Export';
            }
        });

        const cancelBtn = actions.createEl('button', { text: 'Cancel' });
        cancelBtn.setAttr('type', 'button');
        cancelBtn.addEventListener('click', () => this.close());
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
