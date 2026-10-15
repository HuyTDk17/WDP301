import { Link } from 'react-router-dom'
import styles from './LegalPage.module.css'

const PAGE_CONTENT = {
  privacy: {
    eyebrow: 'Chính sách bảo mật',
    title: 'Chính sách bảo mật ESport360',
    updatedAt: 'Cập nhật lần cuối: 04/07/2026',
    intro:
      'ESport360 tôn trọng quyền riêng tư của người dùng và cam kết bảo vệ thông tin cá nhân khi bạn tìm sân, đặt sân, thanh toán hoặc quản lý địa điểm trên nền tảng.',
    sections: [
      {
        title: '1. Thông tin chúng tôi thu thập',
        body:
          'Chúng tôi có thể thu thập họ tên, số điện thoại, email, thông tin tài khoản, lịch sử đặt sân, sân yêu thích, thông tin thanh toán được mã hóa và nội dung bạn gửi cho bộ phận hỗ trợ.',
      },
      {
        title: '2. Mục đích sử dụng thông tin',
        body:
          'Dữ liệu được sử dụng để tạo và bảo vệ tài khoản, xử lý đặt sân, gửi thông báo liên quan đến giao dịch, cải thiện trải nghiệm tìm kiếm sân và hỗ trợ khi có sự cố.',
      },
      {
        title: '3. Chia sẻ thông tin',
        body:
          'ESport360 chỉ chia sẻ thông tin cần thiết với chủ sân, đơn vị thanh toán, đối tác kỹ thuật hoặc cơ quan có thẩm quyền khi pháp luật yêu cầu. Chúng tôi không bán thông tin cá nhân của bạn.',
      },
      {
        title: '4. Bảo mật dữ liệu',
        body:
          'Chúng tôi áp dụng các biện pháp kỹ thuật và vận hành phù hợp để hạn chế truy cập trái phép, mất mát hoặc làm sai lệch dữ liệu người dùng.',
      },
      {
        title: '5. Quyền của người dùng',
        body:
          'Bạn có thể yêu cầu cập nhật, điều chỉnh hoặc xóa thông tin tài khoản theo quy định áp dụng. Một số dữ liệu giao dịch có thể được lưu giữ để đối soát và tuân thủ pháp lý.',
      },
    ],
  },
  terms: {
    eyebrow: 'Điều khoản dịch vụ',
    title: 'Điều khoản dịch vụ ESport360',
    updatedAt: 'Có hiệu lực từ: 04/07/2026',
    intro:
      'Các điều khoản này quy định cách người dùng, chủ sân và ESport360 sử dụng nền tảng đặt sân thể thao. Khi tiếp tục sử dụng dịch vụ, bạn đồng ý với các nội dung dưới đây.',
    sections: [
      {
        title: '1. Tài khoản và trách nhiệm người dùng',
        body:
          'Người dùng cần cung cấp thông tin chính xác, bảo mật thông tin đăng nhập và chịu trách nhiệm cho các hoạt động phát sinh từ tài khoản của mình.',
      },
      {
        title: '2. Đặt sân và thanh toán',
        body:
          'Thông tin sân, khung giờ, giá và trạng thái chỗ trống được hiển thị theo dữ liệu từ hệ thống hoặc chủ sân. Đơn đặt sân chỉ được xác nhận sau khi hoàn tất các bước cần thiết.',
      },
      {
        title: '3. Hủy lịch và hoàn tiền',
        body:
          'Chính sách hủy lịch, đổi lịch và hoàn tiền có thể khác nhau theo từng địa điểm. Người dùng cần kiểm tra điều kiện cụ thể trước khi xác nhận đặt sân.',
      },
      {
        title: '4. Nội dung và hành vi bị cấm',
        body:
          'Không sử dụng ESport360 để đăng tải thông tin sai lệch, làm gián đoạn hệ thống, xâm phạm quyền của bên khác hoặc thực hiện hành vi vi phạm pháp luật.',
      },
      {
        title: '5. Thay đổi dịch vụ',
        body:
          'ESport360 có thể cập nhật tính năng, điều chỉnh nội dung điều khoản hoặc tạm dừng một phần dịch vụ để bảo trì, nâng cấp và đảm bảo chất lượng vận hành.',
      },
    ],
  },
}

export default function LegalPage({ type }) {
  const content = PAGE_CONTENT[type] || PAGE_CONTENT.terms

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className="container">
          <Link to="/" className={styles.backLink}>Về trang chủ</Link>
          <p className={styles.eyebrow}>{content.eyebrow}</p>
          <h1 className={styles.title}>{content.title}</h1>
          <p className={styles.updatedAt}>{content.updatedAt}</p>
          <p className={styles.intro}>{content.intro}</p>
        </div>
      </section>

      <section className={styles.contentSection}>
        <div className={`container ${styles.contentWrap}`}>
          <div className={styles.content}>
            {content.sections.map((section) => (
              <article key={section.title} className={styles.section}>
                <h2>{section.title}</h2>
                <p>{section.body}</p>
              </article>
            ))}
          </div>

          <aside className={styles.notice} aria-label="Thông tin lưu ý">
            <h2>Cần hỗ trợ?</h2>
            <p>
              Nếu bạn có câu hỏi về nội dung này, hãy liên hệ bộ phận hỗ trợ
              của ESport360 để được hướng dẫn thêm.
            </p>
            <Link to="/venues" className={styles.ctaLink}>Tiếp tục tìm sân</Link>
          </aside>
        </div>
      </section>
    </div>
  )
}
