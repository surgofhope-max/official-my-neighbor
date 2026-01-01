import React, { useState } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Search, Ban, CheckCircle, XCircle, Trash2, AlertCircle, Shield, UserX, ArrowLeft, Power, PowerOff, Eye, FileText, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import UserProfileDialog from "../components/admin/UserProfileDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  isBuyerAccessReady,
  isSellerAccessReady,
  isSellerPaymentReady,
  getOnboardingReadiness,
} from "@/lib/auth/onboardingState";

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

export default function ManageUsers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState(null);
  const [actionDialog, setActionDialog] = useState({ open: false, action: "", user: null });
  const [profileDialog, setProfileDialog] = useState({ open: false, user: null });
  
  // Track degraded state for error-truth UI
  const [isLoadDegraded, setIsLoadDegraded] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // DATA FETCHING: Direct Supabase queries (replaces broken base44.entities)
  // ─────────────────────────────────────────────────────────────────────────

  // Fetch all users - AUTO REFRESH every 10 seconds (disabled when degraded)
  // CRITICAL: This query MUST include account_status from public.users
  const { data: allUsers = [], isLoading: usersLoading, error: usersError, refetch: refetchUsers } = useQuery({
    queryKey: ['all-users-manage'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("users")
          .select("*")
          .order("created_at", { ascending: false });
        
        if (error) {
          console.warn("[ManageUsers] Failed to load users:", error.message);
          if (isDegradedSupabaseError(error)) {
            setIsLoadDegraded(true);
          }
          throw error;
        }
        setIsLoadDegraded(false);
        
        // Debug log: show account_status values after fetch
        if (data && data.length > 0) {
          const statusCounts = data.reduce((acc, u) => {
            const s = u.account_status || 'active';
            acc[s] = (acc[s] || 0) + 1;
            return acc;
          }, {});
          console.log('[ManageUsers] Fetched users - account_status distribution:', statusCounts);
        }
        
        return data || [];
      } catch (err) {
        if (isDegradedSupabaseError(err)) {
          setIsLoadDegraded(true);
        }
        throw err;
      }
    },
    refetchInterval: isLoadDegraded ? false : 10000, // Disable auto-refresh when degraded
    staleTime: 5000,
    retry: (failureCount, error) => {
      if (isDegradedSupabaseError(error)) return false;
      return failureCount < 2;
    }
  });

  // Fetch all buyer profiles - AUTO REFRESH (disabled when degraded)
  const { data: buyerProfiles = [] } = useQuery({
    queryKey: ['all-buyer-profiles-manage'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("buyer_profiles")
          .select("*");
        
        if (error) {
          console.warn("[ManageUsers] Failed to load buyer profiles:", error.message);
          return [];
        }
        return data || [];
      } catch (err) {
        console.warn("[ManageUsers] Unexpected error loading buyer profiles:", err);
        return [];
      }
    },
    refetchInterval: isLoadDegraded ? false : 10000,
    staleTime: 5000,
    retry: (failureCount, error) => {
      if (isDegradedSupabaseError(error)) return false;
      return failureCount < 2;
    }
  });

  // Fetch all sellers - AUTO REFRESH (disabled when degraded)
  const { data: sellers = [] } = useQuery({
    queryKey: ['all-sellers-manage'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("sellers")
          .select("*");
        
        if (error) {
          console.warn("[ManageUsers] Failed to load sellers:", error.message);
          return [];
        }
        return data || [];
      } catch (err) {
        console.warn("[ManageUsers] Unexpected error loading sellers:", err);
        return [];
      }
    },
    refetchInterval: isLoadDegraded ? false : 10000,
    staleTime: 5000,
    retry: (failureCount, error) => {
      if (isDegradedSupabaseError(error)) return false;
      return failureCount < 2;
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ID MAPS: Quick lookup by auth user ID (uuid)
  // - buyerMap: keyed by buyer_profiles.user_id (auth.users.id)
  // - sellerMap: keyed by sellers.user_id (auth.users.id)
  // ─────────────────────────────────────────────────────────────────────────
  const buyerMap = (buyerProfiles || []).reduce((acc, buyer) => {
    if (buyer?.user_id) {
      acc[buyer.user_id] = buyer;
    }
    return acc;
  }, {});

  const sellerMap = (sellers || []).reduce((acc, seller) => {
    // Key by seller.user_id (auth user id), NOT created_by (email)
    if (seller?.user_id) {
      acc[seller.user_id] = seller;
    }
    return acc;
  }, {});

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE USER ACCOUNT STATUS: Suspend / Unsuspend
  // Uses canonical public.users columns:
  // - account_status: 'active' | 'suspended'
  // - account_status_reason: Admin-provided reason
  // - account_status_updated_at: Timestamp
  // - account_status_updated_by: Admin user ID
  //
  // FIX: Uses .select() to detect RLS blocking (0-row updates)
  // FIX: Uses optimistic update + delayed refetch to prevent stale data overwrite
  // ═══════════════════════════════════════════════════════════════════════════
  const updateUserStatusMutation = useMutation({
    mutationFn: async ({ userId, status, reason }) => {
      const { data: authData } = await supabase.auth.getUser();
      const currentUser = authData?.user ?? null;
      const now = new Date().toISOString();
      
      const updateData = {
        account_status: status,
        account_status_reason: status !== 'active' ? (reason || null) : null,
        account_status_updated_at: now,
        account_status_updated_by: currentUser?.id || null
      };
      
      // ═══════════════════════════════════════════════════════════════════════════
      // FIX: Use .select() to get returned rows - detects RLS blocking
      // If RLS blocks the update, 0 rows are returned even though no error is thrown
      // ═══════════════════════════════════════════════════════════════════════════
      const { data, error } = await supabase
        .from("users")
        .update(updateData)
        .eq("id", userId)
        .select("id, account_status");
      
      if (error) {
        console.error('[ManageUsers] Update error:', error);
        throw new Error(error.message);
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // FIX: Detect 0-row updates caused by RLS policy blocking
      // This happens when the current user's role is not allowed to UPDATE
      // ═══════════════════════════════════════════════════════════════════════════
      if (!data || data.length === 0) {
        console.error('[ManageUsers] RLS blocked update: 0 rows returned');
        throw new Error('Permission denied: your admin role is not allowed to update users. Check RLS policy.');
      }
      
      console.log('[ManageUsers] account_status after mutation:', status, '- rows updated:', data.length);
      console.log('[ManageUsers] Updated row:', data[0]);
      
      // Return the update info for cache update
      return { userId, status, reason, updatedAt: now, updatedBy: currentUser?.id };
    },
    // ═══════════════════════════════════════════════════════════════════════════
    // OPTIMISTIC UPDATE: Immediately update the cache before server confirms
    // This makes the button swap instantly without waiting for refetch
    // ═══════════════════════════════════════════════════════════════════════════
    onMutate: async ({ userId, status, reason }) => {
      // Cancel any outgoing refetches to prevent race conditions
      await queryClient.cancelQueries({ queryKey: ['all-users-manage'] });
      
      // Snapshot previous value for rollback
      const previousUsers = queryClient.getQueryData(['all-users-manage']);
      
      // Optimistically update the cache
      const now = new Date().toISOString();
      queryClient.setQueryData(['all-users-manage'], (old) => {
        if (!old) return old;
        const updated = old.map(user => 
          user.id === userId 
            ? { 
                ...user, 
                account_status: status,
                account_status_reason: status !== 'active' ? (reason || null) : null,
                account_status_updated_at: now
              }
            : user
        );
        console.log('[ManageUsers] Optimistic update applied for user:', userId, '→', status);
        return updated;
      });
      
      return { previousUsers, userId, status };
    },
    onSuccess: (data, variables, context) => {
      // ═══════════════════════════════════════════════════════════════════════════
      // FIX: Do NOT immediately invalidate queries - this causes stale data race
      // Instead, directly set the cache with confirmed server data
      // The background polling will eventually sync, but UI stays correct
      // ═══════════════════════════════════════════════════════════════════════════
      
      // Re-apply the update to cache to ensure it persists
      queryClient.setQueryData(['all-users-manage'], (old) => {
        if (!old) return old;
        return old.map(user => 
          user.id === data.userId 
            ? { 
                ...user, 
                account_status: data.status,
                account_status_reason: data.status !== 'active' ? (data.reason || null) : null,
                account_status_updated_at: data.updatedAt,
                account_status_updated_by: data.updatedBy
              }
            : user
        );
      });
      
      console.log('[ManageUsers] Mutation success - cache updated:', data.userId, '→', data.status);
      
      // Close dialog and show success
      setActionDialog({ open: false, action: "", user: null });
      alert('User status updated successfully');
      
      // Delay invalidation to allow DB replication to settle
      // This ensures the next refetch gets fresh data
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['all-users-manage'] });
        queryClient.invalidateQueries({ queryKey: ['all-users'] });
      }, 2000);
    },
    onError: (error, variables, context) => {
      // Rollback to previous state on error
      if (context?.previousUsers) {
        queryClient.setQueryData(['all-users-manage'], context.previousUsers);
      }
      console.error("❌ Failed to update user status:", error);
      alert(`Failed to update user: ${error.message}`);
    }
  });

  // Delete user account mutation (HARD DELETE - TEST MODE)
  // Uses direct Supabase queries instead of base44.entities
  const deleteUserMutation = useMutation({
    mutationFn: async (userId) => {
      const user = allUsers.find(u => u.id === userId);
      if (!user) {
        return;
      }

      // Find seller profile by user_id (not email)
      const seller = sellers.find(s => s.user_id === userId);

      // 1. Delete buyer profile
      await supabase.from("buyer_profiles").delete().eq("user_id", userId);

      // 2. Delete seller profile and related data
      if (seller) {
        // Delete products
        await supabase.from("products").delete().eq("seller_id", seller.id);
        // Delete shows
        await supabase.from("shows").delete().eq("seller_id", seller.id);
        // Delete seller
        await supabase.from("sellers").delete().eq("id", seller.id);
      }

      // 3. Delete orders (as buyer)
      await supabase.from("orders").delete().eq("buyer_id", userId);

      // 4. Delete orders (as seller)
      if (seller) {
        await supabase.from("orders").delete().eq("seller_id", seller.id);
      }

      // 5. Delete batches
      await supabase.from("batches").delete().eq("buyer_id", userId);

      // 6. Delete conversations and messages
      // First get conversation IDs
      const { data: buyerConvs } = await supabase
        .from("conversations")
        .select("id")
        .eq("buyer_id", userId);
      
      const sellerConvs = seller 
        ? (await supabase.from("conversations").select("id").eq("seller_id", seller.id)).data || []
        : [];
      
      const allConvIds = [...(buyerConvs || []), ...sellerConvs].map(c => c.id);
      
      if (allConvIds.length > 0) {
        await supabase.from("messages").delete().in("conversation_id", allConvIds);
        await supabase.from("conversations").delete().in("id", allConvIds);
      }

      // 7. Delete follows
      await supabase.from("followed_sellers").delete().eq("buyer_id", userId);

      // 8. Delete bookmarks
      await supabase.from("bookmarked_shows").delete().eq("buyer_id", userId);

      // 9. Delete community follows
      await supabase.from("followed_communities").delete().eq("user_id", userId);

      // 10. Delete notifications
      await supabase.from("notifications").delete().eq("user_id", userId);

      // 11. Delete GIVI entries
      await supabase.from("givi_entries").delete().eq("user_id", userId);

      // 12. Delete reviews
      await supabase.from("reviews").delete().eq("reviewer_id", userId);

      // 13. Delete share logs
      await supabase.from("share_logs").delete().eq("sharer_id", userId);

      // 14. Delete viewer bans
      await supabase.from("viewer_bans").delete().eq("viewer_id", userId);

      // 15. Delete buyer bans
      if (seller) {
        await supabase.from("seller_banned_buyers").delete().eq("seller_id", seller.id);
      }

      // 16. Delete the User record itself (hard delete)
      const { error } = await supabase.from("users").delete().eq("id", userId);
      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-users-manage'] });
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      queryClient.invalidateQueries({ queryKey: ['all-buyer-profiles-manage'] });
      queryClient.invalidateQueries({ queryKey: ['all-buyer-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['all-sellers-manage'] });
      queryClient.invalidateQueries({ queryKey: ['all-sellers'] });
      setActionDialog({ open: false, action: "", user: null });
      alert('User account deleted successfully');
    },
    onError: (error) => {
      console.error("❌ Failed to delete user:", error);
      alert(`Failed to delete user: ${error.message}`);
    }
  });

  const handleAction = (action, user) => {
    setActionDialog({ open: true, action, user });
  };

  const executeAction = () => {
    const { action, user } = actionDialog;
    
    if (action === 'delete') {
      deleteUserMutation.mutate(user.id);
      return;
    }

    let reason = null;
    if (action === 'suspend' || action === 'ban' || action === 'deny' || action === 'deactivate') {
      reason = prompt(`Please provide a reason for ${action === 'deactivate' ? 'deactivating' : action + 'ing'} this account:`);
      if (!reason) return;
    }

    const statusMap = {
      'suspend': 'suspended',
      'unsuspend': 'active',
      'ban': 'banned',
      'unban': 'active',
      'deny': 'denied',
      'activate': 'active',
      'deactivate': 'denied'
    };

    updateUserStatusMutation.mutate({
      userId: user.id,
      status: statusMap[action],
      reason
    });
  };

  // Filter users - Show ALL users (remove profile requirement for global account control)
  // Use safe guards to prevent crashes on undefined data
  const filteredUsers = (allUsers || []).filter(user => {
    // Skip if user is undefined or admin accounts
    if (!user || user.email === 'admin@surge.org') return false;

    // Search filter (with safe optional chaining)
    // Maps are keyed by user.id (auth user id), not email
    const buyer = user?.id ? buyerMap[user.id] : null;
    const seller = user?.id ? sellerMap[user.id] : null;
    const matchesSearch = !searchTerm || 
      user.email?.toLowerCase()?.includes(searchTerm.toLowerCase()) ||
      user.full_name?.toLowerCase()?.includes(searchTerm.toLowerCase()) ||
      buyer?.full_name?.toLowerCase()?.includes(searchTerm.toLowerCase()) ||
      buyer?.phone?.toLowerCase()?.includes(searchTerm.toLowerCase()) ||
      seller?.business_name?.toLowerCase()?.includes(searchTerm.toLowerCase());

    // Status filter
    const userStatus = user.account_status || 'active';
    const matchesStatus = statusFilter === 'all' || userStatus === statusFilter;

    // Role filter - Show ALL users by default
    // Maps are keyed by user.id (auth user id)
    const hasBuyerProfile = user?.id ? !!buyerMap[user.id] : false;
    const hasSellerProfile = user?.id ? !!sellerMap[user.id] : false;
    
    const matchesRole = roleFilter === 'all' || 
      (roleFilter === 'buyer-only' && hasBuyerProfile && !hasSellerProfile) ||
      (roleFilter === 'seller-buyer' && hasSellerProfile);

    // Show ALL users - this is the global account control center
    return matchesSearch && matchesStatus && matchesRole;
  });

  const getStatusColor = (status) => {
    switch(status) {
      case "active": return "bg-green-100 text-green-800 border-green-200";
      case "suspended": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "denied": return "bg-orange-100 text-orange-800 border-orange-200";
      case "banned": return "bg-red-100 text-red-800 border-red-200";
      case "deleted": return "bg-gray-100 text-gray-800 border-gray-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case "active": return <CheckCircle className="w-4 h-4" />;
      case "suspended": return <AlertCircle className="w-4 h-4" />;
      case "denied": return <XCircle className="w-4 h-4" />;
      case "banned": return <Ban className="w-4 h-4" />;
      case "deleted": return <Trash2 className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  const getAccountTypeBadge = (user) => {
    // Maps are keyed by user.id (auth user id)
    const hasBuyerProfile = !!buyerMap[user.id];
    const hasSellerProfile = !!sellerMap[user.id];

    // Role from public.users.role (canonical truth)
    if (user.role === 'admin' || user.role === 'super_admin') {
      return <Badge className="bg-gradient-to-r from-purple-600 to-blue-600 text-white border-0">Admin</Badge>;
    }
    if (hasSellerProfile && hasBuyerProfile) {
      return <Badge className="bg-purple-100 text-purple-800 border-purple-200">Seller+Buyer</Badge>;
    } else if (hasSellerProfile) {
      return <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">Seller</Badge>;
    } else if (hasBuyerProfile) {
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Buyer</Badge>;
    }
    return <Badge className="bg-gray-100 text-gray-800 border-gray-200">Registered User</Badge>;
  };

  // Check if we have a load error
  const hasLoadError = !!usersError;
  
  // Stats - show "—" when degraded/error, actual counts when loaded successfully
  const stats = [
    {
      label: "Total Accounts",
      value: hasLoadError ? "—" : allUsers.filter(u => u?.email !== 'admin@surge.org').length,
      color: "from-blue-500 to-cyan-500"
    },
    {
      label: "Active",
      value: hasLoadError ? "—" : allUsers.filter(u => (u?.account_status || 'active') === 'active' && u?.email !== 'admin@surge.org').length,
      color: "from-green-500 to-emerald-500"
    },
    {
      label: "Suspended",
      value: hasLoadError ? "—" : allUsers.filter(u => u?.account_status === 'suspended').length,
      color: "from-yellow-500 to-orange-500"
    },
    {
      label: "Banned",
      value: hasLoadError ? "—" : allUsers.filter(u => u?.account_status === 'banned').length,
      color: "from-red-500 to-pink-500"
    }
  ];

  return (
    <div className="min-h-screen p-4 sm:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => navigate(createPageUrl("AdminDashboard"))}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Manage Users</h1>
            <p className="text-gray-600 mt-1">Global account control center - All platform users (buyers & sellers)</p>
          </div>
        </div>

        {/* Degraded Mode Banner */}
        {isLoadDegraded && (
          <Alert className="border-orange-300 bg-orange-50">
            <AlertCircle className="h-5 w-5 text-orange-600" />
            <AlertDescription className="flex items-center justify-between w-full">
              <span className="text-orange-900">
                <strong>Backend temporarily unavailable</strong> (Supabase 503/timeout). Auto-refresh paused. Data may be incomplete.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchUsers()}
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
                <strong>Failed to load users:</strong> {usersError?.message || "Unknown error"}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchUsers()}
                className="ml-4 border-red-300 text-red-700 hover:bg-red-100"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <Card key={index} className="border-0 shadow-lg">
              <CardContent className="p-4">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center mb-2`}>
                  <Users className="w-5 h-5 text-white" />
                </div>
                <p className="text-sm text-gray-600">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="border-0 shadow-lg">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search by email, name, phone, or business..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="banned">Banned</SelectItem>
                  <SelectItem value="denied">Denied/Deactivated</SelectItem>
                  <SelectItem value="deleted">Deleted</SelectItem>
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="buyer-only">Buyer Only</SelectItem>
                  <SelectItem value="seller-buyer">Seller (+ Buyer)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Important Notices */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Card className="border-2 border-orange-200 bg-orange-50">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <Shield className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-orange-900">
                  <p className="font-semibold mb-1">⚠️ Global Account Enforcement</p>
                  <p>Actions here affect the ENTIRE account platform-wide. Suspending or banning disables all buyer AND seller capabilities. Login becomes invalid immediately.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-green-200 bg-green-50">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-green-900">
                  <p className="font-semibold mb-1">✅ Live Database Connection</p>
                  <p>This page shows ALL real users (buyers & sellers). Data auto-updates every 10 seconds. New signups appear instantly.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users List */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-6 h-6" />
                All Platform Accounts ({filteredUsers.length})
              </CardTitle>
              <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                Live Data • Auto-refresh
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {usersError ? (
              <div className="text-center py-12">
                <AlertCircle className={`w-16 h-16 mx-auto mb-4 ${isLoadDegraded ? "text-orange-500" : "text-red-500"}`} />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {isLoadDegraded ? "Unable to load users (backend unavailable)" : "Error Loading Users"}
                </h3>
                <p className={`mb-4 ${isLoadDegraded ? "text-orange-600" : "text-red-600"}`}>
                  {isLoadDegraded 
                    ? "Supabase is temporarily unavailable. This does not mean there are 0 users." 
                    : usersError?.message || "Unknown error"}
                </p>
                <p className="text-sm text-gray-600 mb-4">Check browser console for detailed logs</p>
                <Button 
                  variant="outline"
                  onClick={() => refetchUsers()}
                  className={isLoadDegraded 
                    ? "border-orange-300 text-orange-700 hover:bg-orange-100" 
                    : "border-red-300 text-red-700 hover:bg-red-100"}
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Retry
                </Button>
              </div>
            ) : usersLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading accounts...</p>
              </div>
            ) : allUsers.length === 0 ? (
              <div className="text-center py-12">
                <AlertCircle className="w-16 h-16 text-orange-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Users Found</h3>
                <p className="text-gray-600 mb-4">
                  The User table appears to be empty. This shouldn't happen if sellers exist in Seller Management.
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left max-w-2xl mx-auto">
                  <p className="text-sm text-blue-900 mb-2"><strong>Debug Info:</strong></p>
                  <ul className="text-xs text-blue-800 space-y-1">
                    <li>• Total Users Fetched: {allUsers.length}</li>
                    <li>• Buyers Found: {buyerProfiles.length}</li>
                    <li>• Sellers Found: {sellers.length}</li>
                    <li>• Check browser console for detailed logs</li>
                  </ul>
                </div>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12">
                <UserX className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No accounts found matching your filters</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredUsers.map((user) => {
                  // Maps are keyed by user.id (auth user id)
                  const buyer = buyerMap[user.id];
                  const seller = sellerMap[user.id];
                  const status = user.account_status || 'active';

                  return (
                    <Card key={user.id} className="border-2 hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          {/* Avatar */}
                          <Avatar className="w-12 h-12 flex-shrink-0">
                            <AvatarImage src={buyer?.profile_image_url || seller?.profile_image_url} />
                            <AvatarFallback className="bg-gradient-to-br from-purple-600 to-blue-600 text-white">
                              {user.full_name?.[0] || user.email[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>

                          {/* User Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h3 className="font-semibold text-gray-900">
                                {user.full_name || buyer?.full_name || seller?.business_name || "No Name"}
                              </h3>
                              {getAccountTypeBadge(user)}
                              <Badge className={`${getStatusColor(status)} border`}>
                                {getStatusIcon(status)}
                                <span className="ml-1">{status}</span>
                              </Badge>
                            </div>
                            <div className="text-sm text-gray-600 space-y-1">
                              <p><strong>Email:</strong> {user.email}</p>
                              {buyer?.phone && <p><strong>Phone:</strong> {buyer.phone}</p>}
                              {seller && <p><strong>Business:</strong> {seller.business_name}</p>}
                              {user.account_status_reason && (
                                <p className="text-red-600"><strong>Reason:</strong> {user.account_status_reason}</p>
                              )}
                            </div>
                          </div>

                          {/* Profile & Onboarding Status Indicators */}
                          <div className="flex flex-col gap-1 flex-shrink-0 min-w-[120px]">
                            {/* Buyer Profile Badge - based on buyer_profiles.user_id existence */}
                            <div className="flex items-center gap-1">
                              {buyer ? (
                                <Badge className="bg-green-100 text-green-800 text-[10px] px-1.5 py-0.5">
                                  <CheckCircle className="w-2.5 h-2.5 mr-0.5" />
                                  Buyer ✓
                                </Badge>
                              ) : (
                                <Badge className="bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0.5">
                                  Buyer ✗
                                </Badge>
                              )}
                            </div>
                            {/* Seller Profile Badge - based on sellers.user_id existence */}
                            <div className="flex items-center gap-1">
                              {seller ? (
                                <Badge className={`text-[10px] px-1.5 py-0.5 ${
                                  seller.status === "approved" ? "bg-green-100 text-green-800" :
                                  seller.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                                  seller.status === "declined" ? "bg-red-100 text-red-800" :
                                  "bg-blue-100 text-blue-800"
                                }`}>
                                  {seller.status === "approved" && <CheckCircle className="w-2.5 h-2.5 mr-0.5 inline" />}
                                  Seller {seller.status === "approved" ? "✓" : `(${seller.status || "unknown"})`}
                                </Badge>
                              ) : (
                                <Badge className="bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0.5">
                                  Seller ✗
                                </Badge>
                              )}
                            </div>
                            {/* Seller Approval Status (canonical: sellers.status) */}
                            {seller && (
                              <Badge className={`text-[10px] px-1.5 py-0.5 ${
                                seller.status === "approved" ? "bg-green-100 text-green-800" :
                                seller.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                                seller.status === "declined" ? "bg-red-100 text-red-800" :
                                seller.status === "suspended" ? "bg-orange-100 text-orange-800" :
                                "bg-gray-100 text-gray-800"
                              }`}>
                                Status: {seller.status || "unknown"}
                              </Badge>
                            )}
                            {/* Stripe Connected (if seller) */}
                            {seller && (
                              <Badge className={`text-[10px] px-1.5 py-0.5 ${
                                (seller.stripe_account_id || seller.stripe_connected) 
                                  ? "bg-purple-100 text-purple-800" 
                                  : "bg-gray-100 text-gray-500"
                              }`}>
                                Stripe: {(seller.stripe_account_id || seller.stripe_connected) ? "Connected" : "Not Connected"}
                              </Badge>
                            )}
                            {/* Onboarding Completeness Summary using Canonical Helpers */}
                            {(() => {
                              // Use canonical onboarding state machine
                              const readiness = getOnboardingReadiness(user, buyer, seller);
                              
                              // Build list of missing buyer requirements
                              const buyerMissing = [];
                              if (buyer) {
                                if (!readiness.buyerSafetyAgreed) buyerMissing.push("Safety Agreement");
                              }

                              // Build list of missing seller requirements
                              // NOTE: Stripe is listed but NOT required for seller access
                              const sellerMissing = [];
                              if (seller) {
                                if (!readiness.sellerApproved) sellerMissing.push("Approval");
                                if (!readiness.sellerSafetyAgreed) sellerMissing.push("Safety Agreement");
                                if (!readiness.sellerOnboardingCompleted) sellerMissing.push("Onboarding Steps");
                                if (!readiness.identityVerified) sellerMissing.push("Identity");
                              }

                              return (
                                <div className="flex flex-col gap-0.5">
                                  {/* Buyer Access Status (using canonical helper) */}
                                  {buyer && (
                                    <Badge className={`text-[10px] px-1.5 py-0.5 ${
                                      readiness.buyerAccessReady
                                        ? "bg-teal-100 text-teal-800"
                                        : "bg-amber-100 text-amber-700"
                                    }`}>
                                      B-Access: {readiness.buyerAccessReady ? "Ready ✓" : "Incomplete"}
                                    </Badge>
                                  )}
                                  {buyer && buyerMissing.length > 0 && (
                                    <span className="text-[9px] text-amber-600 ml-1">
                                      Missing: {buyerMissing.join(", ")}
                                    </span>
                                  )}
                                  
                                  {/* Seller Access Status (using canonical helper - NO Stripe required) */}
                                  {seller && (
                                    <Badge className={`text-[10px] px-1.5 py-0.5 ${
                                      readiness.sellerAccessReady
                                        ? "bg-teal-100 text-teal-800"
                                        : "bg-amber-100 text-amber-700"
                                    }`}>
                                      S-Access: {readiness.sellerAccessReady ? "Ready ✓" : "Incomplete"}
                                    </Badge>
                                  )}
                                  {seller && sellerMissing.length > 0 && (
                                    <span className="text-[9px] text-amber-600 ml-1">
                                      Missing: {sellerMissing.join(", ")}
                                    </span>
                                  )}
                                  
                                  {/* Seller Payment Status (Stripe required - display only) */}
                                  {seller && readiness.sellerAccessReady && (
                                    <Badge className={`text-[10px] px-1.5 py-0.5 ${
                                      readiness.sellerPaymentReady
                                        ? "bg-purple-100 text-purple-800"
                                        : "bg-gray-100 text-gray-500"
                                    }`}>
                                      S-Payment: {readiness.sellerPaymentReady ? "Ready ✓" : "No Stripe"}
                                    </Badge>
                                  )}
                                  
                                  {/* No profiles at all */}
                                  {!buyer && !seller && (
                                    <Badge className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5">
                                      No Profiles
                                    </Badge>
                                  )}
                                </div>
                              );
                            })()}
                          </div>

                          {/* Actions */}
                          <div className="flex flex-col gap-2 flex-shrink-0">
                            {/* View Profile Button */}
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-purple-600 border-purple-200 hover:bg-purple-50"
                              onClick={() => setProfileDialog({ open: true, user })}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              Profile
                            </Button>
                            {status === 'active' ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-orange-600 border-orange-200 hover:bg-orange-50"
                                  onClick={() => handleAction('deactivate', user)}
                                >
                                  <PowerOff className="w-3 h-3 mr-1" />
                                  Deactivate
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-yellow-600 border-yellow-200 hover:bg-yellow-50"
                                  onClick={() => handleAction('suspend', user)}
                                >
                                  <AlertCircle className="w-3 h-3 mr-1" />
                                  Suspend
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 border-red-200 hover:bg-red-50"
                                  onClick={() => handleAction('ban', user)}
                                >
                                  <Ban className="w-3 h-3 mr-1" />
                                  Ban
                                </Button>
                              </>
                            ) : status === 'banned' ? (
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => handleAction('unban', user)}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Unban
                              </Button>
                            ) : status === 'suspended' ? (
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => handleAction('unsuspend', user)}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Unsuspend
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => handleAction('activate', user)}
                              >
                                <Power className="w-3 h-3 mr-1" />
                                Activate
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => handleAction('delete', user)}
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* User Profile Dialog */}
      <UserProfileDialog
        open={profileDialog.open}
        onOpenChange={(open) => setProfileDialog({ ...profileDialog, open })}
        user={profileDialog.user}
        buyerProfile={profileDialog.user ? buyerMap[profileDialog.user.id] : null}
        sellerProfile={profileDialog.user ? sellerMap[profileDialog.user.id] : null}
      />

      {/* Action Confirmation Dialog */}
      <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog({ ...actionDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Confirm Action
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-700">
              {actionDialog.action === 'delete' && (
                <>Are you sure you want to <strong>HARD DELETE</strong> this account? This will COMPLETELY REMOVE the user from the system. They will need to sign up as a NEW user if they return. This cannot be undone.</>
              )}
              {actionDialog.action === 'suspend' && (
                <>Are you sure you want to <strong>suspend</strong> this account? User will lose access to all platform features (buying, selling, chat).</>
              )}
              {actionDialog.action === 'ban' && (
                <>Are you sure you want to <strong>permanently ban</strong> this account? This prevents all future access.</>
              )}
              {actionDialog.action === 'deactivate' && (
                <>Are you sure you want to <strong>deactivate</strong> this account? User login will be disabled until reactivated.</>
              )}
              {(actionDialog.action === 'unsuspend' || actionDialog.action === 'unban' || actionDialog.action === 'activate') && (
                <>Are you sure you want to <strong>restore</strong> this account? User will regain full platform access.</>
              )}
            </p>
            {actionDialog.action === 'delete' && (
              <div className="space-y-2">
                <p className="text-sm text-red-600 font-semibold">
                  ⚠️ TEST MODE: HARD DELETE - This completely removes the user from the system:
                </p>
                <ul className="text-xs text-red-600 space-y-1 ml-4">
                  <li>✓ User record deleted (invalidates login)</li>
                  <li>✓ All profiles deleted (buyer/seller)</li>
                  <li>✓ All orders, batches, and products deleted</li>
                  <li>✓ All messages, notifications, and follows deleted</li>
                  <li>✓ User CANNOT log back in with old credentials</li>
                  <li>✓ If they sign up again = completely NEW account</li>
                </ul>
              </div>
            )}
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setActionDialog({ open: false, action: "", user: null })}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={executeAction}
                disabled={updateUserStatusMutation.isPending || deleteUserMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                {updateUserStatusMutation.isPending || deleteUserMutation.isPending ? "Processing..." : "Confirm"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}