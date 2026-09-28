import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { notificationApi } from '../../services/api/notificationApi.js';

// Giả định list trả { data: [{ _id, type, title, content, isRead, relatedEntity, createdAt }] }.
export const fetchNotifications = createAsyncThunk('notifications/fetch', async (_, { rejectWithValue }) => {
  try {
    const res = await notificationApi.list();
    return res.data;
  } catch (err) {
    return rejectWithValue(err);
  }
});

export const markNotificationRead = createAsyncThunk('notifications/markRead', async (id, { rejectWithValue }) => {
  try {
    await notificationApi.markRead(id);
    return id;
  } catch (err) {
    return rejectWithValue(err);
  }
});

export const markAllNotificationsRead = createAsyncThunk('notifications/markAllRead', async (_, { rejectWithValue }) => {
  try {
    await notificationApi.markAllRead();
  } catch (err) {
    return rejectWithValue(err);
  }
});

const notificationSlice = createSlice({
  name: 'notifications',
  initialState: { items: [], status: 'idle' },
  reducers: {
    clearNotifications(state) {
      state.items = [];
      state.status = 'idle';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.items = action.payload;
        state.status = 'succeeded';
      })
      .addCase(fetchNotifications.rejected, (state) => {
        state.status = 'failed';
      })
      .addCase(markNotificationRead.fulfilled, (state, action) => {
        const item = state.items.find((n) => n._id === action.payload);
        if (item) item.isRead = true;
      })
      .addCase(markAllNotificationsRead.fulfilled, (state) => {
        state.items.forEach((n) => {
          n.isRead = true;
        });
      });
  },
});

export const { clearNotifications } = notificationSlice.actions;
export const selectUnreadCount = (state) => state.notifications.items.filter((n) => !n.isRead).length;
export default notificationSlice.reducer;
