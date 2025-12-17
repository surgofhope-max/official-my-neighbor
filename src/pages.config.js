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
    "SellerDashboard": SellerDashboard,
    "SellerProducts": SellerProducts,
    "SellerShows": SellerShows,
    "HostConsole": HostConsole,
    "LiveShow": LiveShow,
    "BuyerOrders": BuyerOrders,
    "SellerOrders": SellerOrders,
    "AdminDashboard": AdminDashboard,
    "AdminSellers": AdminSellers,
    "AdminReports": AdminReports,
    "Marketplace": Marketplace,
    "SellerStorefront": SellerStorefront,
    "BuyerProfile": BuyerProfile,
    "Sellers": Sellers,
    "NearMe": NearMe,
    "Messages": Messages,
    "Communities": Communities,
    "AdminAnalytics": AdminAnalytics,
    "CommunityPage": CommunityPage,
    "AdminGIVITracker": AdminGIVITracker,
    "GIVIDiagnostics": GIVIDiagnostics,
    "ShowVideoDebug": ShowVideoDebug,
    "Notifications": Notifications,
    "AdminSellerData": AdminSellerData,
    "ManageUsers": ManageUsers,
    "BuyerSafetyAgreement": BuyerSafetyAgreement,
    "SellerSafetyAgreement": SellerSafetyAgreement,
    "SellerOnboarding": SellerOnboarding,
    "Login": Login,
    "Signup": Signup,
}

export const pagesConfig = {
    mainPage: "Marketplace",
    Pages: PAGES,
    Layout: __Layout,
};