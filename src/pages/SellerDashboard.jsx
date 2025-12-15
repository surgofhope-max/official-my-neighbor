import React, { useState, useEffect, useRef } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Link as LinkIcon,
  DollarSign,
  Package,
  Video,
  TrendingUp,
  Receipt,
  ShoppingBag,
  Settings,
  Edit,
  X as CloseIcon,
  Ban,
  Upload,
  User,
  Image as ImageIcon,
  Users,
  UserPlus,
  Bookmark,
  Layers,
  Eye,
  EyeOff,
  Shield,
  LogOut
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import SellerCard from "../components/marketplace/SellerCard";
import LiveShowCard from "../components/marketplace/LiveShowCard";
import CommunityCard from "../components/marketplace/CommunityCard";
import ModerationCenter from "../components/seller/ModerationCenter"; // Changed import from BannedBuyersManager to ModerationCenter

export default function SellerDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [seller, setSeller] = useState(null);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false);
  const [uploadingBackgroundImage, setUploadingBackgroundImage] = useState(false);
  const [showFollowersDialog, setShowFollowersDialog] = useState(false);
  const [showFollowingDialog, setShowFollowingDialog] = useState(false);
  const [showBookmarksDialog, setShowBookmarksDialog] = useState(false);
  const [showCommunitiesDialog, setShowCommunitiesDialog] = useState(false);
  const [showBannedBuyersDialog, setShowBannedBuyersDialog] = useState(false); // Kept state name, but it will now open ModerationCenter
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFinalDeleteConfirm, setShowFinalDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const profileImageRef = useRef(null);
  const backgroundImageRef = useRef(null);
  const [formData, setFormData] = useState({
    business_name: "",
    contact_phone: "",
    contact_email: "",
    pickup_address: "",
    pickup_city: "",
    pickup_state: "Arizona",
    pickup_zip: "",
    pickup_notes: "",
    bio: "",
    profile_image_url: "",
    background_image_url: "",
    show_contact_email: true,
    show_contact_phone: true,
    show_pickup_address: true
  });

  const { data: products = [] } = useQuery({
    queryKey: ['seller-products'],
    queryFn: () => seller ? base44.entities.Product.filter({ seller_id: seller.id }) : [],
    enabled: !!seller && seller.status === "approved"
  });

  const { data: shows = [] } = useQuery({
    queryKey: ['seller-shows'],
    queryFn: () => seller ? base44.entities.Show.filter({ seller_id: seller.id }) : [],
    enabled: !!seller && seller.status === "approved"
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['seller-orders'],
    queryFn: () => seller ? base44.entities.Order.filter({ seller_id: seller.id }) : [],
    enabled: !!seller && seller.status === "approved"
  });

  const { data: followers = [] } = useQuery({
    queryKey: ['seller-followers', seller?.id],
    queryFn: async () => {
      if (!seller?.id) return [];
      const follows = await base44.entities.FollowedSeller.filter({ seller_id: seller.id });
      if (follows.length === 0) return [];
      const buyerIds = follows.map(f => f.buyer_id);
      const buyers = await base44.entities.BuyerProfile.list();
      const matchingBuyers = buyers.filter(b => buyerIds.includes(b.user_id));
      return matchingBuyers;
    },
    enabled: !!seller && seller.status === "approved"
  });

  const { data: followingSellers = [] } = useQuery({
    queryKey: ['seller-following', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const follows = await base44.entities.FollowedSeller.filter({ buyer_id: user.id });
      if (follows.length === 0) return [];
      const sellerIds = follows.map(f => f.seller_id);
      const sellers = await base44.entities.Seller.list();
      const matchingSellers = sellers.filter(s => sellerIds.includes(s.id));
      return matchingSellers;
    },
    enabled: !!user && !!seller && seller.status === "approved"
  });

  const { data: bookmarkedShows = [] } = useQuery({
    queryKey: ['seller-bookmarked-shows', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const bookmarks = await base44.entities.BookmarkedShow.filter({ buyer_id: user.id });
      if (bookmarks.length === 0) return [];
      const showIds = bookmarks.map(b => b.show_id);
      const shows = await base44.entities.Show.list();
      const matchingShows = shows.filter(s => showIds.includes(s.id));
      return matchingShows;
    },
    enabled: !!user && !!seller && seller.status === "approved"
  });

  const { data: followedCommunities = [] } = useQuery({
    queryKey: ['seller-followed-communities', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const follows = await base44.entities.FollowedCommunity.filter({ user_id: user.id });
      if (follows.length === 0) return [];
      const communityIds = follows.map(f => f.community_id);
      const communities = await base44.entities.Community.list();
      const matchingCommunities = communities.filter(c => communityIds.includes(c.id));
      return matchingCommunities;
    },
    enabled: !!user && !!seller && seller.status === "approved"
  });

  const { data: bannedViewers = [] } = useQuery({
    queryKey: ['seller-banned-viewers-count', seller?.id],
    queryFn: () => seller ? base44.entities.ViewerBan.filter({ seller_id: seller.id }) : [],
    enabled: !!seller && seller.status === "approved"
  });

  const isImpersonating = !!sessionStorage.getItem('admin_impersonate_seller_id');

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      // Check if user is authenticated first
      const isAuthenticated = await base44.auth.isAuthenticated();
      
      if (!isAuthenticated) {
        // Not logged in - redirect to seller safety agreement (which will handle login)
        console.log("🔐 User not authenticated - redirecting to seller safety agreement");
        navigate(createPageUrl("SellerSafetyAgreement"), { replace: true });
        return;
      }
      
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      
      // CRITICAL: Check for onboarding reset - must complete full onboarding again
      if (currentUser.role !== "admin" && currentUser.seller_onboarding_reset === true) {
        console.log("🔄 Seller onboarding reset detected - redirecting to full onboarding");
        navigate(createPageUrl("SellerSafetyAgreement"), { replace: true });
        return;
      }

      // Check if seller entity already exists (If so, they are effectively onboarded)
      const existingSellers = await base44.entities.Seller.filter({ created_by: currentUser.email });
      const hasSellerEntity = existingSellers.length > 0;

      // LOGGING FOR DEBUGGING
      console.log("🔍 SellerDashboard Check:", {
        hasSellerEntity,
        sellerOnboardingCompleted: currentUser.seller_onboarding_completed,
        sellerSafetyAgreed: currentUser.seller_safety_agreed,
        sellerReset: currentUser.seller_onboarding_reset,
        role: currentUser.role
      });
      if (existingSellers.length > 0) {
        console.log("✅ Seller profile found:", existingSellers[0]);
      }

      // SAFETY & ONBOARDING CHECKS (Sequential to prevent race conditions)
      if (currentUser.role !== "admin") {
        // 1. Check Safety Agreement (Relaxed check)
        // CRITICAL: If seller entity exists, we assume they are safe/approved regardless of flag
        if (!currentUser.seller_safety_agreed && !hasSellerEntity) {
          console.log("🛡️ Seller safety agreement required - redirecting");
          navigate(createPageUrl("SellerSafetyAgreement"), { replace: true });
          return;
        }

        // 2. Check Onboarding Completion
        // CRITICAL: If seller entity exists, we UNCONDITIONALLY allow access
        // We do NOT check specific sub-fields like main_community, etc.
        if (!hasSellerEntity && !currentUser.seller_onboarding_completed) {
          // Check for auto-repair (steps completed)
          const completedSteps = currentUser.seller_onboarding_steps_completed || [];
          if (completedSteps.length >= 9) {
            console.log("🔧 Auto-repairing seller completion flag...");
            base44.auth.updateMe({ seller_onboarding_completed: true }).catch(console.error);
            currentUser.seller_onboarding_completed = true; 
          } else {
            console.log("📋 Seller onboarding incomplete - redirecting");
            navigate(createPageUrl("SellerOnboarding"), { replace: true });
            return;
          }
        }
      }
      
      // CRITICAL: Ensure we don't show spinner if we have a user but no seller yet (new seller flow)
      // If we reached here, onboarding is marked complete (or auto-repaired)
      
      // Check if admin is impersonating
      const impersonatingSellerId = sessionStorage.getItem('admin_impersonate_seller_id');
      
      if (impersonatingSellerId && currentUser.role === "admin") {
        // Load the impersonated seller by ID
        const allSellers = await base44.entities.Seller.list();
        const impersonatedSeller = allSellers.find(s => s.id === impersonatingSellerId);
        
        if (impersonatedSeller) {
          setSeller(impersonatedSeller);
          setFormData({
            business_name: impersonatedSeller.business_name || "",
            contact_phone: impersonatedSeller.contact_phone || "",
            contact_email: impersonatedSeller.contact_email || currentUser.email,
            pickup_address: impersonatedSeller.pickup_address || "",
            pickup_city: impersonatedSeller.pickup_city || "",
            pickup_state: impersonatedSeller.pickup_state || "Arizona",
            pickup_zip: impersonatedSeller.pickup_zip || "",
            pickup_notes: impersonatedSeller.pickup_notes || "",
            bio: impersonatedSeller.bio || "",
            profile_image_url: impersonatedSeller.profile_image_url || "",
            background_image_url: impersonatedSeller.background_image_url || "",
            show_contact_email: impersonatedSeller.show_contact_email !== false,
            show_contact_phone: impersonatedSeller.show_contact_phone !== false,
            show_pickup_address: impersonatedSeller.show_pickup_address !== false
          });
          console.log("🔧 Admin impersonating seller:", impersonatedSeller.business_name);
          return;
        }
      }
      
      // Normal flow - load seller by created_by
      try {
        const sellers = await base44.entities.Seller.filter({ created_by: currentUser.email });
        if (sellers.length > 0) {
          const sellerProfile = sellers[0];
          setSeller(sellerProfile);
          
          if (currentUser.role !== "admin" && sellerProfile.status !== "approved") {
            alert("Your seller application has been submitted and is pending admin approval. You'll be notified once approved.");
            navigate(createPageUrl("Marketplace"));
            return;
          }
          
          setFormData({
            business_name: sellerProfile.business_name || "",
            contact_phone: sellerProfile.contact_phone || "",
            contact_email: sellerProfile.contact_email || currentUser.email,
            pickup_address: sellerProfile.pickup_address || "",
            pickup_city: sellerProfile.pickup_city || "",
            pickup_state: sellerProfile.pickup_state || "Arizona",
            pickup_zip: sellerProfile.pickup_zip || "",
            pickup_notes: sellerProfile.pickup_notes || "",
            bio: sellerProfile.bio || "",
            profile_image_url: sellerProfile.profile_image_url || "",
            background_image_url: sellerProfile.background_image_url || "",
            show_contact_email: sellerProfile.show_contact_email !== false,
            show_contact_phone: sellerProfile.show_contact_phone !== false,
            show_pickup_address: sellerProfile.show_pickup_address !== false
          });
        } else {
          // User has completed "User Onboarding" (steps) but hasn't created "Seller Entity" yet.
          // Show the Profile Creation Form.
          if (currentUser.role === "admin") {
            setFormData({
              business_name: "Surge of Hope",
              contact_phone: "",
              contact_email: currentUser.email,
              pickup_address: "",
              pickup_city: "Phoenix",
              pickup_state: "Arizona",
              pickup_zip: "",
              pickup_notes: "",
              bio: "Official Surge of Hope marketplace for live charity auctions and sales",
              profile_image_url: "",
              background_image_url: "",
              show_contact_email: true,
              show_contact_phone: true,
              show_pickup_address: true
            });
          } else {
            // Pre-fill from user onboarding data
            setFormData({
              business_name: currentUser.seller_return_full_name || "",
              contact_phone: currentUser.phone_number || "",
              contact_email: currentUser.email,
              pickup_address: (currentUser.seller_return_address_1 || "") + (currentUser.seller_return_address_2 ? " " + currentUser.seller_return_address_2 : ""),
              pickup_city: currentUser.seller_return_city || "",
              pickup_state: currentUser.seller_return_state || "",
              pickup_zip: currentUser.seller_return_zip || "",
              pickup_notes: "",
              bio: "",
              profile_image_url: "",
              background_image_url: "",
              show_contact_email: true,
              show_contact_phone: true,
              show_pickup_address: true
            });
          }
          setIsOnboarding(true);
        }
      } catch (err) {
        console.error("Error fetching seller:", err);
        // If fetch fails, assume new seller and show onboarding form
        setIsOnboarding(true);
      }
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  const createSellerMutation = useMutation({
    mutationFn: (data) => base44.entities.Seller.create({
      ...data,
      created_by: user.email, // Ensure created_by is set
      status: user?.role === "admin" ? "approved" : "pending"
    }),
    onSuccess: (newSeller) => {
      setSeller(newSeller);
      setIsOnboarding(false);
      
      if (user?.role !== "admin" && newSeller.status !== "approved") {
        alert("Your seller application has been submitted and is pending admin approval. You'll be notified once approved.");
        navigate(createPageUrl("Marketplace"));
      }
      
      queryClient.invalidateQueries({ queryKey: ['seller-products'] });
    },
  });

  const updateSellerMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Seller.update(id, data),
    onSuccess: (updatedSeller) => {
      setSeller(updatedSeller);
      setShowProfileEditor(false);
    },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (seller) {
      updateSellerMutation.mutate({ id: seller.id, data: formData });
    } else {
      createSellerMutation.mutate(formData);
    }
  };

  const handleProfileImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingProfileImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData(prev => ({ ...prev, profile_image_url: file_url }));
    } catch (error) {
      console.error("Error uploading profile image:", error);
      alert("Failed to upload image. Please try again.");
    }
    setUploadingProfileImage(false);
  };

  const handleBackgroundImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingBackgroundImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData(prev => ({ ...prev, background_image_url: file_url }));
    } catch (error) {
      console.error("Error uploading background image:", error);
      alert("Failed to upload image. Please try again.");
    }
    setUploadingBackgroundImage(false);
  };

  const handleConnectStripe = () => {
    // Check if admin is impersonating
    const isImpersonating = sessionStorage.getItem('admin_impersonate_seller_id');
    if (isImpersonating) {
      alert("🔒 STRIPE BLOCKED: For security reasons, Stripe financial information cannot be accessed during admin impersonation.");
      return;
    }
    
    alert("Stripe Connect flow: To enable this, deploy the backend functions from the 'backend-functions' folder. See README for deployment instructions.");
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

      if (seller) {
        const sellerProducts = await base44.entities.Product.filter({ seller_id: seller.id });
        for (const product of sellerProducts) {
          await base44.entities.Product.delete(product.id);
        }

        const sellerShows = await base44.entities.Show.filter({ seller_id: seller.id });
        for (const show of sellerShows) {
          await base44.entities.Show.delete(show.id);
        }

        await base44.entities.Seller.delete(seller.id);
      }

      const buyerProfiles = await base44.entities.BuyerProfile.filter({ user_id: user.id });
      for (const profile of buyerProfiles) {
        await base44.entities.BuyerProfile.delete(profile.id);
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

  // Reusable visibility toggle component
  const VisibilityToggle = ({ label, checked, onChange }) => (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center gap-2">
        {checked ? (
          <Eye className="w-4 h-4 text-green-600" />
        ) : (
          <EyeOff className="w-4 h-4 text-gray-400" />
        )}
        <Label className="text-sm cursor-pointer" onClick={() => onChange(!checked)}>
          {label}
        </Label>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
      />
    </div>
  );

  // SAFETY CHECK: Redirect checks (handled in loadUser, but keep UI clean)
  if (user && user.role !== "admin" && (!user.seller_safety_agreed || !user.seller_onboarding_completed)) {
    // Don't block rendering with spinner here - rely on loadUser to redirect or set state
    // This prevents stuck loading state if there's a slight sync delay
  }

  if (isOnboarding) {
    return (
      <div className="min-h-screen p-4 sm:p-8">
        <div className="max-w-3xl mx-auto">
          <Card className="shadow-xl border-0">
            <CardHeader className="text-center pb-8">
              <div className="w-20 h-20 bg-gradient-to-r from-purple-600 to-blue-500 rounded-full mx-auto mb-4 flex items-center justify-center">
                <Video className="w-10 h-10 text-white" />
              </div>
              <CardTitle className="text-3xl">
                {user?.role === "admin" ? "Setup Your Seller Profile" : "Become a Seller"}
              </CardTitle>
              <p className="text-gray-600 mt-2">
                {user?.role === "admin" 
                  ? "As an admin, you can also sell products and host live shows. Set up your seller profile below."
                  : "Set up your seller profile and start livestreaming"
                }
              </p>
              {user?.role === "admin" && (
                <Badge className="bg-gradient-to-r from-purple-600 to-blue-500 text-white border-0 mt-3">
                  Admin Account - Auto-Approved
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Profile Images Section */}
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 space-y-4">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-purple-600" />
                    Profile Images
                  </h3>
                  
                  {/* Profile Picture */}
                  <div className="space-y-2">
                    <Label>Profile Picture (Circular Avatar)</Label>
                    <p className="text-xs text-gray-500">Used on seller cards, chat, and live shows • Suggested: 500×500px (1:1 ratio)</p>
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
                        disabled={uploadingProfileImage}
                        className="flex-1"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {uploadingProfileImage ? "Uploading..." : "Upload Profile Picture"}
                      </Button>
                      <input
                        ref={profileImageRef}
                        type="file"
                        accept="image/*"
                        onChange={handleProfileImageUpload}
                        className="hidden"
                      />
                    </div>
                  </div>

                  {/* Background Image */}
                  <div className="space-y-2">
                    <Label>Backdrop / Background Image</Label>
                    <p className="text-xs text-gray-500">Banner displayed on seller card and storefront • Suggested: 1200×400px (16:9 ratio)</p>
                    <div className="space-y-3">
                      {formData.background_image_url ? (
                        <div className="relative">
                          <img
                            src={formData.background_image_url}
                            alt="Background Preview"
                            className="w-full h-32 rounded-lg object-cover border-2 border-purple-200"
                          />
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, background_image_url: "" }))}
                            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                          >
                            <CloseIcon className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-full h-32 rounded-lg bg-gray-200 flex items-center justify-center">
                          <ImageIcon className="w-12 h-12 text-gray-400" />
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => backgroundImageRef.current?.click()}
                        disabled={uploadingBackgroundImage}
                        className="w-full"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {uploadingBackgroundImage ? "Uploading..." : "Upload Background Image"}
                      </Button>
                      <input
                        ref={backgroundImageRef}
                        type="file"
                        accept="image/*"
                        onChange={handleBackgroundImageUpload}
                        className="hidden"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Business Name *</Label>
                  <Input
                    value={formData.business_name}
                    onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                    placeholder="Your Business Name"
                    required
                  />
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Contact Email</Label>
                    <Input
                      type="email"
                      value={formData.contact_email}
                      onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                      placeholder="seller@example.com"
                    />
                    <VisibilityToggle
                      label="Show on Profile/Seller Card"
                      checked={formData.show_contact_email}
                      onChange={(checked) => setFormData({ ...formData, show_contact_email: checked })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Contact Phone</Label>
                    <Input
                      type="tel"
                      value={formData.contact_phone}
                      onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                      placeholder="(555) 123-4567"
                    />
                    <VisibilityToggle
                      label="Show on Profile/Seller Card"
                      checked={formData.show_contact_phone}
                      onChange={(checked) => setFormData({ ...formData, show_contact_phone: checked })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Pickup Address</Label>
                  <Input
                    value={formData.pickup_address}
                    onChange={(e) => setFormData({ ...formData, pickup_address: e.target.value })}
                    placeholder="123 Main Street"
                  />
                  <VisibilityToggle
                    label="Show on Profile/Seller Card"
                    checked={formData.show_pickup_address}
                    onChange={(checked) => setFormData({ ...formData, show_pickup_address: checked })}
                  />
                </div>

                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input
                      value={formData.pickup_city}
                      onChange={(e) => setFormData({ ...formData, pickup_city: e.target.value })}
                      placeholder="Phoenix"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>State</Label>
                    <Input
                      value={formData.pickup_state}
                      onChange={(e) => setFormData({ ...formData, pickup_state: e.target.value })}
                      placeholder="Arizona"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>ZIP</Label>
                    <Input
                      value={formData.pickup_zip}
                      onChange={(e) => setFormData({ ...formData, pickup_zip: e.target.value })}
                      placeholder="85001"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Pickup Instructions</Label>
                  <Textarea
                    value={formData.pickup_notes}
                    onChange={(e) => setFormData({ ...formData, pickup_notes: e.target.value })}
                    placeholder="e.g., Ring doorbell, pickup from garage"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Business Bio</Label>
                  <Textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    placeholder="Tell buyers about your business..."
                    rows={4}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-700 hover:to-blue-600"
                  disabled={createSellerMutation.isPending}
                >
                  {createSellerMutation.isPending ? "Creating Profile..." : "Create Seller Profile"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  const stats = [
    {
      title: "Total Products",
      value: products.length,
      icon: Package,
      color: "from-blue-500 to-cyan-500",
      onClick: null
    },
    {
      title: "Live Shows",
      value: shows.filter(s => s.status === "live").length,
      icon: Video,
      color: "from-purple-500 to-pink-500",
      onClick: null
    },
    {
      title: "Total Orders",
      value: orders.length,
      icon: DollarSign,
      color: "from-green-500 to-emerald-500",
      onClick: null
    },
    {
      title: "Followers",
      value: followers.length,
      icon: Users,
      color: "from-orange-500 to-red-500",
      onClick: () => setShowFollowersDialog(true)
    },
    {
      title: "Following",
      value: followingSellers.length,
      icon: UserPlus,
      color: "from-blue-500 to-cyan-500",
      onClick: () => setShowFollowingDialog(true)
    },
    {
      title: "Banned",
      value: bannedViewers.length, // Updated to bannedViewers
      icon: Ban,
      color: "from-red-500 to-pink-500",
      onClick: () => setShowBannedBuyersDialog(true)
    }
  ];

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">Seller Dashboard</h1>
              {user?.role === "admin" && !isImpersonating && (
                <Badge className="bg-gradient-to-r from-purple-600 to-blue-500 text-white border-0">
                  Admin/Seller
                </Badge>
              )}
            </div>
            <p className="text-gray-600 mt-1">Welcome back, {seller.business_name}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-purple-500 text-purple-600 hover:bg-purple-50 h-auto py-2 px-2 flex flex-col items-center gap-1"
              onClick={() => navigate(createPageUrl(`SellerStorefront?sellerId=${seller.id}`))}
            >
              <User className="w-4 h-4" />
              <span className="text-[10px] leading-tight text-center">View My Profile</span>
            </Button>

            {user?.role === "admin" && !isImpersonating && (
              <Button
                variant="outline"
                size="sm"
                className="border-purple-500 text-purple-600 hover:bg-purple-50 h-auto py-2 px-2 flex flex-col items-center gap-1"
                onClick={() => navigate(createPageUrl("AdminDashboard"))}
              >
                <Settings className="w-4 h-4" />
                <span className="text-[10px] leading-tight text-center">Admin Panel</span>
              </Button>
            )}
            
            <Button
              variant="outline"
              size="sm"
              className="h-auto py-2 px-2 flex flex-col items-center gap-1"
              onClick={() => navigate(createPageUrl("SellerProducts"))}
            >
              <Package className="w-4 h-4" />
              <span className="text-[10px] leading-tight text-center">Manage Products</span>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              className="h-auto py-2 px-2 flex flex-col items-center gap-1"
              onClick={() => navigate(createPageUrl("SellerOrders"))}
            >
              <Receipt className="w-4 h-4" />
              <span className="text-[10px] leading-tight text-center">Manage Orders</span>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              className="h-auto py-2 px-2 flex flex-col items-center gap-1"
              onClick={() => navigate(createPageUrl("BuyerOrders"))}
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="text-[10px] leading-tight text-center">My Orders</span>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              className="border-red-300 text-red-600 hover:bg-red-50 h-auto py-2 px-2 flex flex-col items-center gap-1"
              onClick={() => setShowBannedBuyersDialog(true)}
            >
              <Shield className="w-4 h-4" />
              <span className="text-[10px] leading-tight text-center">Moderation Center</span>
            </Button>
            
            <Button
              size="sm"
              className={`bg-gradient-to-r from-purple-600 to-blue-500 h-auto py-2 px-2 flex flex-col items-center gap-1 ${shows.length === 0 ? 'animate-pulse ring-2 ring-purple-400 ring-offset-2' : ''}`}
              onClick={() => navigate(createPageUrl("SellerShows"))}
            >
              <Video className="w-4 h-4" />
              <span className="text-[10px] leading-tight text-center">
                {shows.length === 0 ? 'Schedule First Show' : 'Manage Shows'}
              </span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="border-red-300 text-red-600 hover:bg-red-50 h-auto py-2 px-2 flex flex-col items-center gap-1"
              onClick={() => base44.auth.logout(createPageUrl("Marketplace"))}
            >
              <LogOut className="w-4 h-4" />
              <span className="text-[10px] leading-tight text-center">Logout</span>
            </Button>
            </div>
        </div>

        {user?.role === "admin" && !isImpersonating && (
          <Alert className="border-purple-500 bg-purple-50">
            <AlertCircle className="w-5 h-5 text-purple-600" />
            <AlertDescription className="text-gray-700">
              <strong>Admin Mode:</strong> You're operating as both an administrator and a seller. 
              You can manage products, host live shows, and sell items while maintaining full admin privileges. 
              Your seller account is automatically approved.
            </AlertDescription>
          </Alert>
        )}

        <Alert className={seller.stripe_connected ? "border-green-500 bg-green-50" : "border-orange-500 bg-orange-50"}>
          <div className="flex items-start gap-3">
            {seller.stripe_connected ? (
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5" />
            )}
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">
                {seller.stripe_connected ? "Stripe Connected" : "Stripe Connection Required"}
              </h3>
              <AlertDescription className="mt-1">
                {seller.stripe_connected ? (
                  <span className="text-gray-700">
                    Your Stripe account is connected. Payments will go directly to your account.
                  </span>
                ) : (
                  <span className="text-gray-700">
                    You must connect your Stripe account before you can sell products. Click below to connect.
                  </span>
                )}
              </AlertDescription>
              {!seller.stripe_connected && (
                <Button
                  className="mt-3 bg-gradient-to-r from-purple-600 to-blue-500"
                  onClick={handleConnectStripe}
                >
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Connect Stripe Account
                </Button>
              )}
            </div>
          </div>
        </Alert>

        <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {stats.map((stat, index) => (
            <Card 
              key={index} 
              className={`relative overflow-hidden border-0 shadow-lg ${stat.onClick ? 'cursor-pointer hover:shadow-xl transition-all hover:scale-105' : ''}`}
              onClick={stat.onClick}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-5`}></div>
              <CardContent className="p-3 sm:p-4">
                <div className="flex flex-col items-center text-center">
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center mb-2`}>
                    <stat.icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <p className="text-[10px] sm:text-xs font-medium text-gray-600 mb-1 leading-tight">{stat.title}</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="shadow-lg border-0">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Profile Information</CardTitle>
              <Button
                variant="outline"
                onClick={() => setShowProfileEditor(!showProfileEditor)}
              >
                {showProfileEditor ? (
                  <>
                    <CloseIcon className="w-4 h-4 mr-2" />
                    Close
                  </>
                ) : (
                  <>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit Profile Info
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          {showProfileEditor && (
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Profile Images Section */}
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 space-y-4">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-purple-600" />
                    Profile Images
                  </h3>
                  
                  <div className="space-y-2">
                    <Label>Profile Picture (Circular Avatar)</Label>
                    <p className="text-xs text-gray-500">Used on seller cards, chat, and live shows • Suggested: 500×500px (1:1 ratio)</p>
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
                        disabled={uploadingProfileImage}
                        className="flex-1"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {uploadingProfileImage ? "Uploading..." : "Upload Profile Picture"}
                      </Button>
                      <input
                        ref={profileImageRef}
                        type="file"
                        accept="image/*"
                        onChange={handleProfileImageUpload}
                        className="hidden"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Backdrop / Background Image</Label>
                    <p className="text-xs text-gray-500">Banner displayed on seller card and storefront • Suggested: 1200×400px (16:9 ratio)</p>
                    <div className="space-y-3">
                      {formData.background_image_url ? (
                        <div className="relative">
                          <img
                            src={formData.background_image_url}
                            alt="Background Preview"
                            className="w-full h-32 rounded-lg object-cover border-2 border-purple-200"
                          />
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, background_image_url: "" }))}
                            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                          >
                            <CloseIcon className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-full h-32 rounded-lg bg-gray-200 flex items-center justify-center">
                          <ImageIcon className="w-12 h-12 text-gray-400" />
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => backgroundImageRef.current?.click()}
                        disabled={uploadingBackgroundImage}
                        className="w-full"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {uploadingBackgroundImage ? "Uploading..." : "Upload Background Image"}
                      </Button>
                      <input
                        ref={backgroundImageRef}
                        type="file"
                        accept="image/*"
                        onChange={handleBackgroundImageUpload}
                        className="hidden"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Business Name *</Label>
                  <Input
                    value={formData.business_name}
                    onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Contact Email</Label>
                    <Input
                      type="email"
                      value={formData.contact_email}
                      onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                      placeholder="seller@example.com"
                    />
                    <VisibilityToggle
                      label="Show on Profile/Seller Card"
                      checked={formData.show_contact_email}
                      onChange={(checked) => setFormData({ ...formData, show_contact_email: checked })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Contact Phone</Label>
                    <Input
                      type="tel"
                      value={formData.contact_phone}
                      onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                      placeholder="(555) 123-4567"
                    />
                    <VisibilityToggle
                      label="Show on Profile/Seller Card"
                      checked={formData.show_contact_phone}
                      onChange={(checked) => setFormData({ ...formData, show_contact_phone: checked })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Pickup Address</Label>
                  <Input
                    value={formData.pickup_address}
                    onChange={(e) => setFormData({ ...formData, pickup_address: e.target.value })}
                    placeholder="123 Main Street"
                  />
                  <VisibilityToggle
                    label="Show on Profile/Seller Card"
                    checked={formData.show_pickup_address}
                    onChange={(checked) => setFormData({ ...formData, show_pickup_address: checked })}
                    />
                </div>

                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input
                      value={formData.pickup_city}
                      onChange={(e) => setFormData({ ...formData, pickup_city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>State</Label>
                    <Input
                      value={formData.pickup_state}
                      onChange={(e) => setFormData({ ...formData, pickup_state: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>ZIP</Label>
                    <Input
                      value={formData.pickup_zip}
                      onChange={(e) => setFormData({ ...formData, pickup_zip: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Pickup Instructions</Label>
                  <Textarea
                    value={formData.pickup_notes}
                    onChange={(e) => setFormData({ ...formData, pickup_notes: e.target.value })}
                    rows={3}
                    placeholder="e.g., Ring doorbell, pickup from garage"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Bio</Label>
                  <Textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    rows={4}
                    placeholder="Tell buyers about your business..."
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <Button
                      type="submit"
                      className="bg-gradient-to-r from-purple-600 to-blue-500"
                      disabled={updateSellerMutation.isPending}
                    >
                      {updateSellerMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowProfileEditor(false);
                        setFormData({
                          business_name: seller.business_name || "",
                          contact_phone: seller.contact_phone || "",
                          contact_email: seller.contact_email || "",
                          pickup_address: seller.pickup_address || "",
                          pickup_city: seller.pickup_city || "",
                          pickup_state: seller.pickup_state || "Arizona",
                          pickup_zip: seller.pickup_zip || "",
                          pickup_notes: seller.pickup_notes || "",
                          bio: seller.bio || "",
                          profile_image_url: seller.profile_image_url || "",
                          background_image_url: seller.background_image_url || "",
                          show_contact_email: seller.show_contact_email !== false,
                          show_contact_phone: seller.show_contact_phone !== false,
                          show_pickup_address: seller.show_pickup_address !== false
                        });
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
          )}
        </Card>
      </div>

      {/* Followers Dialog */}
      <Dialog open={showFollowersDialog} onOpenChange={setShowFollowersDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" />
              Your Followers ({followers.length})
            </DialogTitle>
          </DialogHeader>
          {followers.length > 0 ? (
            <div className="space-y-2">
              {followers.map((buyer) => (
                <div key={buyer.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <Avatar className="w-12 h-12 flex-shrink-0">
                    <AvatarImage src={buyer.profile_image_url} />
                    <AvatarFallback className="bg-gradient-to-r from-purple-600 to-blue-500 text-white">
                      {buyer.full_name?.[0] || "B"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{buyer.full_name}</p>
                    <p className="text-sm text-gray-500 truncate">{buyer.email}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Followers Yet</h3>
              <p className="text-gray-600">Start hosting shows to gain followers!</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Following Dialog */}
      <Dialog open={showFollowingDialog} onOpenChange={setShowFollowingDialog}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-600" />
              Sellers You Follow ({followingSellers.length})
            </DialogTitle>
          </DialogHeader>
          {followingSellers.length > 0 ? (
            <div className="grid grid-cols-3 lg:grid-cols-4 gap-4">
              {followingSellers.map((followedSeller) => (
                <SellerCard
                  key={followedSeller.id}
                  seller={followedSeller}
                  initialFollowStatus={true}
                  onClick={() => {
                    setShowFollowingDialog(false);
                    navigate(createPageUrl(`SellerStorefront?sellerId=${followedSeller.id}`));
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <UserPlus className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Not Following Anyone Yet</h3>
              <p className="text-gray-600">Follow other sellers to stay updated with their shows and products</p>
              <Button 
                className="mt-4"
                onClick={() => {
                  setShowFollowingDialog(false);
                  navigate(createPageUrl("Sellers"));
                }}
              >
                Browse Sellers
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bookmarks Dialog */}
      <Dialog open={showBookmarksDialog} onOpenChange={setShowBookmarksDialog}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bookmark className="w-5 h-5 text-yellow-600" />
              Shows You Bookmarked ({bookmarkedShows.length})
            </DialogTitle>
          </DialogHeader>
          {bookmarkedShows.length > 0 ? (
            <div className="grid grid-cols-3 lg:grid-cols-4 gap-4">
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
              <p className="text-gray-600">Bookmark shows to easily find them later</p>
              <Button 
                className="mt-4"
                onClick={() => {
                  setShowBookmarksDialog(false);
                  navigate(createPageUrl("LiveShows"));
                }}
              >
                Browse Live Shows
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Communities You Follow Dialog */}
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

      {/* UPDATED: Banned Viewers Dialog - Uses ModerationCenter */}
      <Dialog open={showBannedBuyersDialog} onOpenChange={setShowBannedBuyersDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl lg:max-w-5xl max-h-[80vh] overflow-y-auto left-[50%] translate-x-[-50%] data-[state=open]:left-[50%] data-[state=open]:translate-x-[-50%]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-600" />
              Moderation Center
            </DialogTitle>
          </DialogHeader>
          <ModerationCenter sellerId={seller.id} />
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
              All your data including orders, shows, products, and messages will be permanently removed.
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