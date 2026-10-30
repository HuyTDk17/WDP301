import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import api from './services/api'
import { applySportCategories } from './utils'
import './styles/globals.css'

// Danh mục môn thể thao do Admin quản lý: nạp TRƯỚC khi vẽ giao diện để mọi nơi dùng SPORTS thấy dữ liệu mới ngay.
// Chờ tối đa 1,2 giây; lỗi/chậm thì dùng danh mục mặc định, không chặn người dùng.
const loadSports = api.get('/sports')
  .then((res) => applySportCategories(res.sports))
  .catch(() => {})
const timeout = new Promise((resolve) => setTimeout(resolve, 1200))

Promise.race([loadSports, timeout]).finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
