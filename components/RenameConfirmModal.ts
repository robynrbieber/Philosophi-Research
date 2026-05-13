import { Modal, App, Setting } from 'obsidian';
import { RenamePreview } from '../services/CascadeRenameService';

/**
 * Modal that shows the user what a rename will affect and asks for confirmation.
 *
 * Displays a summary like:
 *   Rename "John" → "Jonathan"?
 *   This will update 12 scenes and 3 relationships.
 *
 * - "Update References" — cascades the rename across the project
 * - "Cancel" — reverts the name back to the original
 */
export class RenameConfirmModal extends Modal {
    private resolved = false;

    constructor(
        app: App,
        private entityType: 'character' | 'world' | 'location',
        private oldName: string,
        private newName: string,
        private preview: RenamePreview,
        private summaryText: string,
        private onConfirm: () => void | Promise<void>,
        private onCancel?: () => void,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        const label = this.entityType.charAt(0).toUpperCase() + this.entityType.slice(1);

        this.titleEl.setText(`Rename ${label}`);

        // Description
        contentEl.createEl('p', {
            text: `Rename "${this.oldName}" → "${this.newName}"?`,
        }).setCssStyles({ fontWeight: '600' });

        contentEl.createEl('p', {
            text: this.summaryText,
            cls: 'setting-item-description',
        });

        // Detail breakdown
        const details = contentEl.createEl('div');
        details.setCssStyles({
            marginBottom: '12px',
            fontSize: '13px',
            color: 'var(--text-muted)',
        });

        if (this.preview.sceneCount > 0) {
            details.createEl('div', { text: `• ${this.preview.sceneCount} scene${this.preview.sceneCount !== 1 ? 's' : ''} (pov, characters, location fields)` });
        }
        if (this.preview.relationCount > 0) {
            details.createEl('div', { text: `• ${this.preview.relationCount} character relationship${this.preview.relationCount !== 1 ? 's' : ''}` });
        }
        if (this.preview.locationCount > 0) {
            details.createEl('div', { text: `• ${this.preview.locationCount} child location${this.preview.locationCount !== 1 ? 's' : ''} (world/parent fields)` });
        }
        if (this.preview.characterLocationCount > 0) {
            details.createEl('div', { text: `• ${this.preview.characterLocationCount} character location reference${this.preview.characterLocationCount !== 1 ? 's' : ''}` });
        }

        // Buttons
        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText('Cancel')
                    .onClick(() => {
                        this.resolved = true;
                        this.close();
                        this.onCancel?.();
                    });
            })
            .addButton(btn => {
                btn.setButtonText('Update References')
                    .setCta()
                    .onClick(async () => {
                        this.resolved = true;
                        this.close();
                        await this.onConfirm();
                    });
            });
    }

    onClose(): void {
        if (!this.resolved) {
            // User closed modal without choosing (Escape key) — revert name
            this.onCancel?.();
        }
        this.contentEl.empty();
    }
}
