import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Xác nhận', cancelLabel = 'Hủy', loading = false, danger = false, onConfirm, onClose }) {
  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button onClick={onConfirm} disabled={loading} color={danger ? 'error' : 'primary'} variant="contained">
          {loading ? 'Đang xử lý…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
