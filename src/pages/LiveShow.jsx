import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { getProductById } from "@/api/products";
import { getShowProductsByShowId } from "@/api/showProducts";
import { adaptShowProductsForBuyer } from "@/lib/adapters/buyerShowProductsAdapter";
import { getShowByIdWithStats } from "@/api/shows";
import { getSellerById } from "@/api/sellers";
import { getBuyerProfileByUserId } from "@/api/buyers";
import { getEffectiveUserContext } from "@/lib/auth/effectiveUser";
import { isAdmin } from "@/lib/auth/routeGuards";
import { useSupabaseAuth } from "@/lib/auth/SupabaseAuthProvider";
import { isShowLive } from "@/api/streamSync";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Radio,
  Users,
  MapPin,
  ShoppingBag,
  Lock,
  ArrowLeft,
  AlertCircle,
  X as XIcon,
  MessageCircle,
  Minimize2,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Fingerprint,
} from "lucide-react";
import CheckoutOverlay from "../components/checkout/CheckoutOverlay";
import WebRTCViewer from "../components/streaming/WebRTCViewer";
import IVSPlayer, { PLAYER_STATE } from "../components/streaming/IVSPlayer";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import GiviTracker from "../components/sharing/GiviTracker";
import ShareButton from "../components/sharing/ShareButton";
import LiveChatOverlay from "../components/chat/LiveChatOverlay";
import LiveChat from "../components/chat/LiveChat";
import SupabaseLiveChat from "../components/chat/SupabaseLiveChat";
import GIVIViewerOverlay from "../components/givi/GIVIViewerOverlay";
import PickupInstructionsBubble from "../components/streaming/PickupInstructionsBubble";
import SellerProfileModal from "../components/liveshow/SellerProfileModal";
import GIVIWinnerBanner from "../components/givi/GIVIWinnerBanner";
import FollowButton from "../components/marketplace/FollowButton";
import { FEATURES } from "@/config/features";

