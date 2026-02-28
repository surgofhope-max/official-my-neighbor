import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  ShoppingBag, 
  Search, 
  CheckCircle, 
  MapPin, 
  ArrowLeft, 
  Users, 
  Package, 
  Calendar,
  Video,
  ChevronRight,
  DollarSign,
  Copy,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Gift,
  Trash2,
  Clock,
  AlertCircle,
  MoreVertical,
  Ban
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import BanBuyerDialog from "../components/seller/BanBuyerDialog";
import { getEffectiveUserContext } from "@/lib/auth/effectiveUser";
import { getSellerByUserId, getSellerById } from "@/api/sellers";
import { requireSellerAsync, isAdmin, isSuperAdmin } from "@/lib/auth/routeGuards";
import { checkAccountActiveAsync } from "@/lib/auth/accountGuards";
import { getBatchesBySellerId, getFulfillmentBatchesForShow } from "@/api/sellerBatches";
import { getOrdersBySeller } from "@/api/sellerOrders";
import { getShowsBySellerId } from "@/api/shows";
import { autoSyncHealOrders, completeBatchPickup } from "@/api/fulfillment";

export default function SellerOrders() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [seller, setSeller] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedCode, setCopiedCode] = useState(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [expandedBatches, setExpandedBatches] = useState({});
  const [showPastBatches, setShowPastBatches] = useState(false);
  const [showToDelete, setShowToDelete] = useState(null);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [showPastShows, setShowPastShows] = useState(false);
  const [banningBuyer, setBanningBuyer] = useState(null);
  
  // Navigation state: 'shows' | 'batches' | 'orders'
  const [view, setView] = useState('shows');
  const [selectedShow, setSelectedShow] = useState(null);

  // Data state (replacing React Query)
  const [shows, setShows] = useState([]);
  const [allBatches, setAllBatches] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BUYER IDENTITY MAP
  // Maps buyer_id (public.users.id) → { full_name, email } for display only.
  // Fetched once per batch load; does NOT affect business logic.
  // ═══════════════════════════════════════════════════════════════════════════
  const [buyerProfiles, setBuyerProfiles] = useState({});

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

  // Track if initial load is complete
  const initialLoadDone = useRef(false);

  // Load user on mount
  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("[SellerOrders] auth load failed", error);
        navigate(createPageUrl("Marketplace"), { replace: true });
        return;
      }
      const currentUser = data?.user ?? null;
      if (!currentUser) {
        navigate(createPageUrl("Marketplace"), { replace: true });
        return;
      }
      setUser(currentUser);

      // ═══════════════════════════════════════════════════════════════════════════
      // OPTION B SELLER GATING (STEP 3 REFACTOR)
      // User is seller IFF: public.users.role='seller' AND sellers.status='approved'
      // ═══════════════════════════════════════════════════════════════════════════

      // 🔐 SUPER_ADMIN BYPASS: Full system authority
      if (isSuperAdmin(currentUser)) {
        console.log("[SellerGate] SUPER_ADMIN bypass - full access");
        const resolvedSeller = await getSellerByUserId(currentUser.id);
        if (resolvedSeller) {
          setSeller(resolvedSeller);
        }
        return;
      }

      // 🔐 ADMIN BYPASS: Admins can access seller routes
      if (isAdmin(currentUser)) {
        console.log("[SellerGate] Admin bypass - access granted");
        const context = getEffectiveUserContext(currentUser);
        let resolvedSeller = null;
        if (context.isImpersonating && context.impersonatedSellerId) {
          resolvedSeller = await getSellerById(context.impersonatedSellerId);
        } else {
          resolvedSeller = await getSellerByUserId(currentUser.id);
        }
        if (resolvedSeller) {
          setSeller(resolvedSeller);
        }
        return;
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // SUSPENSION CHECK: Block seller routes for suspended accounts
      // ═══════════════════════════════════════════════════════════════════════════
      const { canProceed: accountActive, error: suspendedReason } = await checkAccountActiveAsync(supabase, currentUser.id);
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
      const sellerCheck = await requireSellerAsync(currentUser.id);
      
      console.log("[SellerGate] SellerOrders check:", {
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
          // Other failure (no seller row, not approved, etc.) - redirect to Marketplace
          console.log("[SellerGate] Not approved seller - redirecting to Marketplace");
          navigate(createPageUrl("Marketplace"), { replace: true });
        }
        return;
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // APPROVED SELLER - Load orders
      // ═══════════════════════════════════════════════════════════════════════════
      console.log("[SellerGate] Approved seller verified:", sellerCheck.sellerRow?.business_name);
      setSeller(sellerCheck.sellerRow);

    } catch (error) {
      console.error("[SellerOrders] Error loading:", error);
      setUser(null);
      setSeller(null);
      setLoading(false);
      navigate(createPageUrl("Marketplace"), { replace: true });
    }
  };

  // Load data when seller is available
  const loadData = async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // READ PATH (Step T3.5):
    // - batches.seller_id = sellers.id (entity PK) — always canonical
    // - orders: prefer seller_entity_id (canonical), fallback to seller_id (legacy)
    // ═══════════════════════════════════════════════════════════════════════════
    if (!seller?.id) return;

    try {
      const [batchesData, ordersData] = await Promise.all([
        getBatchesBySellerId(seller.id),        // batches use seller entity id (canonical)
        // READ PATH: seller_entity_id (canonical) with seller_id (legacy) fallback
        getOrdersBySeller(seller.id, seller.user_id),
      ]);

      setAllBatches(batchesData);
      setAllOrders(ordersData);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // BUYER IDENTITY ENRICHMENT (READ-ONLY, DISPLAY ONLY)
      // batch.buyer_id = public.users.id — we lookup buyer_profiles for display.
      // This does NOT change business logic; only adds name/email for UI.
      // ═══════════════════════════════════════════════════════════════════════════
      if (batchesData.length > 0) {
        // FIX: Use buyer_id only (buyer_user_id does not exist in batches table)
        const uniqueBuyerIds = [...new Set(batchesData.map(b => b.buyer_id).filter(Boolean))];
        if (uniqueBuyerIds.length > 0) {
          const { data: profiles } = await supabase
            .from("buyer_profiles")
            .select("user_id, full_name, email, phone")
            .in("user_id", uniqueBuyerIds);
          
          if (profiles) {
            const profileMap = {};
            for (const p of profiles) {
              profileMap[p.user_id] = {
                full_name: p.full_name,
                email: p.email,
                phone: p.phone,
              };
            }
            setBuyerProfiles(profileMap);
          }
        }
      }
    } catch (error) {
      setAllBatches([]);
      setAllOrders([]);
    } finally {
      setLoading(false);
      initialLoadDone.current = true;
    }
  };

  // Load shows for this seller
  const loadShows = async () => {
    // shows.seller_id = sellers.id (entity PK)
    if (!seller?.id) return;

    try {
      // NORMALIZED: shows.seller_id references sellers.id
      const allShowsData = await getShowsBySellerId(seller.id);
      const visibleShows = allShowsData.filter(show => !show.hidden_from_orders);
      setShows(visibleShows);
    } catch (error) {
      setShows([]);
    }
  };

  // Initial data load and polling
  useEffect(() => {
    // Need seller.id for batches, shows, and orders
    if (!seller?.id) return;

    // Initial load
    loadData();
    loadShows();

    // Auto-refresh every 5 seconds
    const interval = setInterval(() => {
      loadData();
    }, 5000);

    return () => clearInterval(interval);
  }, [seller?.id, seller?.user_id]);

  // Auto-sync order status when batch is completed (Base44 parity)
  // Every 5 seconds: for each batch where status === "completed",
  // if ANY order.status === "paid", auto-update those orders to "picked_up"
  useEffect(() => {
    // autoSyncHealOrders queries batches, which use seller entity id
    if (!initialLoadDone.current || !seller?.id) return;

    const syncOrderStatuses = async () => {
      // batches.seller_id uses seller entity id (public.sellers.id)
      const healed = await autoSyncHealOrders(seller.id);
      
      // Reload data after sync if any orders were healed
      if (healed > 0) {
        loadData();
      }
    };

    syncOrderStatuses();
  }, [allBatches, allOrders, seller?.id]);

  const toggleBatchExpansion = (batchId) => {
    setExpandedBatches(prev => ({
      ...prev,
      [batchId]: !prev[batchId]
    }));
  };

  // State for mutation loading
  const [isHidingShow, setIsHidingShow] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const hideShow = async (showId) => {
    setIsHidingShow(true);
    try {
      // Use direct Supabase call instead of Base44
      const { error } = await supabase
        .from("shows")
        .update({ hidden_from_orders: true })
        .eq("id", showId);
      
      if (error) {
        console.error("[SellerOrders] Failed to hide show:", error.message);
      }
      
      await loadShows();
      setShowToDelete(null);
    } catch (error) {
      console.error("[SellerOrders] Unexpected error hiding show:", error);
    } finally {
      setIsHidingShow(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PICKUP VERIFICATION (Backend-only, Supabase-based)
  // Uses completeBatchPickup from fulfillment.ts which:
  // - Updates batch status to "completed"
  // - Updates all orders to "picked_up"
  // - Creates review_request notification
  // - Emits analytics events (shadow mode)
  // ═══════════════════════════════════════════════════════════════════════════
  const verifyCompletionCode = async ({ code, batch }) => {
    // Normalize both codes to strings and compare
    const enteredCode = String(code || "").trim();
    const expectedCode = String(batch.completion_code || "").trim();
    
    if (enteredCode !== expectedCode) {
      setVerificationError("Invalid verification code");
      return;
    }

    setIsVerifying(true);
    try {
      // Use completeBatchPickup from fulfillment.ts
      // batches.seller_id = seller entity id (public.sellers.id)
      const result = await completeBatchPickup({
        batchId: batch.id,
        sellerId: seller.id, // seller entity id for batches
        sellerEmail: user.email,
        sellerName: seller.business_name,
        isAdmin: false,
      });
      
      if (result.error) {
        console.error("[PickupVerification] Error:", result.error);
        setVerificationError(result.error.message || "Verification failed. Please try again.");
        return;
      }
      
      // Success - reload data to reflect changes
      await loadData();
      
      setShowVerificationModal(false);
      setVerificationCode("");
      setVerificationError("");
      setSelectedBatch(null);
      
      const ordersMsg = result.ordersUpdated === 1 ? 'order' : 'orders';
      const notifMsg = result.notificationSent ? "Review notification sent to buyer." : "";
      alert(`✅ Successfully verified ${result.ordersUpdated} ${ordersMsg}. ${notifMsg}`);
    } catch (error) {
      console.error("[PickupVerification] Unexpected error:", error);
      setVerificationError("Verification failed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifyCode = (e) => {
    e.preventDefault();
    setVerificationError("");
    
    if (!/^\d{9}$/.test(verificationCode)) {
      setVerificationError("Please enter a valid 9-digit code");
      return;
    }
    
    verifyCompletionCode({ code: verificationCode, batch: selectedBatch });
  };

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE-1 VISIBILITY FIX: Hide empty batches from seller view
  // A batch is "empty" if it has zero orders
  // This is purely client-side filtering — no DB changes
  // ═══════════════════════════════════════════════════════════════════════════
  const batchHasOrders = (batch) => allOrders.some(order => order.batch_id === batch.id);

  // ═══════════════════════════════════════════════════════════════════════════
  // FULFILLMENT DATA WIRING
  // Build batch count map FIRST from ALL seller batches, grouped by show_id.
  // Fulfillment count is derived from all seller batches grouped by show_id.
  // This must happen BEFORE showsWithStats is computed.
  // PHASE-1: Only count batches that have at least one order
  // ═══════════════════════════════════════════════════════════════════════════
  const batchCountByShow = React.useMemo(() => {
    const countMap = {};
    for (const batch of allBatches) {
      if (batch.show_id && batchHasOrders(batch)) {
        countMap[batch.show_id] = (countMap[batch.show_id] || 0) + 1;
      }
    }
    return countMap;
  }, [allBatches, allOrders]);

  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH CLASSIFICATION HELPERS
  // A batch is considered DONE when:
  //   batch.status === 'picked_up' OR batch.status === 'completed'
  // A batch is considered PENDING when:
  //   batch.status is NOT 'picked_up' AND NOT 'completed'
  // PHASE-1: All counts exclude empty batches (batches with zero orders)
  // ═══════════════════════════════════════════════════════════════════════════
  const isBatchDone = (batch) => {
    return batch.status === 'picked_up' || batch.status === 'completed';
  };

  const getPendingCountForShow = (showId) => {
    const showBatches = allBatches.filter(batch => batch.show_id === showId && batchHasOrders(batch));
    // Count batches that are NOT done (still need fulfillment)
    return showBatches.filter(batch => !isBatchDone(batch)).length;
  };
  
  const getDoneCountForShow = (showId) => {
    const showBatches = allBatches.filter(batch => batch.show_id === showId && batchHasOrders(batch));
    // Count batches that ARE done (picked up or completed)
    return showBatches.filter(batch => isBatchDone(batch)).length;
  };

  // Build fulfillment stats for each show using the pre-computed batchCountByShow map.
  // fulfillmentCount is derived from all seller batches grouped by show_id (NOT analytics).
  // PHASE-1: Only include non-empty batches (batches with at least one order)
  const showsWithStats = shows.map(show => {
    const showBatches = allBatches.filter(batch => batch.show_id === show.id && batchHasOrders(batch));
    // Revenue from ORDERS (already filtered by paid/fulfilled/completed/ready in sellerOrders.ts)
    const showOrders = allOrders.filter(o => o.show_id === show.id);
    const totalRevenue = showOrders.reduce(
      (sum, o) => sum + getOrderFinancials(o).total,
      0
    );
    const totalItems = showOrders.length;
    const pendingCount = getPendingCountForShow(show.id);
    const doneCount = getDoneCountForShow(show.id);
    
    return {
      ...show,
      batchCount: showBatches.length,
      // fulfillmentCount: derived from batchCountByShow map, NOT from analytics
      fulfillmentCount: batchCountByShow[show.id] || 0,
      totalRevenue,
      totalItems,
      uniqueBuyers: showBatches.length,
      pendingCount,
      doneCount,
      // A show is fully complete when it has batches AND all are done
      isFullyComplete: showBatches.length > 0 && pendingCount === 0,
    };
  });

  // Fulfillment batches are show-scoped but NOT show-lifecycle-scoped.
  // ALL batches for the selected show are included regardless of show status (live/ended/cancelled).
  // This ensures sellers can always see and manage fulfillment for any show.
  // PHASE-1: Only include non-empty batches (batches with at least one order)
  const batchesForShow = selectedShow 
    ? allBatches.filter(batch => batch.show_id === selectedShow.id && batchHasOrders(batch))
    : [];

  const getOrdersForBatch = (batchId) => {
    return allOrders.filter(order => order.batch_id === batchId);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PRE-DERIVED DATA FOR VERIFICATION MODAL
  // Avoids function calls inside JSX render — uses in-memory filter only
  // ═══════════════════════════════════════════════════════════════════════════
  const selectedBatchOrders = selectedBatch
    ? allOrders.filter(o => o.batch_id === selectedBatch.id)
    : [];
  
  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY HELPERS (READ-ONLY, DISPLAY ONLY)
  // - batches.seller_id = sellers.id (entity PK) — canonical
  // - orders: seller_entity_id (canonical) or seller_id (legacy, auth user)
  // - buyer_id in both = public.users.id (auth user)
  // These helpers derive display names; they do NOT affect business logic.
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Get buyer display info for a batch. Returns { name, email } for UI display.
  // FIX: Use buyer_id only (buyer_user_id does not exist in batches table)
  const getBuyerIdentity = (batch) => {
    const buyerId = batch.buyer_id;
    const profile = buyerId ? buyerProfiles[buyerId] : null;
    
    // Priority: buyer_profiles.full_name → batch.buyer_name → "Unknown buyer"
    const name = profile?.full_name || batch.buyer_name || "Unknown buyer";
    // Priority: buyer_profiles.email → batch.buyer_email → ""
    const email = profile?.email || batch.buyer_email || "";
    const phone = profile?.phone || batch.buyer_phone || "";
    
    return { name, email, phone };
  };
  
  // Get seller display name. Uses already-loaded seller context.
  const getSellerDisplayName = () => {
    return seller?.business_name || "Seller";
  };

  const handleShowClick = (show) => {
    setSelectedShow(show);
    setView('batches');
  };

  const handleBackToShows = () => {
    setView('shows');
    setSelectedShow(null);
    setSearchTerm("");
  };

  const statusColors = {
    pending: "bg-orange-100 text-orange-800 border-orange-200",
    partial: "bg-yellow-100 text-yellow-800 border-yellow-200",
    completed: "bg-green-100 text-green-800 border-green-200",
    cancelled: "bg-gray-100 text-gray-800 border-gray-200",
    paid: "bg-green-100 text-green-800 border-green-200",
    picked_up: "bg-blue-100 text-blue-800 border-blue-200"
  };

  if (!seller) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  // ========================================
  // VIEW 1: SHOWS LIST
  // ========================================
  if (view === 'shows') {
    const filteredShows = showsWithStats.filter(show =>
      show.title?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // SHOW CLASSIFICATION
    // Active Shows: shows with at least one batch that is NOT done (picked_up/completed)
    // Past Shows: shows where ALL batches are done (picked_up or completed)
    // ═══════════════════════════════════════════════════════════════════════════
    const activeShows = filteredShows.filter(show => show.pendingCount > 0);
    const pastShows = filteredShows.filter(show => show.isFullyComplete);

    const renderShowCard = (show) => (
      <Card 
        key={show.id} 
        className="border-0 shadow-lg hover:shadow-xl transition-shadow cursor-pointer relative group"
      >
        {/* Delete Button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 hover:bg-red-50 hover:text-red-600"
          onClick={(e) => {
            e.stopPropagation();
            setShowToDelete(show);
          }}
        >
          <Trash2 className="w-4 h-4" />
        </Button>

        <div onClick={() => handleShowClick(show)}>
          <div className="relative h-40 bg-gradient-to-br from-purple-600 to-blue-600 overflow-hidden">
            {show.thumbnail_url ? (
              <img 
                src={show.thumbnail_url} 
                alt={show.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Video className="w-12 h-12 text-white" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
            
            {/* Fulfillment badge: shows total batches needing seller attention */}
            {show.fulfillmentCount > 0 && (
              <div className="absolute top-3 left-3">
                <Badge className="bg-purple-600 text-white border-0 shadow-lg">
                  <ShoppingBag className="w-3 h-3 mr-1" />
                  {show.fulfillmentCount} {show.fulfillmentCount === 1 ? 'Order' : 'Orders'}
                </Badge>
              </div>
            )}
            
            <div className="absolute bottom-3 left-3 right-3">
              <h3 className="text-white font-bold text-lg line-clamp-2">{show.title}</h3>
            </div>
          </div>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Date:</span>
                <span className="font-medium">
                  {/* FIX: Use scheduled_start_time (actual DB column) not scheduled_start */}
                  {show.scheduled_start_time 
                    ? format(new Date(show.scheduled_start_time), "MMM d, yyyy")
                    : "Not scheduled"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-3 border-t">
                <div className="text-center">
                  <p className="text-xs text-gray-600">Buyers</p>
                  <p className="text-lg font-bold text-gray-900">{show.uniqueBuyers}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-600">Items</p>
                  <p className="text-lg font-bold text-gray-900">{show.totalItems}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-600">Revenue</p>
                  <p className="text-lg font-bold text-gray-900">
                    ${show.totalRevenue.toFixed(2)}
                  </p>
                </div>
              </div>
              {show.pendingCount > 0 && (
                <div className="pt-3 border-t">
                  <Badge className="w-full bg-orange-100 text-orange-800 border-orange-300">
                    <Clock className="w-3 h-3 mr-1" />
                    {show.pendingCount} Pending
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </div>
      </Card>
    );

    return (
      <div className="min-h-screen p-4 sm:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="rounded-full"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Manage Orders</h1>
              <p className="text-gray-600 mt-1">Select a show to view batch orders and manage pickups</p>
            </div>
          </div>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search shows..."
              className="pl-10"
            />
          </div>

          <div className="flex gap-2">
            <Card className="border-0 shadow-sm flex-[1] bg-purple-50">
              <CardContent className="p-2 text-center">
                <p className="text-xs text-gray-600 mb-0.5">Shows</p>
                <p className="text-lg font-bold text-gray-900">{shows.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm flex-[1] bg-green-50">
              <CardContent className="p-2 text-center">
                <p className="text-xs text-gray-600 mb-0.5">Batches</p>
                <p className="text-lg font-bold text-gray-900">{allBatches.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm flex-[2] bg-blue-50">
              <CardContent className="p-2 text-center">
                <p className="text-xs text-gray-600 mb-0.5">Revenue</p>
                <p className="text-lg font-bold text-gray-900">
                  ${allOrders.reduce(
                    (sum, o) => sum + getOrderFinancials(o).total,
                    0
                  ).toFixed(2)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Active Shows (Pending > 0) */}
          {activeShows.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Your Shows</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeShows.map(renderShowCard)}
              </div>
            </div>
          )}

          {/* Past Shows (Pending = 0) - COLLAPSIBLE */}
          {pastShows.length > 0 && (
            <div className="space-y-4">
              <Button
                variant="outline"
                onClick={() => setShowPastShows(!showPastShows)}
                className="w-full flex items-center justify-between p-4 h-auto hover:bg-gray-50 transition-colors border-2"
              >
                <div className="flex items-center gap-3">
                  <Video className="w-5 h-5 text-gray-600" />
                  <span className="text-lg font-semibold text-gray-900">Past Shows</span>
                  <Badge variant="secondary" className="bg-gray-200 text-gray-700">
                    {pastShows.length}
                  </Badge>
                </div>
                {showPastShows ? (
                  <ChevronUp className="w-5 h-5 text-gray-600" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-600" />
                )}
              </Button>

              {showPastShows && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {pastShows.map(renderShowCard)}
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {filteredShows.length === 0 && (
            <Card className="border-2 border-dashed border-gray-300">
              <CardContent className="p-12 text-center">
                <Video className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No shows found</h3>
                <p className="text-gray-600">Create a show to start receiving orders</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!showToDelete} onOpenChange={() => setShowToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Show from Orders View?</AlertDialogTitle>
              <AlertDialogDescription>
                This will hide "{showToDelete?.title}" from your Manage Orders page. This does not delete any data, analytics, revenue totals, or order history.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => hideShow(showToDelete.id)}
                disabled={isHidingShow}
                className="bg-red-600 hover:bg-red-700"
              >
                Remove from View
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ========================================
  // VIEW 2: BATCHES LIST FOR SELECTED SHOW (WITH EXPANDABLE ITEMS)
  // ========================================
  // Fulfillment batches are show-scoped but NOT show-lifecycle-scoped.
  // ALL batches for the show are displayed regardless of show status.
  // Empty state ONLY if truly zero batches exist for this show.
  if (view === 'batches') {
    // Filter batches by search - checks enriched buyer identity + raw batch fields
    const filteredBatches = batchesForShow.filter(batch => {
      const buyerIdentity = getBuyerIdentity(batch);
      const searchLower = searchTerm.toLowerCase();
      return (
        buyerIdentity.name?.toLowerCase().includes(searchLower) ||
        buyerIdentity.email?.toLowerCase().includes(searchLower) ||
        batch.batch_number?.toLowerCase().includes(searchLower) ||
        batch.completion_code?.toLowerCase().includes(searchLower)
      );
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // BATCH CLASSIFICATION (within selected show)
    // Uses isBatchDone helper: batch.status === 'picked_up' OR 'completed'
    // Active: batches that are NOT done (need fulfillment)
    // Completed: batches that ARE done (picked up or completed)
    // Pending: batches with orders still in 'paid' status (need immediate attention)
    // ═══════════════════════════════════════════════════════════════════════════
    const activeBatches = filteredBatches.filter(batch => !isBatchDone(batch));
    const completedBatches = filteredBatches.filter(batch => isBatchDone(batch));

    // For pending highlight card - batches with orders needing immediate attention
    // These are batches with orders in 'paid' status (not yet verified)
    const pendingBatches = batchesForShow.filter(batch => {
      if (isBatchDone(batch)) return false; // Don't show done batches as pending
      const batchOrders = getOrdersForBatch(batch.id);
      const pendingCount = batchOrders.filter(o => o.status === 'paid').length;
      return pendingCount > 0;
    });

    const renderBatchCard = (batch) => {
      const batchOrders = getOrdersForBatch(batch.id);
      const isExpanded = expandedBatches[batch.id];
      const pendingCount = batchOrders.filter(o => o.status === 'paid').length;
      const completedCount = batchOrders.filter(o => o.status === 'picked_up').length;
      
      // Identity enrichment (read-only, display only)
      const buyerIdentity = getBuyerIdentity(batch);
      
      return (
        <Card key={batch.id} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                {buyerIdentity.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${statusColors[batch.status]} border`}>
                  {batch.status}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-red-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        // FIX: Use buyer_id only (buyer_user_id does not exist)
                        setBanningBuyer({
                          user_id: batch.buyer_id,
                          email: buyerIdentity.email,
                          full_name: buyerIdentity.name,
                          buyer_name: buyerIdentity.name
                        });
                      }}
                    >
                      <Ban className="w-4 h-4 mr-2" />
                      Ban Buyer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            
            {/* Buyer identity - joined from buyer_profiles for display only */}
            <h3 className="font-semibold text-lg text-gray-900 mb-1">
              {buyerIdentity.name}
            </h3>
            <p className="text-sm text-gray-600 mb-3">{buyerIdentity.email || "No email"}</p>
            
            {/* Batch Number */}
            <div className="mb-3 p-2 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-600 font-semibold mb-0.5">BATCH #</p>
                  <p className="text-xs font-mono text-gray-900 truncate">
                    {batch.batch_number}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    copyCode(batch.batch_number);
                  }}
                  className="flex-shrink-0 p-1.5 hover:bg-gray-100 rounded transition-colors"
                >
                  {copiedCode === batch.batch_number ? (
                    <Check className="w-3.5 h-3.5 text-green-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-gray-600" />
                  )}
                </button>
              </div>
            </div>
            
            {/* INTEGRITY FIX: Derive totals from ORDERS (filtered to eligible statuses) */}
            <div className="grid grid-cols-2 gap-3 pt-3 border-t">
              <div>
                <p className="text-xs text-gray-600">Items</p>
                <p className="text-lg font-bold text-gray-900">{batchOrders.length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Total</p>
                <p className="text-lg font-bold text-gray-900">
                  ${batchOrders.reduce(
                    (sum, o) => sum + getOrderFinancials(o).total,
                    0
                  ).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Completion Code */}
            <div className="mb-3 p-2 bg-purple-50 rounded-lg border border-purple-100">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-purple-600 font-semibold mb-0.5">PICKUP CODE</p>
                  <p className="text-sm font-mono text-purple-900 font-bold">
                    {batch.completion_code}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    copyCode(batch.completion_code);
                  }}
                  className="flex-shrink-0 p-1.5 hover:bg-purple-100 rounded transition-colors"
                >
                  {copiedCode === batch.completion_code ? (
                    <Check className="w-3.5 h-3.5 text-green-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-purple-600" />
                  )}
                </button>
              </div>
            </div>
            
            <div className="mt-3 pt-3 border-t">
              <div className="flex gap-2 mb-3">
                <Badge className="bg-orange-100 text-orange-800 text-xs">
                  {pendingCount} Pending
                </Badge>
                <Badge className="bg-green-100 text-green-800 text-xs">
                  {completedCount} Done
                </Badge>
              </div>

              {/* Expandable Items List */}
              <Button
                variant="ghost"
                className="w-full flex items-center justify-between hover:bg-gray-100 p-2 rounded-lg mb-3"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleBatchExpansion(batch.id);
                }}
              >
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-gray-600" />
                  <span className="font-semibold text-gray-900 text-sm">
                    {batchOrders.length} {batchOrders.length === 1 ? 'Item' : 'Items'}
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-gray-600" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-600" />
                )}
              </Button>

              {/* Expanded Items Details */}
              {isExpanded && (
                <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
                  {batchOrders.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      {order.product_image_url ? (
                        <img
                          src={order.product_image_url}
                          alt={order.product_title}
                          className="w-12 h-12 object-cover rounded-lg flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Package className="w-6 h-6 text-gray-400" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 text-xs line-clamp-1 mb-1">
                          {order.product_title}
                        </h4>
                        
                        {order.price === 0 && (
                          <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-0 text-[10px] mb-1">
                            <Gift className="w-2.5 h-2.5 mr-1" />
                            FREE GIVI
                          </Badge>
                        )}

                        <div className="flex items-center justify-between gap-2">
                          {order.price === 0 ? (
                            <p className="text-sm font-bold text-green-600">FREE</p>
                          ) : (
                            <p className="text-sm font-bold text-gray-900">
                              ${getOrderFinancials(order).total.toFixed(2)}
                            </p>
                          )}
                          
                          <div className="flex flex-col gap-1 items-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2 text-red-600 border-red-300 hover:bg-red-50"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const { data, error } = await supabase.functions.invoke(
                                    "seller_refund_stripe_only",
                                    {
                                      body: { order_id: order.id }
                                    }
                                  );

                                  if (error) {
                                    console.error("Stripe refund failed:", error);
                                    alert("Refund failed. Please check Stripe or try again.");
                                    return;
                                  }

                                  alert("Refund processed successfully in Stripe.");
                                } catch (err) {
                                  console.error("Unexpected refund error:", err);
                                  alert("Unexpected error processing refund.");
                                }
                              }}
                            >
                              Refund / Remove Item
                            </Button>

                            <Badge className={`${statusColors[order.status]} border text-[10px]`}>
                              {order.status === "paid" ? "Paid" :
                               order.status === "picked_up" ? "Picked Up" :
                               order.status === "cancelled" ? "Cancelled" :
                               "Refunded"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {batch.status !== 'completed' && (
                <Button
                  className="w-full bg-gradient-to-r from-green-600 to-green-500"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBatch(batch);
                    setShowVerificationModal(true);
                  }}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Verify Pickup
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      );
    };

    return (
      <div className="min-h-screen p-4 sm:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={handleBackToShows}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{selectedShow.title}</h1>
              <p className="text-gray-600 mt-1">Buyer batches from this show</p>
            </div>
          </div>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search buyers, codes..."
              className="pl-10"
            />
          </div>

          {/* Top 3 Cards in Grid */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-0 shadow-md">
              <CardContent className="p-4">
                <div className="flex flex-col gap-2">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-gray-600 text-xs">Total Buyers</p>
                    <p className="text-xl font-bold text-gray-900">{batchesForShow.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card 
              className={`border-0 shadow-md cursor-pointer hover:shadow-lg transition-shadow ${
                pendingBatches.length > 0 ? 'bg-orange-50 border-2 border-orange-300' : ''
              }`}
              onClick={() => pendingBatches.length > 0 && setShowPendingModal(true)}
            >
              <CardContent className="p-4">
                <div className="flex flex-col gap-2">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    pendingBatches.length > 0 ? 'bg-orange-200' : 'bg-gray-100'
                  }`}>
                    <Clock className={`w-5 h-5 ${
                      pendingBatches.length > 0 ? 'text-orange-600' : 'text-gray-600'
                    }`} />
                  </div>
                  <div>
                    <p className={`text-xs ${
                      pendingBatches.length > 0 ? 'text-orange-700 font-semibold' : 'text-gray-600'
                    }`}>Pending</p>
                    <p className={`text-xl font-bold ${
                      pendingBatches.length > 0 ? 'text-orange-900' : 'text-gray-900'
                    }`}>{pendingBatches.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* INTEGRITY FIX: Derive totals from ORDERS (filtered to eligible statuses) */}
            <Card className="border-0 shadow-md">
              <CardContent className="p-4">
                <div className="flex flex-col gap-2">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Package className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-gray-600 text-xs">Total Items</p>
                    <p className="text-xl font-bold text-gray-900">
                      {allOrders.filter(o => o.show_id === selectedShow?.id).length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Full Width Revenue Card - INTEGRITY FIX: Derive from ORDERS */}
          <Card className="border-0 shadow-md">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-gray-600 text-sm">Show Revenue</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${allOrders
                    .filter(o => o.show_id === selectedShow?.id)
                    .reduce((sum, o) => sum + getOrderFinancials(o).total, 0)
                    .toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {activeBatches.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Active Batches ({activeBatches.length})</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeBatches.map(renderBatchCard)}
              </div>
            </div>
          )}

          {/* Completed batches - fulfillment finished, all orders picked up */}
          {completedBatches.length > 0 && (
            <div className="space-y-4">
              <Button
                variant="outline"
                onClick={() => setShowPastBatches(!showPastBatches)}
                className="w-full flex items-center justify-between p-4 h-auto hover:bg-gray-50 transition-colors border-2"
              >
                <div className="flex items-center gap-3">
                  <ShoppingBag className="w-5 h-5 text-gray-600" />
                  <span className="text-lg font-semibold text-gray-900">Completed Batches</span>
                  <Badge variant="secondary" className="bg-gray-200 text-gray-700">
                    {completedBatches.length}
                  </Badge>
                </div>
                {showPastBatches ? (
                  <ChevronUp className="w-5 h-5 text-gray-600" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-600" />
                )}
              </Button>

              {showPastBatches && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {completedBatches.map(renderBatchCard)}
                </div>
              )}
            </div>
          )}

          {filteredBatches.length === 0 && (
            <Card className="border-2 border-dashed border-gray-300">
              <CardContent className="p-12 text-center">
                <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No batches found</h3>
                <p className="text-gray-600">No orders were placed during this show</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Pending Batches Modal */}
        <Dialog open={showPendingModal} onOpenChange={setShowPendingModal}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-orange-600" />
                Pending Buyers ({pendingBatches.length})
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {pendingBatches.map((batch) => {
                const batchOrders = getOrdersForBatch(batch.id);
                const pendingCount = batchOrders.filter(o => o.status === 'paid').length;
                const pendingBuyerIdentity = getBuyerIdentity(batch);
                
                return (
                  <Card key={batch.id} className="border border-orange-200 bg-orange-50">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          {/* Buyer identity - joined from buyer_profiles for display only */}
                          <h4 className="font-semibold text-gray-900 text-lg">{pendingBuyerIdentity.name}</h4>
                          <p className="text-sm text-gray-600">{pendingBuyerIdentity.email || "No email"}</p>
                        </div>
                        <Badge className="bg-orange-200 text-orange-800 border-orange-300">
                          {pendingCount} Pending
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-600">Batch #</p>
                          <p className="font-mono text-gray-900 text-xs">{batch.batch_number}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Pickup Code</p>
                          <p className="font-mono font-bold text-purple-900">{batch.completion_code}</p>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-orange-200">
                        <p className="text-xs text-gray-600 mb-2">Pending Items:</p>
                        <div className="space-y-1">
                          {batchOrders
                            .filter(o => o.status === 'paid')
                            .map(order => (
                              <div key={order.id} className="flex items-center gap-2 text-sm">
                                <Package className="w-3 h-3 text-orange-600" />
                                <span className="text-gray-700">{order.product_title}</span>
                                <span className="ml-auto font-semibold text-gray-900">
                                  ${getOrderFinancials(order).total.toFixed(2)}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>

        {showVerificationModal && selectedBatch && (
          <>
            <div 
              className="fixed inset-0 bg-black/40 z-[9998]"
              onClick={() => {
                setShowVerificationModal(false);
                setVerificationCode("");
                setVerificationError("");
                setSelectedBatch(null);
              }}
            />
            
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] w-full max-w-md">
              <Card className="border-0 shadow-2xl">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-gray-900">Verify Pickup Code</h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setShowVerificationModal(false);
                        setVerificationCode("");
                        setVerificationError("");
                        setSelectedBatch(null);
                      }}
                    >
                      <X className="w-5 h-5" />
                    </Button>
                  </div>
                  
                  <p className="text-gray-600 mb-4">
                    {/* Buyer identity - joined from buyer_profiles for display only */}
                    Ask {getBuyerIdentity(selectedBatch).name} to show their 9-digit verification code:
                  </p>
                  
                  <form onSubmit={handleVerifyCode} className="space-y-4">
                    <div>
                      <Label>9-Digit Verification Code</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="\d{9}"
                        maxLength={9}
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="123456789"
                        className="text-2xl font-bold text-center tracking-wider"
                        autoFocus
                      />
                      {verificationError && (
                        <p className="text-red-600 text-sm mt-2">{verificationError}</p>
                      )}
                    </div>
                    
                    {/* INTEGRITY FIX: Derive totals from pre-computed selectedBatchOrders (in-memory only) */}
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <p className="text-xs text-gray-600">
                        <strong>Expected Code:</strong> {selectedBatch.completion_code}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        <strong>Batch:</strong> {selectedBatchOrders.length} items, ${selectedBatchOrders.reduce((sum, o) => sum + (Number(o.price) || 0), 0).toFixed(2)}
                      </p>
                    </div>
                    
                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-green-600 to-green-500"
                      disabled={isVerifying || verificationCode.length !== 9}
                    >
                      {isVerifying ? (
                        "Verifying..."
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Verify & Mark as Picked Up
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-8">
      {/* Add Ban Buyer Dialog at the end */}
      <BanBuyerDialog
        open={!!banningBuyer}
        onOpenChange={() => setBanningBuyer(null)}
        buyer={banningBuyer}
        sellerId={seller?.id}
        onSuccess={() => {
          // Reload data after banning
          loadData();
        }}
      />
    </div>
  );
}