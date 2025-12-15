import React, { useState, useEffect, useRef } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
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
import { getBatchesBySellerId } from "@/api/sellerBatches";
import { getOrdersBySellerId } from "@/api/sellerOrders";
import { getShowsBySellerId } from "@/api/shows";
import { autoSyncHealOrders } from "@/api/fulfillment";

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

  // Track if initial load is complete
  const initialLoadDone = useRef(false);

  // Load user on mount
  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      
      // Use centralized effective user context for impersonation support
      const context = getEffectiveUserContext(currentUser);
      
      // Resolve seller - impersonation aware
      let resolvedSeller = null;
      
      if (context.isImpersonating && context.impersonatedSellerId) {
        // Admin is impersonating - load the impersonated seller
        resolvedSeller = await getSellerById(context.impersonatedSellerId);
      } else {
        // Normal user - load their seller profile
        resolvedSeller = await getSellerByUserId(currentUser.id);
      }
      
      if (resolvedSeller) {
        setSeller(resolvedSeller);
        
        // Non-admin non-approved sellers get redirected
        if (currentUser.role !== "admin" && resolvedSeller.status !== "approved") {
          navigate(createPageUrl("Marketplace"));
          return;
        }
      } else {
        // No seller profile - redirect to marketplace
        navigate(createPageUrl("Marketplace"));
        return;
      }
    } catch (error) {
      setUser(null);
      setSeller(null);
      setLoading(false);
      navigate(createPageUrl("Marketplace"));
    }
  };

  // Load data when seller is available
  const loadData = async () => {
    if (!seller?.id) return;

    try {
      const [batchesData, ordersData] = await Promise.all([
        getBatchesBySellerId(seller.id),
        getOrdersBySellerId(seller.id),
      ]);

      setAllBatches(batchesData);
      setAllOrders(ordersData);
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
    if (!seller?.id) return;

    try {
      const allShowsData = await getShowsBySellerId(seller.id);
      const visibleShows = allShowsData.filter(show => !show.hidden_from_orders);
      setShows(visibleShows);
    } catch (error) {
      setShows([]);
    }
  };

  // Initial data load and polling
  useEffect(() => {
    if (!seller?.id) return;

    // Initial load
    loadData();
    loadShows();

    // Auto-refresh every 5 seconds
    const interval = setInterval(() => {
      loadData();
    }, 5000);

    return () => clearInterval(interval);
  }, [seller?.id]);

  // Auto-sync order status when batch is completed (Base44 parity)
  // Every 5 seconds: for each batch where status === "completed",
  // if ANY order.status === "paid", auto-update those orders to "picked_up"
  useEffect(() => {
    if (!initialLoadDone.current || !seller?.id) return;

    const syncOrderStatuses = async () => {
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
      await base44.entities.Show.update(showId, { hidden_from_orders: true });
      await loadShows();
      setShowToDelete(null);
    } catch (error) {
      // Mutation not yet wired - expected during migration
    } finally {
      setIsHidingShow(false);
    }
  };

  const verifyCompletionCode = async ({ code, batch }) => {
    if (batch.completion_code !== code) {
      setVerificationError("Invalid verification code");
      return;
    }

    setIsVerifying(true);
    try {
      const batchOrders = allOrders.filter(order => order.batch_id === batch.id);
      
      await Promise.all(
        batchOrders.map(order =>
          base44.entities.Order.update(order.id, {
            status: "picked_up",
            picked_up_at: new Date().toISOString(),
            picked_up_by: user.email
          })
        )
      );
      
      await base44.entities.Batch.update(batch.id, {
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: user.email
      });

      await base44.entities.Notification.create({
        user_id: batch.buyer_id,
        title: "Leave a Review",
        body: `Your order from ${seller.business_name} is complete. Tap to leave a review.`,
        type: "review_request",
        metadata: {
          seller_id: seller.id,
          seller_name: seller.business_name,
          order_id: batchOrders[0].id,
          batch_id: batch.id
        }
      });
      
      // Reload data after verification
      await loadData();
      
      setShowVerificationModal(false);
      setVerificationCode("");
      setVerificationError("");
      setSelectedBatch(null);
      
      alert(`✅ Successfully verified ${batchOrders.length} ${batchOrders.length === 1 ? 'order' : 'orders'}. Review notification sent to buyer.`);
    } catch (error) {
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

  const getPendingCountForShow = (showId) => {
    const showBatches = allBatches.filter(batch => batch.show_id === showId);
    return showBatches.filter(batch => {
      const batchOrders = allOrders.filter(order => order.batch_id === batch.id);
      const pendingCount = batchOrders.filter(o => o.status === 'paid').length;
      return pendingCount > 0;
    }).length;
  };

  const showsWithStats = shows.map(show => {
    const showBatches = allBatches.filter(batch => batch.show_id === show.id);
    const totalRevenue = showBatches.reduce((sum, batch) => sum + (batch.total_amount || 0), 0);
    const totalItems = showBatches.reduce((sum, batch) => sum + (batch.total_items || 0), 0);
    const pendingCount = getPendingCountForShow(show.id);
    
    return {
      ...show,
      batchCount: showBatches.length,
      totalRevenue,
      totalItems,
      uniqueBuyers: showBatches.length,
      pendingCount
    };
  });

  const batchesForShow = selectedShow 
    ? allBatches.filter(batch => batch.show_id === selectedShow.id)
    : [];

  const getOrdersForBatch = (batchId) => {
    return allOrders.filter(order => order.batch_id === batchId);
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

    // Separate active and past shows based on pending count
    const activeShows = filteredShows.filter(show => show.pendingCount > 0);
    const pastShows = filteredShows.filter(show => show.pendingCount === 0);

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
            <div className="absolute bottom-3 left-3 right-3">
              <h3 className="text-white font-bold text-lg line-clamp-2">{show.title}</h3>
            </div>
          </div>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Date:</span>
                <span className="font-medium">
                  {format(new Date(show.scheduled_start), "MMM d, yyyy")}
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
                    ${show.totalRevenue.toFixed(0)}
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
                  ${allBatches.reduce((sum, b) => sum + (b.total_amount || 0), 0).toFixed(2)}
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
  if (view === 'batches') {
    const filteredBatches = batchesForShow.filter(batch =>
      batch.buyer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      batch.buyer_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      batch.batch_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      batch.completion_code?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Separate active and past batches
    const activeBatches = filteredBatches.filter(batch => {
      const batchOrders = getOrdersForBatch(batch.id);
      const pendingCount = batchOrders.filter(o => o.status === 'paid').length;
      const completedCount = batchOrders.filter(o => o.status === 'picked_up').length;
      return pendingCount > 0 || completedCount > 0;
    });

    const pastBatches = filteredBatches.filter(batch => {
      const batchOrders = getOrdersForBatch(batch.id);
      const pendingCount = batchOrders.filter(o => o.status === 'paid').length;
      const completedCount = batchOrders.filter(o => o.status === 'picked_up').length;
      return pendingCount === 0 && completedCount === 0;
    });

    // Calculate pending batches
    const pendingBatches = batchesForShow.filter(batch => {
      const batchOrders = getOrdersForBatch(batch.id);
      const pendingCount = batchOrders.filter(o => o.status === 'paid').length;
      return pendingCount > 0;
    });

    const renderBatchCard = (batch) => {
      const batchOrders = getOrdersForBatch(batch.id);
      const isExpanded = expandedBatches[batch.id];
      const pendingCount = batchOrders.filter(o => o.status === 'paid').length;
      const completedCount = batchOrders.filter(o => o.status === 'picked_up').length;
      
      return (
        <Card key={batch.id} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                {batch.buyer_name?.[0]?.toUpperCase() || '?'}
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
                        setBanningBuyer({
                          user_id: batch.buyer_id,
                          email: batch.buyer_email,
                          full_name: batch.buyer_name,
                          buyer_name: batch.buyer_name
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
            
            <h3 className="font-semibold text-lg text-gray-900 mb-1">
              {batch.buyer_name}
            </h3>
            <p className="text-sm text-gray-600 mb-3">{batch.buyer_email}</p>
            
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
            
            <div className="grid grid-cols-2 gap-3 pt-3 border-t">
              <div>
                <p className="text-xs text-gray-600">Items</p>
                <p className="text-lg font-bold text-gray-900">{batch.total_items}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Total</p>
                <p className="text-lg font-bold text-gray-900">
                  ${batch.total_amount.toFixed(2)}
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
                              ${order.price?.toFixed(2)}
                            </p>
                          )}
                          
                          <div className="flex flex-col gap-1 items-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2 text-red-600 border-red-300 hover:bg-red-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                alert("Refund/Remove functionality coming soon");
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

            <Card className="border-0 shadow-md">
              <CardContent className="p-4">
                <div className="flex flex-col gap-2">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Package className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-gray-600 text-xs">Total Items</p>
                    <p className="text-xl font-bold text-gray-900">
                      {batchesForShow.reduce((sum, b) => sum + b.total_items, 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Full Width Revenue Card */}
          <Card className="border-0 shadow-md">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-gray-600 text-sm">Show Revenue</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${batchesForShow.reduce((sum, b) => sum + b.total_amount, 0).toFixed(2)}
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

          {pastBatches.length > 0 && (
            <div className="space-y-4">
              <Button
                variant="outline"
                onClick={() => setShowPastBatches(!showPastBatches)}
                className="w-full flex items-center justify-between p-4 h-auto hover:bg-gray-50 transition-colors border-2"
              >
                <div className="flex items-center gap-3">
                  <ShoppingBag className="w-5 h-5 text-gray-600" />
                  <span className="text-lg font-semibold text-gray-900">Past Buyer Batches</span>
                  <Badge variant="secondary" className="bg-gray-200 text-gray-700">
                    {pastBatches.length}
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
                  {pastBatches.map(renderBatchCard)}
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
                
                return (
                  <Card key={batch.id} className="border border-orange-200 bg-orange-50">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-gray-900 text-lg">{batch.buyer_name}</h4>
                          <p className="text-sm text-gray-600">{batch.buyer_email}</p>
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
                                  ${order.price?.toFixed(2)}
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
                    Ask {selectedBatch.buyer_name} to show their 9-digit verification code:
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
                    
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <p className="text-xs text-gray-600">
                        <strong>Expected Code:</strong> {selectedBatch.completion_code}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        <strong>Batch:</strong> {selectedBatch.total_items} items, ${selectedBatch.total_amount.toFixed(2)}
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