import React, { useState, useEffect, useRef } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isSuperAdmin, requireSellerAsync, isAdmin } from "@/lib/auth/routeGuards";
import { checkAccountActiveAsync } from "@/lib/auth/accountGuards";
import { getShowByIdWithStats } from "@/api/shows";
import { isShowLive } from "@/api/streamSync";
import { createProduct, updateProduct } from "@/api/products";
import { getShowProductsByShowId, createShowProduct, updateShowProductByIds, clearFeaturedForShow, deleteShowProductByIds } from "@/api/showProducts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Radio,
  Users,
  DollarSign,
  Package,
  Search,
  Star,
  Video,
  Monitor,
  AlertTriangle,
  XCircle,
  Edit2,
  Check,
  X as XIcon,
  Plus,
  ArrowLeft,
  Trash2,
  Sparkles,
  MessageCircle,
  ClipboardCheck,
  QrCode,
  ShoppingBag
} from "lucide-react";
import HostBottomControls from "../components/host/HostBottomControls";
import SellerProductDetailCard from "../components/host/SellerProductDetailCard";
import SellerProductDetailContent from "../components/host/SellerProductDetailContent";
import LiveChat from "../components/chat/LiveChat";
import LiveChatOverlay from "../components/chat/LiveChatOverlay";
import SupabaseLiveChat from "../components/chat/SupabaseLiveChat";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ProductForm from "../components/products/ProductForm";
import GIVIHostPanel from "../components/givi/GIVIHostPanel";
import GIVIWinnerBanner from "../components/givi/GIVIWinnerBanner";
import BottomDrawer from "../components/host/BottomDrawer";
import { FEATURES } from "@/config/features";
import PickupVerification from "../components/fulfillment/PickupVerification";
import BatchFulfillmentList from "../components/fulfillment/BatchFulfillmentList";
import DailyBroadcaster from "@/components/streaming/DailyBroadcaster";
import { useDeviceClass } from "@/hooks/useDeviceClass";
import { useMobilePortraitLock } from "@/hooks/useMobilePortraitLock";

