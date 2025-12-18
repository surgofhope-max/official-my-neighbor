import React, { useState, useEffect, useRef } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isSuperAdmin } from "@/lib/auth/routeGuards";
import { getShowById } from "@/api/shows";
import { createProduct, updateProduct } from "@/api/products";
import { getShowProductsByShowId, createShowProduct, updateShowProductByIds, clearFeaturedForShow, deleteShowProductByIds } from "@/api/showProducts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Eye,
  EyeOff,
  Video,
  Smartphone,
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
import WebRTCBroadcaster from "../components/streaming/WebRTCBroadcaster";
import HostBottomControls from "../components/host/HostBottomControls";
import SellerProductDetailCard from "../components/host/SellerProductDetailCard";
import LiveChat from "../components/chat/LiveChat";
import LiveChatOverlay from "../components/chat/LiveChatOverlay";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ProductForm from "../components/products/ProductForm";
import GIVIHostPanel from "../components/givi/GIVIHostPanel";
import GIVIWinnerBanner from "../components/givi/GIVIWinnerBanner";
import BottomDrawer from "../components/host/BottomDrawer";
import PickupVerification from "../components/fulfillment/PickupVerification";
import BatchFulfillmentList from "../components/fulfillment/BatchFulfillmentList";

export default function HostConsole() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const showId = urlParams.get('showId');
  const [searchTerm, setSearchTerm] = useState("");
  const [streamingMethod, setStreamingMethod] = useState("in-app");
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
  
  // Ref to prevent NO_SHOWID guard from re-triggering after initial mount
  const noShowIdGuardRan = useRef(false);

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
      const user = await base44.auth.me();
      setCurrentUser(user);
      const userRole = user.user_metadata?.role || user.role;
      
      // DERIVED CONSTANTS: Read ALL onboarding flags from user_metadata ONLY
      const onboardingCompleted = user.user_metadata?.seller_onboarding_completed === true;
      const safetyAgreed = user.user_metadata?.seller_safety_agreed === true;
      const onboardingReset = user.user_metadata?.seller_onboarding_reset === true;

      // 🔐 SUPER_ADMIN BYPASS: Skip ALL checks
      if (isSuperAdmin(user)) {
        // Load seller if exists, but don't require it
        const { data: seller, error: sellerError } = await supabase
          .from("sellers")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();
        if (sellerError) throw sellerError;
        if (seller) {
          setCurrentSeller(seller);
        }
        setUserLoading(false);
        return;
      }
      
      // CRITICAL: Check for onboarding reset - must complete full onboarding again
      if (userRole !== "admin" && onboardingReset) {
        navigate(createPageUrl("SellerSafetyAgreement"), { replace: true });
        return;
      }

      // Check for seller safety agreement
      if (userRole !== "admin" && !safetyAgreed) {
        navigate(createPageUrl("SellerSafetyAgreement"), { replace: true });
        return;
      }

      // Check for seller onboarding completion
      if (userRole !== "admin" && !onboardingCompleted) {
        navigate(createPageUrl("SellerOnboarding"), { replace: true });
        return;
      }
      
      const { data: seller, error: sellerError } = await supabase
        .from("sellers")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (sellerError) throw sellerError;
      
      if (seller) {
        setCurrentSeller(seller);
      } else {
        console.error("No seller profile found for user:", user.email);
      }
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
      const fetchedShow = await getShowById(showId);
      
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
      const { data: fetchedSeller, error } = await supabase
        .from("sellers")
        .select("*")
        .eq("user_id", show.seller_id)
        .maybeSingle();
      if (error) throw error;
      return fetchedSeller || null;
    },
    enabled: !!show?.seller_id
  });

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
      
      // Seller ID must match
      const isOwner = currentSeller.user_id === show.seller_id;
      
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
    queryFn: async () => {
      const result = await base44.entities.Order.filter({ show_id: showId });
      return result;
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
      const productData = { 
        ...catalogData, 
        seller_id: currentSeller.user_id, // Use user_id for seller_id FK
        status: "active"
      };
      console.log("📦 HostConsole - Creating product in catalog:", productData);
      console.log("🆔 Seller ID (user_id):", currentSeller.user_id);
      
      const newProduct = await createProduct(productData);
      if (!newProduct) {
        throw new Error("Failed to create product - check Supabase logs");
      }
      console.log("✅ Product created in catalog:", newProduct.id);
      
      // Step 2: Link product to this show via show_products
      // is_givi is stored here (per-show state), not in products catalog
      console.log("🔗 Linking product to show:", showId);
      const showProduct = await createShowProduct({
        show_id: showId,
        product_id: newProduct.id,
        seller_id: currentSeller.user_id,
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
      
      const qty = parseInt(newQuantity);
      if (isNaN(qty) || qty < 0) {
        throw new Error("Quantity must be a non-negative number.");
      }
      
      // If quantity becomes 0, mark as sold
      const updates = {
        quantity: qty
      };
      
      if (qty === 0) {
        updates.status = "sold";
        console.log("   Marking as sold (quantity = 0)");
      } else if (qty > 0) {
        // If increasing from 0, restore to available unless it was explicitly locked
        const currentProduct = products.find(p => p.id === productId);
        if (currentProduct?.status === "sold") {
          updates.status = "available";
          console.log("   Restoring to available (quantity > 0 and was sold)");
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

  const handleStreamStart = (stream) => {
    console.log("📡 HostConsole - Stream started for ShowID:", showId);
  };

  const handleStreamStop = () => {
    console.log("⏹️ HostConsole - Stream stopped for ShowID:", showId);
  };

  const handleSaveProduct = (productData) => {
    createProductMutation.mutate(productData);
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
  const endShowMutation = useMutation({
    mutationFn: async () => {
      console.log("⏹️ HostConsole - Ending show:", showId);
      
      // CRITICAL: Change URL IMMEDIATELY before making the API call
      // This prevents refresh from reloading the dead showId
      const showsUrl = createPageUrl("SellerShows");
      window.history.replaceState({}, '', showsUrl);
      console.log("✅ URL immediately changed to prevent refresh loading dead showId");
      
      await base44.entities.Show.update(showId, { status: "ended" });
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
    const searchLower = searchTerm.toLowerCase();
    return (
      p.title.toLowerCase().includes(searchLower) ||
      p.description?.toLowerCase().includes(searchLower)
    );
  });

  const stats = {
    viewers: show.viewer_count || 0,
    sales: orders.length,
    revenue: orders.reduce((sum, o) => sum + (o.price || 0), 0)
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-blue-900 px-3 py-4 sm:p-6" style={{ 
      overscrollBehavior: 'none',
      touchAction: 'pan-y'
    }}>
      {/* GIVI Winner Banner */}
      <GIVIWinnerBanner 
        show={showWinnerBanner}
        winnerName={activeGIVI?.winner_names?.[0]}
        onDismiss={() => setShowWinnerBanner(false)}
      />

      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Header with Seller Verification */}
        <Card className="bg-white/10 backdrop-blur-md border-white/20">
          <CardContent className="p-3 sm:p-6">
            {/* Back Button + Title - Mobile: with right buttons, Desktop: full width */}
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(createPageUrl("SellerShows"))}
                className="text-white hover:bg-white/20 p-1 h-auto flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <h1 className="text-base sm:text-2xl font-bold text-white truncate">{show.title}</h1>
                <p className="text-[10px] sm:text-sm text-white/70">Host Console</p>
              </div>

              {/* MOBILE ONLY: Compact Revenue + GIVI + Feature Product buttons on right */}
              <div className="flex flex-col gap-1.5 sm:hidden">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-purple-500/20 border-purple-400/30 text-white hover:bg-purple-500/30 px-3 py-3 h-auto min-w-[70px]"
                >
                  <div className="text-center">
                    <p className="text-[10px] text-white/70 leading-tight font-bold">Revenue</p>
                    <p className="text-sm font-bold leading-tight">${stats.revenue.toFixed(2)}</p>
                  </div>
                </Button>

                <Button
                  onClick={() => {
                    setShowGiviDrawer(true);
                    setGiviDrawerMode(activeGIVI ? "console" : "form");
                  }}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 px-3 py-3 h-auto text-sm min-w-[70px] backdrop-blur-md font-bold"
                >
                  <span>GIVI</span>
                </Button>
                
                <Button
                  onClick={() => setShowFeatureProductDrawer(true)}
                  className="bg-gradient-to-r from-blue-600 to-cyan-600 px-3 py-3 h-auto text-sm min-w-[70px] font-bold"
                >
                  <span>Products</span>
                </Button>
                
                <Button
                  onClick={() => setIsBroadcasting(!isBroadcasting)}
                  className="bg-gradient-to-r from-red-600 to-pink-600 px-3 py-3 h-auto text-sm min-w-[70px] font-bold"
                >
                  <span>{isBroadcasting ? "Stop" : "Start"}</span>
                </Button>
              </div>
            </div>
            
            {/* Seller & Show Verification - with NULL checks - HIDDEN ON MOBILE */}
            <Alert className="hidden sm:block bg-green-500/20 border-green-500">
              <div className="flex items-start gap-2 sm:gap-3">
                <div className="text-green-300 text-xs sm:text-sm">
                  <strong>✅ Verified Host Console</strong>
                </div>
              </div>
              <AlertDescription className="text-green-100 mt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-2 text-[10px] sm:text-xs font-mono">
                  <div className="truncate">
                    <strong>Your Seller:</strong> {currentSeller?.business_name || "Loading..."}
                  </div>
                  <div className="truncate">
                    <strong>Seller ID:</strong> {currentSeller?.id || "Loading..."}
                  </div>
                  <div className="truncate">
                    <strong>Show Title:</strong> {show?.title || "Loading..."}
                  </div>
                  <div className="truncate">
                    <strong>Show ID:</strong> {show?.id || "Loading..."}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Stats Row - DESKTOP ONLY (hidden on mobile) */}
        <div className="hidden sm:grid grid-cols-3 gap-4">
          <Card className="bg-white/10 backdrop-blur-md border-white/20">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-blue-400" />
                </div>
                <div className="text-left">
                  <p className="text-white/70 text-sm">Viewers</p>
                  <p className="text-2xl font-bold text-white">{stats.viewers}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/10 backdrop-blur-md border-white/20">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <Package className="w-6 h-6 text-green-400" />
                </div>
                <div className="text-left">
                  <p className="text-white/70 text-sm">Sales</p>
                  <p className="text-2xl font-bold text-white">{stats.sales}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/10 backdrop-blur-md border-white/20">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-purple-400" />
                </div>
                <div className="text-left">
                  <p className="text-white/70 text-sm">Revenue</p>
                  <p className="text-2xl font-bold text-white">${stats.revenue.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>



        {/* GIVI Drawer - MOBILE ONLY */}
        {currentSeller && showGiviDrawer && typeof window !== 'undefined' && window.innerWidth < 640 && (
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

        {/* GIVI Dialog - DESKTOP ONLY */}
        {currentSeller && showGiviDrawer && typeof window !== 'undefined' && window.innerWidth >= 640 && (
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

        {/* MOBILE: Fullscreen Video with Overlay Chat */}
        <div className="sm:hidden fixed inset-0 bg-black" style={{ zIndex: 1 }}>
          {/* Back Arrow - Top Left */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(createPageUrl("SellerShows"))}
            className="fixed top-4 left-4 z-[250] bg-black/50 backdrop-blur-md text-white hover:bg-black/70 h-10 w-10 rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          
          {/* Video Background - Placeholder/Waiting Screen */}
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
              <p className="text-white/70 text-lg mb-2">Waiting for Stream</p>
              <p className="text-white/50 text-sm">Host will start broadcasting soon...</p>
            </div>
          </div>
          
          {/* Chat Overlay - Left Side, Transparent */}
          <div style={{ zIndex: 100 }}>
            <LiveChatOverlay 
              showId={showId} 
              isSeller={true}
              sellerId={currentSeller?.id}
            />
          </div>
          
          {/* Seller Product Detail Card (Overlay) */}
          {selectedProduct && (
            <SellerProductDetailCard 
              product={selectedProduct}
              showId={showId}
              isFeatured={selectedProduct.is_featured || selectedProduct.id === show.featured_product_id}
              onClose={() => setSelectedProduct(null)}
              onPushToLive={(product) => {
                const isLocked = product.status === "locked" || product.status === "sold";
                const isFeatured = product.is_featured || product.id === show.featured_product_id;
                
                if (!isLocked) {
                  if (isFeatured) {
                    // Unfeature if already featured (unpush)
                    unfeatureProductMutation.mutate();
                  } else {
                    // Feature if not featured (push)
                    featureProductMutation.mutate(product);
                  }
                }
              }}
            />
          )}

          {/* Bottom Controls (Product Bubbles + Toggle Area) */}
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
          />
          
          {/* Host Controls - Top Right Icons */}
          <div 
            className="fixed top-16 right-3 flex flex-col gap-3 z-[200]"
          >
            {/* Revenue (Icon Only) */}
            <Button
              variant="ghost"
              size="icon"
              className="bg-black/40 backdrop-blur-md border border-white/20 text-white hover:bg-black/60 h-10 w-10 rounded-full"
              title={`Revenue: $${stats.revenue.toFixed(2)}`}
            >
              <DollarSign className="w-5 h-5 text-green-400" />
            </Button>

            {/* Message Toggle (Icon Only) */}
            <Button
              onClick={() => setBottomBarMode("message")}
              size="icon"
              className={`h-10 w-10 rounded-full backdrop-blur-md border transition-all ${
                bottomBarMode === "message" 
                  ? "bg-white text-purple-600 border-white" 
                  : "bg-black/40 text-white border-white/20 hover:bg-black/60"
              }`}
            >
              <MessageCircle className="w-5 h-5" />
            </Button>

            {/* GIVI Button (Icon Only) */}
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

            {/* Products Button (Icon Only) - Toggles Product Mode */}
            <Button
              onClick={() => setBottomBarMode("products")}
              size="icon"
              className={`h-10 w-10 rounded-full shadow-lg border transition-all ${
                bottomBarMode === "products"
                  ? "bg-gradient-to-r from-blue-500 to-cyan-500 border-white scale-110"
                  : "bg-gradient-to-r from-blue-600 to-cyan-600 border-white/20"
              }`}
            >
              <Package className="w-5 h-5 text-white" />
            </Button>

            {/* Fulfillment Button (Icon Only) */}
            <Button
              onClick={() => setShowFulfillmentDrawer(true)}
              size="icon"
              className="bg-gradient-to-r from-orange-600 to-amber-600 h-10 w-10 rounded-full shadow-lg border border-white/20"
            >
              <ClipboardCheck className="w-5 h-5 text-white" />
            </Button>

            {/* Broadcast Button (Icon Only) */}
            <Button
              onClick={() => setIsBroadcasting(!isBroadcasting)}
              size="icon"
              className={`h-10 w-10 rounded-full shadow-lg border border-white/20 ${
                isBroadcasting 
                  ? "bg-gradient-to-r from-red-600 to-pink-600 animate-pulse" 
                  : "bg-gradient-to-r from-green-600 to-emerald-600"
              }`}
            >
              <Radio className="w-5 h-5 text-white" />
            </Button>
          </div>
        </div>
        
        {/* DESKTOP: 3-Column Whatnot-Style Layout */}
        <div className="hidden sm:grid sm:grid-cols-[25%_50%_25%] h-screen bg-black fixed inset-0" style={{ top: 0, paddingTop: 0 }}>
          {/* LEFT COLUMN - Host Tools & Products */}
          <div className="bg-gray-900 overflow-y-auto p-4 space-y-4">
            {/* Host Control Buttons */}
            <div className="space-y-2">
              <Button
                onClick={() => setIsBroadcasting(!isBroadcasting)}
                className={`w-full font-bold py-3 ${
                  isBroadcasting 
                    ? 'bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700' 
                    : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700'
                } text-white`}
              >
                <Radio className="w-4 h-4 mr-2" />
                {isBroadcasting ? 'Stop Broadcast' : 'Start Broadcast'}
              </Button>
              
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
                onClick={() => setShowFulfillmentDialog(true)}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3"
              >
                <ClipboardCheck className="w-4 h-4 mr-2" />
                Pickup Verification
              </Button>
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
                const isLocked = product.status === "locked" || product.status === "sold";
                const isFeatured = product.is_featured || product.id === show.featured_product_id;
                const isEditingQty = editingQuantityProductId === product.id;
                const isEditingPrice = editingPriceProductId === product.id;
                
                return (
                  <div
                    key={product.id}
                    onClick={() => {
                      if (!isLocked) {
                        if (isFeatured) {
                          // Unfeature if already featured (unpush)
                          unfeatureProductMutation.mutate();
                        } else {
                          // Feature if not featured (push)
                          featureProductMutation.mutate(product);
                        }
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
                        {Array.isArray(product.images) && product.images.length > 0 ? (
                          <img
                            src={product.images[0]}
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
                        <h3 className="text-white font-semibold text-sm line-clamp-2">{product.title}</h3>
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
                                className="h-6 w-16 text-xs"
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
                            {product.status === "sold" ? "SOLD" : "LOCKED"}
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
            {/* Video Placeholder */}
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
                <p className="text-white/50 text-sm">Click Start Broadcast to go live</p>
              </div>
            </div>
            
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
                  <Badge className="bg-black/60 backdrop-blur-sm text-white border-white/30">
                    <Users className="w-4 h-4 mr-1" />
                    {show.viewer_count || 0}
                  </Badge>
                  {show.is_streaming && (
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
            <div className="flex-1 flex flex-col min-h-0 pb-6">
              <LiveChat
                showId={showId}
                sellerId={currentSeller?.id}
                isSeller={true}
                isEmbedded={true}
              />
            </div>
          </div>
        </div>


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
                        src={order.product_image_url || "/placeholder.png"}
                        alt={order.product_title}
                        className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{order.product_title}</p>
                        <p className="text-sm text-gray-600">{order.buyer_name}</p>
                      </div>
                      <p className="text-lg font-bold text-gray-900 flex-shrink-0">${order.price?.toFixed(2)}</p>
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
    </div>
  );
}