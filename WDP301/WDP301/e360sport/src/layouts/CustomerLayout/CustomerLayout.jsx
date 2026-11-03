import { Outlet } from 'react-router-dom'
import Navbar from '@/components/common/Navbar/Navbar'
import Footer from '@/components/common/Footer/Footer'
import ToastContainer from '@/components/ui/Toast/Toast'
import styles from './CustomerLayout.module.css'

export default function CustomerLayout() {
  return (
    <div className={styles.layout}>
      <Navbar />
      <main className={styles.main}><Outlet /></main>
      <Footer />
      <ToastContainer />
    </div>
  )
}
