import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material'

import { useAppSelector, useServices } from './services.tsx'

/**
 * Asks before the project is saved into a folder that already holds project files. Same-named
 * files are overwritten and the others stay, so they would show up as ghost maps and assets
 * when the folder is opened later.
 */
export const FolderConflictDialog = () => {
  const { session } = useServices()
  const conflict = useAppSelector((state) => state.editorUi.folderConflict)
  const more = conflict ? conflict.leftoverCount - conflict.leftover.length : 0

  return (
    <Dialog
      open={conflict !== null}
      onClose={() => {
        session.answerFolderConflict(false)
      }}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>This folder already has project files</DialogTitle>
      <DialogContent>
        <DialogContentText>
          “{conflict?.folderName}” holds {conflict?.existing} project file(s). Saving here
          overwrites the ones with the same name.
        </DialogContentText>
        {conflict && conflict.leftoverCount > 0 ? (
          <DialogContentText sx={{ mt: 1 }}>
            {conflict.leftoverCount} of them are not part of this project and will stay in the
            folder, so they will appear in the project the next time you open it:
            <br />
            {conflict.leftover.join(', ')}
            {more > 0 ? ` and ${more} more` : ''}
          </DialogContentText>
        ) : null}
        <DialogContentText sx={{ mt: 1 }}>Choose an empty folder to avoid this.</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button
          autoFocus
          onClick={() => {
            session.answerFolderConflict(false)
          }}
        >
          Cancel
        </Button>
        <Button
          color="warning"
          onClick={() => {
            session.answerFolderConflict(true)
          }}
        >
          Save anyway
        </Button>
      </DialogActions>
    </Dialog>
  )
}
