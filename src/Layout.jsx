import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useQueryClient } from "@tanstack/react-query";
import { useSupabaseAuth } from "@/lib/auth/SupabaseAuthProvider";
import { getUnreadNotificationCount } from "@/api/notifications";
import { getUnreadMessageCount } from "@/api/messages";
import { getEffectiveUserContext } from "@/lib/auth/effectiveUser";
import { getSellerByUserId, getSellerById } from "@/api/sellers";
import { canAccessRoute, getUnauthorizedRedirect, isSuperAdmin, requireSellerAsync } from "@/lib/auth/routeGuards";

// ═══════════════════════════════════════════════════════════════════════════
// IDENTITY CACHE: Session-scoped cache to reduce Supabase cold-start reads
// Cache TTL: 10 minutes. Stored in sessionStorage for tab persistence.
// ═══════════════════════════════════════════════════════════════════════════
const IDENTITY_CACHE_KEY = "lm_identity_cache";
const IDENTITY_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ═══════════════════════════════════════════════════════════════════════════
// FORENSIC LOGGING HELPER (gated behind localStorage flag)
// Enable with: localStorage.setItem("LM_FORENSIC", "1")
// ═══════════════════════════════════════════════════════════════════════════
const LM_FORENSIC = () =>
  typeof window !== "undefined" && window.localStorage?.getItem("LM_FORENSIC") === "1";

// Log forensic mode status on first load (only once per page load)
if (typeof window !== "undefined") {
  try {
    if (LM_FORENSIC()) console.warn("[LM_FORENSIC] ENABLED (localStorage LM_FORENSIC=1)");
  } catch {}
}

/**
 * Identity cache structure for session-scoped caching
 */
