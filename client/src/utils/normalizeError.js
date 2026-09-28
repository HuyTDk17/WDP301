import { HTTP_MESSAGES, MSG } from '../constants/messages.js';

// Trả về object thuần (serializable) để dùng được với rejectWithValue của Redux Toolkit.
// Giả định backend trả: { message, code?, errors?: { field: 'msg' } }. Xem API_CONTRACT.md.
export function normalizeError(error) {
  if (!error.response) {
    return { status: 0, code: 'NETWORK', message: HTTP_MESSAGES.network, fieldErrors: {} };
  }
  const { status, data } = error.response;
  const code = data?.code;
  const backendMessage = typeof data?.message === 'string' ? data.message : null;
  const showBackend = [400, 403, 409, 422].includes(status) && backendMessage;
  return {
    status,
    code,
    message: MSG[code] || (showBackend ? backendMessage : HTTP_MESSAGES[status] || HTTP_MESSAGES.fallback),
    fieldErrors: data?.errors || {},
  };
}

export const getErrorMessage = (err) => err?.message || HTTP_MESSAGES.fallback;
