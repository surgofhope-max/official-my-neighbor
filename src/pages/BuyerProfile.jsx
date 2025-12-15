import React, { useState, useEffect, useRef } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  User,
  Mail,
  Phone,
  ShoppingBag,
  DollarSign,
  MapPin,
  Edit,
  X as CloseIcon,
  Upload,
  Image as ImageIcon,
  UserPlus,
  Bookmark,
  CheckCircle,
  Clock,
  Package,
  Layers,
  LogOut,
  AlertCircle
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import SellerCard from "../components/marketplace/SellerCard";
import LiveShowCard from "../components/marketplace/LiveShowCard";
import CommunityCard from "../components/marketplace/CommunityCard";

export default function BuyerProfile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [seller, setSeller] = useState(null); // New state for seller profile
  const [buyerProfile, setBuyerProfile] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showApprovalCongrats, setShowApprovalCongrats] = useState(false); // New state for approval congrats modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFinalDeleteConfirm, setShowFinalDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const profileImageRef = useRef(null);
  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    email: "",
    profile_image_url: ""
  });

  // Dialog states
  const [showOrdersDialog, setShowOrdersDialog] = useState(false);
  const [showFollowingDialog, setShowFollowingDialog] = useState(false);
  const [showBookmarksDialog, setShowBookmarksDialog] = useState(false);
  const [showCommunitiesDialog, setShowCommunitiesDialog] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      // Check for seller profile - BUT DO NOT auto-redirect
      // Users who are both buyers AND sellers should be able to access buyer routes freely
      const sellers = await base44.entities.Seller.filter({ created_by: currentUser.email });
      if (sellers.length > 0) {
        const sellerProfile = sellers[0];
        setSeller(sellerProfile);
        
        // Show congratulations modal ONLY if they just got approved (first time seeing it)
        // But DO NOT force redirect - let them dismiss and stay on buyer profile if they want
        if (sellerProfile.status === "approved") {
          const hasSeenApproval = localStorage.getItem(`seller_approved_${sellerProfile.id}`);
          if (!hasSeenApproval) {
            setShowApprovalCongrats(true);
            localStorage.setItem(`seller_approved_${sellerProfile.id}`, 'true');
            // NO auto-redirect - user can choose to go to seller dashboard or stay
          }
        }
      }

      // If not an approved seller, proceed to load buyer profile
      const profiles = await base44.entities.BuyerProfile.filter({ user_id: currentUser.id });
      if (profiles.length > 0) {
        setBuyerProfile(profiles[0]);
        setFormData({
          full_name: profiles[0].full_name || currentUser.full_name || "",
          phone: profiles[0].phone || "",
          email: profiles[0].email || currentUser.email || "",
          profile_image_url: profiles[0].profile_image_url || ""
        });
      } else {
        setFormData({
          full_name: currentUser.full_name || "",
          phone: "",
          email: currentUser.email || "",
          profile_image_url: ""
        });
        setShowEditor(true);
      }
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  const { data: orders = [] } = useQuery({
    queryKey: ['buyer-orders'],
    queryFn: () => user ? base44.entities.Order.filter({ buyer_id: user.id }, '-created_date') : [],
    enabled: !!user
  });

  // Fetch followed sellers
  const { data: followedSellers = [] } = useQuery({
    queryKey: ['followed-sellers', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const follows = await base44.entities.FollowedSeller.filter({ buyer_id: user.id });
      const sellerIds = follows.map(f => f.seller_id);

      if (sellerIds.length === 0) return [];

      const sellers = await base44.entities.Seller.list();
      return sellers.filter(s => sellerIds.includes(s.id));
    },
    enabled: !!user
  });

  // Fetch bookmarked shows
  const { data: bookmarkedShows = [] } = useQuery({
    queryKey: ['bookmarked-shows', user?.id],
	queryFn: async () => {
      if (!user?.id) return [];
      const bookmarks = await base44.entities.BookmarkedShow.filter({ buyer_id: user.id });
      const showIds = bookmarks.map(b => b.show_id);

      if (showIds.length === 0) return [];

      const shows = await base44.entities.Show.list();
      return shows.filter(s => showIds.includes(s.id));
    },
    enabled: !!user
  });

  // NEW: Fetch followed communities
  const { data: followedCommunities = [] } = useQuery({
    queryKey: ['buyer-followed-communities', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const follows = await base44.entities.FollowedCommunity.filter({ user_id: user.id });
      if (follows.length === 0) return [];
      const communityIds = follows.map(f => f.community_id);
      const communities = await base44.entities.Community.list();
      const matchingCommunities = communities.filter(c => communityIds.includes(c.id));
      return matchingCommunities;
    },
    enabled: !!user
  });

  const createProfileMutation = useMutation({
    mutationFn: (data) => base44.entities.BuyerProfile.create({
      ...data,
      user_id: user.id,
      total_orders: 0,
      total_spent: 0
    }),
    onSuccess: (newProfile) => {
      setBuyerProfile(newProfile);
      setShowEditor(false);
      queryClient.invalidateQueries({ queryKey: ['buyer-orders'] });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BuyerProfile.update(id, data),
    onSuccess: (updatedProfile) => {
      setBuyerProfile(updatedProfile);
      setShowEditor(false);
    },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (buyerProfile) {
      updateProfileMutation.mutate({ id: buyerProfile.id, data: formData });
    } else {
      createProfileMutation.mutate(formData);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData(prev => ({ ...prev, profile_image_url: file_url }));
    } catch (error) {
      console.error("Error uploading image:", error);
      alert("Failed to upload image. Please try again.");
    }
    setUploadingImage(false);
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      // Delete all related records
      const allOrders = await base44.entities.Order.filter({ buyer_id: user.id });
      for (const order of allOrders) {
        await base44.entities.Order.delete(order.id);
      }

      const allConversations = await base44.entities.Conversation.filter({ buyer_id: user.id });
      for (const conv of allConversations) {
        const messages = await base44.entities.Message.filter({ conversation_id: conv.id });
        for (const msg of messages) {
          await base44.entities.Message.delete(msg.id);
        }
        await base44.entities.Conversation.delete(conv.id);
      }

      const allFollows = await base44.entities.FollowedSeller.filter({ buyer_id: user.id });
      for (const follow of allFollows) {
        await base44.entities.FollowedSeller.delete(follow.id);
      }

      const allBookmarks = await base44.entities.BookmarkedShow.filter({ buyer_id: user.id });
      for (const bookmark of allBookmarks) {
        await base44.entities.BookmarkedShow.delete(bookmark.id);
      }

      const allCommFollows = await base44.entities.FollowedCommunity.filter({ user_id: user.id });
      for (const follow of allCommFollows) {
        await base44.entities.FollowedCommunity.delete(follow.id);
      }

      if (buyerProfile) {
        await base44.entities.BuyerProfile.delete(buyerProfile.id);
      }

      // Logout and redirect
      await base44.auth.logout(createPageUrl("Marketplace"));
    } catch (error) {
      console.error("Error deleting account:", error);
      alert("Failed to delete account. Please try again or contact support.");
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  const totalSpent = orders.reduce((sum, order) => sum + (order.price || 0), 0);
  const stats = [
    {
      label: "Total Orders",
      value: orders.length,
      icon: ShoppingBag,
      color: "from-purple-500 to-blue-500",
      onClick: () => setShowOrdersDialog(true)
    },
    {
      label: "Total Spent",
      value: `$${totalSpent.toFixed(2)}`,
      icon: DollarSign,
      color: "from-green-500 to-emerald-500",
      onClick: null
    },
    {
      label: "Following",
      value: followedSellers.length,
      icon: UserPlus,
      color: "from-blue-500 to-cyan-500",
      onClick: () => setShowFollowingDialog(true)
    },
    {
      label: "Communities",
      value: followedCommunities.length,
      icon: Layers,
      color: "from-indigo-500 to-purple-500",
      onClick: () => setShowCommunitiesDialog(true)
    }
  ];

  // CRITICAL: Determine whether to show "Become a Seller" CTA
  const shouldShowSellerCTA = !seller; // Only show if user has NO seller profile at all
  const isPendingSeller = seller && seller.status === "pending";
  const isDeclinedSeller = seller && seller.status === "declined";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
        </div>

        {/* Profile Card */}
        <Card className="border-0 shadow-xl overflow-hidden">
          <div className="h-32 bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600"></div>
          <CardContent className="relative pt-0 pb-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 -mt-16 sm:-mt-12">
              {/* Profile Image */}
              <div className="relative">
                {formData.profile_image_url ? (
                  <img
                    src={formData.profile_image_url}
                    alt={formData.full_name}
                    className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-xl"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center border-4 border-white shadow-xl">
                    <User className="w-16 h-16 text-white" />
                  </div>
                )}
              </div>

              {/* Name & Info */}
              <div className="flex-1 text-center sm:text-left sm:ml-4 mt-4 sm:mt-0">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  {buyerProfile?.full_name || user.full_name || "Welcome"}
                </h1>
                <p className="text-gray-600 mt-1">{user.email}</p>
              </div>

              {/* Edit Button */}
              <div className="flex gap-2 mt-4 sm:mt-0">
                <Button
                  variant="outline"
                  onClick={() => setShowEditor(!showEditor)}
                >
                  {showEditor ? (
                    <>
                      <CloseIcon className="w-4 h-4 mr-2" />
                      Close
                    </>
                  ) : (
                    <>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Profile
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  onClick={() => base44.auth.logout(createPageUrl("Marketplace"))}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions - ADD ORDERS BUTTON */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              onClick={() => navigate(createPageUrl("BuyerOrders"))}
              className="h-20 bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-700 hover:to-blue-600 text-white flex flex-col items-center justify-center gap-2"
            >
              <Package className="w-6 h-6" />
              <span className="font-semibold">My Orders</span>
            </Button>
            
            <Button
              onClick={() => navigate(createPageUrl("Marketplace"))}
              variant="outline"
              className="h-20 flex flex-col items-center justify-center gap-2"
            >
              <ShoppingBag className="w-6 h-6" />
              <span className="font-semibold">Browse Shows</span>
            </Button>
          </CardContent>
        </Card>

        {/* Pending Seller Alert */}
        {isPendingSeller && (
          <Alert className="border-yellow-500 bg-yellow-50 shadow-lg">
            <Clock className="h-5 w-5 text-yellow-600" />
            <AlertDescription className="text-gray-900">
              <strong>Your seller application is under review.</strong> We'll notify you once it's approved. 
              In the meantime, you can continue shopping on LiveMarket.
            </AlertDescription>
          </Alert>
        )}

        {/* Declined Seller Alert */}
        {isDeclinedSeller && (
          <Alert className="border-red-500 bg-red-50 shadow-lg">
            <CloseIcon className="h-5 w-5 text-red-600" />
            <AlertDescription className="text-gray-900">
              <strong>Your seller application was not approved.</strong> {seller.status_reason && `Reason: ${seller.status_reason}`}
              <br />
              If you have questions, please contact support.
            </AlertDescription>
          </Alert>
        )}

        {/* Edit Form */}
        {showEditor && (
          <Card className="border-0 shadow-xl">
            <CardHeader>
              <CardTitle>Edit Profile Information</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Profile Image Section */}
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-purple-600" />
                    Profile Picture
                  </h3>
                  <p className="text-xs text-gray-500">
                    Used in chat, reviews, and order interactions • Suggested: 500×500px (1:1 ratio)
                  </p>

                  <div className="flex items-center gap-4">
                    {formData.profile_image_url ? (
                      <div className="relative">
                        <img
                          src={formData.profile_image_url}
                          alt="Profile Preview"
                          className="w-20 h-20 rounded-full object-cover border-2 border-purple-200"
                        />
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, profile_image_url: "" }))}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                        >
                          <CloseIcon className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center">
                        <User className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => profileImageRef.current?.click()}
                      disabled={uploadingImage}
                      className="flex-1"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {uploadingImage ? "Uploading..." : "Upload Profile Picture"}
                    </Button>
                    <input
                      ref={profileImageRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Full Name *</Label>
                  <Input
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    placeholder="Your full name"
                    required
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="your@email.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone *</Label>
                    <Input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(555) 123-4567"
                      required
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <Button
                      type="submit"
                      className="bg-gradient-to-r from-purple-600 to-blue-500"
                      disabled={createProfileMutation.isPending || updateProfileMutation.isPending}
                    >
                      {(createProfileMutation.isPending || updateProfileMutation.isPending) ? "Saving..." : "Save Profile"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowEditor(false);
                        if (buyerProfile) {
                          setFormData({
                            full_name: buyerProfile.full_name || "",
                            phone: buyerProfile.phone || "",
                            email: buyerProfile.email || "",
                            profile_image_url: buyerProfile.profile_image_url || ""
                          });
                        }
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  
                  <div className="pt-4 border-t border-gray-200">
                    <Button
                      type="button"
                      variant="destructive"
                      className="w-full bg-red-600 hover:bg-red-700"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      Delete Account
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid - NOW CLICKABLE */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => (
            <Card
              key={index}
              className={`border-0 shadow-xl ${stat.onClick ? 'cursor-pointer hover:shadow-2xl transition-all hover:scale-105' : ''}`}
              onClick={stat.onClick}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                    <stat.icon className="w-6 h-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Profile Summary (when not editing) */}
        {!showEditor && buyerProfile && (
          <Card className="border-0 shadow-xl">
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Email</p>
                  <p className="font-medium text-gray-900">{buyerProfile.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Phone</p>
                  <p className="font-medium text-gray-900">{buyerProfile.phone}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* CONDITIONAL: Become a Seller CTA - Only show if NO seller profile */}
        {shouldShowSellerCTA && (
          <Card className="border-0 bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 overflow-hidden shadow-xl">
            <CardContent className="p-8 sm:p-12 relative">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMuY29tLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-20"></div>
              <div className="relative text-center">
                <h3 className="text-2xl font-bold text-white mb-2">Want to start selling?</h3>
                <p className="text-white/90 mb-4">
                  Join LiveMarket as a seller and reach customers through live shows
                </p>
                <Button
                  size="lg"
                  className="bg-white text-purple-600 hover:bg-gray-100 font-bold"
                  onClick={() => navigate(createPageUrl("SellerSafetyAgreement"))}
                >
                  Become a Seller
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Orders Dialog */}
      <Dialog open={showOrdersDialog} onOpenChange={setShowOrdersDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Your Orders</DialogTitle>
          </DialogHeader>
          {orders.length > 0 ? (
            <div className="space-y-3">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  {order.product_image_url ? (
                    <img
                      src={order.product_image_url}
                      alt={order.product_title}
                      className="w-16 h-16 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center">
                      <ShoppingBag className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">{order.product_title}</h4>
                    <p className="text-sm text-gray-600">${order.price?.toFixed(2)}</p>
                  </div>
                  <Badge className={
                    order.status === "paid" ? "bg-green-100 text-green-800" :
                    order.status === "picked_up" ? "bg-blue-100 text-blue-800" :
                    "bg-gray-100 text-gray-800"
                  }>
                    {order.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <ShoppingBag className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Orders Yet</h3>
              <p className="text-gray-600 mb-4">Start shopping on LiveMarket</p>
              <Button onClick={() => {
                setShowOrdersDialog(false);
                navigate(createPageUrl("Marketplace"));
              }}>
                Browse Marketplace
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Following Dialog */}
      <Dialog open={showFollowingDialog} onOpenChange={setShowFollowingDialog}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sellers You Follow</DialogTitle>
          </DialogHeader>
          {followedSellers.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {followedSellers.map((seller) => (
                <SellerCard
                  key={seller.id}
                  seller={seller}
                  initialFollowStatus={true}
                  onClick={() => {
                    setShowFollowingDialog(false);
                    navigate(createPageUrl(`SellerStorefront?sellerId=${seller.id}`));
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <UserPlus className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Not Following Anyone Yet</h3>
              <p className="text-gray-600 mb-4">Follow sellers to see their live shows and updates</p>
              <Button onClick={() => {
                setShowFollowingDialog(false);
                navigate(createPageUrl("Sellers"));
              }}>
                Browse Sellers
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bookmarks Dialog */}
      <Dialog open={showBookmarksDialog} onOpenChange={setShowBookmarksDialog}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bookmarked Shows</DialogTitle>
          </DialogHeader>
          {bookmarkedShows.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {bookmarkedShows.map((show) => (
                <LiveShowCard
                  key={show.id}
                  show={show}
                  seller={null}
                  onClick={() => {
                    setShowBookmarksDialog(false);
                    navigate(createPageUrl(`LiveShow?showId=${show.id}`));
                  }}
                  isUpcoming={show.status !== "live"}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Bookmark className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Bookmarked Shows</h3>
              <p className="text-gray-600 mb-4">Bookmark shows to easily find them later</p>
              <Button onClick={() => {
                setShowBookmarksDialog(false);
                navigate(createPageUrl("LiveShows"));
              }}>
                Browse Live Shows
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* NEW: Communities You Follow Dialog */}
      <Dialog open={showCommunitiesDialog} onOpenChange={setShowCommunitiesDialog}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              Communities You Follow ({followedCommunities.length})
            </DialogTitle>
          </DialogHeader>
          {followedCommunities.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {followedCommunities.map((community) => (
                <CommunityCard
                  key={community.id}
                  community={community}
                  onClick={() => {
                    setShowCommunitiesDialog(false);
                    navigate(createPageUrl(`CommunityPage?community=${community.name}`));
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Layers className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Not Following Any Communities</h3>
              <p className="text-gray-600">Follow communities to see shows from sellers in those categories</p>
              <Button 
                className="mt-4"
                onClick={() => {
                  setShowCommunitiesDialog(false);
                  navigate(createPageUrl("Communities"));
                }}
              >
                Browse Communities
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Congratulations Modal for Newly Approved Sellers */}
      <Dialog open={showApprovalCongrats} onOpenChange={setShowApprovalCongrats}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="text-center">
              <div className="mx-auto w-20 h-20 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center mb-4 animate-bounce">
                <CheckCircle className="w-12 h-12 text-white" />
              </div>
              <DialogTitle className="text-2xl">🎉 Congratulations!</DialogTitle>
            </div>
          </DialogHeader>
          <div className="text-center space-y-4">
            <p className="text-lg text-gray-700">
              You're now a <strong className="text-purple-600">Seller</strong> on LiveMarket!
            </p>
            <p className="text-gray-600">
              You can now create products, host live shows, and start selling to customers.
            </p>
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4">
              <p className="text-sm text-gray-700">
                Redirecting you to your <strong>Seller Dashboard</strong> in a moment...
              </p>
            </div>
            <Button
              className="w-full bg-gradient-to-r from-purple-600 to-blue-500"
              onClick={() => {
                setShowApprovalCongrats(false);
                navigate(createPageUrl("SellerDashboard"));
              }}
            >
              Go to Seller Dashboard Now
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Delete Account?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-700">
              Are you sure you want to permanently delete your account? This action cannot be undone.
            </p>
            <p className="text-sm text-gray-600">
              All your data including orders, bookmarks, and messages will be permanently removed.
            </p>
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                {isDeleting ? "Deleting..." : "Delete Account"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Delete Account?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-700">
              Are you sure you want to permanently delete your account? This action cannot be undone.
            </p>
            <p className="text-sm text-gray-600">
              All your data including orders, bookmarks, and messages will be permanently removed.
            </p>
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setShowFinalDeleteConfirm(true);
                }}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                Delete Account
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Final Delete Confirmation Dialog */}
      <Dialog open={showFinalDeleteConfirm} onOpenChange={setShowFinalDeleteConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Final Confirmation
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-700">
              This is your final confirmation. Deleting your account will permanently erase all your data.
            </p>
            <p className="text-gray-700 font-semibold">
              Are you absolutely sure you want to proceed?
            </p>
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowFinalDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                {isDeleting ? "Deleting..." : "Delete Account"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}