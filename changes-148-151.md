# Changes for Issues #148 and #151

## Summary

Implemented focused improvements for Plotlines subway hover details and custom section field management.

## Files Changed

- `views/StorylineView.ts`
  - Replaced the compact subway node tooltip text with a richer hover summary.
  - Tooltip now includes scene title, subtitle, synopsis excerpt, Arc Point status, plotlines, story date/time, and the open hint when available.

- `components/CustomSectionsRenderer.ts`
  - Added `folderSource` support to custom-section field definitions.
  - Dropdown and multi-select fields inside custom sections now merge manual options with markdown note names from an optional vault folder path.
  - Added folder-source input to the custom-section Add/Edit Field modal.
  - Added a move-to-section action so a field can move from one user-created section to another while preserving the current entry's value.

- `views/CharacterView.ts`
  - Editing a universal character field now applies the selected Position choice when one is chosen.

- `views/CodexView.ts`
  - Editing a universal Codex field now applies the selected Position choice when one is chosen.

- `views/LocationView.ts`
  - Adding and editing universal Location/World fields now passes sibling fields to the modal and applies the selected Position choice.

- `CHANGELOG.md`
  - Added 1.10.19 entries for issues #148 and #151.

- `HELP.md`
  - Documented richer Plotlines subway hover details.
  - Documented custom-section field moves and folder-sourced dropdown/multi-select options.

## Verification

- TypeScript diagnostics were clean for the edited source files.
- `npm run build` completed successfully and regenerated the bundled plugin output.
