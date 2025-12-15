import React, { useState } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
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
import { Users, Search, Ban, CheckCircle, XCircle, Trash2, AlertCircle, Shield, UserX, ArrowLeft, Power, PowerOff, Eye, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import UserProfileDialog from "../components/admin/UserProfileDialog";

export default function ManageUsers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState(null);
  const [actionDialog, setActionDialog] = useState({ open: false, action: "", user: null });
  const [profileDialog, setProfileDialog] = useState({ open: false, user: null });

  // Fetch all users - AUTO REFRESH every 10 seconds
  const { data: allUsers = [], isLoading: usersLoading, error: usersError } = useQuery({
    queryKey: ['all-users-manage'],
    queryFn: async () => {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📊 MANAGE USERS - Fetching ALL platform users");
      
      const users = await base44.entities.User.list('-created_date');
      console.log("✅ Total users fetched:", users.length);
      console.log("   User emails:", users.map(u => u.email).join(", "));
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      return users;
    },
    refetchInterval: 10000,
    staleTime: 5000
  });

  // Fetch all buyer profiles - AUTO REFRESH
  const { data: buyerProfiles = [] } = useQuery({
    queryKey: ['all-buyer-profiles-manage'],
    queryFn: () => base44.entities.BuyerProfile.list('-created_date'),
    refetchInterval: 10000,
    staleTime: 5000
  });

  // Fetch all sellers - AUTO REFRESH
  const { data: sellers = [] } = useQuery({
    queryKey: ['all-sellers-manage'],
    queryFn: () => base44.entities.Seller.list('-created_date'),
    refetchInterval: 10000,
    staleTime: 5000
  });

  // Create maps for quick lookup
  const buyerMap = buyerProfiles.reduce((acc, buyer) => {
    acc[buyer.user_id] = buyer;
    return acc;
  }, {});

  const sellerMap = sellers.reduce((acc, seller) => {
    acc[seller.created_by] = seller;
    return acc;
  }, {});

  // Update user account status mutation
  const updateUserStatusMutation = useMutation({
    mutationFn: async ({ userId, status, reason }) => {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🔧 UPDATING USER STATUS");
      console.log("   User ID:", userId);
      console.log("   New Status:", status);
      console.log("   Reason:", reason);
      
      const currentUser = await base44.auth.me();
      const updateData = {
        account_status: status,
        suspended_at: status !== 'active' ? new Date().toISOString() : null,
        suspended_by: status !== 'active' ? currentUser.email : null,
        suspension_reason: reason || null
      };
      
      console.log("   Update Data:", updateData);
      
      await base44.entities.User.update(userId, updateData);
      
      console.log("✅ User status updated successfully");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-users-manage'] });
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      setActionDialog({ open: false, action: "", user: null });
      alert('User status updated successfully');
    },
    onError: (error) => {
      console.error("❌ Failed to update user status:", error);
      alert(`Failed to update user: ${error.message}`);
    }
  });

  // Delete user account mutation (HARD DELETE - TEST MODE)
  const deleteUserMutation = useMutation({
    mutationFn: async (userId) => {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🗑️ HARD DELETE USER ACCOUNT (TEST MODE)");
      console.log("   User ID:", userId);
      
      const user = allUsers.find(u => u.id === userId);
      if (!user) {
        console.log("❌ User not found");
        return;
      }
      console.log("   User Email:", user.email);
      console.log("   PERFORMING COMPLETE DATA WIPE...");

      // 1. Delete buyer profile
      const buyerProfile = buyerProfiles.find(b => b.user_id === userId);
      if (buyerProfile) {
        console.log("   Deleting buyer profile:", buyerProfile.id);
        await base44.entities.BuyerProfile.delete(buyerProfile.id);
      }

      // 2. Delete seller profile and all related data
      const seller = sellers.find(s => s.created_by === user.email);
      if (seller) {
        console.log("   Deleting seller profile:", seller.id);
        
        // Delete products
        const products = await base44.entities.Product.filter({ seller_id: seller.id });
        console.log("   Deleting", products.length, "products");
        for (const product of products) {
          await base44.entities.Product.delete(product.id);
        }

        // Delete shows
        const shows = await base44.entities.Show.filter({ seller_id: seller.id });
        console.log("   Deleting", shows.length, "shows");
        for (const show of shows) {
          await base44.entities.Show.delete(show.id);
        }

        await base44.entities.Seller.delete(seller.id);
      }

      // 3. Delete all orders (as buyer)
      const buyerOrders = await base44.entities.Order.filter({ buyer_id: userId });
      console.log("   Deleting", buyerOrders.length, "buyer orders");
      for (const order of buyerOrders) {
        await base44.entities.Order.delete(order.id);
      }

      // 4. Delete all orders (as seller)
      if (seller) {
        const sellerOrders = await base44.entities.Order.filter({ seller_id: seller.id });
        console.log("   Deleting", sellerOrders.length, "seller orders");
        for (const order of sellerOrders) {
          await base44.entities.Order.delete(order.id);
        }
      }

      // 5. Delete all batches
      const batches = await base44.entities.Batch.filter({ buyer_id: userId });
      console.log("   Deleting", batches.length, "batches");
      for (const batch of batches) {
        await base44.entities.Batch.delete(batch.id);
      }

      // 6. Delete conversations and messages
      const buyerConversations = await base44.entities.Conversation.filter({ buyer_id: userId });
      const sellerConversations = seller ? await base44.entities.Conversation.filter({ seller_id: seller.id }) : [];
      const allConversations = [...buyerConversations, ...sellerConversations];
      
      console.log("   Deleting", allConversations.length, "conversations");
      for (const conv of allConversations) {
        const messages = await base44.entities.Message.filter({ conversation_id: conv.id });
        for (const msg of messages) {
          await base44.entities.Message.delete(msg.id);
        }
        await base44.entities.Conversation.delete(conv.id);
      }

      // 7. Delete follows
      const follows = await base44.entities.FollowedSeller.filter({ buyer_id: userId });
      console.log("   Deleting", follows.length, "followed sellers");
      for (const follow of follows) {
        await base44.entities.FollowedSeller.delete(follow.id);
      }

      // 8. Delete bookmarks
      const bookmarks = await base44.entities.BookmarkedShow.filter({ buyer_id: userId });
      console.log("   Deleting", bookmarks.length, "bookmarked shows");
      for (const bookmark of bookmarks) {
        await base44.entities.BookmarkedShow.delete(bookmark.id);
      }

      // 9. Delete community follows
      const communityFollows = await base44.entities.FollowedCommunity.filter({ user_id: userId });
      console.log("   Deleting", communityFollows.length, "followed communities");
      for (const follow of communityFollows) {
        await base44.entities.FollowedCommunity.delete(follow.id);
      }

      // 10. Delete notifications
      const notifications = await base44.entities.Notification.filter({ user_id: userId });
      console.log("   Deleting", notifications.length, "notifications");
      for (const notification of notifications) {
        await base44.entities.Notification.delete(notification.id);
      }

      // 11. Delete GIVI entries
      const giviEntries = await base44.entities.GIVIEntry.filter({ user_id: userId });
      console.log("   Deleting", giviEntries.length, "GIVI entries");
      for (const entry of giviEntries) {
        await base44.entities.GIVIEntry.delete(entry.id);
      }

      // 12. Delete reviews (as author)
      const reviews = await base44.entities.Review.filter({ reviewer_id: userId });
      console.log("   Deleting", reviews.length, "reviews");
      for (const review of reviews) {
        await base44.entities.Review.delete(review.id);
      }

      // 13. Delete share logs
      const shareLogs = await base44.entities.ShareLog.filter({ sharer_id: userId });
      console.log("   Deleting", shareLogs.length, "share logs");
      for (const log of shareLogs) {
        await base44.entities.ShareLog.delete(log.id);
      }

      // 14. Delete viewer bans (as banned viewer)
      const viewerBans = await base44.entities.ViewerBan.filter({ viewer_id: userId });
      console.log("   Deleting", viewerBans.length, "viewer bans");
      for (const ban of viewerBans) {
        await base44.entities.ViewerBan.delete(ban.id);
      }

      // 15. Delete buyer bans (as banned buyer)
      if (seller) {
        const buyerBans = await base44.entities.SellerBannedBuyer.filter({ seller_id: seller.id });
        console.log("   Deleting", buyerBans.length, "seller banned buyers");
        for (const ban of buyerBans) {
          await base44.entities.SellerBannedBuyer.delete(ban.id);
        }
      }

      // 16. CRITICAL: Delete the User record itself (hard delete)
      console.log("   ⚠️ DELETING USER RECORD - This invalidates authentication");
      await base44.entities.User.delete(userId);
      
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("✅ HARD DELETE COMPLETE");
      console.log("   User email:", user.email, "has been PERMANENTLY removed");
      console.log("   All data wiped. User cannot log in with old credentials.");
      console.log("   If they sign up again, they will be a NEW user.");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
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
  const filteredUsers = allUsers.filter(user => {
    // Skip admin accounts
    if (user.email === 'admin@surge.org') return false;

    // Search filter
    const buyer = buyerMap[user.id];
    const seller = sellerMap[user.email];
    const matchesSearch = !searchTerm || 
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      buyer?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      buyer?.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      seller?.business_name?.toLowerCase().includes(searchTerm.toLowerCase());

    // Status filter
    const userStatus = user.account_status || 'active';
    const matchesStatus = statusFilter === 'all' || userStatus === statusFilter;

    // Role filter - Show ALL users by default
    const hasBuyerProfile = !!buyerMap[user.id];
    const hasSellerProfile = !!sellerMap[user.email];
    
    const matchesRole = roleFilter === 'all' || 
      (roleFilter === 'buyer-only' && hasBuyerProfile && !hasSellerProfile) ||
      (roleFilter === 'seller-buyer' && hasSellerProfile);

    // Show ALL users - this is the global account control center
    return matchesSearch && matchesStatus && matchesRole;
  });

  // Debug logging
  React.useEffect(() => {
    if (!usersLoading && allUsers.length > 0) {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🔍 MANAGE USERS - Data Summary");
      console.log("   Total Users:", allUsers.length);
      console.log("   Buyer Profiles:", buyerProfiles.length);
      console.log("   Sellers:", sellers.length);
      console.log("   Users with Buyer Profile:", allUsers.filter(u => buyerMap[u.id]).length);
      console.log("   Users with Seller Profile:", allUsers.filter(u => sellerMap[u.email]).length);
      console.log("   Users with BOTH:", allUsers.filter(u => buyerMap[u.id] && sellerMap[u.email]).length);
      console.log("   Filtered Users (visible):", filteredUsers.length);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    }
  }, [allUsers, buyerProfiles, sellers, filteredUsers.length, usersLoading]);

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
    const hasBuyerProfile = !!buyerMap[user.id];
    const hasSellerProfile = !!sellerMap[user.email];

    if (user.role === 'admin') {
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

  const stats = [
    {
      label: "Total Accounts",
      value: allUsers.filter(u => u.email !== 'admin@surge.org').length,
      color: "from-blue-500 to-cyan-500"
    },
    {
      label: "Active",
      value: allUsers.filter(u => (u.account_status || 'active') === 'active' && u.email !== 'admin@surge.org').length,
      color: "from-green-500 to-emerald-500"
    },
    {
      label: "Suspended",
      value: allUsers.filter(u => u.account_status === 'suspended').length,
      color: "from-yellow-500 to-orange-500"
    },
    {
      label: "Banned",
      value: allUsers.filter(u => u.account_status === 'banned').length,
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
                <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Users</h3>
                <p className="text-red-600 mb-4">{usersError.message}</p>
                <p className="text-sm text-gray-600 mb-4">Check browser console for detailed logs</p>
                <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['all-users-manage'] })}>
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
                  const buyer = buyerMap[user.id];
                  const seller = sellerMap[user.email];
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
                              {user.suspension_reason && (
                                <p className="text-red-600"><strong>Reason:</strong> {user.suspension_reason}</p>
                              )}
                            </div>
                          </div>

                          {/* Safety Status Indicators */}
                          <div className="flex flex-col gap-1 flex-shrink-0 min-w-[100px]">
                            <div className="flex items-center gap-1">
                              {user.buyer_safety_agreed ? (
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
                            <div className="flex items-center gap-1">
                              {/* CRITICAL: Check BOTH User.seller_safety_agreed AND Seller entity status */}
                              {(() => {
                                const sellerProfile = seller; // seller from sellerMap[user.email]
                                const sellerStatus = sellerProfile?.status || user.seller_status;
                                const hasSellerSafetyAgreed = user.seller_safety_agreed;
                                const isApprovedSeller = sellerStatus === "approved";

                                if (isApprovedSeller) {
                                  return (
                                    <Badge className="bg-green-100 text-green-800 text-[10px] px-1.5 py-0.5">
                                      <CheckCircle className="w-2.5 h-2.5 mr-0.5" />
                                      Seller ✓
                                    </Badge>
                                  );
                                } else if (hasSellerSafetyAgreed && sellerStatus === "pending") {
                                  return (
                                    <Badge className="bg-yellow-100 text-yellow-800 text-[10px] px-1.5 py-0.5">
                                      Seller (Pending)
                                    </Badge>
                                  );
                                } else if (hasSellerSafetyAgreed) {
                                  return (
                                    <Badge className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.5">
                                      Seller Safety ✓
                                    </Badge>
                                  );
                                } else {
                                  return (
                                    <Badge className="bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0.5">
                                      Seller ✗
                                    </Badge>
                                  );
                                }
                              })()}
                            </div>
                            {/* Show Seller entity status if exists */}
                            {seller && (
                              <Badge className={`text-[10px] px-1.5 py-0.5 ${
                                seller.status === "approved" ? "bg-green-100 text-green-800" :
                                seller.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                                seller.status === "declined" ? "bg-red-100 text-red-800" :
                                seller.status === "suspended" ? "bg-orange-100 text-orange-800" :
                                "bg-gray-100 text-gray-800"
                              }`}>
                                Seller: {seller.status}
                              </Badge>
                            )}
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
        sellerProfile={profileDialog.user ? sellerMap[profileDialog.user.email] : null}
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