function readIdentityCache() {
  try {
    const raw = sessionStorage.getItem(IDENTITY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Validate structure
    if (typeof parsed?.userId !== "string" || typeof parsed?.timestamp !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeIdentityCache(data) {
  try {
    sessionStorage.setItem(IDENTITY_CACHE_KEY, JSON.stringify({
      ...data,
      timestamp: Date.now()
    }));
  } catch {
    // sessionStorage may be unavailable in some contexts
  }
}

function clearIdentityCache() {
  try {
    sessionStorage.removeItem(IDENTITY_CACHE_KEY);
  } catch {
    // Ignore errors
  }
}

function isIdentityCacheValid(cache, userId) {
  if (!cache) return false;
  // Must match current user
  if (cache.userId !== userId) return false;
  // Must be younger than TTL
  const age = Date.now() - cache.timestamp;
  return age < IDENTITY_CACHE_TTL_MS;
}
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
  MessageCircle,
  Mail
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
  const queryClient = useQueryClient();
  
  // Use SupabaseAuthProvider as single source of truth for user state
  const { user, isLoadingAuth } = useSupabaseAuth();
  
  const [seller, setSeller] = useState(null);
  // Buyer profile for route guard prerequisites
  const [buyerProfile, setBuyerProfile] = useState(null);
  // Option B: Track approved seller status from DB truth
  const [isVerifiedApprovedSeller, setIsVerifiedApprovedSeller] = useState(false);
  const [dbUserRole, setDbUserRole] = useState(null);
  // AUDIT: Full DB user row for forensic comparison with auth user
  const [dbUserRow, setDbUserRow] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ACCOUNT STATUS: Platform-level suspension state
  // 'active' = full access, 'suspended' = viewer-only mode
  // Canonical source: public.users.account_status
  // ═══════════════════════════════════════════════════════════════════════════
  const [accountStatus, setAccountStatus] = useState("active");

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH HYDRATION GATE: Prevents routing decisions until session is fully ready
  // authHydrated becomes true ONLY when:
  //   1. Auth provider has finished initial session check (isLoadingAuth = false)
  //   2. Identity data (user role, seller status) has been loaded
  // Until authHydrated is true, Layout renders a neutral loading state.
  // ═══════════════════════════════════════════════════════════════════════════
  const [authHydrated, setAuthHydrated] = useState(false);
  const authHydratedLoggedRef = useRef(false); // One-time log tracker

  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY CACHE STATE: Prevent repeated DB reads on route changes
  // identityLoadedRef tracks if we've already loaded identity this session
  // ═══════════════════════════════════════════════════════════════════════════
  const identityLoadedRef = useRef(false);
  const identityLoadingRef = useRef(false); // Prevent concurrent loads
  const cacheLoggedRef = useRef(false); // One-time log tracker

  // ═══════════════════════════════════════════════════════════════════════════
  // CIRCUIT BREAKER: Stop hammering Supabase when degraded (503/timeout)
  // Non-critical queries pause when degraded. Critical flows still work.
  // Manual refresh resets the flag.
  // ═══════════════════════════════════════════════════════════════════════════
  const [supabaseDegraded, setSupabaseDegraded] = useState(false);
  const degradedLoggedRef = useRef(false);

  // Helper to detect degraded state from error
  const checkAndSetDegraded = (error) => {
    if (!error) return false;
    const msg = error?.message?.toLowerCase() || "";
    const code = error?.code || "";
    const status = error?.status || error?.statusCode;
    
    const isDegraded = 
      status === 503 ||
      code === "503" ||
      msg.includes("503") ||
      msg.includes("upstream connect error") ||
      msg.includes("connection timeout") ||
      msg.includes("fetch failed") ||
      msg.includes("networkerror") ||
      msg.includes("failed to fetch");

    if (isDegraded && !supabaseDegraded) {
      setSupabaseDegraded(true);
      if (!degradedLoggedRef.current) {
        console.warn("[Supabase] Entering degraded mode — pausing background queries");
        degradedLoggedRef.current = true;
      }
    }
    return isDegraded;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // FORCE REFRESH: Explicit retry action to refresh identity from Supabase
  // Call this when user clicks "Retry" or when we want to re-check after recovery
  // ═══════════════════════════════════════════════════════════════════════════
  const forceRefreshIdentity = useCallback(async () => {
    if (!user) return;
    
    // Clear cache and reset flags
    clearIdentityCache();
    identityLoadedRef.current = false;
    cacheLoggedRef.current = false;
    authHydratedLoggedRef.current = false;
    setSupabaseDegraded(false);
    degradedLoggedRef.current = false;
    // Note: Don't reset authHydrated to false here - we want to keep the app usable during refresh
    
    // Re-fetch from Supabase
    await loadSellerData(user);
    loadUnreadCount(user);
    loadUnreadNotificationCount(user);
  }, [user]);

  // ═══════════════════════════════════════════════════════════════════════════
  // BUYER PROFILE SYNC: Re-fetch buyer_profiles when BuyerProfile page saves
  // This ensures route guards see the updated buyer profile immediately
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const handleBuyerProfileUpdated = async (event) => {
      const userId = event.detail?.userId || user?.id;
      if (!userId) return;
      
      console.log("[Layout] buyerProfileUpdated event received, re-fetching buyer_profiles");
      
      const { data: buyerRow, error: buyerError } = await supabase
        .from("buyer_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      
      if (!buyerError && buyerRow) {
        console.log("[Layout] buyerProfile re-fetched:", { full_name: buyerRow.full_name, phone: buyerRow.phone, email: buyerRow.email });
        setBuyerProfile(buyerRow);
      } else {
        console.warn("[Layout] buyerProfile re-fetch failed:", buyerError);
      }
    };
    
    window.addEventListener("buyerProfileUpdated", handleBuyerProfileUpdated);
    return () => window.removeEventListener("buyerProfileUpdated", handleBuyerProfileUpdated);
  }, [user?.id]);

  // ═══════════════════════════════════════════════════════════════════════════
  // SELLER STATUS SYNC: Refresh identity when seller approval is detected
  // This ensures nav updates immediately after BuyerProfile detects approval
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const handleSellerStatusUpdated = async (event) => {
      const eventUserId = event.detail?.userId;
      // Ignore if no authenticated user
      if (!user?.id) return;
      // Only act if event is for current user (or userId not specified)
      if (eventUserId && eventUserId !== user.id) return;
      
      console.log("[Layout] sellerStatusUpdated received, refreshing identity");
      
      // Use existing forceRefreshIdentity to clear cache and reload from DB
      await forceRefreshIdentity();
    };
    
    window.addEventListener("sellerStatusUpdated", handleSellerStatusUpdated);
    return () => window.removeEventListener("sellerStatusUpdated", handleSellerStatusUpdated);
  }, [user?.id, forceRefreshIdentity]);

  // Pages where header should be shown (lowercase to match normalized route keys)
  const pagesWithHeader = ['marketplace', 'sellerdashboard', 'buyerprofile', 'admindashboard', 'about'];
  const shouldShowHeader = pagesWithHeader.includes(currentPageName);

  // Check if admin is impersonating
  const impersonatingSellerId = sessionStorage.getItem('admin_impersonate_seller_id');
  const isImpersonating = !!impersonatingSellerId;

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH HYDRATION GATE: Subscribe to auth state changes during initial hydration
  // This prevents false logout cascades when getSession returns null during hydration
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    // Subscribe to auth state changes for hydration signals
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // On SIGNED_IN or TOKEN_REFRESHED, auth is definitely hydrated
      // Auth is valid - identity loading will handle authHydrated
      
      // On SIGNED_OUT, auth is also hydrated (just no session)
      if (event === "SIGNED_OUT") {
        authHydratedLoggedRef.current = true;
        setAuthHydrated(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY LOADING: Load ONCE per session, use cache when available
  // Prevents repeated /users and /sellers reads on every route change
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (isLoadingAuth) return; // Wait for auth check to complete
    
    if (user) {
      // Check if identity already loaded this session (prevents re-fetch on route change)
      if (identityLoadedRef.current && !impersonatingSellerId) {
        // ═══════════════════════════════════════════════════════════════════════════
        // FIX: State may have been reset on component remount, restore from cache
        // This prevents the "seller → buyer nav" bug during navigation
        // ═══════════════════════════════════════════════════════════════════════════
        if (dbUserRole === null) {
          const cache = readIdentityCache();
          if (cache && cache.userId === user.id) {
            // Restore canonical role and seller state from cache
            setDbUserRole(cache.dbRole);
            setIsVerifiedApprovedSeller(cache.isApprovedSeller);
            if (cache.sellerRow) {
              setSeller(cache.sellerRow);
            }
            setBuyerProfile(cache.buyerProfile || null);
            // Restore account status from cache, but update ref too
            const cachedStatus = cache.accountStatus || "active";
            authoritativeAccountStatusRef.current = cachedStatus;
            setAccountStatus(cachedStatus);
            console.log('[Layout] Restored account_status from cache:', cachedStatus);
          }
        }
        
        // Auth is already hydrated from previous load
        if (!authHydrated) {
          setAuthHydrated(true);
        }
        loadUnreadCount(user);
        loadUnreadNotificationCount(user);
        return;
      }

      loadIdentityWithCache(user);
      loadUnreadCount(user);
      loadUnreadNotificationCount(user);
    } else {
      // Logged out - clear everything including cache
      setSeller(null);
      setBuyerProfile(null);
      setIsVerifiedApprovedSeller(false);
      setDbUserRole(null);
      setDbUserRow(null);
      setAccountStatus("active");
      setUnreadCount(0);
      setUnreadNotificationCount(0);
      identityLoadedRef.current = false;
      clearIdentityCache();
      // Auth is hydrated even when logged out
      markAuthHydrated("no user");
    }
  }, [user, isLoadingAuth]);

  // Listen for impersonation changes (non-critical, skip when degraded)
  // Impersonation is an explicit admin action - always re-fetch when it changes
  useEffect(() => {
    if (!user || supabaseDegraded) return;
    
    const handleStorageChange = () => {
      if (supabaseDegraded) return;
      // Impersonation change is explicit - always re-fetch (bypass cache)
      loadSellerData(user);
    };

    // Poll for sessionStorage changes (since storage event doesn't fire for same-tab changes)
    const interval = setInterval(() => {
      if (supabaseDegraded) return;
      const currentImpersonation = sessionStorage.getItem('admin_impersonate_seller_id');
      if (currentImpersonation !== impersonatingSellerId) {
        handleStorageChange();
      }
    }, 500);

    return () => clearInterval(interval);
  }, [impersonatingSellerId, user, supabaseDegraded]);

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCOUNT STATUS ENFORCEMENT: Realtime + Polling fallback
  // When account is suspended, immediately force viewer-only mode
  // This ensures suspended users are kicked out of seller routes in real-time
  // ═══════════════════════════════════════════════════════════════════════════
  
  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHORITATIVE ACCOUNT STATUS REF: Prevents stale closures from overwriting
  // This ref is the source of truth for account_status enforcement
  // ═══════════════════════════════════════════════════════════════════════════
  const authoritativeAccountStatusRef = useRef(accountStatus);
  
  // Keep ref in sync with state
  useEffect(() => {
    authoritativeAccountStatusRef.current = accountStatus;
    console.log('[Layout] authoritative account_status:', accountStatus);
  }, [accountStatus]);
  
  // Helper function to handle suspension enforcement
  const handleAccountStatusChange = useCallback((newStatus) => {
    if (!newStatus) return;
    
    // Use ref to avoid stale closure issues
    const currentStatus = authoritativeAccountStatusRef.current;
    if (newStatus === currentStatus) return;
    
    console.log(`[Layout] Account status changed: ${currentStatus} → ${newStatus}`);
    
    // Update BOTH ref and state immediately
    authoritativeAccountStatusRef.current = newStatus;
    setAccountStatus(newStatus);
    
    // Update cache with new status to prevent stale cache restoration
    const existingCache = readIdentityCache();
    if (existingCache && existingCache.userId === user?.id) {
      writeIdentityCache({
        ...existingCache,
        accountStatus: newStatus
      });
    }
    
    // If suspended, redirect away from seller routes immediately
    if (newStatus === 'suspended') {
      console.log('[Layout] Account suspended - forcing viewer-only mode');
      const currentPath = location.pathname.toLowerCase();
      const sellerRoutes = ['sellerdashboard', 'sellerorders', 'sellerproducts', 'hostconsole', 'manageproducts'];
      const isOnSellerRoute = sellerRoutes.some(route => currentPath.includes(route));
      
      if (isOnSellerRoute) {
        navigate(createPageUrl("BuyerProfile"), { replace: true });
      }
    }
  }, [location.pathname, navigate, user?.id]);
  
  // OPTION 1: Supabase Realtime subscription
  useEffect(() => {
    if (!user?.id) return;

    // Create realtime channel for account status changes
    const channel = supabase
      .channel(`account_status_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${user.id}`
        },
        (payload) => {
          const newStatus = payload.new?.account_status;
          console.log(`[Layout] Realtime received: account_status = ${newStatus}`);
          handleAccountStatusChange(newStatus);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Layout] Realtime subscription active for account_status');
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('[Layout] Realtime subscription error - falling back to polling');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, handleAccountStatusChange]);

  // Realtime subscription for viewer_bans (chat mute enforcement)
  useEffect(() => {
    if (!user?.id) return;

    const viewerBansChannel = supabase
      .channel('viewer_bans_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'viewer_bans',
          filter: `viewer_id=eq.${user.id}`
        },
        async (payload) => {
          console.log('[Layout] Realtime: viewer_bans INSERT', payload);
          console.log("[VB REALTIME]", {
            eventType: payload?.eventType,
            table: payload?.table,
            schema: payload?.schema,
            new: payload?.new,
            old: payload?.old,
          });
          
          // Dump active viewer-ban-check queries BEFORE invalidation
          const matchesBefore = queryClient
            .getQueryCache()
            .findAll({ predicate: q => q.queryKey?.[0] === "viewer-ban-check" })
            .map(q => ({
              key: q.queryKey,
              stateStatus: q.state.status,
              fetchStatus: q.state.fetchStatus,
              observers: q.getObserversCount?.() ?? "n/a",
            }));
          console.log("[VB CACHE][BEFORE INVALIDATE]", matchesBefore);
          
          queryClient.invalidateQueries({
            predicate: q => q.queryKey?.[0] === 'viewer-ban-check'
          });
          
          console.log("[VB CACHE][AFTER INVALIDATE]", {
            invalidated: true,
            userId: user?.id ?? null,
            path: window.location.pathname,
          });
          
          // Force refetch to prove if this fixes immediate update
          console.log("[VB REALTIME][AFTER INVALIDATE] forcing refetchQueries for viewer-ban-check");
          await queryClient.refetchQueries({ predicate: q => q.queryKey?.[0] === 'viewer-ban-check' });
          console.log("[VB REALTIME][AFTER REFETCH] done");
          
          queryClient.invalidateQueries({ queryKey: ['viewer-bans'] });
          queryClient.invalidateQueries({
            predicate: q => q.queryKey?.[0] === 'seller-banned-viewers-count'
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'viewer_bans',
          filter: `viewer_id=eq.${user.id}`
        },
        async (payload) => {
          console.log('[Layout] Realtime: viewer_bans DELETE', payload);
          console.log("[VB REALTIME]", {
            eventType: payload?.eventType,
            table: payload?.table,
            schema: payload?.schema,
            new: payload?.new,
            old: payload?.old,
          });
          
          // Dump active viewer-ban-check queries BEFORE invalidation
          const matchesBefore = queryClient
            .getQueryCache()
            .findAll({ predicate: q => q.queryKey?.[0] === "viewer-ban-check" })
            .map(q => ({
              key: q.queryKey,
              stateStatus: q.state.status,
              fetchStatus: q.state.fetchStatus,
              observers: q.getObserversCount?.() ?? "n/a",
            }));
          console.log("[VB CACHE][BEFORE INVALIDATE]", matchesBefore);
          
          queryClient.invalidateQueries({
            predicate: q => q.queryKey?.[0] === 'viewer-ban-check'
          });
          
          console.log("[VB CACHE][AFTER INVALIDATE]", {
            invalidated: true,
            userId: user?.id ?? null,
            path: window.location.pathname,
          });
          
          // Force refetch to prove if this fixes immediate update
          console.log("[VB REALTIME][AFTER INVALIDATE] forcing refetchQueries for viewer-ban-check");
          await queryClient.refetchQueries({ predicate: q => q.queryKey?.[0] === 'viewer-ban-check' });
          console.log("[VB REALTIME][AFTER REFETCH] done");
          
          queryClient.invalidateQueries({ queryKey: ['viewer-bans'] });
          queryClient.invalidateQueries({
            predicate: q => q.queryKey?.[0] === 'seller-banned-viewers-count'
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Layout] Realtime subscription active for viewer_bans');
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('[Layout] Realtime subscription error for viewer_bans');
        }
      });

    return () => {
      supabase.removeChannel(viewerBansChannel);
    };
  }, [user?.id, queryClient, location.pathname]);
  
  // OPTION 2: Polling fallback (every 5 seconds) - ensures enforcement even if realtime fails
  useEffect(() => {
    if (!user?.id || supabaseDegraded) return;
    
    const pollAccountStatus = async () => {
      try {
        const { data, error } = await supabase
          .from("users")
          .select("account_status")
          .eq("id", user.id)
          .maybeSingle();
        
        if (!error && data?.account_status) {
          if (data.account_status !== accountStatus) {
            console.log(`[Layout] Poll detected status change: ${accountStatus} → ${data.account_status}`);
            handleAccountStatusChange(data.account_status);
          }
        }
      } catch (err) {
        // Silently ignore polling errors
      }
    };
    
    // Poll every 5 seconds
    const interval = setInterval(pollAccountStatus, 5000);
    
    return () => clearInterval(interval);
  }, [user?.id, accountStatus, supabaseDegraded, handleAccountStatusChange]);

  useEffect(() => {
    // CRITICAL: Don't redirect on LiveShow page - wait for params to resolve
    const isLiveShowRoute = location.pathname.toLowerCase().includes('liveshow') || location.search.toLowerCase().includes('showid');
    
    if (!isLiveShowRoute && (location.pathname === '/' || location.pathname === '' || location.pathname === '/index.html')) {
      navigate(createPageUrl("Marketplace"), { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  // Route protection - check access after auth is fully hydrated
  useEffect(() => {
    // ═══════════════════════════════════════════════════════════════════════════
    // AUTH HYDRATION GATE: Block routing decisions until session is fully ready
    // This prevents false redirects during login when identity hasn't loaded yet
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Wait for auth provider to finish initial check
    if (isLoadingAuth) return;
    
    // CRITICAL: Wait for auth to be fully hydrated (session + identity loaded)
    // This prevents the "seller → buyerprofile bounce" during login
    if (!authHydrated) {
      // Auth not hydrated yet - render neutral loading state (handled below)
      return;
    }

    // Allow HostConsole to handle its own access checks
    if (currentPageName === "hostconsole") return;

    // ═══════════════════════════════════════════════════════════════════════════
    // HARD AUDIT: Log when buyerProfile is null/undefined while user is authenticated
    // This is the key failure mode causing sellerdashboard redirect
    // ═══════════════════════════════════════════════════════════════════════════
    if (user?.id && !buyerProfile) {
      console.groupCollapsed("[BUYERPROFILE NULL WHILE AUTHED]");
      console.log("DIAGNOSTIC:", {
        currentPageName,
        pathname: location.pathname,
        authHydrated,
        authUserId: user?.id,
        email: user?.email,
        reason: buyerProfile === null ? "EXPLICITLY_NULL" : buyerProfile === undefined ? "UNDEFINED" : "FALSY",
        buyerProfileState: buyerProfile,
        sellerState: seller,
        dbUserRowExists: !!dbUserRow
      });
      console.groupEnd();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // AUDIT: AUTH VS DB USER SNAPSHOT — Compare what gates SEE vs DB TRUTH
    // ═══════════════════════════════════════════════════════════════════════════
    console.groupCollapsed("[AUTH VS DB USER SNAPSHOT]");
    console.log("authUser (from useSupabaseAuth):", {
      id: user?.id,
      email: user?.email,
      role: user?.role,
      buyer_safety_agreed: user?.buyer_safety_agreed,
      seller_safety_agreed: user?.seller_safety_agreed,
      seller_onboarding_completed: user?.seller_onboarding_completed,
      user_metadata: user?.user_metadata
    });
    console.log("dbUserRow (from public.users query):", dbUserRow);
    console.log("DB SELLER FLAGS PRESENT?", {
      seller_safety_agreed: dbUserRow?.seller_safety_agreed,
      seller_onboarding_completed: dbUserRow?.seller_onboarding_completed,
      seller_safety_agreed_at: dbUserRow?.seller_safety_agreed_at
    });
    console.log("buyerProfile (raw):", buyerProfile);
    console.log("seller (raw):", seller);
    console.groupEnd();

    // Check if current route is accessible
    const hasAccess = canAccessRoute(currentPageName, user, seller, buyerProfile);

    // ═══════════════════════════════════════════════════════════════════════════
    // GATING SNAPSHOT: Full diagnostic for routing decisions
    // ═══════════════════════════════════════════════════════════════════════════
    const buyerComplete = !!(buyerProfile?.full_name && buyerProfile?.phone && buyerProfile?.email);
    const buyerSafetyDirect = user?.buyer_safety_agreed === true;
    const buyerSafetyMeta = user?.user_metadata?.buyer_safety_agreed === true;
    const buyerSafety = buyerSafetyDirect || buyerSafetyMeta;
    const redirectTo = !hasAccess ? getUnauthorizedRedirect(currentPageName, user, buyerProfile) : null;
    
    console.groupCollapsed("[GATING SNAPSHOT]");
    console.log("Route:", { pathname: location.pathname, currentPageName });
    console.log("Auth:", { userId: user?.id, email: user?.email, authHydrated });
    console.log("BuyerProfile (raw):", buyerProfile);
    console.log("BuyerProfile check:", { 
      buyerComplete, 
      missingFields: !buyerProfile ? "NO_PROFILE" : [
        !buyerProfile.full_name && "full_name",
        !buyerProfile.phone && "phone", 
        !buyerProfile.email && "email"
      ].filter(Boolean)
    });
    console.log("BuyerSafety:", { buyerSafety, source: buyerSafetyDirect ? "users.buyer_safety_agreed" : buyerSafetyMeta ? "user_metadata" : "NONE" });
    console.log("Seller:", { 
      sellerId: seller?.id, 
      status: seller?.status,
      userRole: user?.role,
      userMetaRole: user?.user_metadata?.role 
    });
    console.log("Guard result:", { hasAccess, redirectTo });
    console.groupEnd();

    if (!hasAccess) {
      // MARKETPLACE REDIRECT FORENSIC LOG: Capture exact state when redirecting to Marketplace
      if (redirectTo && redirectTo.toLowerCase() === "marketplace") {
        console.warn("[MARKETPLACE REDIRECT FORENSIC]", {
          pathname: window.location.pathname,
          currentPageName,
          redirectTo,
          buyerProfileExists: !!buyerProfile,
          buyerProfileComplete: buyerComplete,
          buyerSafetyAgreed: buyerSafety,
          buyerSafetySource: buyerSafetyDirect ? "users.buyer_safety_agreed" : buyerSafetyMeta ? "user_metadata" : "NONE",
          sellerExists: !!seller,
          sellerStatus: seller?.status,
          userRole: user?.role,
          userMetaRole: user?.user_metadata?.role,
          hasAccess,
          authHydrated
        });
      }
      console.warn("[GATE REDIRECT]", { from: currentPageName, to: redirectTo, reason: "canAccessRoute returned false" });
      
      // FORENSIC SNAPSHOT (gated)
      if (LM_FORENSIC()) {
        try {
          const authUser = user || null;
          console.groupCollapsed("[GATE FORENSIC SNAPSHOT][LAYOUT]");
          console.log({
            ts: new Date().toISOString(),
            pathname: window.location.pathname,
            search: window.location.search,
            currentPageName,
            redirectTo,
            hasAccess,
            authHydrated,
            // AUTH (JWT / session)
            auth_user_id: authUser?.id,
            auth_email: authUser?.email,
            auth_role: authUser?.role,
            auth_user_metadata: authUser?.user_metadata || null,
            // DB USER (public.users)
            db_user_obj: dbUserRow || null,
            // BUYER PROFILE (buyer_profiles)
            buyerProfile_obj: buyerProfile || null,
            buyerProfile_exists: !!buyerProfile,
            buyerProfile_user_id: buyerProfile?.user_id,
            buyerProfile_email: buyerProfile?.email,
            buyerProfile_phone: buyerProfile?.phone,
            buyerProfile_full_name: buyerProfile?.full_name,
            // SELLER (sellers)
            seller_obj: seller || null,
            seller_exists: !!seller,
            seller_user_id: seller?.user_id,
            seller_status: seller?.status,
          });
          console.groupEnd();
        } catch (e) {
          console.warn("[GATE FORENSIC SNAPSHOT][LAYOUT] logging failed", e);
        }
      }
      
      // Handle redirects that may include query strings (e.g., "BuyerProfile?forceEdit=1")
      const [route, query] = redirectTo.split("?");
      const redirectUrl = createPageUrl(route) + (query ? "?" + query : "");
      navigate(redirectUrl, { replace: true });
    }
  }, [isLoadingAuth, authHydrated, currentPageName, user, seller, buyerProfile, navigate, location.pathname]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER: Mark auth as hydrated (once per session)
  // ═══════════════════════════════════════════════════════════════════════════
  const markAuthHydrated = (source) => {
    authHydratedLoggedRef.current = true;
    setAuthHydrated(true);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY LOADING WITH CACHE: Load identity ONCE, cache for session
  // Sequenced reads: users FIRST, then sellers (if users succeeds)
  // ═══════════════════════════════════════════════════════════════════════════
  const loadIdentityWithCache = async (currentUser) => {
    // Prevent concurrent loads
    if (identityLoadingRef.current) {
      return;
    }
    identityLoadingRef.current = true;

    try {
      // ═══════════════════════════════════════════════════════════════════════════
      // STEP 1: Check cache FIRST (before any Supabase reads)
      // ═══════════════════════════════════════════════════════════════════════════
      const cache = readIdentityCache();
      
      if (isIdentityCacheValid(cache, currentUser.id)) {
        // Cache hit - use cached identity immediately
        cacheLoggedRef.current = true;
        
        // Apply cached state
        setDbUserRole(cache.dbRole);
        setIsVerifiedApprovedSeller(cache.isApprovedSeller);
        if (cache.sellerRow) {
          setSeller(cache.sellerRow);
        } else {
          setSeller(null);
        }
        setBuyerProfile(cache.buyerProfile || null);
        
        identityLoadedRef.current = true;
        markAuthHydrated("from cache");
        return;
      }

      // Cache miss or stale - need to fetch from Supabase
      cacheLoggedRef.current = true;

      // ═══════════════════════════════════════════════════════════════════════════
      // STEP 2: Load identity from Supabase (sequenced reads)
      // ═══════════════════════════════════════════════════════════════════════════
      await loadSellerData(currentUser);
      
    } finally {
      identityLoadingRef.current = false;
    }
  };

  const loadSellerData = async (currentUser) => {
    try {
      // If impersonating, load the impersonated seller by ID (admin bypass)
      if (impersonatingSellerId) {
        const targetSeller = await getSellerById(impersonatingSellerId);
        if (targetSeller) {
          setSeller(targetSeller);
          // Impersonation bypasses Option B check - admin is viewing as seller
          setIsVerifiedApprovedSeller(true);
          setDbUserRole("seller"); // Treat as seller for impersonation
          // Do NOT cache impersonation state
        } else {
          console.error("Impersonation target seller not found:", impersonatingSellerId);
          sessionStorage.removeItem('admin_impersonate_seller_id');
          setSeller(null);
          setIsVerifiedApprovedSeller(false);
          setDbUserRole(null);
        }
        identityLoadedRef.current = true;
        markAuthHydrated("impersonation");
        return;
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // SEQUENCED READS: Query public.users FIRST, then sellers
      // If users fetch fails (503/timeout), do NOT attempt sellers fetch
      // This prevents cascading failures
      // ═══════════════════════════════════════════════════════════════════════════
      
      // STEP 1: Fetch public.users role, account_status, and seller onboarding flags
      // NOTE: seller flags included for AUDIT VISIBILITY (gate logic uses auth user, not this)
      const { data: userRow, error: userError } = await supabase
        .from("users")
        .select("id, role, email, account_status, buyer_safety_agreed, seller_safety_agreed, seller_onboarding_completed, seller_safety_agreed_at")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (userError) {
        console.error("[Layout] users query failed:", userError);
        // Check if degraded
        if (checkAndSetDegraded(userError)) {
          console.warn("[Layout] Users fetch degraded — using cache fallback if available");
          // Try to use cache as fallback
          const fallbackCache = readIdentityCache();
          if (fallbackCache && fallbackCache.userId === currentUser.id) {
            cacheLoggedRef.current = true;
            setDbUserRole(fallbackCache.dbRole);
            setIsVerifiedApprovedSeller(fallbackCache.isApprovedSeller);
            if (fallbackCache.sellerRow) {
              setSeller(fallbackCache.sellerRow);
            }
            setBuyerProfile(fallbackCache.buyerProfile || null);
            identityLoadedRef.current = true;
            markAuthHydrated("degraded cache fallback");
            return;
          }
          // No cache - fail closed (buyer view)
          setDbUserRole(null);
          setSeller(null);
          setIsVerifiedApprovedSeller(false);
          identityLoadedRef.current = true;
          markAuthHydrated("degraded no cache");
          return;
        }
        throw userError;
      }

      const dbRole = userRow?.role || null;
      setDbUserRole(dbRole);
      // AUDIT: Store full DB user row for forensic comparison
      setDbUserRow(userRow);
      
      // Set account status (default to 'active' if not present)
      // IMPORTANT: Always use DB value as authoritative source
      const status = userRow?.account_status || "active";
      console.log('[Layout] loadSellerData: DB account_status =', status);
      
      // Update both state and ref
      authoritativeAccountStatusRef.current = status;
      setAccountStatus(status);

      // STEP 2: Fetch buyer_profiles (required for seller route guards)
      const { data: buyerRow, error: buyerError } = await supabase
        .from("buyer_profiles")
        .select("*")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      // ═══════════════════════════════════════════════════════════════════════════
      // HARD AUDIT: Log EVERY buyer_profiles fetch result
      // ═══════════════════════════════════════════════════════════════════════════
      console.groupCollapsed("[BUYERPROFILE FETCH RESULT]");
      console.log("QUERY:", { 
        table: "buyer_profiles", 
        filter: `user_id = ${currentUser.id}`,
        method: ".maybeSingle()"
      });
      console.log("RESPONSE:", { 
        data: buyerRow, 
        error: buyerError,
        dataIsNull: buyerRow === null,
        dataIsUndefined: buyerRow === undefined,
        errorCode: buyerError?.code,
        errorMessage: buyerError?.message
      });
      if (buyerError) {
        if (buyerError.code === "PGRST116") {
          console.warn("[BUYERPROFILE FETCH] NO ROW FOUND (PGRST116) — user has no buyer_profiles entry");
        } else if (buyerError.code === "42501" || buyerError.message?.includes("permission")) {
          console.error("[BUYERPROFILE FETCH] RLS/DENY — user blocked by RLS policy:", buyerError);
        } else {
          console.error("[BUYERPROFILE FETCH] UNKNOWN ERROR:", buyerError);
        }
      } else if (!buyerRow) {
        console.warn("[BUYERPROFILE FETCH] NO ROW FOUND (null data, no error) — .maybeSingle() returned nothing");
      } else {
        console.log("[BUYERPROFILE FETCH] SUCCESS — row found:", { 
          full_name: buyerRow.full_name, 
          phone: buyerRow.phone, 
          email: buyerRow.email 
        });
      }
      console.groupEnd();

      if (!buyerError && buyerRow) {
        setBuyerProfile(buyerRow);
      } else {
        setBuyerProfile(null);
      }

      // STEP 3: If users succeeded, fetch sellers
      const { data: sellerRow, error: sellerError } = await supabase
        .from("sellers")
        .select("*")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (sellerError) {
        // Check if degraded - still have user role
        if (checkAndSetDegraded(sellerError)) {
          const fallbackCache = readIdentityCache();
          if (fallbackCache && fallbackCache.userId === currentUser.id && fallbackCache.sellerRow) {
            setSeller(fallbackCache.sellerRow);
            setIsVerifiedApprovedSeller(
              dbRole === "seller" && fallbackCache.sellerRow?.status === "approved"
            );
          } else {
            // Fail closed - no seller access
            setSeller(null);
            setIsVerifiedApprovedSeller(false);
          }
          identityLoadedRef.current = true;
          markAuthHydrated("seller degraded");
          return;
        }
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // OPTION B: User is seller IFF role='seller' AND status='approved'
      // ═══════════════════════════════════════════════════════════════════════════
      const sellerStatus = sellerRow?.status || null;
      const isApproved = dbRole === "seller" && sellerStatus === "approved";

      if (isApproved) {
        setSeller(sellerRow);
        setIsVerifiedApprovedSeller(true);
      } else {
        // NOT approved - still load seller row for UI (pending banner, etc)
        if (sellerRow) {
          setSeller(sellerRow);
        } else {
          setSeller(null);
        }
        setIsVerifiedApprovedSeller(false);
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // STEP 4: Cache successful identity load
      // ═══════════════════════════════════════════════════════════════════════════
      writeIdentityCache({
        userId: currentUser.id,
        dbRole,
        accountStatus: status,
        sellerStatus,
        sellerId: sellerRow?.id || null,
        sellerRow: sellerRow || null,
        isApprovedSeller: isApproved,
        buyerProfile: buyerRow || null,
      });

      identityLoadedRef.current = true;
      markAuthHydrated("identity loaded");

    } catch (error) {
      console.error("Error loading seller data:", error);
      // Check if degraded - but don't reset state if so (keep last known)
      if (checkAndSetDegraded(error)) {
        console.warn("[Layout] Seller data load failed due to degraded state - keeping last known state");
        identityLoadedRef.current = true;
        markAuthHydrated("error degraded");
        return;
      }
      setSeller(null);
      setIsVerifiedApprovedSeller(false);
      setDbUserRole(null);
      identityLoadedRef.current = true;
      markAuthHydrated("error");
    }
  };

  const loadUnreadCount = async (currentUser) => {
    // CIRCUIT BREAKER: Skip non-critical fetch when degraded
    if (supabaseDegraded) {
      return;
    }

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

      // Determine role: seller if impersonating or has approved seller profile (Option B verified)
      const isSellerRole = isActivelyImpersonating || isVerifiedApprovedSeller;
      const role = isSellerRole ? "seller" : "buyer";

      // Get the seller ID to use
      const sellerIdForQuery = isActivelyImpersonating
        ? effectiveSellerId
        : seller?.id ?? null;

      const result = await getUnreadMessageCount({
        effectiveUserId,
        effectiveSellerId: sellerIdForQuery,
        role,
      });

      // Check if result indicates failure (null = degraded/error)
      if (result === null) {
        // API indicated failure - don't update count, keep last known
        return;
      }
      setUnreadCount(result);
    } catch (err) {
      // Check if this error indicates degraded state
      checkAndSetDegraded(err);
      // Don't set to 0 on error - keep last known value
    }
  };

  const loadUnreadNotificationCount = async (currentUser) => {
    // CIRCUIT BREAKER: Skip non-critical fetch when degraded
    if (supabaseDegraded) {
      return;
    }

    try {
      if (!currentUser) {
        setUnreadNotificationCount(0);
        return;
      }
      const { effectiveUserId } = getEffectiveUserContext(currentUser);
      const result = await getUnreadNotificationCount(effectiveUserId);
      
      // Check if result indicates failure (null = degraded/error)
      if (result === null) {
        // API indicated failure - don't update count, keep last known
        return;
      }
      setUnreadNotificationCount(result);
    } catch (err) {
      // Check if this error indicates degraded state
      checkAndSetDegraded(err);
      // Don't set to 0 on error - keep last known value
    }
  };

  const isLiveShowPage = 
    currentPageName === "LiveShow" || 
    location.pathname.toLowerCase().includes('liveshow') ||
    location.pathname.toLowerCase().includes('live-show') ||
    location.search.toLowerCase().includes('showid');

  const isHostConsolePage =
    currentPageName === "hostconsole" ||
    location.pathname.toLowerCase().includes("hostconsole");

  const isFullScreenPage = isLiveShowPage || isHostConsolePage;

  const isNearMePage = 
    currentPageName === "NearMe" || 
    location.pathname.toLowerCase().includes('nearme') ||
    location.pathname.toLowerCase().includes('near-me');

  // Poll for unread messages every 30 seconds (skip on fullscreen pages or when degraded)
  useEffect(() => {
    if (isFullScreenPage || !user || supabaseDegraded) {
      return;
    }

    const interval = setInterval(() => {
      if (!supabaseDegraded) {
        loadUnreadCount(user);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isFullScreenPage, user, supabaseDegraded]);

  // Poll for unread notifications every 30 seconds (skip on fullscreen pages or when degraded)
  useEffect(() => {
    if (isFullScreenPage || !user || supabaseDegraded) {
      return;
    }

    const interval = setInterval(() => {
      if (!supabaseDegraded) {
        loadUnreadNotificationCount(user);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isFullScreenPage, user, supabaseDegraded]);

  const handleLogout = async () => {
    // Clear identity cache and refs on logout
    clearIdentityCache();
    identityLoadedRef.current = false;
    cacheLoggedRef.current = false;
    
    await supabase.auth.signOut();
    navigate(createPageUrl("Marketplace"), { replace: true });
  };

  const handleUserClick = () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // CANONICAL ROLE: Use dbUserRole (from public.users.role), NOT metadata
    // ═══════════════════════════════════════════════════════════════════════════
    const canonicalRole = dbUserRole || user?.user_metadata?.role || user?.role;

    // 1. SUPER_ADMIN → AdminDashboard
    if (isSuperAdmin(user)) {
      navigate(createPageUrl("AdminDashboard"));
      return;
    }

    // 2. Admin → AdminDashboard (admins manage platform, not sell)
    if (canonicalRole === "admin") {
      navigate(createPageUrl("AdminDashboard"));
      return;
    }

    // 3. Approved Seller → SellerDashboard (Option B verified)
    if (isVerifiedApprovedSeller) {
      navigate(createPageUrl("SellerDashboard"));
      return;
    }

    // 4. Everyone else → BuyerProfile
    navigate(createPageUrl("BuyerProfile"));
  };

  const handleLogoClick = () => {
    navigate(createPageUrl("Marketplace"));
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CANONICAL ROLE FOR NAV: public.users.role is the source of truth
  // Only fallback to metadata when dbUserRole hasn't loaded yet (during hydration)
  // ═══════════════════════════════════════════════════════════════════════════
  const userRole = dbUserRole || user?.user_metadata?.role || user?.role;
  
  // OPTION B: isApprovedSeller is TRUE only when BOTH conditions pass:
  // 1. public.users.role === 'seller'
  // 2. sellers.status === 'approved'
  // This is now verified via requireSellerAsync in loadSellerData
  const isApprovedSeller = isVerifiedApprovedSeller;
  
  // Pending seller: has seller row with status='pending' but NOT approved
  const isPendingSeller = !isSuperAdmin(user) && seller && seller.status === "pending" && !isVerifiedApprovedSeller;

  const sellerNav = [
    { title: "Marketplace", url: createPageUrl("Marketplace"), icon: ShoppingBag, isMarketplace: true },
    { title: "Communities", url: createPageUrl("Communities"), icon: Users },
    { title: "Dashboard", url: createPageUrl("SellerDashboard"), icon: LayoutDashboard },
    { title: "Orders", url: createPageUrl("SellerOrders"), icon: Receipt },
  ];

  const buyerNav = [
    { title: "Marketplace", url: createPageUrl("Marketplace"), icon: ShoppingBag, isMarketplace: true },
    { title: "Communities", url: createPageUrl("Communities"), icon: Users },
    { title: "My Orders", url: createPageUrl("BuyerOrders"), icon: Receipt },
    { title: "Profile", url: createPageUrl("BuyerProfile"), icon: User },
  ];

  // Admin navigation - platform management only (V1)
  const adminNav = [
    { title: "Marketplace", url: createPageUrl("Marketplace"), icon: ShoppingBag, isMarketplace: true },
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

  // ═══════════════════════════════════════════════════════════════════════════
  // SUSPENDED USER NAVIGATION: Viewer-only mode (can browse, cannot transact)
  // Shows minimal navigation - no seller dashboard, no orders, just browsing
  // ═══════════════════════════════════════════════════════════════════════════
  const suspendedNav = [
    { title: "Marketplace", url: createPageUrl("Marketplace"), icon: ShoppingBag, isMarketplace: true },
    { title: "Communities", url: createPageUrl("Communities"), icon: Users },
    { title: "Profile", url: createPageUrl("BuyerProfile"), icon: User },
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCOUNT SUSPENSION CHECK: Suspended users get viewer-only navigation
  // This overrides role-based navigation when account_status === 'suspended'
  // ═══════════════════════════════════════════════════════════════════════════
  const isAccountSuspended = accountStatus === "suspended";
  
  // ═══════════════════════════════════════════════════════════════════════════
  // NAVIGATION SELECTION (CANONICAL SOURCE = public.users.role ONLY)
  // Priority:
  // 1. Not logged in → visitorNav
  // 2. SUSPENDED → suspendedNav (viewer-only mode, overrides role)
  // 3. Admin or Super Admin → adminNav (platform management)
  // 4. Seller (role='seller') → sellerNav (Dashboard tab ALWAYS visible)
  // 5. Everyone else → buyerNav
  // 
  // IMPORTANT: Suspension overrides role for navigation purposes.
  // Route access control remains separate from nav visibility.
  // ═══════════════════════════════════════════════════════════════════════════
  const isAdminUser = userRole === "admin" || isSuperAdmin(user);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CANONICAL SELLER NAV CHECK: Show seller nav if role === 'seller'
  // This is separate from isApprovedSeller (which gates route access)
  // Dashboard tab appears for ALL sellers, including pending/unapproved
  // ═══════════════════════════════════════════════════════════════════════════
  let isSellerRole = userRole === "seller";
  
  // Defensive fallback: Check cache for role if state appears stale
  // This prevents brief flashes of buyer nav during state restoration
  if (!isSellerRole && user && !isAdminUser) {
    const cache = readIdentityCache();
    if (cache?.userId === user.id && cache?.dbRole === "seller") {
      isSellerRole = true;
    }
  }
  
  // Navigation selection with suspension override
  const navigation = user === null
    ? visitorNav
    : isAccountSuspended
      ? suspendedNav  // Suspended users get viewer-only nav regardless of role
      : isAdminUser
        ? adminNav
        : isSellerRole
          ? sellerNav
          : buyerNav;

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH HYDRATION LOADING STATE
  // Show neutral loading state while auth is hydrating for logged-in users
  // This prevents false routing decisions before identity is loaded
  // ═══════════════════════════════════════════════════════════════════════════
  if (!isLoadingAuth && user && !authHydrated) {
    // User exists but auth not fully hydrated - show neutral loading state
    // DO NOT redirect, DO NOT assume buyer/seller, just wait
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-3 text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

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

      <div className={`min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 ${isFullScreenPage ? 'pb-0' : 'pb-20'}`}>
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
                            {isImpersonating ? "Seller" : (isSuperAdmin(user) ? "Super Admin" : userRole === "admin" ? "Admin" : isSellerRole ? seller?.business_name || "Seller" : "Buyer")}
                          </p>
                        </div>
                      </button>
                      <a
                        href="mailto:contact.myneighbor@gmail.com"
                        className="hidden sm:flex items-center gap-2 hover:bg-blue-50 text-gray-600 hover:text-blue-600 rounded-lg px-3 py-2 transition-colors cursor-pointer"
                        title="Contact"
                      >
                        <Mail className="w-5 h-5" />
                        <span className="hidden lg:inline text-sm font-medium">Contact</span>
                      </a>
                    </div>
                  ) : (
                    <Button
                      onClick={() => navigate(createPageUrl("Signup"))}
                      className="bg-gradient-to-r from-purple-600 to-blue-500 text-white font-semibold"
                    >
                      Create Account
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

        {/* Suspension Banner - Shown for suspended accounts */}
        {user && isAccountSuspended && (
          <div className="bg-amber-500 text-white px-4 py-3 text-center shadow-md">
            <div className="flex items-center justify-center gap-2">
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">
                Your account is temporarily suspended. You may view content only.
              </span>
              <a 
                href="mailto:support@livemarketaz.com" 
                className="underline hover:no-underline ml-2 font-semibold"
              >
                Contact Support
              </a>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className={isFullScreenPage ? '' : 'pb-4'}>
          {children}
        </main>

        {/* Bottom Navigation Bar - HIDE on fullscreen pages (LiveShow, HostConsole) */}
        {!isFullScreenPage && (
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
                    <Link
                      key={item.title + index}
                      to={item.url}
                      className="flex-1"
                      onClick={() => {
                        if (item.isMarketplace) {
                          window.dispatchEvent(new Event("resetMarketplace"));
                        }
                      }}
                    >
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