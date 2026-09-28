import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice.js';
import notificationReducer from './slices/notificationSlice.js';

const store = configureStore({
  reducer: {
    auth: authReducer,
    notifications: notificationReducer,
  },
});

export default store;
