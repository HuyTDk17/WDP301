import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { authApi } from '../../services/api/authApi.js';
import { userApi } from '../../services/api/userApi.js';
import { tokenStorage } from '../../services/axiosClient.js';

// Giả định login trả { data: { accessToken, user } }.
export const login = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const res = await authApi.login(credentials);
    tokenStorage.set(res.data.accessToken);
    return res.data.user;
  } catch (err) {
    return rejectWithValue(err);
  }
});

// Chạy một lần khi app khởi động nếu đã có token.
export const restoreSession = createAsyncThunk('auth/restoreSession', async (_, { rejectWithValue }) => {
  if (!tokenStorage.get()) return null;
  try {
    const res = await userApi.getProfile();
    return res.data;
  } catch (err) {
    tokenStorage.clear();
    return rejectWithValue(err);
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState: { user: null, initialized: false, loginStatus: 'idle' },
  reducers: {
    loggedOut(state) {
      state.user = null;
    },
    profileUpdated(state, action) {
      state.user = { ...state.user, ...action.payload };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loginStatus = 'loading';
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loginStatus = 'idle';
        state.user = action.payload;
      })
      .addCase(login.rejected, (state) => {
        state.loginStatus = 'idle';
      })
      .addCase(restoreSession.fulfilled, (state, action) => {
        state.user = action.payload;
        state.initialized = true;
      })
      .addCase(restoreSession.rejected, (state) => {
        state.user = null;
        state.initialized = true;
      });
  },
});

export const { loggedOut, profileUpdated } = authSlice.actions;

// Xoá token ngoài reducer để reducer giữ thuần.
export const logout = () => (dispatch) => {
  tokenStorage.clear();
  dispatch(loggedOut());
};
export default authSlice.reducer;
