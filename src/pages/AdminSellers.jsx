import React, { useState } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle, XCircle, Ban, Search, AlertCircle, Info, Database, UserCog, ArrowLeft, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Detect degraded Supabase errors (503/timeout)
// ═══════════════════════════════════════════════════════════════════════════
function isDegradedSupabaseError(error) {
  if (!error) return false;
  const msg = (error?.message || "").toLowerCase();
  const code = error?.code || "";
  const status = error?.status || error?.statusCode;
  
  return (
    status === 503 ||
    code === "503" ||
    msg.includes("503") ||
    msg.includes("service unavailable") ||
    msg.includes("upstream connect error") ||
    msg.includes("disconnect/reset before headers") ||
    msg.includes("connection timeout") ||
    msg.includes("fetch failed") ||
    msg.includes("network error") ||
    msg.includes("failed to fetch")
  );
}

export default function AdminSellers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [actionType, setActionType] = useState("");
  const [statusReason, setStatusReason] = useState("");

  // Track degraded state for error-truth UI
  const [isLoadDegraded, setIsLoadDegraded] = useState(false);

  // ═══════════════════════════════════════════════════════════════════════════
  // SELLERS LIST (SUPABASE READ) - With error-truth handling
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: sellers, isLoading, error: sellersError, refetch: refetchSellers } = useQuery({
    queryKey: ['all-sellers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sellers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[ADMIN SELLERS] Load failed:", error);
        // Check if degraded
        if (isDegradedSupabaseError(error)) {
          setIsLoadDegraded(true);
        } else {
          setIsLoadDegraded(false);
        }
        throw error;
      }
      
      // Success - clear degraded state
      setIsLoadDegraded(false);
      return data || [];
    },
    retry: (failureCount, error) => {
      // Don't retry on degraded errors
      if (isDegradedSupabaseError(error)) return false;
      return failureCount < 2;
    }
  });

  // Safe sellers array - never null, but track if it's from error state
  const sellersData = sellers ?? [];
  const hasLoadError = !!sellersError;

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE SELLER STATUS (ATOMIC EDGE FUNCTION)
  // ═══════════════════════════════════════════════════════════════════════════
  const updateSellerMutation = useMutation({
    mutationFn: async ({ id, data, sellerUserId }) => {
      // Single atomic Edge Function call handles:
      // 1. sellers.status update
      // 2. user_metadata sync
      // 3. notification creation
      const { data: response, error } = await supabase.functions.invoke("approve-seller", {
        body: {
          seller_id: id,
          seller_user_id: sellerUserId,
          new_status: data.status,
          status_reason: data.status_reason || null
        }
      });

      if (error) {
        console.error("[ADMIN SELLERS] Edge Function error:", error);
        throw new Error(error.message || "Failed to update seller status");
      }

      if (!response?.success) {
        console.error("[ADMIN SELLERS] Edge Function returned failure:", response);
        throw new Error(response?.error || "Unknown error updating seller status");
      }

      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-sellers'] });
      queryClient.invalidateQueries({ queryKey: ['all-users-manage'] });
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      setShowReasonDialog(false);
      setSelectedSeller(null);
      setStatusReason("");
    },
    onError: (error) => {
      console.error("[ADMIN SELLERS] Mutation error:", error);
      alert(`Failed to update seller status: ${error.message}`);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════
  const handleStatusAction = (seller, status) => {
    if (seller.business_name === "Surge of Hope" || seller.created_by === "admin@surge.org") {
      alert("Cannot change status of the primary admin account (Surge of Hope LLC)");
      return;
    }

    if (status === "declined" || status === "suspended") {
      setSelectedSeller(seller);
      setActionType(status);
      setShowReasonDialog(true);
    } else {
      updateSellerMutation.mutate({ 
        id: seller.id, 
        data: { status, status_reason: null },
        sellerUserId: seller.user_id
      });
    }
  };

  const confirmStatusChange = () => {
    if (selectedSeller && statusReason.trim()) {
      updateSellerMutation.mutate({
        id: selectedSeller.id,
        data: {
          status: actionType,
          status_reason: statusReason.trim()
        },
        sellerUserId: selectedSeller.user_id
      });
    }
  };

  const handleViewData = (seller) => {
    if (!seller?.id) {
      alert("Error: Seller ID is missing. Please contact support.");
      console.error("❌ Seller ID is null or undefined:", seller);
      return;
    }
    
    // Navigate directly without access logging (access log removed - was Base44 dependent)
    navigate(createPageUrl("AdminSellerData") + `?sellerId=${seller.id}`);
  };

  const handleImpersonate = (seller) => {
    // Use seller.user_id directly (no Base44 BuyerProfile lookup)
    const impersonatedUserId = seller.user_id || seller.created_by;
    
    sessionStorage.setItem('admin_impersonate_seller_id', seller.id);
    sessionStorage.setItem('admin_impersonate_user_id', impersonatedUserId || '');
    sessionStorage.setItem('admin_impersonate_user_email', seller.created_by || '');
    sessionStorage.setItem('admin_impersonate_start', new Date().toISOString());
    
    navigate(createPageUrl("SellerDashboard"));
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // FILTERS & UI HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  const filteredSellers = sellersData.filter(seller =>
    seller.business_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    seller.contact_email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Stats - show "—" when degraded, actual counts when loaded successfully
  const pendingCount = hasLoadError ? "—" : sellersData.filter(s => s.status === "pending").length;
  const approvedCount = hasLoadError ? "—" : sellersData.filter(s => s.status === "approved").length;
  const declinedCount = hasLoadError ? "—" : sellersData.filter(s => s.status === "declined").length;

  const statusColors = {
    pending: "bg-gray-100 text-gray-800 border-gray-200",
    approved: "bg-green-100 text-green-800 border-green-200",
    declined: "bg-red-100 text-red-800 border-red-200",
    suspended: "bg-yellow-100 text-yellow-800 border-yellow-200"
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen p-4 sm:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
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
              <h1 className="text-3xl font-bold text-gray-900">Seller Management</h1>
              <p className="text-gray-600 mt-1">Approve and manage seller accounts</p>
            </div>
          </div>
        </div>

        {/* Degraded Mode Banner */}
        {isLoadDegraded && (
          <Alert className="border-orange-300 bg-orange-50">
            <AlertCircle className="h-5 w-5 text-orange-600" />
            <AlertDescription className="flex items-center justify-between w-full">
              <span className="text-orange-900">
                <strong>Backend temporarily unavailable</strong> (Supabase 503/timeout). Data may be incomplete. Retry in a moment.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchSellers()}
                className="ml-4 border-orange-300 text-orange-700 hover:bg-orange-100"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Generic Error Banner (non-degraded) */}
        {hasLoadError && !isLoadDegraded && (
          <Alert className="border-red-300 bg-red-50">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <AlertDescription className="flex items-center justify-between w-full">
              <span className="text-red-900">
                <strong>Failed to load sellers:</strong> {sellersError?.message || "Unknown error"}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchSellers()}
                className="ml-4 border-red-300 text-red-700 hover:bg-red-100"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Search & Stats */}
        <div className="grid sm:grid-cols-5 gap-4">
          <div className="sm:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search sellers..."
                className="pl-10"
              />
            </div>
          </div>
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-gray-600">
                {pendingCount}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <p className="text-sm text-gray-600">Approved</p>
              <p className="text-2xl font-bold text-green-600">
                {approvedCount}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <p className="text-sm text-gray-600">Declined</p>
              <p className="text-2xl font-bold text-red-600">
                {declinedCount}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Sellers Table */}
        <Card className="shadow-lg border-0">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead>Business Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Stripe</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
                      </TableCell>
                    </TableRow>
                  ) : hasLoadError ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <div className="flex flex-col items-center gap-3">
                          <AlertCircle className="w-12 h-12 text-orange-500" />
                          <p className="text-orange-700 font-medium">
                            {isLoadDegraded ? "Unable to load sellers (backend unavailable)" : "Failed to load sellers"}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refetchSellers()}
                            className="border-orange-300 text-orange-700 hover:bg-orange-100"
                          >
                            <RefreshCw className="w-4 h-4 mr-1" />
                            Retry
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredSellers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                        No sellers found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSellers.map((seller) => {
                      const isProtected = seller.business_name === "Surge of Hope" || seller.created_by === "admin@surge.org";
                      
                      return (
                        <TableRow key={seller.id}>
                          <TableCell>
                            <div>
                              <p className="font-semibold flex items-center gap-2">
                                {seller.business_name}
                                {isProtected && (
                                  <Badge className="bg-purple-100 text-purple-800 border-purple-200 border text-xs">
                                    Admin
                                  </Badge>
                                )}
                              </p>
                              <p className="text-sm text-gray-600">{seller.contact_email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <p>{seller.contact_phone}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <p>{seller.pickup_city}, {seller.pickup_state}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {seller.stripe_connected ? (
                              <Badge className="bg-green-100 text-green-800 border-green-200 border">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Connected
                              </Badge>
                            ) : (
                              <Badge className="bg-gray-100 text-gray-800 border-gray-200 border">
                                <XCircle className="w-3 h-3 mr-1" />
                                Not Connected
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Badge className={`${statusColors[seller.status]} border`}>
                                {seller.status}
                              </Badge>
                              {seller.status_reason && (
                                <div className="flex items-start gap-1 mt-1">
                                  <Info className="w-3 h-3 text-gray-500 mt-0.5 flex-shrink-0" />
                                  <p className="text-xs text-gray-600">{seller.status_reason}</p>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2 flex-wrap">
                              {/* Admin Tools - Always visible */}
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-blue-600 border-blue-200 hover:bg-blue-50"
                                onClick={() => handleViewData(seller)}
                              >
                                <Database className="w-4 h-4 mr-1" />
                                View Data
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-purple-600 border-purple-200 hover:bg-purple-50"
                                onClick={() => handleImpersonate(seller)}
                              >
                                <UserCog className="w-4 h-4 mr-1" />
                                Impersonate
                              </Button>

                              {/* Status Actions - Only for non-protected sellers */}
                              {!isProtected && (
                                <>
                                  {seller.status !== "approved" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-green-600 border-green-200 hover:bg-green-50"
                                      onClick={() => handleStatusAction(seller, "approved")}
                                    >
                                      <CheckCircle className="w-4 h-4 mr-1" />
                                      Approve
                                    </Button>
                                  )}
                                  {seller.status !== "declined" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-red-600 border-red-200 hover:bg-red-50"
                                      onClick={() => handleStatusAction(seller, "declined")}
                                    >
                                      <XCircle className="w-4 h-4 mr-1" />
                                      Decline
                                    </Button>
                                  )}
                                  {seller.status !== "suspended" && seller.status !== "declined" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-yellow-600 border-yellow-200 hover:bg-yellow-50"
                                      onClick={() => handleStatusAction(seller, "suspended")}
                                    >
                                      <Ban className="w-4 h-4 mr-1" />
                                      Suspend
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Reason Dialog */}
        <Dialog open={showReasonDialog} onOpenChange={setShowReasonDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {actionType === "declined" ? "Decline Seller" : "Suspend Seller"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Seller: {selectedSeller?.business_name}</Label>
              </div>
              <div className="space-y-2">
                <Label>Reason *</Label>
                <Textarea
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder={`Please provide a reason for ${actionType === "declined" ? "declining" : "suspending"} this seller...`}
                  rows={4}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowReasonDialog(false);
                    setStatusReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className={actionType === "declined" ? "bg-red-600 hover:bg-red-700" : "bg-yellow-600 hover:bg-yellow-700"}
                  onClick={confirmStatusChange}
                  disabled={!statusReason.trim() || updateSellerMutation.isPending}
                >
                  {updateSellerMutation.isPending ? "Processing..." : "Confirm"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