export default function HostConsole() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const showId = urlParams.get('showId');
  const [searchTerm, setSearchTerm] = useState("");
  // Daily In-App Camera State
  const [dailyRoomUrl, setDailyRoomUrl] = useState(null);
  const [dailyToken, setDailyToken] = useState(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentSeller, setCurrentSeller] = useState(null);
  const [accessError, setAccessError] = useState(null);
  const [editingPriceProductId, setEditingPriceProductId] = useState(null);
  const [newPrice, setNewPrice] = useState("");
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const [editingQuantityProductId, setEditingQuantityProductId] = useState(null);
  const [newQuantity, setNewQuantity] = useState("");
  const [showWinnerBanner, setShowWinnerBanner] = useState(false);
  const [winnerName, setWinnerName] = useState("");
  const [showGiviDrawer, setShowGiviDrawer] = useState(false);
  const [showAddProductDrawer, setShowAddProductDrawer] = useState(false);
  const [giviDrawerMode, setGiviDrawerMode] = useState("form"); // "form" or "console"
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [showRecentOrders, setShowRecentOrders] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [bottomBarMode, setBottomBarMode] = useState("products"); // "products" or "message"
  const [showFulfillmentDrawer, setShowFulfillmentDrawer] = useState(false);
  const [showFulfillmentDialog, setShowFulfillmentDialog] = useState(false);
  const [showPurchaseBanner, setShowPurchaseBanner] = useState(false);
  const [purchaseBannerBuyerName, setPurchaseBannerBuyerName] = useState(null);
  const [editDetailsProductId, setEditDetailsProductId] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [isEditDetailsOpen, setIsEditDetailsOpen] = useState(false);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [targetShowId, setTargetShowId] = useState("");
  const [sellerShowsForClone, setSellerShowsForClone] = useState([]);
  const [isCloning, setIsCloning] = useState(false);
  const [showHostProductOverlay, setShowHostProductOverlay] = useState(false);
  const [overlayMode, setOverlayMode] = useState("grid"); // "grid" | "detail"
  const [overlaySelectedProduct, setOverlaySelectedProduct] = useState(null);
  const [showConfirmGoLive, setShowConfirmGoLive] = useState(false);
  const [showConfirmEndShow, setShowConfirmEndShow] = useState(false);
  const [activeGivey, setActiveGivey] = useState(null);
  const [nextGiveyNumber, setNextGiveyNumber] = useState(null);
  const [startingGivey, setStartingGivey] = useState(false);
  const hostOverlayPanelRef = useRef(null);
  const hostChatRef = useRef(null);

  // ═══════════════════════════════════════════════════════════════════════════
  // DEVICE-LOCKED CLASSIFICATION (NO VIEWPORT FLIPS)
  // Prevents dual DailyBroadcaster AND dual SupabaseLiveChat mount.
  // Classification is determined ONCE by device type, NOT viewport width.
  // This ensures SDKs don't remount on orientation change.
  // ═══════════════════════════════════════════════════════════════════════════
  const { isMobileDevice, isDesktopDevice, reason: deviceClassReason } = useDeviceClass();
  const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  useMobilePortraitLock(isMobileDevice);

  // Capture-phase listener: close overlay on tap outside (works even when chat stops propagation)
  useEffect(() => {
    if (!showHostProductOverlay) return;
    const handler = (event) => {
      if (!showHostProductOverlay) return;
      if (hostOverlayPanelRef.current?.contains(event.target)) return;
      // If user tapped inside chat area (including input), do NOT close overlay
      if (hostChatRef.current && hostChatRef.current.contains(event.target)) return;
      setShowHostProductOverlay(false);
      setOverlayMode("grid");
      setOverlaySelectedProduct(null);
      setSearchTerm("");
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [showHostProductOverlay]);

  const getOrderFinancials = (order) => {
    const subtotal =
      order.subtotal_amount != null
        ? Number(order.subtotal_amount)
        : Number(order.price) || 0;

    const tax =
      order.tax_amount != null
        ? Number(order.tax_amount)
        : 0;

    const delivery =
      order.delivery_fee_amount != null
        ? Number(order.delivery_fee_amount)
        : Number(order.delivery_fee) || 0;

    const total =
      order.total_amount != null
        ? Number(order.total_amount)
        : subtotal + delivery;

    return { subtotal, tax, delivery, total };
  };
  
  // Log device classification for debugging
  useEffect(() => {
    console.log("[HostConsole] Device classification:", { isMobileDevice, isDesktopDevice, reason: deviceClassReason });
  }, []);

  // Load seller shows when Clone dialog opens
  useEffect(() => {
    if (!showCloneDialog || !currentSeller?.id) return;

    const loadSellerShows = async () => {
      try {
        const { data, error } = await supabase
          .from("shows")
          .select("id, title, status")
          .eq("seller_id", currentSeller.id)
          .order("created_at", { ascending: false });

        if (!error && data) {
          setSellerShowsForClone(data);
        }
      } catch (err) {
        console.error("Failed to load seller shows for clone:", err);
      }
    };

    loadSellerShows();
  }, [showCloneDialog, currentSeller?.id]);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MVP PHASE-1: Seller viewer count sourced from Daily SDK (UI-only)
  // This provides real-time updates without waiting for server polling.
  // Falls back to show.viewer_count when SDK count is not available.
  // ═══════════════════════════════════════════════════════════════════════════
  const [liveViewerCount, setLiveViewerCount] = useState(null);
  
  // Ref to prevent NO_SHOWID guard from re-triggering after initial mount
  const noShowIdGuardRan = useRef(false);
  const lastPaidOrdersCountRef = useRef(null);
  const seenPaidOrderIdsRef = useRef(null);

  // CRITICAL: Immediate redirect if no showId - prevent "No Show ID" error from appearing
  // Only runs ONCE on initial mount
  useEffect(() => {
    if (noShowIdGuardRan.current) return; // Already ran, don't repeat
    if (!showId) {
      noShowIdGuardRan.current = true;
      navigate(createPageUrl("SellerShows"), { replace: true });
      return;
    }
  }, []); // Empty deps = only on mount


  // ENHANCED: Load user and seller with better error handling
  useEffect(() => {
    loadUserAndSeller();
    
    // Minimal overscroll prevention
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
    
    return () => {
      document.body.style.overscrollBehavior = '';
      document.documentElement.style.overscrollBehavior = '';
    };
  }, []);

  const loadUserAndSeller = async () => {
    try {
      // Get current user from Supabase auth
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        console.error("No authenticated user found");
        setUserLoading(false);
        return;
      }
      const user = authData.user;
      setCurrentUser(user);

      // ═══════════════════════════════════════════════════════════════════════════
      // OPTION B SELLER GATING (STEP 3 REFACTOR)
      // User is seller IFF: public.users.role='seller' AND sellers.status='approved'
      // ═══════════════════════════════════════════════════════════════════════════

      // 🔐 SUPER_ADMIN BYPASS: Full system authority
      if (isSuperAdmin(user)) {
        console.log("[SellerGate] SUPER_ADMIN bypass - full access");
        const { data: seller } = await supabase
          .from("sellers")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();
        if (seller) {
          setCurrentSeller(seller);
        }
        setUserLoading(false);
        return;
      }

      // 🔐 ADMIN BYPASS: Admins can access seller routes
      if (isAdmin(user)) {
        console.log("[SellerGate] Admin bypass - access granted");
        const { data: seller } = await supabase
          .from("sellers")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();
        if (seller) {
          setCurrentSeller(seller);
        }
        setUserLoading(false);
        return;
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // SUSPENSION CHECK: Block seller routes for suspended accounts
      // ═══════════════════════════════════════════════════════════════════════════
      const { canProceed: accountActive, error: suspendedReason } = await checkAccountActiveAsync(supabase, user.id);
      if (!accountActive) {
        console.log("[SellerGate] Account suspended - redirecting to BuyerProfile");
        navigate(createPageUrl("BuyerProfile"), { 
          replace: true, 
          state: { suspended: true, reason: suspendedReason } 
        });
        return;
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // OPTION B CHECK: Query DB for role + seller status
      // ═══════════════════════════════════════════════════════════════════════════
      const sellerCheck = await requireSellerAsync(user.id);
      
      console.log("[SellerGate] HostConsole check:", {
        ok: sellerCheck.ok,
        role: sellerCheck.role,
        sellerStatus: sellerCheck.sellerStatus,
        reason: sellerCheck.reason
      });

      if (!sellerCheck.ok) {
        // NOT an approved seller - redirect based on reason
        if (sellerCheck.reason === "seller_onboarding_incomplete" || sellerCheck.reason === "seller_safety_not_agreed") {
          // Onboarding incomplete - send to BuyerProfile to continue onboarding
          console.log("[SellerGate] Onboarding incomplete - redirecting to BuyerProfile");
          navigate(createPageUrl("BuyerProfile"), { replace: true });
        } else {
          // Other failure (no seller row, not approved, etc.) - redirect to SellerShows
          console.log("[SellerGate] Not approved seller - redirecting to SellerShows");
          navigate(createPageUrl("SellerShows"), { replace: true });
        }
        return;
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // APPROVED SELLER - Load host console
      // ═══════════════════════════════════════════════════════════════════════════
      console.log("[SellerGate] Approved seller verified:", sellerCheck.sellerRow?.business_name);
      setCurrentSeller(sellerCheck.sellerRow);

    } catch (error) {
      console.error("Error loading user/seller:", error);
    } finally {
      setUserLoading(false);
    }
  };

  // CRITICAL: Reduced show polling from 5s to 15s
  const { data: show, isLoading: showLoading, error: showError } = useQuery({
    queryKey: ['show', showId],
    queryFn: async () => {
      const fetchedShow = await getShowByIdWithStats(showId);
      
      if (!fetchedShow) {
        throw new Error("Show not found");
      }
      
      // CRITICAL: If show is ended, redirect immediately
      if (fetchedShow.status === "ended" || fetchedShow.status === "cancelled") {
        navigate(createPageUrl("SellerShows"), { replace: true });
        return null;
      }
      
      return fetchedShow;
    },
    enabled: !!showId,
    refetchInterval: 15000, // REDUCED from 5s to 15s
    staleTime: 10000
  });

  const { data: showSeller, isLoading: sellerLoading } = useQuery({
    queryKey: ['show-seller', show?.seller_id],
    queryFn: async () => {
      // NORMALIZED: show.seller_id = sellers.id
      const { data: fetchedSeller, error } = await supabase
        .from("sellers")
        .select("*")
        .eq("id", show.seller_id)
        .maybeSingle();
      if (error) throw error;
      return fetchedSeller || null;
    },
    enabled: !!show?.seller_id
  });

  // LIVE CHAT INVARIANT:
  // When useSupabaseChat === true, SupabaseLiveChat MUST be
  // the only chat engine mounted. Legacy chat is forbidden in live state.
  // UI-derived boolean — DO NOT shadow the imported isShowLive() function
  const isShowLiveUI =
    show?.stream_status === 'starting' ||
    show?.stream_status === 'live' ||
    show?.is_streaming === true ||
    show?.status === 'live';
  const useSupabaseChat = isShowLiveUI;

  // Sync Daily room URL from show data when it loads/changes
  useEffect(() => {
    if (show?.daily_room_url) {
      setDailyRoomUrl(show.daily_room_url);
    }
  }, [show?.daily_room_url]);

  // Load next givey number (desktop only - used when show/seller available)
  useEffect(() => {
    async function loadNextGiveyNumber() {
      if (!show?.id || !currentSeller?.id) return;

      const { data, error } = await supabase
        .from("givey_events")
        .select("givey_number")
        .eq("show_id", show.id)
        .order("givey_number", { ascending: false })
        .limit(1);

      if (!error) {
        const next = data?.length ? data[0].givey_number + 1 : 1;
        setNextGiveyNumber(next);
      }
    }

    loadNextGiveyNumber();
  }, [show?.id, currentSeller?.id]);

  async function handleStartGivey() {
    if (!show?.id || !currentSeller?.id) return;
    setStartingGivey(true);

    const { data, error } = await supabase.rpc("start_givey_event", {
      p_show_id: show.id,
      p_seller_id: currentSeller.id,
      p_require_follow: true
    });

    if (error) {
      console.error("Failed to start givey:", error);
    }

    if (!error && data) {
      setActiveGivey(data);
      setNextGiveyNumber(data.givey_number + 1);
    }

    setStartingGivey(false);
  }

  // Access control
  useEffect(() => {
    // Only run access control after user, show, and showSeller are loaded and not in a loading state
    if (!userLoading && !showLoading && !sellerLoading && currentUser && show && showSeller) {
      // Admin bypass
      if (currentUser.role === "admin") {
        setAccessError(null);
        setDebugInfo({
          userEmail: currentUser.email,
          userRole: currentUser.role,
          currentSellerId: currentSeller?.id,
          showSellerId: show.seller_id,
          accessGranted: true,
          reason: "Admin user"
        });
        return;
      }
      
      // Seller must exist
      if (!currentSeller) {
        setAccessError("You need a seller profile to access Host Console.");
        setDebugInfo({
          userEmail: currentUser.email,
          userRole: currentUser.role,
          currentSellerId: null,
          showSellerId: show.seller_id,
          accessGranted: false,
          reason: "No seller profile"
        });
        return;
      }
      
      // Seller ID must match (shows.seller_id = sellers.id)
      const isOwner = currentSeller.id === show.seller_id;
      
      if (!isOwner) {
        setAccessError(`This show belongs to ${showSeller.business_name}. You cannot access their Host Console.`);
        setDebugInfo({
          userEmail: currentUser.email,
          userRole: currentUser.role,
          currentSeller: currentSeller.business_name,
          currentSellerId: currentSeller.id,
          showSeller: showSeller.business_name,
          showSellerId: show.seller_id,
          accessGranted: false,
          reason: "Seller ID mismatch"
        });
        return;
      }
      
      setAccessError(null);
      setDebugInfo({
        userEmail: currentUser.email,
        userRole: currentUser.role,
        currentSeller: currentSeller.business_name,
        currentSellerId: currentSeller.id,
        showSeller: showSeller.business_name,
        showSellerId: show.seller_id,
        accessGranted: true,
        reason: "Seller owns show"
      });
    }
  }, [userLoading, showLoading, sellerLoading, currentUser, currentSeller, show, showSeller]);

  // Reduced product polling from 2s to 10s
  // Now fetches from show_products joined with products
  const { data: showProductsRaw = [] } = useQuery({
    queryKey: ['show-products', showId],
    queryFn: async () => {
      const showProducts = await getShowProductsByShowId(showId);
      return showProducts;
    },
    enabled: !!show && !!showId,
    refetchInterval: 10000,
    staleTime: 5000
  });

  // Transform show_products into a products-like array for rendering
  // Each item has product fields + show_product fields (box_number, is_featured, is_givi)
  const products = showProductsRaw.map(sp => ({
    ...sp.product,
    show_product_id: sp.id,
    box_number: sp.box_number,
    is_featured: sp.is_featured,
    is_givi_in_show: sp.is_givi,
  })).filter(p => p.id); // Filter out any with missing product data

  // Reduced orders polling from 5s to 15s
  const { data: orders = [] } = useQuery({
    queryKey: ['show-orders', showId],
    enabled: !!showId,
    keepPreviousData: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id,show_id,price,delivery_fee,created_at,product_id,buyer_id,buyer:buyer_id(display_name),product:product_id(image_urls,title)'
        )
        .eq('show_id', showId)
        .in('status', ['paid', 'fulfilled', 'completed', 'ready'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    refetchInterval: 15000,
    staleTime: 10000
  });

  // Watch for GIVI winner selection
  const { data: activeGIVI } = useQuery({
    queryKey: ['host-givi-banner-trigger', showId],
    queryFn: async () => {
      if (!showId) return null;
      const events = await base44.entities.GIVIEvent.filter({
        show_id: showId,
        status: "result"
      }, '-created_date');
      return events.length > 0 ? events[0] : null;
    },
    enabled: !!showId,
    refetchInterval: 3000,
    staleTime: 2000,
    refetchOnWindowFocus: false
  });

  // Trigger banner when winner is selected
  useEffect(() => {
    if (activeGIVI?.status === "result" && activeGIVI?.winner_ids?.length > 0) {
      const bannerShownKey = `givi_banner_shown_${activeGIVI.id}`;
      if (localStorage.getItem(bannerShownKey) !== 'true') {
        setShowWinnerBanner(true);
        localStorage.setItem(bannerShownKey, 'true');
      }
    }
  }, [activeGIVI?.id, activeGIVI?.status, activeGIVI?.winner_ids]);

  // Reset seen-order refs when show changes (avoid false positives on navigation)
  useEffect(() => {
    seenPaidOrderIdsRef.current = null;
    lastPaidOrdersCountRef.current = null;
  }, [showId]);

  // Detect new paid orders by ID diff (truth-based: orders query filters status IN paid/fulfilled/completed/ready)
  useEffect(() => {
    const count = orders.length;

    // First load for this show — initialize refs only
    if (seenPaidOrderIdsRef.current === null) {
      seenPaidOrderIdsRef.current = new Set(orders.map((o) => o.id));
      lastPaidOrdersCountRef.current = count;
      return;
    }

    // Detect new paid orders
    if (count > lastPaidOrdersCountRef.current) {
      const newOrders = orders.filter(
        (o) => !seenPaidOrderIdsRef.current.has(o.id)
      );

      if (newOrders.length > 0) {
        const newestNewOrder = newOrders[0]; // safe due to explicit ordering
        setPurchaseBannerBuyerName(
          newestNewOrder?.buyer?.display_name ?? "Buyer"
        );
        setShowPurchaseBanner(true);
        setTimeout(() => setShowPurchaseBanner(false), 2000);
      }
    }

    // Update refs
    seenPaidOrderIdsRef.current = new Set(orders.map((o) => o.id));
    lastPaidOrdersCountRef.current = count;
  }, [orders]);

  const featureProductMutation = useMutation({
    mutationFn: async (product) => {
      console.log("⭐ HostConsole - Featuring product:", product.title, "ID:", product.id);
      
      // Clear any previously featured products in this show
      await clearFeaturedForShow(showId);
      
      // Feature this product in show_products
      await updateShowProductByIds(showId, product.id, { is_featured: true });
      
      // Update show's featured product reference
      await supabase
        .from("shows")
        .update({ featured_product_id: product.id })
        .eq("id", showId);
      
      console.log("✅ HostConsole - Product featured successfully");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['show', showId] });
      queryClient.invalidateQueries({ queryKey: ['show-products', showId] });
    },
  });

  const unfeatureProductMutation = useMutation({
    mutationFn: async (product) => {
      console.log("👁️ HostConsole - Unfeaturing product:", product?.id);
      
      // Clear featured flag on show_products
      await clearFeaturedForShow(showId);
      
      // Clear featured product on show
      await supabase
        .from("shows")
        .update({ featured_product_id: null })
        .eq("id", showId);
      
      console.log("✅ HostConsole - Product unfeatured successfully");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['show', showId] });
      queryClient.invalidateQueries({ queryKey: ['show-products', showId] });
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async (data) => {
      if (!currentSeller || !currentSeller.id) {
        throw new Error("Seller ID is missing - cannot create product");
      }
      if (!showId) {
        throw new Error("Show ID is missing - cannot create product");
      }
      
      // Step 1: Create the product in the products catalog
      // Extract is_givey for show_products, don't pass to products
      const { is_givey, ...catalogData } = data;
      
      // ═══════════════════════════════════════════════════════════════════════════
      // NORMALIZED: products.seller_id = sellers.id (NOT user_id)
      // ═══════════════════════════════════════════════════════════════════════════
      if (!currentSeller?.id) {
        throw new Error("Seller ID is missing from seller profile - cannot create product");
      }
      
      const productData = { 
        ...catalogData, 
        seller_id: currentSeller.id, // FIXED: Use sellers.id (not user_id)
        status: "active"
      };
      console.log("📦 HostConsole - Creating product in catalog:", productData);
      console.log("🆔 Seller ID (sellers.id):", currentSeller.id);
      
      const newProduct = await createProduct(productData);
      if (!newProduct) {
        throw new Error("Failed to create product - check Supabase logs");
      }
      console.log("✅ Product created in catalog:", newProduct.id);
      
      // Step 2: Link product to this show via show_products
      // is_givi is stored here (per-show state), not in products catalog
      // NORMALIZED: show_products.seller_id = sellers.id (NOT user_id)
      console.log("🔗 Linking product to show:", showId);
      const showProduct = await createShowProduct({
        show_id: showId,
        product_id: newProduct.id,
        seller_id: currentSeller.id, // FIXED: Use sellers.id (not user_id)
        is_featured: false,
        is_givi: is_givey === true,
      });
      
      if (!showProduct) {
        throw new Error("Failed to link product to show - check Supabase logs");
      }
      console.log("✅ Show product link created:", showProduct.id, "Box #:", showProduct.box_number);
      
      return { product: newProduct, showProduct };
    },
    onSuccess: ({ product, showProduct }) => {
      console.log("✅ HostConsole - Product created and linked successfully");
      console.log("🆔 Product ID:", product.id);
      console.log("🆔 Show Product ID:", showProduct.id);
      console.log("📦 Box Number:", showProduct.box_number);
      queryClient.invalidateQueries({ queryKey: ['show-products', showId] });
      setShowProductDialog(false);
      setShowAddProductDrawer(false);
    },
    onError: (error) => {
      console.error("❌ HostConsole - Error creating product:", error);
      alert("Error creating product: " + error.message);
    }
  });

  const updatePriceMutation = useMutation({
    mutationFn: async ({ productId, newPrice }) => {
      console.log("💰 HostConsole - Updating price for product:", productId, "to $", newPrice);
      const updated = await updateProduct(productId, {
        price: parseFloat(newPrice)
      });
      if (!updated) {
        throw new Error("Failed to update price");
      }
      console.log("✅ HostConsole - Price updated successfully");
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['show-products', showId] });
      queryClient.invalidateQueries({ queryKey: ['featured-product'] });
      setEditingPriceProductId(null);
      setNewPrice("");
    },
  });

  // NEW: Update Quantity Mutation
  const updateQuantityMutation = useMutation({
    mutationFn: async ({ productId, newQuantity }) => {
      console.log("📦 HostConsole - Updating quantity for product:", productId, "to", newQuantity);
      
      const qtyRaw = parseInt(newQuantity, 10);
      if (isNaN(qtyRaw) || qtyRaw < 0) {
        throw new Error("Quantity must be a non-negative number.");
      }
      const qty = qtyRaw <= 0 ? 0 : 1;
      
      // If quantity becomes 0, mark as sold_out
      const updates = {
        quantity: qty
      };
      
      if (qty === 0) {
        updates.status = "sold_out";
        console.log("   Marking as sold_out (quantity = 0)");
      } else if (qty > 0) {
        // If increasing from 0, restore to active unless it was explicitly locked
        const currentProduct = products.find(p => p.id === productId);
        if (currentProduct?.status === "sold_out") {
          updates.status = "active";
          console.log("   Restoring to active (quantity > 0 and was sold_out)");
        }
      }
      
      const updated = await updateProduct(productId, updates);
      if (!updated) {
        throw new Error("Failed to update quantity");
      }
      console.log("✅ HostConsole - Quantity updated successfully");
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['show-products', showId] });
      setEditingQuantityProductId(null);
      setNewQuantity("");
    },
    onError: (error) => {
      alert(`Failed to update quantity: ${error.message}`);
    }
  });

  // NEW: Remove Product from Show (removes show_product link)
  const deleteProductMutation = useMutation({
    mutationFn: async (productId) => {
      console.log("🗑️ HostConsole - Removing product from show:", productId);
      
      // Remove the show_product link (keeps product in catalog)
      const deleted = await deleteShowProductByIds(showId, productId);
      if (!deleted) {
        throw new Error("Failed to remove product from show");
      }
      
      // If this was the featured product, clear it
      if (show.featured_product_id === productId) {
        await supabase
          .from("shows")
          .update({ featured_product_id: null })
          .eq("id", showId);
      }
      
      console.log("✅ HostConsole - Product removed from show successfully");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['show-products', showId] });
      queryClient.invalidateQueries({ queryKey: ['show', showId] }); // Invalidate show to reflect featured product change
    },
    onError: (error) => {
      alert(`Failed to remove product from show: ${error.message}`);
    }
  });

  const updateDetailsMutation = useMutation({
    mutationFn: async () => {
      if (!editDetailsProductId) return null;
      const updated = await updateProduct(editDetailsProductId, {
        title: draftTitle.trim(),
        description: draftDescription ?? "",
      });
      if (!updated) throw new Error("Failed to update product details");
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["show-products", showId] });
      setIsEditDetailsOpen(false);
      setEditDetailsProductId(null);
    },
    onError: (error) => {
      alert(`Failed to update details: ${error.message}`);
    },
  });

  const openEditDetailsModal = (product) => {
    setDraftTitle(product.title || "");
    setDraftDescription(product.description || "");
    setEditDetailsProductId(product.id);
    setIsEditDetailsOpen(true);
  };

  const handleStreamStart = (stream) => {
    console.log("📡 HostConsole - Stream started for ShowID:", showId);
  };

  const handleStreamStop = () => {
    console.log("⏹️ HostConsole - Stream stopped for ShowID:", showId);
  };

  // Check if broadcasting is allowed based on show status
  const isBroadcastBlocked = show?.status === "ended" || show?.status === "cancelled";
  
  // Check if show is already live (one-way: cannot revert)
  // Include local room state so UI is correct during refetch race after startDailyBroadcast
  const isAlreadyLive = show?.stream_status === "live" || (!!dailyRoomUrl && !!dailyToken);

  // ═══════════════════════════════════════════════════════════════════════════
  // DAILY IN-APP CAMERA BROADCAST
  // ═══════════════════════════════════════════════════════════════════════════
  const startDailyBroadcast = async () => {
    if (!show?.id) return;
    
    setDailyLoading(true);
    setDailyError(null);
    
    try {
      // ═══════════════════════════════════════════════════════════════════════════
      // TEMP DEBUG: Log show state BEFORE daily-create-room call
      // ═══════════════════════════════════════════════════════════════════════════
      console.log("[DAILY-DEBUG] PRE-CALL STATE:", {
        show_id: show?.id,
        streaming_provider: show?.streaming_provider,
        status: show?.status,
        stream_status: show?.stream_status,
        user_id: currentUser?.id,
        timestamp: new Date().toISOString()
      });
      
      // Step 1: Call Daily room creation Edge Function FIRST
      // (daily-create-room writes daily_room_name and daily_room_url to DB)
      const { data: resp, error: fnError } = await supabase.functions.invoke("daily-create-room", {
        body: { show_id: show.id }
      });
      
      // TEMP DEBUG: Log response from daily-create-room
      console.log("[DAILY-DEBUG] POST-CALL RESPONSE:", {
        resp,
        fnError,
        fnError_message: fnError?.message,
        fnError_context: fnError?.context,
        resp_error: resp?.error,
        timestamp: new Date().toISOString()
      });
      
      if (fnError) {
        throw new Error(fnError.message || "Failed to create Daily room");
      }
      
      if (resp?.error) {
        throw new Error(resp.error);
      }
      
      // Step 2: Verify room was created successfully
      if (!resp?.room_url || !resp?.room_name) {
        throw new Error("Daily room creation returned invalid response");
      }
      
      // Store room URL and token locally
      setDailyRoomUrl(resp.room_url);
      setDailyToken(resp.token);
      
      // Step 3: ONLY NOW mark show as daily + live (strict invariant)
      // Room is guaranteed to exist at this point
      const { error: updateError } = await supabase
        .from("shows")
        .update({
          streaming_provider: "daily",
          status: "live",
          stream_status: "live",
          started_at: new Date().toISOString()
        })
        .eq("id", show.id);
      
      if (updateError) {
        console.error("Failed to update show status:", updateError);
        throw new Error("Room created but failed to go live. Please try again.");
      }
      
      // Update local state
      setIsBroadcasting(true);
      
      // Invalidate queries so other pages see the update
      queryClient.invalidateQueries({ queryKey: ['seller-shows'] });
      queryClient.invalidateQueries({ queryKey: ['all-shows'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-live-shows'] });
      queryClient.invalidateQueries({ queryKey: ['show', showId] });
      
    } catch (err) {
      console.error("Daily broadcast error:", err);
      setDailyError(err?.message || "Failed to start broadcast");
    } finally {
      setDailyLoading(false);
    }
  };

  const handleSaveProduct = (productData) => {
    createProductMutation.mutate(productData);
  };

  const handleCloneProducts = async () => {
    if (!targetShowId || !currentSeller?.id || !showId) return;
    if (targetShowId === showId) return;

    try {
      setIsCloning(true);

      const remainingProducts = products.filter(
        p => p.quantity > 0 && p.status === "active"
      );

      if (remainingProducts.length === 0) {
        setShowCloneDialog(false);
        setTargetShowId("");
        setIsCloning(false);
        return;
      }

      let successCount = 0;

      for (const sourceProduct of remainingProducts) {
        if (!Array.isArray(sourceProduct.image_urls)) {
          console.error("[AUDIT] HostConsole.handleCloneProducts: sourceProduct.image_urls is not an array", {
            route: "HostConsole",
            productId: sourceProduct.id,
            typeofValue: typeof sourceProduct.image_urls,
            value: sourceProduct.image_urls,
            stack: new Error().stack,
          });
        }
        // 1️⃣ Create new product
        const newProduct = await createProduct({
          seller_id: currentSeller.id,
          title: sourceProduct.title,
          description: sourceProduct.description ?? null,
          price: sourceProduct.price,
          original_price: sourceProduct.original_price ?? null,
          quantity: sourceProduct.quantity,
          image_urls: sourceProduct.image_urls ?? [],
          category: sourceProduct.category ?? null,
          givi_type: sourceProduct.givi_type ?? null,
          status: "active",
        });

        if (!newProduct) continue;

        // 2️⃣ Link to target show
        await createShowProduct({
          show_id: targetShowId,
          product_id: newProduct.id,
          seller_id: currentSeller.id,
          is_featured: false,
          is_givi: false,
        });

        successCount++;
      }

      // 3️⃣ Refresh ONLY target show products
      queryClient.invalidateQueries({
        queryKey: ['show-products', targetShowId],
      });

      setShowCloneDialog(false);
      setTargetShowId("");

    } catch (err) {
      console.error("Clone error:", err);
    } finally {
      setIsCloning(false);
    }
  };

  const handleStartEditPrice = (product) => {
    setEditingPriceProductId(product.id);
    setNewPrice(product.price?.toString() || "");
  };

  const handleSavePrice = (productId) => {
    const price = parseFloat(newPrice);
    if (isNaN(price) || price <= 0) {
      alert("Please enter a valid price");
      return;
    }
    updatePriceMutation.mutate({ productId, newPrice: price });
  };

  const handleCancelEditPrice = () => {
    setEditingPriceProductId(null);
    setNewPrice("");
  };

  // NEW: Quantity Edit Handlers
  const handleStartEditQuantity = (product) => {
    setEditingQuantityProductId(product.id);
    setNewQuantity(product.quantity?.toString() || "0");
  };

  const handleSaveQuantity = (productId) => {
    const qty = parseInt(newQuantity);
    if (isNaN(qty) || qty < 0) {
      alert("Please enter a valid quantity (0 or more)");
      return;
    }
    updateQuantityMutation.mutate({ productId, newQuantity: qty });
  };

  const handleCancelEditQuantity = () => {
    setEditingQuantityProductId(null);
    setNewQuantity("");
  };

  // NEW: Delete Handler with Confirmation
  const handleDeleteProduct = (product) => {
    const confirmMessage = `Are you sure you want to remove "${product.title}" from this show?\n\nThis will:\n• Hide it from viewers\n• Set its quantity to 0\n• Mark it as sold within this show context`;
    
    if (window.confirm(confirmMessage)) {
      deleteProductMutation.mutate(product.id);
    }
  };

  // CRITICAL: End Show with proper navigation history reset
  // CANONICAL END: Sets both status and stream_status to "ended"
  const endShowMutation = useMutation({
    mutationFn: async () => {
      console.log("⏹️ HostConsole - Ending show:", showId);
      
      // CRITICAL: Stop Daily broadcast FIRST to release camera/mic immediately
      if (window.__stopDailyHost) {
        try {
          await window.__stopDailyHost();
          console.log("✅ Daily broadcast stopped - camera released");
        } catch (e) {
          console.warn("[HostConsole] stopDailyHost failed", e);
        }
      }
      
      // CRITICAL: Change URL IMMEDIATELY before making the API call
      // This prevents refresh from reloading the dead showId
      const showsUrl = createPageUrl("SellerShows");
      window.history.replaceState({}, '', showsUrl);
      console.log("✅ URL immediately changed to prevent refresh loading dead showId");
      
      // Build payload - only set ended_at if not already set (avoid overwriting)
      const payload = {
        status: "ended",
        stream_status: "ended",
        ...(show?.ended_at ? {} : { ended_at: new Date().toISOString() })
      };
      
      console.log("📝 End Show payload:", payload);
      
      const { data, error } = await supabase
        .from("shows")
        .update(payload)
        .eq("id", showId)
        .select()
        .maybeSingle();
      
      if (error) {
        console.error("[EndShow] supabase update failed", error);
        throw error;
      }
      
      if (!data) {
        console.warn("[EndShow] update returned no row");
      }
      
      console.log("✅ Show ended - status and stream_status now 'ended'");
      return data;
    },
    onSuccess: () => {
      console.log("✅ Show ended successfully - completing navigation");
      
      // Invalidate all queries
      queryClient.invalidateQueries({ queryKey: ['seller-shows'] });
      queryClient.invalidateQueries({ queryKey: ['all-shows'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-live-shows'] });
      
      // Navigate using router (preserves React state)
      navigate(createPageUrl("SellerShows"), { replace: true });
    },
    onError: (error) => {
      console.error("❌ Error ending show:", error);
      alert(`Failed to end show: ${error.message}`);
    }
  });

  if (!showId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 sm:p-8 text-center">
            <XCircle className="w-12 h-12 sm:w-16 sm:h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-white mb-2">No Show ID</h3>
            <p className="text-sm sm:text-base text-white/70 mb-4">
              No show ID was provided in the URL.
            </p>
            <div className="bg-white/10 rounded p-2 mb-4 text-left">
              <p className="text-xs text-white/70 font-mono">URL: {window.location.href}</p>
            </div>
            <Button onClick={() => navigate(createPageUrl("SellerShows"))} className="w-full sm:w-auto">
              Back to Shows
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (userLoading || showLoading || sellerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-base sm:text-lg">Loading Host Console...</p>
          <p className="text-white/50 text-xs sm:text-sm mt-2">Show ID: {showId}</p>
          {userLoading && <p className="text-white/50 text-xs mt-1">Loading user...</p>}
          {showLoading && <p className="text-white/50 text-xs mt-1">Loading show...</p>}
          {sellerLoading && <p className="text-white/50 text-xs mt-1">Loading seller...</p>}
        </div>
      </div>
    );
  }

  if (showError || !show) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 sm:p-8 text-center">
            <XCircle className="w-12 h-12 sm:w-16 sm:h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Show Not Found</h3>
            <p className="text-sm sm:text-base text-white/70 mb-4">
              Could not load show with ID: {showId}
            </p>
            <div className="bg-white/10 rounded p-2 mb-4 text-left">
              <p className="text-xs text-white/70 font-mono">Error: {showError?.message || "Unknown error"}</p>
            </div>
            <Button onClick={() => navigate(createPageUrl("SellerShows"))} className="w-full sm:w-auto">
              Back to Shows
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 p-4">
        <Card className="max-w-2xl w-full border-2 border-red-500">
          <CardContent className="p-6 sm:p-8">
            <div className="text-center mb-6">
              <AlertTriangle className="w-12 h-12 sm:w-16 sm:h-16 text-red-500 mx-auto mb-4" />
              <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Access Denied</h3>
              <p className="text-sm sm:text-base text-white/70 mb-4">{accessError}</p>
            </div>

            {/* Debug Info */}
            {debugInfo && (
              <div className="bg-black/30 rounded-lg p-4 mb-4 text-left space-y-2">
                <p className="text-white font-semibold text-sm mb-2">Debug Information:</p>
                <div className="space-y-1 text-xs font-mono">
                  <p className="text-white/70">
                    <strong className="text-white">User:</strong> {debugInfo.userEmail}
                  </p>
                  <p className="text-white/70">
                    <strong className="text-white">Role:</strong> {debugInfo.userRole}
                  </p>
                  {debugInfo.currentSeller && (
                    <>
                      <p className="text-white/70">
                        <strong className="text-white">Your Seller:</strong> {debugInfo.currentSeller}
                      </p>
                      <p className="text-white/70">
                        <strong className="text-white">Your Seller ID:</strong> {debugInfo.currentSellerId}
                      </p>
                    </>
                  )}
                  {debugInfo.showSeller && (
                    <>
                      <p className="text-white/70">
                        <strong className="text-white">Show Owner:</strong> {debugInfo.showSeller}
                      </p>
                      <p className="text-white/70">
                        <strong className="text-white">Show Seller ID:</strong> {debugInfo.showSellerId}
                      </p>
                    </>
                  )}
                  {show && (
                    <>
                      <p className="text-white/70">
                        <strong className="text-white">Show Title:</strong> {show.title}
                      </p>
                      <p className="text-white/70">
                        <strong className="text-white">Show ID:</strong> {show.id}
                      </p>
                    </>
                  )}
                  <p className={`${debugInfo.accessGranted ? 'text-green-400' : 'text-red-400'} font-bold`}>
                    <strong>Status:</strong> {debugInfo.accessGranted ? '✅ GRANTED' : '❌ DENIED'}
                  </p>
                  <p className="text-white/70">
                    <strong className="text-white">Reason:</strong> {debugInfo.reason}
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button 
                onClick={() => navigate(createPageUrl("SellerShows"))} 
                className="flex-1"
                variant="outline"
              >
                Go to Your Shows
              </Button>
              <Button 
                onClick={() => navigate(createPageUrl("SellerDashboard"))} 
                className="flex-1"
              >
                Seller Dashboard
              </Button>
            </div>

            {/* Help Text */}
            <div className="mt-6 p-4 bg-blue-500/20 rounded-lg border border-blue-500/30">
              <p className="text-blue-100 text-xs">
                <strong>Need help?</strong> If you believe this is an error, please check:
              </p>
              <ul className="text-blue-100/80 text-xs mt-2 space-y-1 list-disc list-inside">
                <li>You're logged in with the correct account</li>
                <li>You have an approved seller profile</li>
                <li>You're accessing a show you created</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // CRITICAL NULL CHECK: Don't render main content until we have currentSeller
  // This check serves as an additional safeguard if, for any reason,
  // currentSeller is null despite passing initial loading and accessError checks.
  if (!currentSeller) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 p-4">
        <Card className="max-w-md w-full border-2 border-orange-500">
          <CardContent className="p-6 sm:p-8 text-center">
            <AlertTriangle className="w-12 h-12 sm:w-16 sm:h-16 text-orange-500 mx-auto mb-4" />
            <h3 className="text-base sm:text-lg font-semibold text-white mb-2">No Seller Profile</h3>
            <p className="text-sm sm:text-base text-white/70 mb-4">
              You need a seller profile to access the Host Console.
            </p>
            <Button 
              onClick={() => navigate(createPageUrl("SellerDashboard"))} 
              className="w-full sm:w-auto"
            >
              Create Seller Profile
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Find featured product - check is_featured flag from show_products first, then fall back to show.featured_product_id
  const featuredProduct = products.find(p => p.is_featured) || products.find(p => p.id === show.featured_product_id);
  const filteredProducts = products.filter(p => {
    const searchLower = searchTerm.trim().toLowerCase();

    if (!searchLower) return true;

    const isNumeric = /^\d+$/.test(searchLower);

    if (isNumeric) {
      const boxNumber = p.box_number?.toString() || "";
      return boxNumber.includes(searchLower);
    }

    const title = p.title?.toLowerCase() || "";
    const description = p.description?.toLowerCase() || "";

    return (
      title.includes(searchLower) ||
      description.includes(searchLower)
    );
  });

  // MVP PHASE-1: Seller viewer count sourced from Daily SDK (UI-only)
  // Prefers live SDK count, falls back to server-polled value
  const stats = {
    viewers: liveViewerCount ?? show.viewer_count ?? 0,
    sales: orders.length,
    revenue: orders.reduce((sum, o) => sum + (o.price || 0), 0)
  };

  return (
    <div style={{ 
      overscrollBehavior: 'none',
      touchAction: 'pan-y'
    }}>
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
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none flex flex-col items-center justify-center px-8 py-4 rounded-xl bg-black/60 backdrop-blur-md border border-white/20 shadow-[0_0_24px_rgba(234,179,8,0.25)] animate-in fade-in-0 zoom-in-95 duration-300">
          <span className="text-xl font-bold text-amber-400">
            {purchaseBannerBuyerName ?? "Buyer"}
          </span>
          <span className="text-sm text-white/80 font-medium">
            Purchase made
          </span>
        </div>
      )}

      {/* GIVI Drawer - MOBILE ONLY - Gated by feature flag + device class */}
        {FEATURES.givi && currentSeller && showGiviDrawer && isMobileDevice && (
          <BottomDrawer
            isOpen={showGiviDrawer}
            onClose={() => {
              setShowGiviDrawer(false);
              setGiviDrawerMode("console");
            }}
            title={giviDrawerMode === "form" ? "Create New GIVI Event" : "GIVI Control Console"}
            height={giviDrawerMode === "form" ? "70vh" : "50vh"}
          >
            {giviDrawerMode === "form" ? (
              <GIVIHostPanel 
                show={show} 
                seller={currentSeller}
                formOnly={true}
                onFormClose={() => {
                  setGiviDrawerMode("console");
                }}
                externalDrawerOpen={showGiviDrawer}
                onCloseExternalDrawer={() => {
                  setShowGiviDrawer(false);
                  setGiviDrawerMode("console");
                }}
              />
            ) : (
              <GIVIHostPanel 
                show={show} 
                seller={currentSeller}
                onAddNewGivi={() => setGiviDrawerMode("form")}
              />
            )}
          </BottomDrawer>
        )}

        {/* GIVI Dialog - DESKTOP ONLY - Gated by feature flag + device class */}
        {FEATURES.givi && currentSeller && showGiviDrawer && isDesktopDevice && (
          <Dialog open={true} onOpenChange={(open) => {
            if (!open) {
              setShowGiviDrawer(false);
              setGiviDrawerMode("console");
            }
          }}>
            <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
              <div className="flex flex-col h-full max-h-[90vh]">
                <DialogHeader className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
                  <DialogTitle className="text-gray-900 text-xl font-bold">
                    GIVI Control Console
                  </DialogTitle>
                </DialogHeader>
                <div className="overflow-y-auto flex-1 px-6 py-4">
                  {giviDrawerMode === "form" ? (
                    <GIVIHostPanel 
                      show={show} 
                      seller={currentSeller}
                      formOnly={true}
                      onFormClose={() => {
                        setGiviDrawerMode("console");
                      }}
                    />
                  ) : (
                    <GIVIHostPanel 
                      show={show} 
                      seller={currentSeller}
                      onAddNewGivi={() => setGiviDrawerMode("form")}
                    />
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Go Live Confirmation Dialog */}
        <Dialog open={showConfirmGoLive} onOpenChange={setShowConfirmGoLive}>
          <DialogContent className="max-w-sm bg-white">
            <DialogHeader>
              <DialogTitle className="text-gray-900 text-lg">
                Go Live?
              </DialogTitle>
            </DialogHeader>

            <div className="text-sm text-gray-600 mt-2">
              Are you sure you want to start this live broadcast?
              This will make the show visible to buyers.
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => setShowConfirmGoLive(false)}
              >
                Cancel
              </Button>

              <Button
                onClick={async () => {
                  setShowConfirmGoLive(false);
                  await startDailyBroadcast();
                }}
                disabled={dailyLoading}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {dailyLoading ? "Starting..." : "Yes, Go Live"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showConfirmEndShow} onOpenChange={setShowConfirmEndShow}>
          <DialogContent className="max-w-sm bg-white">
            <DialogHeader>
              <DialogTitle className="text-gray-900 text-lg">
                End Show?
              </DialogTitle>
            </DialogHeader>

            <div className="text-sm text-gray-600 mt-2">
              Are you sure you want to end this live show?
              This action cannot be undone.
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => setShowConfirmEndShow(false)}
              >
                Cancel
              </Button>

              <Button
                onClick={async () => {
                  setShowConfirmEndShow(false);
                  await endShowMutation.mutateAsync();
                }}
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={endShowMutation.isPending}
              >
                {endShowMutation.isPending ? "Ending..." : "Yes, End Show"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* MOBILE: Fullscreen Video with Overlay Chat */}
        {/* CONDITIONAL CONTAINER: Only mount mobile layout on mobile devices.
            Device-locked classification prevents remount on rotation. */}
        {isMobileDevice && (
        <div className="fixed inset-0 bg-black" style={{ zIndex: 1 }} onClick={() => { if (showHostProductOverlay) { setShowHostProductOverlay(false); setOverlayMode("grid"); setOverlaySelectedProduct(null); setSearchTerm(""); } }}>
          {/* Back Arrow - Top Left */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(createPageUrl("SellerShows"))}
            className="fixed top-4 left-4 z-[250] bg-black/50 backdrop-blur-md text-white hover:bg-black/70 h-10 w-10 rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          
          {/* Mobile Metrics Header */}
          <div className="fixed top-4 left-0 right-0 z-[250] px-16 flex items-start justify-between pointer-events-none">
            <div className="bg-black/50 backdrop-blur-md rounded-lg px-4 py-2 text-left pointer-events-auto">
              <p className="text-[10px] text-white/70 uppercase tracking-wide">Revenue</p>
              <p className="text-xl font-bold text-white whitespace-nowrap">
                ${stats.revenue.toFixed(2)}
              </p>
            </div>

            <div className="bg-black/50 backdrop-blur-md rounded-lg px-4 py-2 text-right pointer-events-auto">
              <p className="text-[10px] text-white/70 uppercase tracking-wide">Viewers</p>
              <p className="text-xl font-bold text-white whitespace-nowrap">
                {stats.viewers}
              </p>
            </div>
          </div>
          
          {/* Video Background - Daily SDK Broadcaster or Placeholder */}
          {/* CRITICAL: Only mount DailyBroadcaster on mobile devices to prevent duplicate Daily instances */}
          {isMobileDevice && dailyRoomUrl && dailyToken ? (
            <DailyBroadcaster 
              roomUrl={dailyRoomUrl} 
              token={dailyToken} 
              onViewerCountChange={setLiveViewerCount}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
              {show.thumbnail_url && (
                <img 
                  src={show.thumbnail_url} 
                  alt={show.title}
                  className="absolute inset-0 w-full h-full object-cover opacity-50"
                />
              )}
              <div className="relative z-10 text-center p-6">
                <Video className="w-16 h-16 text-white/50 mx-auto mb-4" />
                <p className="text-white/70 text-lg mb-2">
                  {isAlreadyLive ? "🔴 LIVE — In-App Camera" : "Ready to Go Live"}
                </p>
                <p className="text-white/50 text-sm">
                  {isAlreadyLive ? "Your broadcast is active" : "Tap Go Live to start your camera stream"}
                </p>
              </div>
            </div>
          )}
          
          {/* Chat Overlay - Left Side, Transparent */}
          {/* CONDITIONAL MOUNT: Only mount mobile chat on mobile devices.
              Device-locked classification prevents double polling and freeze
              under load by ensuring only one chat instance mounts at any time. */}
          {isMobileDevice && (
            <div ref={hostChatRef} style={{ zIndex: 100 }}>
              {console.log("[HOSTCONSOLE AUTH DEBUG][MOBILE]", {
                currentUserId: currentUser?.id ?? null,
                currentUserRole: currentUser?.role ?? null
              })}
              {useSupabaseChat ? (
                <SupabaseLiveChat
                  showId={showId}
                  sellerId={currentSeller?.id}
                  isSeller={true}
                  isOverlay={true}
                  user={currentUser}
                />
              ) : (
                <LiveChatOverlay 
                  showId={showId} 
                  isSeller={true}
                  sellerId={currentSeller?.id}
                />
              )}
            </div>
          )}
          
          {/* Seller Product Detail Card (Overlay) */}
          {!showHostProductOverlay && selectedProduct && (
            <SellerProductDetailCard 
              product={selectedProduct}
              showId={showId}
              isFeatured={selectedProduct.is_featured || selectedProduct.id === show.featured_product_id}
              onClose={() => setSelectedProduct(null)}
              onPushToLive={(product) => {
                const isFeatured = product.is_featured || product.id === show.featured_product_id;
                
                // Only active products can be featured; any status can be unfeatured
                if (isFeatured) {
                  unfeatureProductMutation.mutate();
                } else if (product.status === "active") {
                  featureProductMutation.mutate(product);
                } else {
                  console.warn("[HostConsole] Cannot feature product - status is not active:", product.status);
                }
              }}
            />
          )}

          {/* Bottom Controls (Product Bubbles + Toggle Area) */}
          {!isMobileDevice && (
            <HostBottomControls
              mode={bottomBarMode}
              showId={showId}
              sellerId={currentSeller?.id}
              products={filteredProducts}
              featuredProductId={show.featured_product_id}
              onFeatureProduct={(product) => setSelectedProduct(product)}
              onAddProduct={() => setShowAddProductDrawer(true)}
              onSearch={setSearchTerm}
              searchTerm={searchTerm}
              useSupabaseChat={useSupabaseChat}
              user={currentUser}
            />
          )}
          
          {/* Host Controls - Top Right Icons */}
          <div 
            className="fixed top-16 right-3 flex flex-col gap-3 z-[200]"
          >
            {/* GIVI Button (Icon Only) - Gated by feature flag */}
            {FEATURES.givi && (
              <Button
                onClick={() => {
                  setShowGiviDrawer(true);
                  setGiviDrawerMode("console");
                }}
                size="icon"
                className="bg-gradient-to-r from-purple-600 to-blue-600 h-10 w-10 rounded-full shadow-lg border border-white/20"
              >
                <Sparkles className="w-5 h-5 text-white" />
              </Button>
            )}

            {/* Fulfillment Button (Icon Only) — DISABLED: never shown on mobile */}
            {false && (
              <Button
                onClick={() => setShowFulfillmentDrawer(true)}
                size="icon"
                className="bg-gradient-to-r from-orange-600 to-amber-600 h-10 w-10 rounded-full shadow-lg border border-white/20"
              >
                <ClipboardCheck className="w-5 h-5 text-white" />
              </Button>
            )}

                {/* Broadcast Button (Icon Only) - ONE-WAY: Shows LIVE or Start */}
                {isAlreadyLive ? (
                  <Button
                    onClick={() => {
                      if (isAlreadyLive) {
                        setShowConfirmEndShow(true);
                      } else {
                        setShowConfirmGoLive(true);
                      }
                    }}
                    size="icon"
                    className="h-10 w-10 rounded-full shadow-lg border border-red-500 bg-red-600 flex items-center justify-center p-0"
                  >
                    <Radio className="w-5 h-5 text-white animate-pulse" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      if (isAlreadyLive) {
                        setShowConfirmEndShow(true);
                      } else {
                        setShowConfirmGoLive(true);
                      }
                    }}
                    size="icon"
                    disabled={isBroadcastBlocked || dailyLoading}
                    className={`h-10 w-10 rounded-full shadow-lg border border-white/20 ${
                      isBroadcastBlocked || dailyLoading
                        ? "bg-gray-600 cursor-not-allowed opacity-50"
                        : "bg-gradient-to-r from-green-600 to-emerald-600"
                    }`}
                    title={isBroadcastBlocked ? `Cannot broadcast - show is ${show?.status}` : "Go Live"}
                  >
                    <Radio className="w-5 h-5 text-white" />
                  </Button>
                )}
          </div>

          {isMobileDevice && (
            <div
              className="fixed right-4 z-[250] flex flex-col items-center"
              style={{ bottom: isAndroid ? "32vh" : "30vh" }}
            >
              <span className="text-xs font-extrabold tracking-wide text-white mb-1">
                PRODUCTS
              </span>
              <button
                onClick={() => setShowHostProductOverlay(true)}
                className="w-12 h-12 rounded-xl relative overflow-hidden
                           bg-white hover:bg-gray-100 border border-gray-200 shadow-lg
                           active:scale-95 transition-all duration-200"
              >
                <div className="relative z-10 flex items-center justify-center h-full">
                  <Package className="w-8 h-8 text-gray-700" />
                </div>
              </button>
            </div>
          )}

          {showHostProductOverlay && (
              <div
                ref={hostOverlayPanelRef}
                className="fixed left-0 right-0 bottom-0 z-[261] bg-white rounded-t-2xl shadow-xl"
                style={{ height: "45vh" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="h-full flex flex-col">

                  {/* Header: Search + Add */}
                  <div className="p-3 border-b border-gray-200 flex gap-2 items-center">
                    <div className="relative flex-1">
                      <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search products..."
                      />
                    </div>

                    <Button
                      onClick={() => setShowAddProductDrawer(true)}
                      className="bg-green-600 hover:bg-green-700 text-white font-bold"
                    >
                      Add
                    </Button>
                  </div>

                  {/* Body: Product Bubbles or Detail */}
                  <div className="flex-1 overflow-y-auto p-3">

                    {overlayMode === "grid" && (
                      <HostBottomControls
                        mode={"products"}
                        showId={showId}
                        sellerId={currentSeller?.id}
                        products={filteredProducts}
                        featuredProductId={show.featured_product_id}
                        onFeatureProduct={(product) => {
                          setOverlaySelectedProduct(product);
                          setOverlayMode("detail");
                        }}
                        onAddProduct={() => setShowAddProductDrawer(true)}
                        onSearch={setSearchTerm}
                        searchTerm={searchTerm}
                        useSupabaseChat={useSupabaseChat}
                        user={currentUser}
                        embedded={true}
                      />
                    )}

                    {overlayMode === "detail" && overlaySelectedProduct && (
                      <div className="flex flex-col h-full pt-1">
                        <div className="flex items-center">
                          <Button
                            variant="ghost"
                            className="px-0 py-1"
                            onClick={() => {
                              setOverlayMode("grid");
                              setOverlaySelectedProduct(null);
                            }}
                          >
                            ← Back
                          </Button>
                        </div>

                        <div className="mt-1">
                          <SellerProductDetailContent
                            product={overlaySelectedProduct}
                            showId={showId}
                            onClose={() => {
                              setOverlayMode("grid");
                              setOverlaySelectedProduct(null);
                            }}
                            onPushToLive={(product) => {
                              const isFeatured = product.is_featured || product.id === show.featured_product_id;

                              if (isFeatured) {
                                unfeatureProductMutation.mutate();
                              } else if (product.status === "active") {
                                featureProductMutation.mutate(product);
                              }
                            }}
                            isFeatured={
                              overlaySelectedProduct.is_featured ||
                              overlaySelectedProduct.id === show.featured_product_id
                            }
                          />
                        </div>
                      </div>
                    )}

                  </div>

                </div>
              </div>
          )}
        </div>
        )}

        {/* DESKTOP: 3-Column Whatnot-Style Layout */}
        {/* CONDITIONAL CONTAINER: Only mount desktop layout on desktop devices.
            Device-locked classification prevents remount on rotation. */}
        {isDesktopDevice && (
        <div className="grid grid-cols-[25%_50%_25%] h-screen bg-black fixed inset-0" style={{ top: 0, paddingTop: 0 }}>
          {/* LEFT COLUMN - Host Tools & Products */}
          <div className="bg-gray-900 overflow-y-auto p-4 space-y-4">
            {/* Host Control Buttons - GATED: Broadcast disabled if show ended/cancelled */}
            <div className="space-y-2">
              {/* Broadcast blocked warning */}
              {isBroadcastBlocked && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-center">
                  <AlertTriangle className="w-5 h-5 text-red-400 mx-auto mb-1" />
                  <p className="text-red-300 text-sm font-medium">
                    Show is {show?.status} - Broadcasting not allowed
                  </p>
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════════════════════════ */}
              {/* DAILY IN-APP CAMERA BROADCAST */}
              {/* ═══════════════════════════════════════════════════════════════════════════ */}
              
              {/* Daily Error Display */}
              {dailyError && (
                <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3">
                  <p className="text-red-400 text-sm">{dailyError}</p>
                </div>
              )}
              
              {/* ONE-WAY BROADCAST: Shows "LIVE" status or "Go Live" button */}
              {isAlreadyLive ? (
                <div className="bg-red-600/20 border border-red-500 rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Radio className="w-4 h-4 text-red-400 animate-pulse" />
                    <span className="text-red-400 font-bold">🔴 LIVE — In-App Camera</span>
                  </div>
                  <p className="text-gray-400 text-xs">
                    Your broadcast is active. End Show when you're done.
                  </p>
                </div>
              ) : (
                <Button
                  onClick={() => setShowConfirmGoLive(true)}
                  disabled={isBroadcastBlocked || dailyLoading}
                  className={`w-full font-bold py-3 ${
                    isBroadcastBlocked || dailyLoading
                      ? 'bg-gray-600 cursor-not-allowed opacity-50'
                      : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700'
                  } text-white`}
                >
                  <Radio className="w-4 h-4 mr-2" />
                  {dailyLoading ? "Starting Camera…" : "Go Live"}
                </Button>
              )}
              
              <Button
                onClick={() => {
                  if (window.confirm('Are you sure you want to end this show? This action cannot be undone.')) {
                    endShowMutation.mutate();
                  }
                }}
                variant="outline"
                className="w-full border-2 border-red-500 text-red-600 hover:bg-red-50 font-bold py-3"
                disabled={endShowMutation.isPending}
              >
                {endShowMutation.isPending ? 'Ending Show...' : 'End Show'}
              </Button>

              {isDesktopDevice && show?.stream_status === "live" && currentSeller?.id && (
                <div className="mt-4 border border-purple-500 rounded-xl p-4 bg-purple-50">
                  <p className="text-sm font-semibold text-purple-700">
                    {activeGivey
                      ? `Givey #${activeGivey.givey_number} is Active`
                      : `Next Givey: #${nextGiveyNumber ?? "-"}`}
                  </p>

                  {!activeGivey && (
                    <Button
                      onClick={handleStartGivey}
                      disabled={startingGivey || !nextGiveyNumber}
                      className="mt-2 w-full bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      {startingGivey ? "Starting..." : "Start Givey"}
                    </Button>
                  )}
                </div>
              )}
              
              {FEATURES.givi && (
                <Button
                  onClick={() => {
                    setShowGiviDrawer(true);
                    setGiviDrawerMode("console");
                  }}
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-3"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  GIVI
                </Button>
              )}
              
              <Button
                onClick={() => setShowProductDialog(true)}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Product
              </Button>
              
              <Button
                onClick={() => setShowRecentOrders(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3"
              >
                <Package className="w-4 h-4 mr-2" />
                Recent Orders
              </Button>
              
              <Button
                onClick={() => setShowCloneDialog(true)}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3"
              >
                Clone Remaining Products
              </Button>
              
              {/* HIDDEN: Pickup Verification moved to SellerOrders - UI guard only, logic preserved */}
              {false && (
                <Button
                  onClick={() => setShowFulfillmentDialog(true)}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3"
                >
                  <ClipboardCheck className="w-4 h-4 mr-2" />
                  Pickup Verification
                </Button>
              )}
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search products..."
                className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>

            {/* Products List */}
            <h2 className="text-white font-bold text-lg">Products</h2>
            <div className="space-y-3">
              {filteredProducts.map((product) => {
                const isLocked = product.status === "locked" || product.status === "sold_out";
                const isFeatured = product.is_featured || product.id === show.featured_product_id;
                const isEditingQty = editingQuantityProductId === product.id;
                const isEditingPrice = editingPriceProductId === product.id;
                
                return (
                  <div
                    key={product.id}
                    onClick={() => {
                      // Only active products can be featured; any status can be unfeatured
                      if (isFeatured) {
                        unfeatureProductMutation.mutate();
                      } else if (product.status === "active") {
                        featureProductMutation.mutate(product);
                      } else {
                        console.warn("[HostConsole] Cannot feature product - status is not active:", product.status);
                      }
                    }}
                    className={`cursor-pointer rounded-lg p-3 transition-all ${
                      isFeatured
                        ? 'bg-yellow-500/20 border-2 border-yellow-500'
                        : 'bg-gray-800 hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className="relative w-20 h-20 flex-shrink-0">
                        {Array.isArray(product.image_urls) && product.image_urls.length > 0 ? (
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
                          <div className={`absolute -top-1 -left-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                            isFeatured ? 'bg-yellow-400 text-gray-900' : 'bg-purple-600 text-white'
                          }`}>
                            {product.box_number}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-1">
                          <h3 className="text-white font-semibold text-sm line-clamp-2 flex-1">{product.title}</h3>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 flex-shrink-0 text-white/70 hover:text-white"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDetailsModal(product);
                            }}
                            title="Edit Details"
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                        </div>
                        {product.category && (
                          <p className="text-white/50 text-xs mt-0.5">{product.category}</p>
                        )}
                        
                        <div className="flex items-center gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
                          {isEditingPrice ? (
                            <div className="flex items-center gap-1">
                              <span className="text-white/80 text-xs">$</span>
                              <Input
                                type="number"
                                step="0.01"
                                value={newPrice}
                                onChange={(e) => setNewPrice(e.target.value)}
                                className="h-6 w-16 text-xs text-white bg-transparent caret-white"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSavePrice(product.id);
                                  if (e.key === 'Escape') handleCancelEditPrice();
                                }}
                              />
                              <Button size="icon" variant="ghost" className="h-5 w-5 text-green-400" onClick={() => handleSavePrice(product.id)}>
                                <Check className="w-3 h-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-5 w-5 text-red-400" onClick={handleCancelEditPrice}>
                                <XIcon className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <p className="text-green-400 font-bold text-sm">${product.price?.toFixed(2)}</p>
                              <Button size="icon" variant="ghost" className="h-4 w-4 text-white/70" onClick={() => handleStartEditPrice(product)}>
                                <Edit2 className="w-2.5 h-2.5" />
                              </Button>
                            </div>
                          )}

                          {isEditingQty ? (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                min="0"
                                max="1"
                                step="1"
                                value={newQuantity}
                                onChange={(e) => setNewQuantity(e.target.value)}
                                className="h-6 w-12 text-xs"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveQuantity(product.id);
                                  if (e.key === 'Escape') handleCancelEditQuantity();
                                }}
                              />
                              <Button size="icon" variant="ghost" className="h-5 w-5 text-green-400" onClick={() => handleSaveQuantity(product.id)}>
                                <Check className="w-3 h-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-5 w-5 text-red-400" onClick={handleCancelEditQuantity}>
                                <XIcon className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <p className={`text-xs ${product.quantity === 0 ? 'text-red-400' : 'text-gray-400'}`}>
                                Qty: {product.quantity}
                              </p>
                              <Button size="icon" variant="ghost" className="h-4 w-4 text-white/70" onClick={() => handleStartEditQuantity(product)}>
                                <Edit2 className="w-2.5 h-2.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                        
                        {isFeatured && (
                          <Badge className="bg-yellow-400 text-gray-900 text-xs mt-1">⭐ Featured</Badge>
                        )}
                        {isLocked && (
                          <Badge className="bg-red-500 text-white text-xs mt-1">
                            {product.status === "sold_out" ? "SOLD" : "LOCKED"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CENTER COLUMN - Live Video */}
          <div className="relative bg-black flex items-center justify-center">
            {/* Daily SDK Broadcaster OR Placeholder */}
            {/* Container is device-gated (isDesktopDevice), so we only check room availability */}
            {dailyRoomUrl && dailyToken ? (
              <DailyBroadcaster 
                roomUrl={dailyRoomUrl} 
                token={dailyToken} 
                onViewerCountChange={setLiveViewerCount}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
                {show.thumbnail_url && (
                  <img 
                    src={show.thumbnail_url} 
                    alt={show.title}
                    className="absolute inset-0 w-full h-full object-cover opacity-50"
                  />
                )}
                <div className="relative z-10 text-center p-6">
                  <Video className="w-16 h-16 text-white/50 mx-auto mb-4" />
                  <p className="text-white/70 text-lg mb-2">Host Console</p>
                  <p className="text-white/50 text-sm">
                    {isAlreadyLive 
                      ? "🔴 LIVE — In-App Camera"
                      : "Tap Go Live to start your in-app camera stream."
                    }
                  </p>
                </div>
              </div>
            )}
            
            {/* Header overlay */}
            <div className="absolute top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4">
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20 rounded-full"
                  onClick={() => navigate(createPageUrl("SellerShows"), { replace: true })}
                  >
                  <ArrowLeft className="w-5 h-5" />
                  </Button>

                <div className="text-center">
                  <h1 className="text-white font-bold text-lg">{show.title}</h1>
                  <p className="text-purple-300 text-sm">Host Console</p>
                </div>

                <div className="flex items-center gap-2">
                  {/* MVP PHASE-1: Seller viewer count from Daily SDK (UI-only) */}
                  <Badge className="bg-black/60 backdrop-blur-sm text-white border-white/30">
                    <Users className="w-4 h-4 mr-1" />
                    {liveViewerCount ?? show.viewer_count ?? 0}
                  </Badge>
                  {isShowLive(show) && (
                    <Badge className="bg-red-500 text-white border-0 animate-pulse">
                      <Radio className="w-4 h-4 mr-1" />
                      LIVE
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN - Chat & Metrics */}
          <div className="bg-gray-900 flex flex-col h-full overflow-hidden">
            {/* Metrics Section */}
            <div className="p-4 border-b border-gray-800 flex-shrink-0">
              <h2 className="text-white font-bold mb-3">Analytics</h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between bg-gray-800 rounded p-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400" />
                    <span className="text-gray-300 text-sm">Viewers</span>
                  </div>
                  <span className="text-white font-bold">{stats.viewers}</span>
                </div>
                <div className="flex items-center justify-between bg-gray-800 rounded p-2">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-green-400" />
                    <span className="text-gray-300 text-sm">Sales</span>
                  </div>
                  <span className="text-white font-bold">{stats.sales}</span>
                </div>
                <div className="flex items-center justify-between bg-gray-800 rounded p-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-purple-400" />
                    <span className="text-gray-300 text-sm">Revenue</span>
                  </div>
                  <span className="text-white font-bold">${stats.revenue.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Chat Component */}
            {/* Container is device-gated (isDesktopDevice), so chat mounts only on desktop.
                This prevents double polling and freeze under load. */}
            <div className="flex-1 flex flex-col min-h-0 pb-6">
              {console.log("[HOSTCONSOLE AUTH DEBUG][DESKTOP]", {
                currentUserId: currentUser?.id ?? null,
                currentUserRole: currentUser?.role ?? null
              })}
              {useSupabaseChat ? (
                <SupabaseLiveChat
                  showId={showId}
                  sellerId={currentSeller?.id}
                  isSeller={true}
                  isOverlay={false}
                  user={currentUser}
                />
              ) : (
                <LiveChat
                  showId={showId}
                  sellerId={currentSeller?.id}
                  isSeller={true}
                  isEmbedded={true}
                />
              )}
            </div>
          </div>
        </div>
        )}


        {/* Recent Orders Dialog - DESKTOP ONLY */}
        <Dialog open={showRecentOrders} onOpenChange={setShowRecentOrders}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden bg-white">
            <DialogHeader>
              <DialogTitle className="text-gray-900 text-xl">Recent Orders</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto max-h-[60vh]">
              {orders.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No orders yet</p>
              ) : (
                <div className="space-y-3">
                  {orders.slice().reverse().map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <img
                        src={order.product?.image_urls?.[0] || "/placeholder.png"}
                        alt={order.product?.title}
                        className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{order.product?.title}</p>
                        <p className="text-sm text-gray-600">{order.buyer?.display_name || 'Buyer'}</p>
                      </div>
                      <p className="text-lg font-bold text-gray-900 flex-shrink-0">${getOrderFinancials(order).total.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Product Bottom Drawer - APP VERSION */}
        <BottomDrawer
          isOpen={showAddProductDrawer}
          onClose={() => setShowAddProductDrawer(false)}
          title="Add New Product"
          height="70vh"
        >
          <ProductForm
            product={null}
            onSave={handleSaveProduct}
            onCancel={() => setShowAddProductDrawer(false)}
            isSubmitting={createProductMutation.isPending}
          />
        </BottomDrawer>

        {/* Add Product Dialog - DESKTOP VERSION */}
        <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white border-gray-200">
            <DialogHeader>
              <DialogTitle className="text-gray-900 text-xl">Add New Product</DialogTitle>
              <p className="text-gray-600 text-sm mt-2">
                Add a product to your inventory during the live show
              </p>
            </DialogHeader>
            <ProductForm
              product={null}
              onSave={handleSaveProduct}
              onCancel={() => setShowProductDialog(false)}
              isSubmitting={createProductMutation.isPending}
            />
          </DialogContent>
        </Dialog>

        {/* Edit Details Dialog - DESKTOP ONLY */}
        <Dialog
          open={isEditDetailsOpen}
          onOpenChange={(open) => {
            if (!open) {
              setIsEditDetailsOpen(false);
              setEditDetailsProductId(null);
            }
          }}
        >
          <DialogContent className="max-w-md bg-white">
            <DialogHeader>
              <DialogTitle className="text-gray-900 text-xl">Edit Product Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-sm font-medium text-gray-700">Title</label>
                <Input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className="mt-1"
                  placeholder="Product title"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Description</label>
                <Textarea
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  className="mt-1 min-h-[80px]"
                  placeholder="Product description"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditDetailsOpen(false);
                    setEditDetailsProductId(null);
                  }}
                  disabled={updateDetailsMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => updateDetailsMutation.mutate()}
                  disabled={updateDetailsMutation.isPending}
                >
                  {updateDetailsMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Clone Remaining Products Modal - DESKTOP ONLY (UI shell, no mutation yet) */}
        {showCloneDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-gray-900 p-6 rounded-lg w-full max-w-md space-y-4">
              <h2 className="text-xl font-bold text-white">
                Clone Remaining Products
              </h2>

              <p className="text-gray-400 text-sm">
                Select a target show to receive remaining products from this show.
              </p>

              <select
                value={targetShowId}
                onChange={(e) => setTargetShowId(e.target.value)}
                className="w-full p-2 rounded bg-gray-800 text-white"
              >
                <option value="">Select Target Show</option>
                {sellerShowsForClone
                  .filter(s => s.id !== showId)
                  .map(show => (
                    <option key={show.id} value={show.id}>
                      {show.title} ({show.status})
                    </option>
                  ))}
              </select>

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  onClick={() => {
                    setShowCloneDialog(false);
                    setTargetShowId("");
                  }}
                  className="bg-gray-700 hover:bg-gray-600 text-white"
                >
                  Cancel
                </Button>

                <Button
                  onClick={handleCloneProducts}
                  disabled={!targetShowId || isCloning}
                  className={!targetShowId || isCloning ? "bg-purple-600 text-white opacity-50 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700 text-white"}
                >
                  {isCloning ? "Cloning..." : "Clone Products"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Fulfillment Bottom Drawer - MOBILE VERSION */}
        <BottomDrawer
          isOpen={showFulfillmentDrawer}
          onClose={() => setShowFulfillmentDrawer(false)}
          title="Order Fulfillment"
          height="80vh"
        >
          <Tabs defaultValue="verify" className="w-full">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="verify" className="flex-1">
                <QrCode className="w-4 h-4 mr-2" />
                Verify Code
              </TabsTrigger>
              <TabsTrigger value="batches" className="flex-1">
                <Package className="w-4 h-4 mr-2" />
                All Orders
              </TabsTrigger>
            </TabsList>
            <TabsContent value="verify">
              <PickupVerification
                sellerId={currentSeller?.id}
                sellerEmail={currentUser?.email}
                sellerName={currentSeller?.business_name || "Seller"}
                isAdmin={currentUser?.role === "admin"}
                onComplete={(batch, orderCount) => {
                  queryClient.invalidateQueries({ queryKey: ['show-orders', showId] });
                }}
              />
            </TabsContent>
            <TabsContent value="batches">
              <BatchFulfillmentList
                showId={showId}
                sellerId={currentSeller?.id}
                isAdmin={currentUser?.role === "admin"}
                onBatchUpdate={() => {
                  queryClient.invalidateQueries({ queryKey: ['show-orders', showId] });
                }}
              />
            </TabsContent>
          </Tabs>
        </BottomDrawer>

        {/* Fulfillment Dialog - DESKTOP VERSION */}
        <Dialog open={showFulfillmentDialog} onOpenChange={setShowFulfillmentDialog}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden bg-white">
            <DialogHeader>
              <DialogTitle className="text-gray-900 text-xl flex items-center gap-2">
                <ClipboardCheck className="w-6 h-6" />
                Order Fulfillment
              </DialogTitle>
            </DialogHeader>
            <Tabs defaultValue="verify" className="w-full">
              <TabsList className="w-full mb-4">
                <TabsTrigger value="verify" className="flex-1">
                  <QrCode className="w-4 h-4 mr-2" />
                  Verify Pickup Code
                </TabsTrigger>
                <TabsTrigger value="batches" className="flex-1">
                  <Package className="w-4 h-4 mr-2" />
                  All Order Batches
                </TabsTrigger>
              </TabsList>
              <TabsContent value="verify" className="max-h-[60vh] overflow-y-auto">
                <PickupVerification
                  sellerId={currentSeller?.id}
                  sellerEmail={currentUser?.email}
                  sellerName={currentSeller?.business_name || "Seller"}
                  isAdmin={currentUser?.role === "admin"}
                  onComplete={(batch, orderCount) => {
                    queryClient.invalidateQueries({ queryKey: ['show-orders', showId] });
                  }}
                />
              </TabsContent>
              <TabsContent value="batches" className="max-h-[60vh] overflow-y-auto">
                <BatchFulfillmentList
                  showId={showId}
                  sellerId={currentSeller?.id}
                  isAdmin={currentUser?.role === "admin"}
                  onBatchUpdate={() => {
                    queryClient.invalidateQueries({ queryKey: ['show-orders', showId] });
                  }}
                />
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
    </div>
  );
}