const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isEmail = (value) => EMAIL_REGEX.test(value.trim());

// SRS FR 1.1 chỉ nêu "minimum length/complexity" mà không cụ thể hoá.
// Giả định tạm: >= 8 ký tự, có chữ và số. Backend vẫn là nơi quyết định cuối cùng.
export const PASSWORD_HINT = 'Tối thiểu 8 ký tự, gồm cả chữ và số.';
export const isValidPassword = (value) => value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
