import DashboardIcon from '@mui/icons-material/Dashboard';
import StadiumIcon from '@mui/icons-material/Stadium';
import EventNoteIcon from '@mui/icons-material/EventNote';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import GroupsIcon from '@mui/icons-material/Groups';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import StorefrontIcon from '@mui/icons-material/Storefront';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import CampaignIcon from '@mui/icons-material/Campaign';
import RateReviewIcon from '@mui/icons-material/RateReview';
import BarChartIcon from '@mui/icons-material/BarChart';
import PolicyIcon from '@mui/icons-material/Policy';
import HubIcon from '@mui/icons-material/Hub';
import PeopleIcon from '@mui/icons-material/People';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import CategoryIcon from '@mui/icons-material/Category';
import ImageIcon from '@mui/icons-material/Image';
import ArticleIcon from '@mui/icons-material/Article';
import SearchIcon from '@mui/icons-material/Search';

// path: đường dẫn tương đối so với /customer | /owner | /admin ('' = trang chủ của vai trò)
// fr: mã yêu cầu trong SRS để truy vết. Thêm `element` khi trang thật được hiện thực.
export const ROLE_MENUS = {
  customer: [
    { path: 'search', label: 'Tìm sân', icon: <SearchIcon />, fr: 'FR 5.1' },
    { path: 'bookings', label: 'Lịch sử đặt sân', icon: <EventNoteIcon />, fr: 'FR 5.14' },
    { path: 'matches', label: 'Ghép đội', icon: <GroupsIcon />, fr: 'FR 5.9' },
    { path: 'complaints', label: 'Khiếu nại', icon: <ReportProblemIcon />, fr: 'FR 5.12–5.13' },
    { path: 'transfers', label: 'Chuyển sân', icon: <SwapHorizIcon />, fr: 'FR 6.9–6.11' },
    { path: 'owner-application', label: 'Đăng ký chủ sân', icon: <StorefrontIcon />, fr: 'FR 3.1' },
  ],
  owner: [
    { path: '', label: 'Tổng quan', icon: <DashboardIcon />, fr: 'FR 4.5' },
    { path: 'fields', label: 'Sân của tôi', icon: <StadiumIcon />, fr: 'FR 3.2–3.5' },
    { path: 'bookings', label: 'Đặt sân', icon: <EventNoteIcon />, fr: 'FR 3.6–3.8' },
    { path: 'calendar', label: 'Lịch đặt sân', icon: <CalendarMonthIcon />, fr: 'FR 3.6' },
    { path: 'vouchers', label: 'Voucher', icon: <LocalOfferIcon />, fr: 'FR 4.1–4.2' },
    { path: 'events', label: 'Sự kiện / khuyến mãi', icon: <CampaignIcon />, fr: 'FR 4.3–4.4' },
    { path: 'reviews', label: 'Đánh giá', icon: <RateReviewIcon />, fr: 'FR 4.6' },
    { path: 'revenue', label: 'Doanh thu', icon: <BarChartIcon />, fr: 'FR 4.5' },
    { path: 'cancellation-policy', label: 'Chính sách hủy', icon: <PolicyIcon />, fr: 'FR 6.4' },
    { path: 'network', label: 'Mạng lưới & chuyển sân', icon: <HubIcon />, fr: 'FR 6.5' },
  ],
  admin: [
    { path: '', label: 'Bảng điều khiển', icon: <DashboardIcon />, fr: 'FR 2.8' },
    { path: 'users', label: 'Người dùng', icon: <PeopleIcon />, fr: 'FR 2.1–2.3' },
    { path: 'owner-applications', label: 'Đơn đăng ký chủ sân', icon: <AssignmentIndIcon />, fr: 'FR 2.9–2.11' },
    { path: 'field-approvals', label: 'Duyệt sân', icon: <FactCheckIcon />, fr: 'FR 2.12–2.14' },
    { path: 'complaints', label: 'Khiếu nại', icon: <ReportProblemIcon />, fr: 'FR 2.15–2.17' },
    { path: 'categories', label: 'Danh mục sân', icon: <CategoryIcon />, fr: 'FR 2.7' },
    { path: 'banners', label: 'Banner trang chủ', icon: <ImageIcon />, fr: 'FR 2.4' },
    { path: 'news', label: 'Tin tức', icon: <ArticleIcon />, fr: 'FR 2.5' },
    { path: 'policies', label: 'Chính sách website', icon: <PolicyIcon />, fr: 'FR 2.6' },
    { path: 'network', label: 'Mạng lưới chuyển sân', icon: <HubIcon />, fr: 'FR 6.6–6.8' },
  ],
};

export const ROLE_TITLES = { customer: 'Khách hàng', owner: 'Chủ sân', admin: 'Quản trị' };
