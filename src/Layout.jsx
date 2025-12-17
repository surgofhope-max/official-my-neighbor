import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useSupabaseAuth } from "@/lib/auth/SupabaseAuthProvider";
import { getUnreadNotificationCount } from "@/api/notifications";
import { getUnreadMessageCount } from "@/api/messages";
import { getEffectiveUserContext } from "@/lib/auth/effectiveUser";
import { getSellerByUserId, getSellerById } from "@/api/sellers";
import { canAccessRoute, getUnauthorizedRedirect, isSuperAdmin } from "@/lib/auth/routeGuards";
import {
  Video,
  ShoppingBag,
  LayoutDashboard,
  Package,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Radio,
  Receipt,
  User,
  Store,
  MessageCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import NotificationBell from "./components/layout/NotificationBell";
import ImpersonationBanner from "./components/admin/ImpersonationBanner";

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Use SupabaseAuthProvider as single source of truth for user state
  const { user, isLoadingAuth } = useSupabaseAuth();
  
  const [seller, setSeller] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  // Pages where header should be shown
  const pagesWithHeader = ['Marketplace', 'SellerDashboard', 'BuyerProfile', 'AdminDashboard'];
  const shouldShowHeader = pagesWithHeader.includes(currentPageName);

  // Check if admin is impersonating
  const impersonatingSellerId = sessionStorage.getItem('admin_impersonate_seller_id');
  const isImpersonating = !!impersonatingSellerId;

  // Load seller data and counts when user changes (from SupabaseAuthProvider)
  useEffect(() => {
    if (isLoadingAuth) return; // Wait for auth check to complete
    
    if (user) {
      console.log("👤 User loaded:", user.email, "Role:", user.user_metadata?.role);
      loadSellerData(user);
      loadUnreadCount(user);
      loadUnreadNotificationCount(user);
    } else {
      console.log("👤 No user logged in - visitor UI visible");
      setSeller(null);
      setUnreadCount(0);
      setUnreadNotificationCount(0);
    }
  }, [user, isLoadingAuth]);

  // Listen for impersonation changes
  useEffect(() => {
    if (!user) return;
    
    const handleStorageChange = () => {
      console.log("🔄 Impersonation state changed - reloading seller");
      loadSellerData(user);
    };

    // Poll for sessionStorage changes (since storage event doesn't fire for same-tab changes)
    const interval = setInterval(() => {
      const currentImpersonation = sessionStorage.getItem('admin_impersonate_seller_id');
      if (currentImpersonation !== impersonatingSellerId) {
        handleStorageChange();
      }
    }, 500);

    return () => clearInterval(interval);
  }, [impersonatingSellerId, user]);

  useEffect(() => {
    // CRITICAL: Don't redirect on LiveShow page - wait for params to resolve
    const isLiveShowRoute = location.pathname.toLowerCase().includes('liveshow') || location.search.toLowerCase().includes('showid');
    
    if (!isLiveShowRoute && (location.pathname === '/' || location.pathname === '' || location.pathname === '/index.html')) {
      navigate(createPageUrl("Marketplace"), { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  // Route protection - check access after auth is verified
  useEffect(() => {
    // Wait for auth check to complete
    if (isLoadingAuth) return;

    // Check if current route is accessible
    const hasAccess = canAccessRoute(currentPageName, user, seller);

    if (!hasAccess) {
      // Silently redirect to appropriate page
      const redirectTo = getUnauthorizedRedirect(currentPageName, user);
      navigate(createPageUrl(redirectTo), { replace: true });
    }
  }, [isLoadingAuth, currentPageName, user, seller, navigate]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const loadSellerData = async (currentUser) => {
    try {
      // If impersonating, load the impersonated seller by ID
      if (impersonatingSellerId) {
        const targetSeller = await getSellerById(impersonatingSellerId);
        if (targetSeller) {
          setSeller(targetSeller);
          console.log("🔧 Admin impersonating seller:", targetSeller.business_name);
        } else {
          console.warn("Impersonation target seller not found:", impersonatingSellerId);
          sessionStorage.removeItem('admin_impersonate_seller_id');
        }
      } else {
        // Load seller by user ID
        const sellerData = await getSellerByUserId(currentUser.id);
        if (sellerData) {
          setSeller(sellerData);
          console.log("🏪 Seller profile found:", sellerData.business_name, "Status:", sellerData.status);
        } else {
          console.log("👤 Regular buyer - no seller profile");
        }
      }
    } catch (error) {
      console.error("Error loading seller data:", error);
    }
  };

  const loadUnreadCount = async (currentUser) => {
    try {
      if (!currentUser) {
        setUnreadCount(0);
        return;
      }

      const {
        effectiveUserId,
        isImpersonating: isActivelyImpersonating,
        impersonatedSellerId: effectiveSellerId,
      } = getEffectiveUserContext(currentUser);

      // Determine role: seller if impersonating or has approved seller profile
      const isSellerRole = isActivelyImpersonating || (seller && seller.status === "approved");
      const role = isSellerRole ? "seller" : "buyer";

      // Get the seller ID to use
      const sellerIdForQuery = isActivelyImpersonating
        ? effectiveSellerId
        : seller?.id ?? null;

      const count = await getUnreadMessageCount({
        effectiveUserId,
        effectiveSellerId: sellerIdForQuery,
        role,
      });

      setUnreadCount(count);
    } catch {
      setUnreadCount(0);
    }
  };

  const loadUnreadNotificationCount = async (currentUser) => {
    try {
      if (!currentUser) {
        setUnreadNotificationCount(0);
        return;
      }
      const { effectiveUserId } = getEffectiveUserContext(currentUser);
      const count = await getUnreadNotificationCount(effectiveUserId);
      setUnreadNotificationCount(count);
    } catch {
      setUnreadNotificationCount(0);
    }
  };

  const isLiveShowPage = 
    currentPageName === "LiveShow" || 
    location.pathname.toLowerCase().includes('liveshow') ||
    location.pathname.toLowerCase().includes('live-show') ||
    location.search.toLowerCase().includes('showid');

  const isNearMePage = 
    currentPageName === "NearMe" || 
    location.pathname.toLowerCase().includes('nearme') ||
    location.pathname.toLowerCase().includes('near-me');

  // Poll for unread messages every 30 seconds (skip on LiveShow)
  useEffect(() => {
    if (isLiveShowPage || !user) {
      return;
    }

    const interval = setInterval(() => {
      loadUnreadCount(user);
    }, 30000);

    return () => clearInterval(interval);
  }, [isLiveShowPage, user]);

  // Poll for unread notifications every 30 seconds (skip on LiveShow)
  useEffect(() => {
    if (isLiveShowPage || !user) {
      return;
    }

    const interval = setInterval(() => {
      loadUnreadNotificationCount(user);
    }, 30000);

    return () => clearInterval(interval);
  }, [isLiveShowPage, user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate(createPageUrl("Marketplace"), { replace: true });
  };

  const handleUserClick = () => {
    const userRole = user?.user_metadata?.role || user?.role;

    // 1. SUPER_ADMIN → AdminDashboard
    if (isSuperAdmin(user)) {
      navigate(createPageUrl("AdminDashboard"));
      return;
    }

    // 2. Admin → AdminDashboard (admins manage platform, not sell)
    if (userRole === "admin") {
      navigate(createPageUrl("AdminDashboard"));
      return;
    }

    // 3. Approved Seller → SellerDashboard
    if (seller && seller.status === "approved") {
      navigate(createPageUrl("SellerDashboard"));
      return;
    }

    // 4. Everyone else → BuyerProfile
    navigate(createPageUrl("BuyerProfile"));
  };

  const handleLogoClick = () => {
    console.log("🏠 Logo clicked, navigating to Marketplace");
    navigate(createPageUrl("Marketplace"));
  };

  // Role extraction for display and routing decisions
  const userRole = user?.user_metadata?.role || user?.role;
  // isApprovedSeller is TRUE only when a seller profile exists AND is approved
  // Admins and Super Admins are NOT sellers — they have separate access paths
  const isApprovedSeller = seller && seller.status === "approved";
  const isPendingSeller = !isSuperAdmin(user) && seller && seller.status === "pending";

  const sellerNav = [
    { title: "Marketplace", url: createPageUrl("Marketplace"), icon: ShoppingBag },
    { title: "Communities", url: createPageUrl("Communities"), icon: Users },
    { title: "Dashboard", url: createPageUrl("SellerDashboard"), icon: LayoutDashboard },
    { title: "Orders", url: createPageUrl("SellerOrders"), icon: Receipt },
  ];

  const buyerNav = [
    { title: "Marketplace", url: createPageUrl("Marketplace"), icon: ShoppingBag },
    { title: "Communities", url: createPageUrl("Communities"), icon: Users },
    { title: "My Orders", url: createPageUrl("BuyerOrders"), icon: Receipt },
    { title: "Profile", url: createPageUrl("BuyerProfile"), icon: User },
  ];

  // Admin navigation - platform management only (V1)
  const adminNav = [
    { title: "Marketplace", url: createPageUrl("Marketplace"), icon: ShoppingBag },
    { title: "Dashboard", url: createPageUrl("AdminDashboard"), icon: LayoutDashboard },
    { title: "Sellers", url: createPageUrl("AdminSellers"), icon: Store },
  ];

  // Non-logged-in visitor navigation - ONLY these 4 items, NO Profile/Orders
  const visitorNav = [
    { title: "Login", url: "#login", icon: User, isLogin: true },
    { title: "Live", url: createPageUrl("Marketplace"), icon: Radio, isLive: true },
    { title: "Community", url: createPageUrl("Communities"), icon: Users },
    { title: "Marketplace", url: createPageUrl("Marketplace"), icon: ShoppingBag, isMarketplace: true },
  ];

  // Navigation selection priority:
  // 1. Not logged in → visitorNav
  // 2. Admin or Super Admin → adminNav (platform management)
  // 3. Approved Seller → sellerNav
  // 4. Everyone else → buyerNav
  const isAdminUser = userRole === "admin" || isSuperAdmin(user);
  const navigation = user === null
    ? visitorNav
    : isAdminUser
      ? adminNav
      : isApprovedSeller
        ? sellerNav
        : buyerNav;

  console.log("🔍 Layout Detection:", {
    currentPageName,
    pathname: location.pathname,
    search: location.search,
    isLiveShowPage,
    shouldShowHeader,
    isImpersonating
  });

  // REMOVED: Loading spinner block
  // Visitor UI renders immediately - no blocking on auth check

  return (
    <>
      <style>{`
        :root {
          --primary: 270 80% 55%;
          --primary-dark: 270 80% 45%;
          --accent: 200 85% 50%;
          --accent-dark: 200 85% 40%;
        }

        @keyframes pulse-glow {
          0%, 100% {
            filter: drop-shadow(0 0 12px rgba(255, 255, 255, 0.8)) drop-shadow(0 0 6px rgba(255, 215, 0, 0.6));
          }
          50% {
            filter: drop-shadow(0 0 18px rgba(255, 255, 255, 1)) drop-shadow(0 0 10px rgba(255, 215, 0, 0.9));
          }
        }

        .animate-pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
      `}</style>

      <div className={`min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 ${isLiveShowPage ? 'pb-0' : 'pb-20'}`}>
        {/* Admin Impersonation Banner - Always on top */}
        {isImpersonating && <ImpersonationBanner />}

        {/* Top Header - Only show on specific pages */}
        {shouldShowHeader && !isLiveShowPage && !isNearMePage && (
          <header className="bg-[#1fb3e3] border-b border-blue-400">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                <button onClick={handleLogoClick} className="flex items-center gap-3 cursor-pointer">
                  <div className="relative w-10 h-10 flex items-center justify-center">
                    <svg 
                      viewBox="0 0 115 130" 
                      className="absolute inset-0 w-full h-full"
                    >
                      <defs>
                        <linearGradient id="azGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" style={{ stopColor: '#ff8c00', stopOpacity: 1 }} />
                          <stop offset="100%" style={{ stopColor: '#ffd700', stopOpacity: 1 }} />
                        </linearGradient>
                      </defs>
                      <path
                        d="M 20 10 L 100 10 L 100 15 L 105 15 L 105 20 L 100 20 L 100 100 L 95 105 L 85 115 L 75 120 L 30 90 L 20 85 
                           C 18 83 16 80 15 77 
                           C 14 74 13 71 14 68 
                           C 15 65 16 62 15 59 
                           C 14 56 13 53 12 50 
                           C 11 47 12 44 13 41 
                           C 14 38 15 35 14 32 
                           C 13 29 14 26 15 23 
                           C 16 20 17 17 18 14 
                           L 20 10 Z"
                        fill="url(#azGradient)"
                      />
                    </svg>
                    <div 
                      className="relative z-10 animate-pulse-glow"
                      style={{
                        filter: 'drop-shadow(0 0 12px rgba(255, 255, 255, 0.8)) drop-shadow(0 0 6px rgba(255, 215, 0, 0.6))'
                      }}
                    >
                      <Video className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="text-center">
                    <h1 
                      className="text-xl font-black tracking-tight leading-none"
                      style={{
                        color: 'white',
                        WebkitTextStroke: '2px #ff8c00',
                        paintOrder: 'stroke fill',
                        textShadow: '2px 2px 4px rgba(0,0,0,0.3)'
                      }}
                    >
                      MY NEIGHBOR
                    </h1>
                    <p 
                      className="text-xs font-bold tracking-wide mt-0.5"
                      style={{
                        color: 'white',
                        textShadow: '1px 1px 2px rgba(0,0,0,0.3)'
                      }}
                    >
                      LOCAL LIVE SHOPPING
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-3">
                  {user && <NotificationBell user={user} unreadCount={unreadNotificationCount} />}
                  {user && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => navigate(createPageUrl("Messages"))}
                      className="relative"
                    >
                      <MessageCircle className="w-5 h-5" />
                      {unreadCount > 0 && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-[10px] font-bold">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        </div>
                      )}
                    </Button>
                  )}
                  {!user && !isLoadingAuth && (
                    <Button
                      onClick={() => navigate("/Login")}
                      className="bg-gradient-to-r from-purple-600 to-blue-500 text-white font-semibold"
                    >
                      Login
                    </Button>
                  )}
                  {user ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleUserClick}
                        className="hidden sm:flex items-center gap-3 hover:bg-gray-100 rounded-lg px-3 py-2 transition-colors cursor-pointer"
                      >
                        <Avatar className="w-9 h-9">
                          <AvatarImage src={seller?.profile_image_url} />
                          <AvatarFallback className="bg-gradient-to-r from-purple-600 to-blue-500 text-white">
                            {isImpersonating && seller ? seller.business_name[0] : (user.full_name?.[0] || user.email[0].toUpperCase())}
                          </AvatarFallback>
                        </Avatar>
                        <div className="hidden lg:block text-left">
                          <p className="text-sm font-medium text-gray-900">
                            {isImpersonating && seller ? seller.business_name : (user.full_name || user.email)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {isImpersonating ? "Seller" : (isSuperAdmin(user) ? "Super Admin" : userRole === "admin" ? "Admin" : isApprovedSeller ? seller?.business_name || "Seller" : "Buyer")}
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={handleLogout}
                        className="hidden sm:flex items-center gap-2 hover:bg-red-50 text-gray-600 hover:text-red-600 rounded-lg px-3 py-2 transition-colors cursor-pointer"
                        title="Logout"
                      >
                        <LogOut className="w-5 h-5" />
                        <span className="hidden lg:inline text-sm font-medium">Logout</span>
                      </button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => navigate("/Login")}
                      className="bg-gradient-to-r from-purple-600 to-blue-500 text-white font-semibold"
                    >
                      Login
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </header>
        )}

        {/* Pending Seller Banner - Only show on pages with header */}
        {shouldShowHeader && !isLiveShowPage && !isNearMePage && isPendingSeller && (
          <div className="bg-yellow-50 border-b border-yellow-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
              <Alert className="border-yellow-300 bg-yellow-100">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-900">
                  <strong>Your Seller Application is Under Review</strong> — You can browse and shop while waiting for approval. Once approved, you'll gain access to seller tools.
                </AlertDescription>
              </Alert>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className={isLiveShowPage ? '' : 'pb-4'}>
          {children}
        </main>

        {/* Bottom Navigation Bar - HIDE on LiveShow page */}
        {!isLiveShowPage && (
          <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-lg z-50">
            <div className="max-w-7xl mx-auto px-2">
              <div className="flex justify-around items-center h-16">
                {navigation.map((item, index) => {
                  // Determine if this item is active
                  // For visitor nav, only one should be active at a time
                  const isMarketplacePath = location.pathname.includes('Marketplace') || location.pathname === '/';
                  const isCommunitiesPath = location.pathname.includes('Communities') || location.pathname.includes('Community');
                  
                  let isActive = false;
                  if (item.isLogin) {
                    isActive = false; // Login button never shows as "active"
                  } else if (item.isMarketplace) {
                    // Marketplace tab: active only on Marketplace, NOT when on Communities
                    isActive = isMarketplacePath && !isCommunitiesPath;
                  } else if (item.isLive) {
                    // Live tab: never auto-highlight (both Live and Marketplace point to same URL)
                    isActive = false;
                  } else if (item.url.includes('Communities')) {
                    // Community tab
                    isActive = isCommunitiesPath;
                  } else {
                    // Default: exact path match
                    isActive = location.pathname === item.url;
                  }

                  return item.isLogin ? (
                    // Login button for non-logged-in users - never highlighted
                    <button
                      key="login"
                      onClick={() => navigate("/Login")}
                      className="flex-1 flex flex-col items-center justify-center gap-1 py-2 px-1 transition-all text-gray-600 hover:text-purple-600"
                    >
                      <div className="relative">
                        <item.icon className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-medium">
                        {item.title}
                      </span>
                    </button>
                  ) : (
                    <Link key={item.title + index} to={item.url} className="flex-1">
                      <button
                        className={`w-full flex flex-col items-center justify-center gap-1 py-2 px-1 transition-all relative ${
                          isActive
                            ? "text-purple-600"
                            : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        <div className={`relative ${isActive ? "scale-110" : ""}`}>
                          <item.icon className={`w-6 h-6 ${
                            isActive ? "stroke-[2.5]" : ""
                          }`} />
                          {item.badge > 0 && (
                            <div className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                              <span className="text-white text-[10px] font-bold">
                                {item.badge > 99 ? "99+" : item.badge}
                              </span>
                            </div>
                          )}
                          {isActive && (
                            <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-purple-600 rounded-full"></div>
                          )}
                        </div>
                        <span className={`text-xs font-medium ${
                          isActive ? "text-purple-600" : ""
                        }`}>
                          {item.title}
                        </span>
                      </button>
                    </Link>
                  );
                })}
              </div>
            </div>
          </nav>
        )}
      </div>
    </>
  );
}