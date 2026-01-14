import SellerDashboard from './pages/SellerDashboard';
import SellerProducts from './pages/SellerProducts';
import SellerShows from './pages/SellerShows';
import HostConsole from './pages/HostConsole';
import LiveShow from './pages/LiveShow';
import BuyerOrders from './pages/BuyerOrders';
import SellerOrders from './pages/SellerOrders';
import AdminDashboard from './pages/AdminDashboard';
import AdminSellers from './pages/AdminSellers';
import AdminReports from './pages/AdminReports';
import Marketplace from './pages/Marketplace';
import SellerStorefront from './pages/SellerStorefront';
import BuyerProfile from './pages/BuyerProfile';
import Sellers from './pages/Sellers';
import NearMe from './pages/NearMe';
import Messages from './pages/Messages';
import Communities from './pages/Communities';
import AdminAnalytics from './pages/AdminAnalytics';
import CommunityPage from './pages/CommunityPage';
import AdminGIVITracker from './pages/AdminGIVITracker';
import GIVIDiagnostics from './pages/GIVIDiagnostics';
import ShowVideoDebug from './pages/ShowVideoDebug';
import Notifications from './pages/Notifications';
import AdminSellerData from './pages/AdminSellerData';
import ManageUsers from './pages/ManageUsers';
import BuyerSafetyAgreement from './pages/BuyerSafetyAgreement';
import SellerSafetyAgreement from './pages/SellerSafetyAgreement';
import SellerOnboarding from './pages/SellerOnboarding';
import Login from './pages/Login';
import Signup from './pages/Signup';
import __Layout from './Layout.jsx';


export const PAGES = {
    "sellerdashboard": SellerDashboard,
    "sellerproducts": SellerProducts,
    "sellershows": SellerShows,
    "hostconsole": HostConsole,
    "liveshow": LiveShow,
    "buyerorders": BuyerOrders,
    "sellerorders": SellerOrders,
    "admindashboard": AdminDashboard,
    "adminsellers": AdminSellers,
    "adminreports": AdminReports,
    "marketplace": Marketplace,
    "sellerstorefront": SellerStorefront,
    "buyerprofile": BuyerProfile,
    "sellers": Sellers,
    "nearme": NearMe,
    "messages": Messages,
    "communities": Communities,
    "adminanalytics": AdminAnalytics,
    "communitypage": CommunityPage,
    "admingivitracker": AdminGIVITracker,
    "gividiagnostics": GIVIDiagnostics,
    "showvideodebug": ShowVideoDebug,
    "notifications": Notifications,
    "adminsellerdata": AdminSellerData,
    "manageusers": ManageUsers,
    "buyersafetyagreement": BuyerSafetyAgreement,
    "sellersafetyagreement": SellerSafetyAgreement,
    "selleronboarding": SellerOnboarding,
    "login": Login,
    "signup": Signup,
}

export const pagesConfig = {
    mainPage: "marketplace",
    Pages: PAGES,
    Layout: __Layout,
};