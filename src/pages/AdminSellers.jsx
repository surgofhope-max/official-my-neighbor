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
import { CheckCircle, XCircle, Ban, Search, AlertCircle, Info, Database, UserCog, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function AdminSellers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [actionType, setActionType] = useState("");
  const [statusReason, setStatusReason] = useState("");

  // ═══════════════════════════════════════════════════════════════════════════
  // SELLERS LIST (SUPABASE READ)
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: sellers = [], isLoading } = useQuery({
    queryKey: ['all-sellers'],
    queryFn: async () => {
      console.log("[ADMIN SELLERS][SUPABASE] Loading sellers...");
      
      const { data, error } = await supabase
        .from("sellers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[ADMIN SELLERS][SUPABASE] Load failed:", error);
        throw error;
      }
      
      console.log("[ADMIN SELLERS][SUPABASE] Loaded", data?.length || 0, "sellers");
      return data || [];
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE SELLER STATUS (ATOMIC EDGE FUNCTION)
  // ═══════════════════════════════════════════════════════════════════════════
  const updateSellerMutation = useMutation({
    mutationFn: async ({ id, data, sellerUserId }) => {
      console.log("[ADMIN SELLERS] Updating seller status via Edge Function...");
      console.log("   Seller ID:", id);
      console.log("   New Status:", data.status);
      console.log("   User ID:", sellerUserId);

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

      console.log("[ADMIN SELLERS] Edge Function success:", response.message);
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
    console.log("[ADMIN SELLERS][SUPABASE] View Data:", seller.id, seller.business_name);
    
    if (!seller?.id) {
      alert("Error: Seller ID is missing. Please contact support.");
      console.error("❌ Seller ID is null or undefined:", seller);
      return;
    }
    
    // Navigate directly without access logging (access log removed - was Base44 dependent)
    navigate(createPageUrl(`AdminSellerData?sellerid=${seller.id}`));
  };

  const handleImpersonate = (seller) => {
    console.log("[ADMIN SELLERS][SUPABASE] Impersonate:", seller.id, seller.business_name);
    
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
  const filteredSellers = sellers.filter(seller =>
    seller.business_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    seller.contact_email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
                {sellers.filter(s => s.status === "pending").length}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <p className="text-sm text-gray-600">Approved</p>
              <p className="text-2xl font-bold text-green-600">
                {sellers.filter(s => s.status === "approved").length}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <p className="text-sm text-gray-600">Declined</p>
              <p className="text-2xl font-bold text-red-600">
                {sellers.filter(s => s.status === "declined").length}
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