export default function LiveShow() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const showId = urlParams.get('showId') || urlParams.get('showid');
  
  // Use canonical auth from SupabaseAuthProvider (single source of truth)
  const { user, isLoadingAuth } = useSupabaseAuth();
  console.log("[AUTH DEBUG][LiveShow] isLoadingAuth:", isLoadingAuth, "user:", user);

  // Wait for auth to hydrate before rendering to prevent user=null flash
  if (isLoadingAuth) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white/70 text-sm">
        Loading…
      </div>
    );
  }
  
  const [buyerProfile, setBuyerProfile] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [previousPrice, setPreviousPrice] = useState(null);
  const [priceJustChanged, setPriceJustChanged] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showChatOverlay, setShowChatOverlay] = useState(true);
  const [showSellerProfile, setShowSellerProfile] = useState(false);
  const [showWinnerBanner, setShowWinnerBanner] = useState(false);
  const [showPurchaseBanner, setShowPurchaseBanner] = useState(false);
  const [__auditSalesCount, set__auditSalesCount] = useState(null);
  const carouselRef = useRef(null);
  const lastSalesCountRef = useRef(null); // null = not initialized yet
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SDK VIEWER COUNT REF: Stores latest viewer_count from Daily SDK
  // Used as merge guard to prevent polling from overwriting live SDK value
  // ═══════════════════════════════════════════════════════════════════════════
  const sdkViewerCountRef = useRef(null);

  // Product state (replacing React Query)
  const [allShowProducts, setAllShowProducts] = useState([]);
  const [featuredProduct, setFeaturedProduct] = useState(null);

  // Show and Seller state (replacing React Query)
  const [show, setShow] = useState(null);
  const [seller, setSeller] = useState(null);
  const [showLoading, setShowLoading] = useState(true);
  const [sellerLoading, setSellerLoading] = useState(false);
  const [showError, setShowError] = useState(null);

  // Role detection
  const [isShowOwner, setIsShowOwner] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);

  // IVS Player state
  const [ivsPlayerState, setIvsPlayerState] = useState(null);
  const [ivsError, setIvsError] = useState(null);

  // ═══════════════════════════════════════════════════════════════════════════
  // REACTIVE VIEWPORT DETECTION
  // Prevents dual WebRTCViewer AND dual SupabaseLiveChat mount.
  // Updates on: mediaQuery change, resize, orientationchange.
  // ═══════════════════════════════════════════════════════════════════════════
  const [isDesktop, setIsDesktop] = useState(() => 
    typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 640px)");
    
    const handleChange = (e) => {
      setIsDesktop(e.matches);
    };

    // Named handler for orientation change (must match add/remove for proper cleanup)
    const handleOrientationChange = () => {
      // Small delay to let viewport settle after rotation
      setTimeout(() => {
        setIsDesktop(window.matchMedia("(min-width: 640px)").matches);
      }, 100);
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleChange);
    }

    // Also listen for orientation change (mobile rotation)
    window.addEventListener("orientationchange", handleOrientationChange);

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
      window.removeEventListener("orientationchange", handleOrientationChange);
    };
  }, []);

  // Determine which player to use based on streaming_provider field:
  // - "ivs" with ivs_playback_url → IVSPlayer (OBS/external encoder)
  // - "daily" → WebRTCViewer (tokenized per-show rooms)
  // - fallback → WebRTCViewer (waiting state if not configured)
  const useIvsPlayer = show?.streaming_provider === "ivs" && Boolean(show?.ivs_playback_url);

  // Determine which chat system to use:
  // SupabaseLiveChat renders when show is starting or live (lifecycle-based)
  // Legacy chat is fallback for other states
  const useSupabaseChat =
    show?.stream_status === 'starting' ||
    show?.stream_status === 'live';

  useEffect(() => {
    console.log("🎬 [LiveShow] MOUNT - showId:", showId);
    
    // AUDIT LOG - TEMPORARY: Verify Supabase client origin
    console.log("[SUPABASE_CLIENT_AUDIT]", {
      clientFile: "LiveShow.jsx imports from @/lib/supabase/supabaseClient",
      hasServiceRole: false,
      showId: showId
    });
    
    window.scrollTo(0, 0);
    
    // Minimal overscroll prevention
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
    
    return () => {
      console.log("🧹 [LiveShow] UNMOUNT - showId:", showId);
      document.body.style.overscrollBehavior = '';
      document.documentElement.style.overscrollBehavior = '';
    };
  }, [showId]);

  // Viewport listener for single WebRTCViewer mount
  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 640px)');
    const handleChange = (e) => setIsDesktop(e.matches);
    
    // Set initial value
    setIsDesktop(mediaQuery.matches);
    
    // Listen for changes
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Load buyer profile when canonical user becomes available
  useEffect(() => {
    console.log("[AUTH DEBUG][LiveShow] buyerProfile effect fired. user?.id:", user?.id);
    const loadBuyerProfile = async () => {
      if (!user) {
        setBuyerProfile(null);
        setIsAdminUser(false);
        return;
      }

      setIsAdminUser(isAdmin(user));

      // Get effective user context for impersonation support
      const { effectiveUserId } = getEffectiveUserContext(user);

      // Load buyer profile using Supabase API
      try {
        const profile = await getBuyerProfileByUserId(effectiveUserId);
        setBuyerProfile(profile);
      } catch (error) {
        console.warn("[LiveShow] Failed to load buyer profile:", error);
        setBuyerProfile(null);
      }
    };

    loadBuyerProfile();
  }, [user?.id]);

  useEffect(() => {
    if (expandedProduct) {
      setCurrentImageIndex(0);
    }
  }, [expandedProduct?.id]);

  // IVS Player event handlers
  const handleIvsStateChange = (state) => {
    setIvsPlayerState(state);
    console.log("[LiveShow] IVS player state:", state);
  };

  const handleIvsError = (error) => {
    setIvsError(error);
    console.error("[LiveShow] IVS player error:", error);
  };

  // Load show data using Supabase API
  const loadShow = async () => {
    if (!showId) return;

    try {
      const showData = await getShowByIdWithStats(showId);
      if (!showData) {
        setShowError({ message: "Show not found", status: 404 });
        setShowLoading(false);
        return;
      }

      console.log("[SHOW_FETCH]", {
        showId,
        gotId: showData?.id,
        sales_count: showData?.sales_count,
        updated_at: showData?.updated_at
      });

      // ═══════════════════════════════════════════════════════════════════════
      // MERGE GUARD: Preserve SDK viewer_count when server returns stale 0
      // - If SDK has set a non-null count AND server returns 0, keep SDK value
      // - Otherwise use server value (allows server authority when webhooks work)
      // ═══════════════════════════════════════════════════════════════════════
      setShow((prev) => {
        const serverCount = showData?.viewer_count ?? 0;
        const sdkCount = sdkViewerCountRef.current;
        const shouldPreserveSdk = (sdkCount != null) && (serverCount === 0);
        const mergedViewerCount = shouldPreserveSdk ? sdkCount : serverCount;

        const prevMax = prev?.max_viewers ?? 0;
        const serverMax = showData?.max_viewers ?? 0;
        const mergedMax = Math.max(prevMax, serverMax, mergedViewerCount);

        return {
          ...(prev ?? {}),
          ...showData,
          viewer_count: mergedViewerCount,
          max_viewers: mergedMax,
        };
      });
      set__auditSalesCount(showData?.sales_count ?? null);
      setShowError(null);
      setShowLoading(false);

      // Detect if current user is show owner
      if (user && showData.seller_id) {
        const { impersonatedSellerId } = getEffectiveUserContext(user);
        const effectiveSellerId = impersonatedSellerId || null;

        // User owns this show if they are the seller or impersonating the seller
        if (effectiveSellerId === showData.seller_id) {
          setIsShowOwner(true);
        }
      }
    } catch (err) {
      setShowError(err);
      setShowLoading(false);
    }
  };

  // Load seller data using Supabase API
  const loadSeller = async () => {
    if (!show?.seller_id) return;

    setSellerLoading(true);
    try {
      const sellerData = await getSellerById(show.seller_id);
      setSeller(sellerData);

      // Check if current user owns this show (via seller_id match)
      if (user) {
        const { impersonatedSellerId } = getEffectiveUserContext(user);
        const userSeller = impersonatedSellerId || null;
        
        // Also check if user's own seller profile matches
        if (sellerData && sellerData.user_id === user.id) {
          setIsShowOwner(true);
        } else if (userSeller === show.seller_id) {
          setIsShowOwner(true);
        }
      }
    } catch (err) {
      // Keep previous seller data on error
    } finally {
      setSellerLoading(false);
    }
  };

  // Load show on mount and poll every 5 seconds (for sales_count updates / purchase banner)
  useEffect(() => {
    if (!showId) return;

    loadShow();

    const interval = setInterval(() => {
      loadShow();
    }, 5000);

    return () => clearInterval(interval);
  }, [showId]);

  // Load seller when show changes
  useEffect(() => {
    if (show?.seller_id) {
      loadSeller();
    }
  }, [show?.seller_id]);

  // Check if current user is banned from viewing this seller's shows
  const { data: viewerBan } = useQuery({
    queryKey: ['viewer-ban-check', show?.seller_id, user?.id],
    queryFn: async () => {
      if (!show?.seller_id || !user?.id) return null;
      const { data } = await supabase
        .from('viewer_bans')
        .select('id, ban_type, reason')
        .eq('seller_id', show.seller_id)
        .eq('viewer_id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!show?.seller_id && !!user?.id
  });

  // Load products using show_products table (via adapter for compatibility)
  const loadProducts = async () => {
    if (!showId) return;

    try {
      // Fetch from show_products JOIN products (ordered by box_number)
      const showProductsRaw = await getShowProductsByShowId(showId);
      
      // Adapt to flattened shape matching existing UI expectations
      const allProducts = adaptShowProductsForBuyer(showProductsRaw);

      // Filter to available products:
      // - Not a GIVI product (now read from show_products.is_givi)
      // - Has quantity > 0
      // - Not sold out or hidden
      const availableProducts = allProducts.filter(product => {
        const isGIVI = product.is_givi === true;
        const hasQuantity = (product.quantity || 0) > 0;
        const isAvailable = product.status === "active";
        return !isGIVI && hasQuantity && isAvailable;
      });

      setAllShowProducts(availableProducts);
    } catch (error) {
      // Keep previous data on error
    }
  };

  // Load featured product
  const loadFeaturedProduct = async () => {
    if (!show?.featured_product_id) {
      setFeaturedProduct(null);
      return;
    }

    try {
      const product = await getProductById(show.featured_product_id);
      setFeaturedProduct(product);
    } catch (error) {
      // Keep previous data on error
    }
  };

  // Poll for products every 20 seconds
  useEffect(() => {
    if (!showId) return;

    loadProducts();

    const interval = setInterval(() => {
      loadProducts();
    }, 20000);

    return () => clearInterval(interval);
  }, [showId]);

  // Listen for instant inventory refresh signal (from checkout success)
  useEffect(() => {
    const handler = () => loadProducts();
    window.addEventListener("lm:inventory_updated", handler);
    return () => window.removeEventListener("lm:inventory_updated", handler);
  }, [showId]);

  // Detect sales_count changes and show global purchase banner
  useEffect(() => {
    if (!show || typeof show.sales_count !== "number") return;

    // Initialize on first load
    if (lastSalesCountRef.current === null) {
      lastSalesCountRef.current = show.sales_count;
      console.log("[BANNER] init sales_count:", show.sales_count);
      return;
    }

    // Detect increment
    if (show.sales_count > lastSalesCountRef.current) {
      console.log("[BANNER] sales_count changed:", { from: lastSalesCountRef.current, to: show.sales_count });
      setShowPurchaseBanner(true);
      setTimeout(() => setShowPurchaseBanner(false), 2000);
    }

    lastSalesCountRef.current = show.sales_count;
  }, [show?.sales_count]);

  // Poll for featured product every 8 seconds
  useEffect(() => {
    if (!show?.featured_product_id) {
      setFeaturedProduct(null);
      return;
    }

    loadFeaturedProduct();

    const interval = setInterval(() => {
      loadFeaturedProduct();
    }, 8000);

    return () => clearInterval(interval);
  }, [show?.featured_product_id]);

  // Watch for GIVI winner selection - REDUCED polling to prevent 429
  const { data: activeGIVI } = useQuery({
    queryKey: ['viewer-givi-banner-trigger', show?.id],
    queryFn: async () => {
      if (!show?.id) return null;
      try {
        const events = await base44.entities.GIVIEvent.filter({
          show_id: show.id,
          status: "result"
        }, '-created_date');
        return events.length > 0 ? events[0] : null;
      } catch (err) {
        if (err?.response?.status === 429 || err?.message?.includes('429')) {
          console.warn("⚠️ GIVI banner check rate limited");
          return undefined;
        }
        throw err;
      }
    },
    enabled: !!show?.id,
    refetchInterval: 10000, // INCREASED from 3s to 10s
    staleTime: 8000,
    refetchOnWindowFocus: false,
    keepPreviousData: true
  });

  // Trigger banner when winner is selected
  useEffect(() => {
    if (activeGIVI?.status === "result" && activeGIVI?.winner_ids?.length > 0) {
      const bannerShownKey = `givi_banner_shown_${activeGIVI.id}`;
      if (localStorage.getItem(bannerShownKey) !== 'true') {
        console.log("🎊 Showing winner banner for viewer");
        console.log("   Winner Names:", activeGIVI.winner_names);
        setShowWinnerBanner(true);
        localStorage.setItem(bannerShownKey, 'true');
      }
    }
  }, [activeGIVI?.id, activeGIVI?.status, activeGIVI?.winner_ids]);

  useEffect(() => {
    if (featuredProduct && previousPrice !== null && featuredProduct.price !== previousPrice) {
      setPriceJustChanged(true);

      setTimeout(() => {
        setPriceJustChanged(false);
      }, 3000);
    }

    if (featuredProduct) {
      setPreviousPrice(featuredProduct.price);
    }
  }, [featuredProduct?.price]);

  // Auto-expand featured product when it changes
  useEffect(() => {
    if (featuredProduct?.id) {
      // Check if we already expanded this specific product ID to avoid annoying re-opens if user closed it
      // But since "Push to Live" implies forcing attention, we'll expand it.
      // To prevent loop if user closes it and data refetches:
      // We only expand if the expandedProduct is DIFFERENT (or null).
      if (expandedProduct?.id !== featuredProduct.id) {
         setExpandedProduct(featuredProduct);
      }
    }
  }, [featuredProduct?.id]);

  const handleBuyNow = (product) => {
    // ═══════════════════════════════════════════════════════════════════════════
    // DIAGNOSTIC LOGGING: Trace product ID at buy click
    // ═══════════════════════════════════════════════════════════════════════════
    console.log("[BUY NOW CLICK] product.id:", product?.id);
    console.log("[BUY NOW CLICK] product.show_product_id:", product?.show_product_id);
    console.log("[BUY NOW CLICK] product.product_id:", product?.product_id);
    console.log("[BUY NOW CLICK] product.title:", product?.title);
    console.log("[BUY NOW CLICK] full product:", product);

    // ═══════════════════════════════════════════════════════════════════════════
    // LIFECYCLE GATING: Only allow buying when show is actually live
    // ═══════════════════════════════════════════════════════════════════════════
    if (!isShowLive(show)) {
      console.log("[GATE BLOCKED] reason: show not live", {
        streamStatus: show?.stream_status,
        showStatus: show?.status,
        productId: product?.id,
      });
      console.warn("[LiveShow] Buy blocked - show is not live (stream_status !== 'live')");
      return;
    }
    
    if (!user) {
      console.log("[GATE BLOCKED] reason: no user logged in", {
        productId: product?.id,
      });
      // Store return URL for post-login redirect
      sessionStorage.setItem('login_return_url', window.location.href);
      navigate(createPageUrl("Login"));
      return;
    }

    // Validate product is still available
    if (product.status === "sold_out" || product.status === "locked") {
      console.log("[GATE BLOCKED] reason: product status blocked", {
        productStatus: product?.status,
        productQuantity: product?.quantity,
        productId: product?.id,
        productTitle: product?.title,
      });
      return;
    }
    if ((product.quantity || 0) <= 0) {
      console.log("[GATE BLOCKED] reason: product quantity <= 0", {
        productQuantity: product?.quantity,
        productStatus: product?.status,
        productId: product?.id,
        productTitle: product?.title,
      });
      return;
    }

    console.log("[SET selectedProduct]", {
      selectedProductId: product?.id,
      selectedTitle: product?.title,
      selectedShowProductId: product?.show_product_id,
    });
    setSelectedProduct(product);
    setExpandedProduct(null);
    setShowCheckout(true);
  };

  // Daily SDK viewer count callback (UI-only, no DB writes)
  // Also stores in ref for merge guard protection against polling overwrite
  const handleViewerCountChange = useCallback((count) => {
    // Store in ref for merge guard (protects against polling overwrite)
    sdkViewerCountRef.current = Number.isFinite(count) ? count : sdkViewerCountRef.current;
    // Update state for UI display
    setShow((prev) => (prev ? { ...prev, viewer_count: count } : prev));
  }, []);

  const scrollCarousel = (direction) => {
    if (carouselRef.current) {
      const scrollAmount = 200;
      const newPosition = direction === 'left'
        ? carouselRef.current.scrollLeft - scrollAmount
        : carouselRef.current.scrollLeft + scrollAmount;

      carouselRef.current.scrollTo({
        left: newPosition,
        behavior: 'smooth'
      });
    }
  };

  const handlePrevImage = () => {
    if (!expandedProduct?.image_urls) return;
    setCurrentImageIndex((prev) => 
      prev === 0 ? expandedProduct.image_urls.length - 1 : prev - 1
    );
  };

  const handleNextImage = () => {
    if (!expandedProduct?.image_urls) return;
    setCurrentImageIndex((prev) => 
      prev === expandedProduct.image_urls.length - 1 ? 0 : prev + 1
    );
  };

  // CRITICAL: Check showId FIRST - if missing after params load, redirect
  // But don't redirect during initial navigation - wait for params to resolve
  if (!showId && !showLoading) {
    console.log("❌ LiveShow - No showId after params loaded, redirecting");
    navigate(createPageUrl("Marketplace"), { replace: true });
    return null;
  }

  // CRITICAL: Only show loading on INITIAL load, not on refetch
  const isInitialLoad = !show && showLoading;
  const isInitialSellerLoad = show && !seller && sellerLoading;
  
  if (!showId) {
    return null; // Will redirect via the effect above
  }
  
  if (isInitialLoad || isInitialSellerLoad) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading show...</p>
        </div>
      </div>
    );
  }
  
  // Show not found error
  if (showError?.status === 404 && !show) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Show Not Found</h3>
            <p className="text-white/70 mb-4">
              The show you're looking for doesn't exist or has been removed.
            </p>
            <Button
              onClick={() => navigate(createPageUrl("Marketplace"), { replace: true })}
              className="w-full"
            >
              Back to Marketplace
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If we have show data (even stale), render the UI - don't flash loading
  if (!show || !seller) {
    // Only reached if initial load failed - show error
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900">
        <div className="text-center">
          <p className="text-white text-lg">Unable to load show</p>
          <Button onClick={() => navigate(createPageUrl("Marketplace"))} className="mt-4">
            Back to Marketplace
          </Button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE GATING: Explicit handling of show states
  // ═══════════════════════════════════════════════════════════════════════════
  
  // AUTHORITATIVE: stream_status === "live" is the ONLY rule for "is live"
  const isShowActuallyLive = isShowLive(show);
  
  // UI FLAGS (derived, not stored):
  // - canShowProducts: Show products during "starting" and "live" (NOT "ended")
  // - canBuy: Only allow purchasing when stream_status === "live"
  const canShowProducts = show?.stream_status === "starting" || show?.stream_status === "live";
  const canBuy = isShowActuallyLive; // stream_status === "live"
  
  // Show ended or cancelled - graceful handling (no video, no buying)
  if (show.status === "ended" || show.status === "cancelled") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">
              {show.status === "ended" ? "Show Has Ended" : "Show Cancelled"}
            </h3>
            <p className="text-white/70 mb-4">
              {show.status === "ended" 
                ? "This live show has ended. Check out other shows on the marketplace!"
                : "This show has been cancelled by the seller."
              }
            </p>
            <Button
              onClick={() => navigate(createPageUrl("Marketplace"), { replace: true })}
              className="w-full"
            >
              Browse Marketplace
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Scheduled show - preview-only UI (no video player, no product rail, no buying)
  // Only show preview when there is NO stream_status yet; once "starting" or "live", render full stage UI
  if (show.status === "scheduled" && !show.stream_status) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 p-4">
        <GiviTracker type="show" id={showId} />
        
        {/* Header */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-3">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 rounded-full h-9 w-9 flex-shrink-0"
              onClick={() => navigate(createPageUrl("Marketplace"))}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1 text-center px-2">
              <h1 className="text-white font-bold text-sm line-clamp-1 leading-tight">{show.title}</h1>
              <p className="text-purple-300 text-xs font-medium">
                {seller?.business_name || "Loading..."}
              </p>
            </div>
            <div className="w-9" /> {/* Spacer for alignment */}
          </div>
        </div>
        
        {/* Preview Content */}
        <div className="flex flex-col items-center justify-center min-h-screen pt-16 pb-8">
          {/* Show Preview Image */}
          <div className="relative w-full max-w-2xl aspect-video rounded-2xl overflow-hidden mb-8">
            {show.thumbnail_url ? (
              <img
                src={show.thumbnail_url}
                alt={show.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-purple-800 to-blue-800 flex items-center justify-center">
                <Radio className="w-20 h-20 text-white/30" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            
            {/* Scheduled Badge */}
            <div className="absolute top-4 left-4">
              <Badge className="bg-blue-500/90 text-white border-0 px-3 py-1">
                <Radio className="w-3 h-3 mr-1" />
                SCHEDULED
              </Badge>
            </div>
          </div>
          
          {/* Show Details */}
          <Card className="max-w-md w-full bg-white/10 backdrop-blur-md border-white/20">
            <CardContent className="p-6 text-center">
              <h2 className="text-2xl font-bold text-white mb-2">{show.title}</h2>
              <p className="text-white/70 mb-4">{show.description || "No description provided"}</p>
              
              {/* Seller Info */}
              <div className="flex items-center justify-center gap-3 mb-6">
                {seller?.profile_image_url && (
                  <img
                    src={seller.profile_image_url}
                    alt={seller.business_name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                )}
                <div className="text-left">
                  <p className="text-white font-medium">{seller?.business_name}</p>
                  {seller?.pickup_city && (
                    <p className="text-white/60 text-xs flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {seller.pickup_city}, {seller.pickup_state}
                    </p>
                  )}
                </div>
              </div>
              
              {/* Scheduled Time */}
              {show.scheduled_start_time && (
                <div className="bg-white/10 rounded-lg p-4 mb-4">
                  <p className="text-white/60 text-sm mb-1">Starting at</p>
                  <p className="text-white font-bold text-lg">
                    {new Date(show.scheduled_start_time).toLocaleString()}
                  </p>
                </div>
              )}
              
              <p className="text-white/60 text-sm">
                Products and buying will be available once the show goes live.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Check if user is banned from viewing this seller's shows
  if (viewerBan && (viewerBan.ban_type === 'view' || viewerBan.ban_type === 'full')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 p-4">
        <Card className="max-w-md w-full border-2 border-red-500">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Access Restricted</h3>
            <p className="text-white/70 mb-4">
              You have been banned from viewing shows from {seller.business_name}.
            </p>
            {viewerBan.reason && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 mb-4">
                <p className="text-sm text-red-200">
                  <strong>Reason:</strong> {viewerBan.reason}
                </p>
              </div>
            )}
            <Button
              onClick={() => navigate(createPageUrl("Marketplace"))}
              className="w-full"
            >
              Back to Marketplace
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const productImages = expandedProduct?.image_urls || [];
  const hasMultipleImages = productImages.length > 1;

  return (
    <div style={{ 
      overscrollBehavior: 'none',
      touchAction: 'pan-y'
    }}>
      <GiviTracker type="show" id={showId} />

      {/* GIVI Winner Banner - Gated by feature flag */}
      {FEATURES.givi && (
        <GIVIWinnerBanner 
          show={showWinnerBanner}
          winnerName={activeGIVI?.winner_names?.[0]}
          onDismiss={() => setShowWinnerBanner(false)}
        />
      )}

      {/* Global Purchase Confirmation Banner */}
      {showPurchaseBanner && (
        <div
          style={{
            position: "fixed",
            top: "16px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 99999,
            pointerEvents: "none"
          }}
          className="bg-green-600 text-white px-5 py-2 rounded-full shadow-lg text-sm font-semibold"
        >
          🎉 New purchase just made!
        </div>
      )}

      {/* CRITICAL: GIVI Overlay - Rendered BEFORE stream elements with high z-index */}
      {/* Must appear even when "Waiting for Stream" is shown */}
      {/* Gated by feature flag */}
      {FEATURES.givi && show && seller && (
        <GIVIViewerOverlay show={show} seller={seller} />
      )}

      {/* Pickup Instructions Bubble */}
      <PickupInstructionsBubble pickupInstructions={show.pickup_instructions} />

      {/* MOBILE VIEW - Original Layout */}
      <div className="sm:hidden">
        <div className="fixed inset-0 z-0">
          {/* Conditional video player: IVS for AWS IVS streams, WebRTC for Daily.co */}
          {/* CRITICAL: Only mount WebRTCViewer when viewport is mobile to prevent duplicate Daily instances */}
          {useIvsPlayer ? (
            <IVSPlayer
              show={show}
              onStateChange={handleIvsStateChange}
              onError={handleIvsError}
              autoplay={true}
              muted={false}
            />
          ) : !isDesktop ? (
            <WebRTCViewer
              show={show}
              onViewerCountChange={handleViewerCountChange}
            />
          ) : null}
        </div>

        {/* Share + Follow Overlay - Buyer Only */}
        {!isShowOwner && seller && (
          <div className="fixed top-16 right-3 z-40 flex flex-col gap-3">
            <FollowButton
              seller={seller}
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 rounded-full h-10 w-10 p-0 bg-black/40 backdrop-blur-sm [&_svg]:w-5 [&_svg]:h-5"
            />
            <ShareButton
              type="show"
              id={showId}
              title={show?.title}
              description={show?.description}
              imageUrl={show?.thumbnail_url}
              variant="ghost"
              size="icon"
              showLabel={false}
              className="text-white hover:bg-white/20 rounded-full h-10 w-10 p-0 bg-black/40 backdrop-blur-sm"
            />
          </div>
        )}

        {/* Header */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-3">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 rounded-full h-9 w-9 flex-shrink-0"
              onClick={() => navigate(createPageUrl("Marketplace"))}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>

            <button
              onClick={() => setShowSellerProfile(true)}
              className="text-white hover:bg-white/20 rounded-full h-9 w-9 flex items-center justify-center transition-colors flex-shrink-0 mx-3"
            >
              <Users className="w-4 h-4" />
            </button>

            <div className="flex-1 text-center px-2">
              <h1 className="text-white font-bold text-sm line-clamp-1 leading-tight">{show.title}</h1>
              <button
                onClick={() => setShowSellerProfile(true)}
                className="text-purple-300 hover:text-purple-100 text-xs font-medium"
              >
                {seller?.business_name || "Loading..."}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Badge className="bg-black/60 backdrop-blur-sm text-white border-white/30 text-xs px-2 py-0.5">
                <Users className="w-3 h-3 mr-1" />
                {show.viewer_count || 0}
              </Badge>
              {isShowActuallyLive && (
                <Badge className="bg-red-500 text-white border-0 animate-pulse text-xs px-2 py-0.5">
                  <Radio className="w-3 h-3 mr-1" />
                  LIVE
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Chat Messages Overlay */}
        {/* CONDITIONAL MOUNT: Only mount mobile chat when !isDesktop.
            This prevents double polling and freeze under load by ensuring
            only one chat instance mounts at any time. */}
        {!isDesktop && (
          <>
            {(() => { console.log("[AUTH DEBUG][LiveShow] rendering mobile chat with user:", user); return null; })()}
            {(() => {
              console.log("[CHAT PROPS DEBUG][LiveShow][MOBILE]", {
                showId,
                sellerId: show?.seller_id,
                isShowOwner,
                userId: user?.id ?? null,
                userRole: user?.role ?? null,
              });
              return null;
            })()}
            {showChatOverlay && (
              useSupabaseChat ? (
                <SupabaseLiveChat
                  showId={showId}
                  sellerId={show?.seller_id}
                  isSeller={isShowOwner}
                  user={user}
                  isOverlay={true}
                  onClose={() => setShowChatOverlay(false)}
                  onMessageSeller={() => {
                    // Navigate to messages page with seller context
                    navigate(createPageUrl("Messages") + `?sellerId=${show?.seller_id}`);
                  }}
                />
              ) : (
                <LiveChatOverlay
                  showId={showId}
                  sellerId={show?.seller_id}
                  isSeller={false}
                  onClose={() => setShowChatOverlay(false)}
                />
              )
            )}
          </>
        )}

        {/* Product Carousel - Show during "starting" and "live", hide when "ended" */}
        {canShowProducts && allShowProducts.length > 0 && (
          <div 
            className="fixed left-0 right-0 z-[90] animate-fade-in"
            style={{ 
              bottom: '60px', // Moved down slightly
            }}
          >
            <div className="relative px-3">
              <div
                ref={carouselRef}
                className="flex gap-2 overflow-x-auto scrollbar-hide pb-2"
                style={{
                  scrollSnapType: 'x mandatory',
                  WebkitOverflowScrolling: 'touch'
                }}
              >
              {allShowProducts.map((product) => {
                const isFeatured = product.id === featuredProduct?.id;
                const isPriceChanging = isFeatured && priceJustChanged;
                
                return (
                  <div
                    key={product.id}
                    onClick={() => setExpandedProduct(product)}
                    className={`flex-shrink-0 cursor-pointer transition-all duration-200 hover:scale-105 ${
                      isFeatured ? 'animate-glow-yellow' : ''
                    }`}
                    style={{
                      width: '70px',  // Reduced size by ~22%
                      height: '70px', // Reduced size by ~22%
                      scrollSnapAlign: 'start',
                      ...(isFeatured && {
                        filter: 'drop-shadow(0 0 12px rgba(250, 204, 21, 0.8)) drop-shadow(0 0 20px rgba(250, 204, 21, 0.5))'
                      })
                    }}
                  >
                    <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl bg-white/95 backdrop-blur-sm">
                      {product.image_urls?.[0] ? (
                        <img
                          src={product.image_urls[0]}
                          alt={product.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-100">
                          <ShoppingBag className="w-8 h-8 text-gray-400" />
                        </div>
                      )}

                      {/* Box Number Bubble */}
                      {product.box_number && (
                        <div className="absolute -top-1 -left-1 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-black shadow-lg">
                          {product.box_number}
                        </div>
                      )}

                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-1.5">
                        <p className="text-white text-xs font-bold text-center leading-none">
                          ${product.price?.toFixed(2)}
                        </p>
                      </div>

                      {isFeatured && (
                        <div className="absolute top-1 right-1">
                          <Badge className="bg-yellow-400 text-gray-900 text-[9px] px-1.5 py-0.5 h-auto leading-none">
                            ⭐
                          </Badge>
                        </div>
                      )}

                      {isPriceChanging && (
                        <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/50 to-orange-500/50 animate-pulse"></div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

              <div className="absolute left-0 top-0 bottom-2 w-8 bg-gradient-to-r from-black/40 to-transparent pointer-events-none"></div>
              <div className="absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-black/40 to-transparent pointer-events-none"></div>
            </div>
          </div>
        )}

        {/* FIXED SIZE Product Detail Card */}
        {expandedProduct && (
        <div 
          className="fixed left-4 right-4 z-[100] animate-slide-up flex justify-center"
          style={{ bottom: '150px' }}
        >
          <div 
            className="backdrop-blur-md rounded-2xl shadow-xl w-full max-w-sm border border-white/10 overflow-hidden bg-black/30"
            style={{ height: '220px' }} // FIXED HEIGHT ENFORCED
          >
            {/* Close Button - Absolute positioning */}
            <div className="absolute top-2 right-2 z-30">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setExpandedProduct(null)}
                className="text-white hover:bg-black/30 h-8 w-8 rounded-full bg-black/10 backdrop-blur-sm"
              >
                <XIcon className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex h-full">
              {/* Left - Full Height Image (40%) */}
              <div className="w-[40%] relative bg-black/20 border-r border-white/10">
                {productImages.length > 0 ? (
                  <>
                    <img
                      src={productImages[currentImageIndex]}
                      alt={expandedProduct.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    {hasMultipleImages && (
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                        {productImages.map((_, index) => (
                          <button
                            key={index}
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrentImageIndex(index);
                            }}
                            className={`h-1 rounded-full transition-all shadow-sm ${
                              index === currentImageIndex ? 'bg-white w-3' : 'bg-white/50 w-1'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                    {/* Simple nav arrows if needed, but dots usually suffice for small cards */}
                    {hasMultipleImages && (
                      <button
                         onClick={(e) => { e.stopPropagation(); handleNextImage(); }}
                         className="absolute inset-0 w-full h-full z-0"
                         aria-label="Next Image"
                      />
                    )}
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ShoppingBag className="w-10 h-10 text-white/30" />
                  </div>
                )}
              </div>

              {/* Right - Fixed Content (60%) */}
              <div className="w-[60%] p-3 flex flex-col relative">
                
                {/* Top Section: Price & Title */}
                <div className="flex-1 min-h-0 flex flex-col">
                  {/* Price - Prominent */}
                  <div className="flex items-baseline justify-between mb-1">
                    <div className="flex flex-col">
                       <p className="text-3xl font-black text-white leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                        ${expandedProduct.price?.toFixed(0)}
                        <span className="text-lg align-top opacity-80">
                          {(expandedProduct.price % 1).toFixed(2).substring(1)}
                        </span>
                      </p>
                      <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider mt-0.5">
                        {expandedProduct.quantity} Available
                      </p>
                    </div>
                  </div>

                  {/* Title - STRICT 1 Line */}
                  <h4 className="font-bold text-white text-lg leading-tight truncate mb-1 drop-shadow-md pr-6">
                    {expandedProduct.title}
                  </h4>
                  
                  {/* Description - STRICT 2 Lines */}
                  <p className="text-xs text-white/80 leading-snug line-clamp-2 drop-shadow-md">
                    {expandedProduct.description || "No description provided."}
                  </p>
                  {/* Optional 'More' indicator if description is long */}
                  {expandedProduct.description?.length > 60 && (
                     <span className="text-[10px] text-blue-300 mt-0.5">more info &rarr;</span>
                  )}
                </div>

                {/* Bottom Section: Thumbprint Button */}
                <div className="mt-2 relative z-20">
                  <button
                    className={`w-full h-12 relative group flex items-center justify-center gap-3 transition-all rounded-xl overflow-hidden
                      ${!canBuy ? 'bg-gray-800/80 cursor-not-allowed' :
                        expandedProduct.status === 'locked' ? 'bg-gray-800/80 cursor-not-allowed' : 
                        expandedProduct.status === 'sold_out' ? 'bg-gray-800/80 cursor-not-allowed' : 
                        'hover:scale-[1.02] active:scale-95'
                      }`}
                    onClick={() => handleBuyNow(expandedProduct)}
                    disabled={!canBuy || expandedProduct.status === "locked" || expandedProduct.status === "sold_out"}
                  >
                    {/* Background Aura for Active State */}
                    {canBuy && expandedProduct.status !== 'locked' && expandedProduct.status !== 'sold_out' && (
                       <div className="absolute inset-0 bg-gradient-to-r from-[#00FF2A]/10 to-[#4D9FFF]/10 animate-pulse-slow"></div>
                    )}

                    {!canBuy ? (
                       <span className="text-gray-400 font-bold text-sm">Waiting for host to go live...</span>
                    ) : expandedProduct.status === "locked" ? (
                       <span className="text-gray-400 font-bold flex items-center gap-2"><Lock className="w-4 h-4"/> LOCKED</span>
                    ) : expandedProduct.status === "sold_out" ? (
                       <span className="text-gray-400 font-bold">SOLD OUT</span>
                    ) : (
                      <>
                        {/* Radiant Thumbprint */}
                        <div className="relative">
                           <div className="absolute inset-0 bg-[#00FF2A] rounded-full blur-md opacity-40 animate-pulse"></div>
                           <Fingerprint className="w-8 h-8 text-[#00FF2A] relative z-10 drop-shadow-[0_0_8px_rgba(0,255,42,0.8)]" />
                        </div>
                        
                        {/* Buy Text */}
                        <span className="text-xl font-black text-white tracking-widest drop-shadow-lg italic">
                          BUY NOW
                        </span>
                      </>
                    )}
                  </button>
                </div>

              </div>
            </div>
          </div>
        </div>
        )}

        {/* Bottom Action Bar */}
        <div 
          className="fixed left-0 right-0 z-[100] animate-fade-in"
          style={{ 
            bottom: '8px',
          }}
        >
          <div className="flex items-center gap-2 px-2">
            <div className="flex-1">
              {!useSupabaseChat && (
                <LiveChatOverlay
                  showId={showId}
                  sellerId={show?.seller_id}
                  isSeller={false}
                  inputOnly={true}
                />
              )}
            </div>

          </div>
        </div>
      </div>

      {/* DESKTOP VIEW - 3-Column Whatnot Layout */}
      <div className="hidden sm:grid sm:grid-cols-[25%_50%_25%] h-screen bg-black">
        {/* LEFT COLUMN - Products Panel - GATED: Only show when live */}
        <div className="bg-gray-900 overflow-y-auto p-4 space-y-4">
          <h2 className="text-white font-bold text-lg mb-4">Products</h2>
          
          {/* Show waiting message if show ended */}
          {!canShowProducts && (
            <div className="text-center py-8">
              <ShoppingBag className="w-12 h-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">This show has ended</p>
            </div>
          )}
          
          {canShowProducts && allShowProducts.map((product) => {
            console.log("[RENDER PRODUCT CARD] (desktop list)", {
              cardProductId: product?.id,
              cardTitle: product?.title,
              cardShowProductId: product?.show_product_id,
              cardQuantity: product?.quantity,
              cardStatus: product?.status,
            });
            const isFeatured = product.id === featuredProduct?.id;
            return (
              <div
                key={product.id}
                onClick={() => setExpandedProduct(product)}
                className={`cursor-pointer rounded-lg p-2 transition-all ${
                  isFeatured ? 'bg-yellow-500/20 border-2 border-yellow-500' : 'bg-gray-800 hover:bg-gray-700'
                }`}
              >
                <div className="flex gap-3">
                  <div className="relative w-20 h-20 flex-shrink-0">
                    {product.image_urls?.[0] ? (
                      <img
                        src={product.image_urls[0]}
                        alt={product.title}
                        className="w-full h-full object-cover rounded"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-700 rounded">
                        <ShoppingBag className="w-8 h-8 text-gray-500" />
                      </div>
                    )}
                    {product.box_number && (
                      <div className="absolute -top-1 -left-1 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-black">
                        {product.box_number}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-semibold text-sm line-clamp-2">{product.title}</h3>
                    <p className="text-green-400 font-bold mt-1">${product.price?.toFixed(2)}</p>
                    <p className="text-gray-400 text-xs">{product.quantity} left</p>
                    {isFeatured && (
                      <Badge className="bg-yellow-400 text-gray-900 text-xs mt-1">⭐ Featured</Badge>
                    )}

                    {/* Desktop Buy Button */}
                    <button
                      className={`w-full mt-2 h-9 relative group flex items-center justify-center gap-2 transition-all rounded-lg overflow-hidden border border-white/10
                        ${(product.status === 'locked' || product.status === 'sold_out') ? 'bg-gray-700/50 cursor-not-allowed' : 
                          'hover:scale-[1.02] active:scale-95 bg-black/20'
                        }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBuyNow(product);
                      }}
                      disabled={product.status === "locked" || product.status === "sold_out"}
                    >
                      {/* Background Aura */}
                      {product.status !== 'locked' && product.status !== 'sold_out' && (
                          <div className="absolute inset-0 bg-gradient-to-r from-[#00FF2A]/10 to-[#4D9FFF]/10 animate-pulse-slow"></div>
                      )}

                      {(product.status === "locked" || product.status === "sold_out") ? (
                          <span className="text-gray-400 text-xs font-bold flex items-center gap-1">
                            {product.status === 'locked' ? <Lock className="w-3 h-3"/> : null}
                            {product.status === 'locked' ? 'LOCKED' : 'SOLD'}
                          </span>
                      ) : (
                        <>
                          {/* Radiant Thumbprint */}
                          <div className="relative">
                              <div className="absolute inset-0 bg-[#00FF2A] rounded-full blur-[2px] opacity-40 animate-pulse"></div>
                              <Fingerprint className="w-5 h-5 text-[#00FF2A] relative z-10 drop-shadow-[0_0_4px_rgba(0,255,42,0.8)]" />
                          </div>
                          
                          {/* Buy Text */}
                          <span className="text-sm font-black text-white tracking-wide italic drop-shadow-md">
                            BUY NOW
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* CENTER COLUMN - Live Video */}
        <div className="relative bg-black h-full">
          {/* Conditional video player: IVS for AWS IVS streams, WebRTC for Daily.co */}
          {/* CRITICAL: Only mount WebRTCViewer when viewport is desktop to prevent duplicate Daily instances */}
          {useIvsPlayer ? (
            <IVSPlayer
              show={show}
              onStateChange={handleIvsStateChange}
              onError={handleIvsError}
              autoplay={true}
              muted={false}
            />
          ) : isDesktop ? (
            <WebRTCViewer
              show={show}
              onViewerCountChange={handleViewerCountChange}
            />
          ) : null}
          
          {/* Header overlay on video */}
          <div className="absolute top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20 rounded-full"
                onClick={() => navigate(createPageUrl("Marketplace"))}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>

              <div className="text-center">
                <h1 className="text-white font-bold text-lg">{show.title}</h1>
                <button
                  onClick={() => setShowSellerProfile(true)}
                  className="text-purple-300 hover:text-purple-100 text-sm font-medium"
                >
                  {seller?.business_name}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <Badge className="bg-black/60 backdrop-blur-sm text-white border-white/30">
                  <Users className="w-4 h-4 mr-1" />
                  {show.viewer_count || 0}
                </Badge>
                {isShowActuallyLive && (
                  <Badge className="bg-red-500 text-white border-0 animate-pulse">
                    <Radio className="w-4 h-4 mr-1" />
                    LIVE
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Share + Follow Overlay - Buyer Only */}
          {!isShowOwner && seller && (
            <div className="absolute top-20 right-4 z-40 flex flex-col gap-3">
              <FollowButton
                seller={seller}
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20 rounded-full h-10 w-10 p-0 bg-black/40 backdrop-blur-sm [&_svg]:w-5 [&_svg]:h-5"
              />
              <ShareButton
                type="show"
                id={showId}
                title={show?.title}
                description={show?.description}
                imageUrl={show?.thumbnail_url}
                variant="ghost"
                size="icon"
                showLabel={false}
                className="text-white hover:bg-white/20 rounded-full h-10 w-10 p-0 bg-black/40 backdrop-blur-sm"
              />
            </div>
          )}
        </div>

        {/* RIGHT COLUMN - Chat & Metrics */}
        <div className="bg-gray-900 flex flex-col h-full overflow-hidden">
          {/* Metrics Section */}
          <div className="p-4 border-b border-gray-800 flex-shrink-0">
            <h2 className="text-white font-bold mb-3">Show Info</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-300">
                <Users className="w-4 h-4" />
                <span>{show.viewer_count || 0} viewers</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300">
                <ShoppingBag className="w-4 h-4" />
                <span>{allShowProducts.length} products</span>
              </div>
            </div>
          </div>

          {/* Chat Component - Full Height */}
          {/* CONDITIONAL MOUNT: Only mount desktop chat when isDesktop.
              This prevents double polling and freeze under load by ensuring
              only one chat instance mounts at any time. */}
          <div className="flex-1 flex flex-col min-h-0">
            {isDesktop && (
              <>
                {(() => { console.log("[AUTH DEBUG][LiveShow] rendering desktop chat with user:", user); return null; })()}
                {(() => {
                  console.log("[CHAT PROPS DEBUG][LiveShow][DESKTOP]", {
                    showId,
                    sellerId: show?.seller_id,
                    isShowOwner,
                    userId: user?.id ?? null,
                    userRole: user?.role ?? null,
                  });
                  return null;
                })()}
                {useSupabaseChat ? (
                  <SupabaseLiveChat
                    showId={showId}
                    sellerId={show?.seller_id}
                    isSeller={isShowOwner}
                    user={user}
                    isOverlay={false}
                    onMessageSeller={() => {
                      navigate(createPageUrl("Messages") + `?sellerId=${show?.seller_id}`);
                    }}
                  />
                ) : (
                  <LiveChat
                    showId={showId}
                    sellerId={show?.seller_id}
                    isSeller={false}
                    isEmbedded={true}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Seller Profile Modal */}
      {showSellerProfile && seller && (
        <SellerProfileModal
          seller={seller}
          user={user}
          onClose={() => setShowSellerProfile(false)}
        />
      )}

      {/* Checkout Overlay - GATED: Only render when canBuy (stream_status === "live") */}
      {canBuy && showCheckout && selectedProduct && seller && (() => {
        console.log("[CHECKOUT RECEIVES PRODUCT]", {
          checkoutProductId: selectedProduct?.id,
          checkoutTitle: selectedProduct?.title,
          checkoutShowProductId: selectedProduct?.show_product_id,
          checkoutQuantity: selectedProduct?.quantity,
          checkoutStatus: selectedProduct?.status,
        });
        return (
          <div className="fixed inset-0 z-[200]">
            <CheckoutOverlay
              product={selectedProduct}
              seller={seller}
              show={show}
              buyerProfile={buyerProfile}
              onClose={() => {
                setShowCheckout(false);
                setSelectedProduct(null);
              }}
            />
          </div>
        );
      })()}

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes glow-yellow {
          0%, 100% {
            filter: drop-shadow(0 0 12px rgba(250, 204, 21, 0.8)) drop-shadow(0 0 20px rgba(250, 204, 21, 0.5));
          }
          50% {
            filter: drop-shadow(0 0 16px rgba(250, 204, 21, 1)) drop-shadow(0 0 28px rgba(250, 204, 21, 0.7));
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        .animate-glow-yellow {
          animation: glow-yellow 2s ease-in-out infinite;
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.02); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}