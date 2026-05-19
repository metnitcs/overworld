import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// NOTE: ตั้งใจไม่ใช้ React.StrictMode เพราะ Phaser ไม่ชอบ double-mount ใน dev
// (จะสร้าง canvas ซ้ำและ event listener ซ้อน) — production build ปกติ
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
