import React, { useState, useEffect, useRef } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ShoppingBag,
  Package,
  MapPin,
  Calendar,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Gift,
  Store,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Copy,
  Check,
  ArrowLeft,
  Trophy
} from "lucide-react";
import { format } from "date-fns";
import MessageSellerButton from "../components/messaging/MessageSellerButton";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { getEffectiveUserContext } from "@/lib/auth/effectiveUser";
import { getBatchesByBuyerId } from "@/api/batches";
import { getOrdersByBuyerId } from "@/api/orders";
import { getAllShows } from "@/api/shows";
import { autoSyncHealBuyerOrders } from "@/api/fulfillment";

export default function BuyerOrders() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [effectiveUserId, setEffectiveUserId] = useState(null);
  const [expandedBatches, setExpandedBatches] = useState({});
  const [copiedCode, setCopiedCode] = useState(null);
  const [showPastOrders, setShowPastOrders] = useState(false);

  // Data state (replacing React Query)
  const [batches, setBatches] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [shows, setShows] = useState([]);
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
      setEffectiveUserId(context.effectiveUserId);
    } catch (error) {
      // User not logged in - expected for visitors
      setUser(null);
      setEffectiveUserId(null);
      setLoading(false);
    }
  };

  // Load data when effectiveUserId is available
  const loadData = async () => {
    if (!effectiveUserId) return;

    try {
      const [batchesData, ordersData] = await Promise.all([
        getBatchesByBuyerId(effectiveUserId),
        getOrdersByBuyerId(effectiveUserId),
      ]);

      setBatches(batchesData);
      setAllOrders(ordersData);
    } catch (error) {
      // Errors handled in API functions, they return empty arrays
      setBatches([]);
      setAllOrders([]);
    } finally {
      setLoading(false);
      initialLoadDone.current = true;
    }
  };

  // Load sellers and shows (reference data)
  const loadReferenceData = async () => {
    try {
      const [sellersData, showsData] = await Promise.all([
        base44.entities.Seller.list(),
        getAllShows(),
      ]);
      setSellers(sellersData);
      setShows(showsData);
    } catch (error) {
      // Graceful fallback - empty arrays
      setSellers([]);
      setShows([]);
    }
  };

  // Initial data load and polling
  useEffect(() => {
    if (!effectiveUserId) return;

    // Initial load
    loadData();
    loadReferenceData();

    // Auto-refresh every 5 seconds
    const interval = setInterval(() => {
      loadData();
    }, 5000);

    return () => clearInterval(interval);
  }, [effectiveUserId]);

  // Auto-sync order status when batch is completed (Base44 parity)
  // Every 5 seconds: for each batch where status === "completed",
  // if ANY order.status === "paid", auto-update those orders to "picked_up"
  useEffect(() => {
    if (!initialLoadDone.current || !effectiveUserId) return;

    const syncOrderStatuses = async () => {
      const healed = await autoSyncHealBuyerOrders(effectiveUserId);
      
      // Reload data after sync if any orders were healed
      if (healed > 0) {
        loadData();
      }
    };

    syncOrderStatuses();
  }, [batches, allOrders, effectiveUserId]);

  const sellersMap = sellers.reduce((acc, seller) => {
    acc[seller.id] = seller;
    return acc;
  }, {});

  const showsMap = shows.reduce((acc, show) => {
    acc[show.id] = show;
    return acc;
  }, {});

  const toggleBatchExpansion = (batchId) => {
    setExpandedBatches(prev => ({
      ...prev,
      [batchId]: !prev[batchId]
    }));
  };

  const getOrdersForBatch = (batchId) => {
    return allOrders.filter(order => order.batch_id === batchId);
  };

  const copyCompletionCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Separate active and past batches
  const activeBatches = batches.filter(batch => batch.status !== 'completed');
  const pastBatches = batches.filter(batch => batch.status === 'completed');

  const statusColors = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    partial: "bg-blue-100 text-blue-800 border-blue-200",
    completed: "bg-green-100 text-green-800 border-green-200",
    cancelled: "bg-red-100 text-red-800 border-red-200",
    paid: "bg-green-100 text-green-800 border-green-200",
    picked_up: "bg-blue-100 text-blue-800 border-blue-200",
    refunded: "bg-red-100 text-red-800 border-red-200"
  };

  const statusIcons = {
    pending: <Clock className="w-4 h-4" />,
    partial: <AlertCircle className="w-4 h-4" />,
    completed: <CheckCircle className="w-4 h-4" />,
    cancelled: <XCircle className="w-4 h-4" />,
    paid: <CheckCircle className="w-4 h-4" />,
    picked_up: <CheckCircle className="w-4 h-4" />,
    refunded: <XCircle className="w-4 h-4" />
  };

  if (!user) { // Check if *any* user is logged in
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <ShoppingBag className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Please Log In</h3>
            <p className="text-gray-600 mb-4">You need to be logged in to view your orders.</p>
            <Button onClick={() => base44.auth.redirectToLogin()}>
              Log In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your orders...</p>
        </div>
      </div>
    );
  }

  // Calculate totals
  const totalOrders = allOrders.length;
  const totalItems = batches.reduce((sum, batch) => sum + (batch.total_items || 0), 0);
  const totalSpent = batches.reduce((sum, batch) => sum + (batch.total_amount || 0), 0);
  const giviWins = allOrders.filter(o => o.price === 0).length;

  const renderBatchCard = (batch) => {
    const seller = sellersMap[batch.seller_id];
    const show = showsMap[batch.show_id];
    const batchOrders = getOrdersForBatch(batch.id);
    const isExpanded = expandedBatches[batch.id];
    const hasGIVIItems = batchOrders.some(o => o.price === 0);

    return (
      <Card key={batch.id} className={`border-0 shadow-lg overflow-hidden ${hasGIVIItems ? 'ring-2 ring-yellow-400' : ''}`}>
        {/* MOBILE OPTIMIZED: Batch Header */}
        <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 border-b p-4 sm:p-6">
          <div className="flex flex-col gap-3">
            {/* Row 1: Seller Info + Status */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {seller?.profile_image_url ? (
                  <img
                    src={seller.profile_image_url}
                    alt={seller.business_name || "Seller"}
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-white shadow-md flex-shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center border-2 border-white shadow-md flex-shrink-0">
                    <Store className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                )}
                
                <div className="min-w-0 flex-1">
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1 line-clamp-1">
                    {seller?.business_name || "Seller"}
                  </h3>
                  {show && (
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-600 mb-1.5">
                      <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span className="line-clamp-1">{show.title}</span>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    {format(new Date(batch.created_date), "MMM d, yyyy")}
                  </p>
                  
                  {/* NEW: GIVI Badge on Batch Header */}
                  {hasGIVIItems && (
                    <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-0 text-xs mt-2">
                      <Trophy className="w-3 h-3 mr-1" />
                      Contains GIVI Win
                    </Badge>
                  )}
                </div>
              </div>

              {/* Status Badge - Mobile Optimized */}
              <Badge className={`${statusColors[batch.status]} border px-2 py-1 sm:px-3 sm:py-1 text-xs sm:text-sm flex items-center gap-1.5 flex-shrink-0`}>
                {statusIcons[batch.status]}
                <span className="hidden sm:inline">
                  {batch.status === "pending" ? "Ready" :
                   batch.status === "partial" ? "Partial" :
                   batch.status === "completed" ? "Done" :
                   "Cancelled"}
                </span>
              </Badge>
            </div>

            {/* Row 2: Batch Stats */}
            <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm bg-white/50 rounded-lg p-2 sm:p-3">
              <div className="flex items-center gap-1.5 text-gray-700">
                <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="font-semibold">{batch.total_items}</span>
                <span className="text-gray-500 hidden sm:inline">items</span>
              </div>
              <span className="text-gray-400">•</span>
              <div className="flex items-center gap-1.5 text-gray-700">
                <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="font-semibold">${batch.total_amount?.toFixed(2)}</span>
              </div>
              {hasGIVIItems && (
                <>
                  <span className="text-gray-400">•</span>
                  <div className="flex items-center gap-1.5 text-yellow-600">
                    <Gift className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="font-semibold">{batchOrders.filter(o => o.price === 0).length} FREE</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 space-y-4">
          {/* MOBILE OPTIMIZED: Pickup Verification Code */}
          <Alert className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-center sm:text-left flex-1 w-full">
                <p className="text-xs sm:text-sm font-semibold text-gray-700 mb-2">Pickup Verification Code</p>
                <div className="flex items-center justify-center sm:justify-start gap-3">
                  <p className="text-3xl sm:text-4xl font-bold text-purple-600 tracking-wider">
                    {batch.completion_code}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyCompletionCode(batch.completion_code)}
                    className="h-10 w-10 p-0 flex-shrink-0"
                  >
                    {copiedCode === batch.completion_code ? (
                      <Check className="w-5 h-5 text-green-600" />
                    ) : (
                      <Copy className="w-5 h-5" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Show this 9-digit code at pickup
                </p>
              </div>
            </div>
          </Alert>

          {/* MOBILE OPTIMIZED: Pickup Location */}
          {batch.pickup_location && (
            <div className="bg-blue-50 rounded-lg p-3 sm:p-4 border border-blue-200">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 mb-1 text-sm sm:text-base">Pickup Location</p>
                  <p className="text-gray-700 text-xs sm:text-sm break-words">{batch.pickup_location}</p>
                  {batch.pickup_notes && (
                    <p className="text-gray-600 text-xs mt-2">
                      <strong>Note:</strong> {batch.pickup_notes}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Status Alerts - MOBILE OPTIMIZED */}
          {batch.status === "pending" && (
            <Alert className="bg-yellow-50 border-yellow-200">
              <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
              <AlertDescription className="text-yellow-800 text-xs sm:text-sm">
                <strong>Ready for Pickup</strong> — Visit the location above and show your verification code.
              </AlertDescription>
            </Alert>
          )}

          {batch.status === "completed" && batch.completed_at && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
              <AlertDescription className="text-green-800 text-xs sm:text-sm">
                <strong>Completed</strong> — Picked up on {format(new Date(batch.completed_at), "MMM d, yyyy")}
              </AlertDescription>
            </Alert>
          )}

          {/* MOBILE OPTIMIZED: Expandable Items List */}
          <div className="border-t pt-4">
            <Button
              variant="ghost"
              className="w-full flex items-center justify-between hover:bg-gray-100 p-3 rounded-lg"
              onClick={() => toggleBatchExpansion(batch.id)}
            >
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                <span className="font-semibold text-gray-900 text-sm sm:text-base">
                  {batchOrders.length} {batchOrders.length === 1 ? 'Item' : 'Items'}
                </span>
              </div>
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-600" />
              )}
            </Button>

            {isExpanded && (
              <div className="mt-3 space-y-3">
                {batchOrders.map((order) => {
                  const isGIVI = order.price === 0;
                  
                  return (
                    <div
                      key={order.id}
                      className={`flex items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg border ${
                        isGIVI 
                          ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-300 ring-2 ring-yellow-400' 
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      {/* MOBILE: Product Image */}
                      {order.product_image_url ? (
                        <img
                          src={order.product_image_url}
                          alt={order.product_title}
                          className="w-14 h-14 sm:w-16 sm:h-16 object-cover rounded-lg flex-shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Package className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" />
                        </div>
                      )}

                      {/* MOBILE: Product Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-gray-900 text-sm sm:text-base line-clamp-2 mb-1">
                              {order.product_title}
                            </h4>
                            
                            {/* ENHANCED: GIVI Badge with Winner Indicator */}
                            {isGIVI && (
                              <div className="space-y-1 mb-2">
                                <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-0 text-xs">
                                  <Trophy className="w-3 h-3 mr-1" />
                                  🎉 GIVI WINNER
                                </Badge>
                                <p className="text-xs text-green-700 font-semibold">
                                  ✅ FREE - No payment required
                                </p>
                              </div>
                            )}

                            {/* Individual Order Status */}
                            <Badge className={`${statusColors[order.status]} border text-xs`}>
                              {order.status === "paid" ? "Paid" :
                               order.status === "picked_up" ? "Picked Up" :
                               order.status === "cancelled" ? "Cancelled" :
                               "Refunded"}
                            </Badge>
                          </div>
                          
                          {/* Price - MOBILE */}
                          <div className="text-left sm:text-right flex-shrink-0">
                            {isGIVI ? (
                              <div>
                                <p className="text-lg sm:text-xl font-bold text-green-600">FREE</p>
                                <p className="text-xs text-gray-500">GIVI Prize</p>
                              </div>
                            ) : (
                              <p className="text-lg sm:text-xl font-bold text-gray-900">
                                ${order.price?.toFixed(2)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* MOBILE OPTIMIZED: Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
            {seller && (
              <MessageSellerButton
                seller={seller}
                orderId={batch.id}
                variant="outline"
                className="w-full sm:flex-1"
              />
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50 pb-20">
      {/* Fixed Header - Back Arrow for BOTH Mobile and Desktop */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 py-3 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="hover:bg-gray-100"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900">My Orders</h1>
              <p className="text-xs sm:text-base text-gray-600 hidden sm:block">Track your purchases and pickup details</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Stats Cards - ENHANCED with GIVI Wins */}
        <div className="grid grid-cols-4 gap-2 sm:gap-4 mb-6">
          <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-500 to-blue-500">
            <CardContent className="p-3 sm:p-6">
              <div className="text-center sm:flex sm:items-center sm:justify-between">
                <div className="flex-1">
                  <p className="text-white/80 text-xs sm:text-sm mb-1">Batches</p>
                  <p className="text-2xl sm:text-3xl font-bold text-white">{batches.length}</p>
                </div>
                <div className="hidden sm:flex w-12 h-12 bg-white/20 rounded-lg items-center justify-center">
                  <ShoppingBag className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-green-500 to-emerald-500">
            <CardContent className="p-3 sm:p-6">
              <div className="text-center sm:flex sm:items-center sm:justify-between">
                <div className="flex-1">
                  <p className="text-white/80 text-xs sm:text-sm mb-1">Items</p>
                  <p className="text-2xl sm:text-3xl font-bold text-white">{totalItems}</p>
                </div>
                <div className="hidden sm:flex w-12 h-12 bg-white/20 rounded-lg items-center justify-center">
                  <Package className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-orange-500 to-red-500">
            <CardContent className="p-3 sm:p-6">
              <div className="text-center sm:flex sm:items-center sm:justify-between">
                <div className="flex-1">
                  <p className="text-white/80 text-xs sm:text-sm mb-1">Spent</p>
                  <p className="text-xl sm:text-3xl font-bold text-white">${totalSpent.toFixed(2)}</p>
                </div>
                <div className="hidden sm:flex w-12 h-12 bg-white/20 rounded-lg items-center justify-center">
                  <DollarSign className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* NEW: GIVI Wins Card */}
          <Card className="border-0 shadow-lg bg-gradient-to-br from-yellow-400 to-orange-500">
            <CardContent className="p-3 sm:p-6">
              <div className="text-center sm:flex sm:items-center sm:justify-between">
                <div className="flex-1">
                  <p className="text-white/80 text-xs sm:text-sm mb-1">GIVI Wins</p>
                  <p className="text-2xl sm:text-3xl font-bold text-white">{giviWins}</p>
                </div>
                <div className="hidden sm:flex w-12 h-12 bg-white/20 rounded-lg items-center justify-center">
                  <Trophy className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Batched Orders - ENHANCED GIVI VISIBILITY */}
        {batches.length === 0 ? (
          <Card className="border-0 shadow-lg">
            <CardContent className="p-8 sm:p-12 text-center">
              <ShoppingBag className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Orders Yet</h3>
              <p className="text-gray-600 mb-6 text-sm sm:text-base">
                Start shopping on live shows to see your orders here!
              </p>
              <Button
                onClick={() => navigate(createPageUrl("Marketplace"))}
                className="bg-gradient-to-r from-purple-600 to-blue-500"
              >
                Browse Live Shows
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Active Orders */}
            {activeBatches.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900">Active Orders</h2>
                {activeBatches.map(renderBatchCard)}
              </div>
            )}

            {/* Past Orders - Collapsible */}
            {pastBatches.length > 0 && (
              <div className="space-y-4">
                <Button
                  variant="outline"
                  onClick={() => setShowPastOrders(!showPastOrders)}
                  className="w-full flex items-center justify-between p-4 h-auto hover:bg-gray-50 transition-colors border-2"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-lg font-semibold text-gray-900">Past Orders</span>
                    <Badge variant="secondary" className="bg-gray-200 text-gray-700">
                      {pastBatches.length}
                    </Badge>
                  </div>
                  {showPastOrders ? (
                    <ChevronUp className="w-5 h-5 text-gray-600" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-600" />
                  )}
                </Button>

                {showPastOrders && (
                  <div className="space-y-4">
                    {pastBatches.map(renderBatchCard)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}