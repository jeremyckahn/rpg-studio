import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material'

export interface DiscardChangesDialogProps {
  readonly open: boolean
  /** What is about to replace the project, e.g. "Creating a new project". */
  readonly action: string
  /** Offer to save to the project's folder first. Only possible where folders are supported. */
  readonly canSave: boolean
  readonly onCancel: () => void
  readonly onDiscard: () => void
  readonly onSaveFirst: () => void
}

/**
 * Asks before something replaces a project that has unsaved changes. Nothing in the
 * editor autosaves and a replaced project cannot be recovered, so this is the last chance.
 */
export const DiscardChangesDialog = ({
  open,
  action,
  canSave,
  onCancel,
  onDiscard,
  onSaveFirst,
}: DiscardChangesDialogProps) => (
  <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
    <DialogTitle>Discard unsaved changes?</DialogTitle>
    <DialogContent>
      <DialogContentText>
        {action} replaces the open project, and your unsaved changes will be lost.{' '}
        {canSave
          ? 'You can save them to the project folder first.'
          : 'Download a copy first with File ▸ Download project (.zip) if you want to keep them.'}
      </DialogContentText>
    </DialogContent>
    <DialogActions>
      <Button onClick={onCancel} autoFocus>
        Cancel
      </Button>
      <Button color="error" onClick={onDiscard}>
        Discard changes
      </Button>
      {canSave ? (
        <Button variant="contained" onClick={onSaveFirst}>
          Save, then continue
        </Button>
      ) : null}
    </DialogActions>
  </Dialog>
)
