import { useContext } from 'react';
import { SnackbarContext } from '../contexts/snackbarContext.js';

export default function useSnackbar() {
  const ctx = useContext(SnackbarContext);
  if (!ctx) throw new Error('useSnackbar phải được dùng bên trong SnackbarProvider');
  return ctx;
}
