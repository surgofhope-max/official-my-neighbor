import React, { useState, useEffect } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useSupabaseAuth } from "@/lib/auth/SupabaseAuthProvider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isSuperAdmin } from "@/lib/auth/routeGuards";
import { getShowsBySellerId, createShow } from "@/api/shows";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Video,
  Plus,
  Search,
  Radio,
  Calendar,
  Users,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  ArrowLeft,
  Package,
  Play,
  Square
} from "lucide-react";
import { format, isPast } from "date-fns";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ShowForm from "../components/shows/ShowForm";
import ProductForm from "../components/products/ProductForm";

export default function SellerShows() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Use SupabaseAuthProvider as single source of truth for auth
  const { user: authUser, isLoadingAuth } = useSupabaseAuth();
  
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [editingShow, setEditingShow] = useState(null);
  const [user, setUser] = useState(null);
  const [seller, setSeller] = useState(null);
  const [isLoadingSeller, setIsLoadingSeller] = useState(true);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [selectedShowForProduct, setSelectedShowForProduct] = useState(null);
  const [showPastShows, setShowPastShows] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Load seller data when auth user changes
  useEffect(() => {
    if (isLoadingAuth) return; // Wait for auth check to complete
    
    if (!authUser) {
      // Not logged in - redirect to login
      console.log("🔐 User not authenticated - redirecting to login");
      navigate(createPageUrl("Login"), { replace: true });
      return;
    }
    
    loadSeller();
  }, [authUser, isLoadingAuth]);

  const loadSeller = async () => {
    setIsLoadingSeller(true);
    try {
      // Auth is already checked by useEffect - authUser is guaranteed to exist here
      const currentUser = authUser;
      setUser(currentUser);
      const userRole = currentUser.user_metadata?.role || currentUser.role;
      console.log("👤 SellerShows - Current user:", currentUser.email, "Role:", userRole);

      // 🔐 SUPER_ADMIN BYPASS: Skip ALL checks
      if (isSuperAdmin(currentUser)) {
        console.log("🔑 SUPER_ADMIN detected — bypassing all checks in SellerShows");
        // Load seller if exists, but don't require it
        const { data: sellerProfile } = await supabase
          .from("sellers")
          .select("*")
          .eq("user_id", currentUser.id)
          .maybeSingle();
        
        if (sellerProfile) {
          setSeller(sellerProfile);
        }
        return;
      }

      // CRITICAL: Check for onboarding reset - must complete full onboarding again
      if (userRole !== "admin" && currentUser.user_metadata?.seller_onboarding_reset === true) {
        console.log("🔄 Seller onboarding reset detected - redirecting to full onboarding");
        navigate(createPageUrl("SellerSafetyAgreement"), { replace: true });
        return;
      }

      // Check for seller safety agreement
      if (userRole !== "admin" && currentUser.user_metadata?.seller_safety_agreed !== true) {
        console.log("🛡️ Seller safety agreement required - redirecting");
        navigate(createPageUrl("SellerSafetyAgreement"), { replace: true });
        return;
      }

      // Check for seller onboarding completion
      if (userRole !== "admin" && !currentUser.user_metadata?.seller_onboarding_completed) {
        console.log("📋 Seller onboarding incomplete - redirecting");
        navigate(createPageUrl("SellerOnboarding"), { replace: true });
        return;
      }

      // Check if admin is impersonating
      const impersonatingSellerId = sessionStorage.getItem('admin_impersonate_seller_id');

      if (impersonatingSellerId && userRole === "admin") {
        const { data: impersonatedSeller } = await supabase
          .from("sellers")
          .select("*")
          .eq("id", impersonatingSellerId)
          .maybeSingle();

        if (impersonatedSeller) {
          setSeller(impersonatedSeller);
          console.log("🔧 Admin impersonating seller in Shows:", impersonatedSeller.business_name);
          return; // Exit loadSeller early if impersonating
        }
      }

      // Load seller by user_id
      const { data: sellerProfile, error: sellerError } = await supabase
        .from("sellers")
        .select("*")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (sellerError && sellerError.code !== "PGRST116") {
        throw sellerError;
      }

      if (sellerProfile) {
        setSeller(sellerProfile);
        console.log("🏪 SellerShows - Loaded seller:", sellerProfile.business_name, "ID:", sellerProfile.id);

        if (userRole !== "admin" && sellerProfile.status !== "approved") {
          console.log("⚠️ Seller not approved - redirecting to BuyerProfile");
          navigate(createPageUrl("BuyerProfile"), { replace: true, state: { sellerStatus: sellerProfile.status } });
          return;
        }
      } else {
        console.log("⚠️ SellerShows - No seller profile found, redirecting to BuyerProfile.");
        navigate(createPageUrl("BuyerProfile"), { replace: true });
        return;
      }
    } catch (error) {
      console.error("Error loading seller:", error);
      navigate(createPageUrl("BuyerProfile"), { replace: true });
      return;
    } finally {
      setIsLoadingSeller(false);
    }
  };

  const { data: shows = [], isLoading: showsLoading } = useQuery({
    queryKey: ['seller-shows', seller?.id],
    queryFn: async () => {
      if (!seller?.id) {
        console.log("⏳ SellerShows - No seller ID yet, returning empty array");
        return [];
      }
      console.log("📺 SellerShows - Fetching shows for seller_id:", seller.id);
      const result = await getShowsBySellerId(seller.user_id);
      console.log("✅ SellerShows - Shows fetched:", result.length, "shows");

      // Log each show with its IDs
      result.forEach((show, index) => {
        console.log(`   Show ${index + 1}: "${show.title}" | ShowID: ${show.id} | SellerID: ${show.seller_id}`);
      });

      return result;
    },
    enabled: !!seller?.id
  });

  const createShowMutation = useMutation({
    mutationFn: async (showData) => {
      console.log("➕ SellerShows - Creating show:", showData);
      console.log("   Title:", showData.title);
      console.log("🧪 DEBUG - seller.id (sellers table PK):", seller.id);
      console.log("🧪 DEBUG - seller.user_id (auth FK):", seller.user_id);
      console.log("🧪 DEBUG - authUser.id (current auth):", authUser?.id);
      console.log("🧪 DEBUG - seller.user_id === authUser.id?", seller.user_id === authUser?.id);
      console.log("   Seller Name:", seller.business_name);
      
      const createdShow = await createShow({
        seller_id: seller.user_id,
        title: showData.title,
        description: showData.description,
        pickup_instructions: showData.pickup_instructions,
        scheduled_start: showData.scheduled_start,
      });

      if (!createdShow) {
        console.warn("Show creation failed");
        throw new Error("Failed to create show");
      }

      console.log("✅ Show created:", createdShow);
      return createdShow;
    },
    onSuccess: (newShow) => {
      console.log("✅ SellerShows - Show created successfully:");
      console.log("   Show ID:", newShow.id);
      console.log("   Seller ID:", newShow.seller_id);
      console.log("   Title:", newShow.title);
      queryClient.invalidateQueries({ queryKey: ['seller-shows', seller.id] });
      queryClient.invalidateQueries({ queryKey: ['all-shows'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-live-shows'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-upcoming-shows'] });
      setShowScheduleDialog(false);
      setEditingShow(null);
    },
  });

  const updateShowMutation = useMutation({
    mutationFn: ({ id, showData }) => {
      console.log("✏️ SellerShows - Updating show:", id, showData);
      return base44.entities.Show.update(id, showData);
    },
    onSuccess: (updatedShow) => {
      console.log("✅ SellerShows - Show updated:", updatedShow.id);
      queryClient.invalidateQueries({ queryKey: ['seller-shows', seller.id] });
      queryClient.invalidateQueries({ queryKey: ['all-shows'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-live-shows'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-upcoming-shows'] });
      setShowScheduleDialog(false);
      setEditingShow(null);
    },
  });

  const createProductMutation = useMutation({
    mutationFn: (data) => {
      if (!selectedShowForProduct?.id) {
        throw new Error("Show ID is missing - cannot create product");
      }
      const productData = {
        ...data,
        seller_id: seller.id,
        show_id: selectedShowForProduct.id, // CRITICAL: Assign to specific show
        is_live_item: true
      };
      console.log("📦 SellerShows - Creating product for show:", selectedShowForProduct.title);
      console.log("   Seller ID:", seller.id);
      console.log("   Show ID:", selectedShowForProduct.id);
      console.log("   Product data:", productData);
      return base44.entities.Product.create(productData);
    },
    onSuccess: (newProduct) => {
      console.log("✅ SellerShows - Product created and linked to show:", newProduct);
      console.log("   Product ID:", newProduct.id);
      console.log("   Show ID:", newProduct.show_id);
      queryClient.invalidateQueries({ queryKey: ['show-products', selectedShowForProduct.id] });
      setShowProductDialog(false);
      setSelectedShowForProduct(null);
    },
  });

  const handleSubmit = (showData) => {
    console.log("📤 SellerShows - Submitting show data:", showData);
    if (editingShow) {
      updateShowMutation.mutate({ id: editingShow.id, showData });
    } else {
      createShowMutation.mutate(showData);
    }
  };

  const handleAddProductToShow = (show) => {
    console.log("➕ Opening product form for show:", show.title, "ID:", show.id);
    setSelectedShowForProduct(show);
    setShowProductDialog(true);
  };

  const handleSaveProduct = (productData) => {
    createProductMutation.mutate(productData);
  };

  const goLive = async (show) => {
    console.log("🟢 goLive START", show);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔴 GO LIVE - UNIVERSAL ROUTING (MOBILE + DESKTOP)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📺 Show Title:", show.title);
    console.log("🆔 Show ID:", show.id);
    console.log("🏪 Show Seller ID:", show.seller_id);
    console.log("👤 Current Seller:", seller.business_name);
    console.log("🆔 Current Seller ID:", seller.id);
    console.log("✅ ID Match:", show.seller_id === seller.id ? "YES" : "NO");
    console.log("🖥️ Platform:", navigator.userAgent);

    try {
      console.log("🟡 goLive TRY BLOCK ENTERED");
      // Update show status
      console.log("🟡 Calling supabase.update for show status...");
      await supabase
        .from("shows")
        .update({ status: "live", started_at: new Date().toISOString() })
        .eq("id", show.id);
      console.log("✅ Show status updated to 'live'");

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['seller-shows', seller.id] });
      queryClient.invalidateQueries({ queryKey: ['all-shows'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-live-shows'] });
      console.log("✅ Queries invalidated");

      // UNIVERSAL NAVIGATION - Works on ALL devices
      const hostConsoleUrl = createPageUrl("HostConsole") + `?showId=${show.id}`;
      console.log("🔗 Navigating to:", hostConsoleUrl);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🧭 GoLive hostConsoleUrl:", hostConsoleUrl);
      console.log("🧭 window.location BEFORE:", window.location.pathname + window.location.search);

      // Use navigate with replace to prevent back button from returning to this page after show ends
      console.log("🟡 CALLING navigate() NOW");
      navigate(hostConsoleUrl, { replace: true });
      console.log("🟢 navigate() RETURNED - goLive END");
    } catch (error) {
      console.error("❌ Error going live:", error);
      console.log("🔴 goLive CAUGHT ERROR:", error.message);
      alert(`Failed to go live: ${error.message}`);
    }
  };

  const handleHostConsoleClick = (show) => {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🎮 HOST CONSOLE - UNIVERSAL ROUTING (MOBILE + DESKTOP)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📺 Show:", show.title);
    console.log("🆔 ShowID:", show.id);
    console.log("🏪 SellerID:", show.seller_id);
    console.log("🖥️ Platform:", navigator.userAgent);

    const hostConsoleUrl = createPageUrl("HostConsole") + `?showId=${show.id}`;
    console.log("🔗 Navigating to:", hostConsoleUrl);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Use navigate with replace to prevent back button from returning to this page after show ends
    navigate(hostConsoleUrl, { replace: true });
  };

  const endShow = async (show) => {
    console.log("⏹️ SellerShows - Ending show:", show.id);
    
    try {
      await supabase
        .from("shows")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", show.id);
      
      queryClient.invalidateQueries({ queryKey: ['seller-shows', seller.id] });
      queryClient.invalidateQueries({ queryKey: ['all-shows'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-live-shows'] });
      
      console.log("✅ Show ended successfully - queries invalidated");
    } catch (error) {
      console.error("❌ Error ending show:", error);
      alert(`Failed to end show: ${error.message}`);
    }
  };

  // Show loading state while auth or seller is loading
  if (isLoadingAuth || isLoadingSeller) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <div className="text-gray-600">Loading shows…</div>
      </div>
    );
  }

  // Redirect if not authenticated (should not reach here normally)
  if (!user) {
    navigate(createPageUrl("Login"), { replace: true });
    return null;
  }

  // Redirect if no seller profile (should not reach here normally)
  if (!seller) {
    navigate(createPageUrl("BuyerProfile"), { replace: true });
    return null;
  }

  const statusColors = {
    scheduled: "bg-blue-100 text-blue-800 border-blue-200",
    live: "bg-red-100 text-red-800 border-red-200",
    ended: "bg-gray-100 text-gray-800 border-gray-200",
    cancelled: "bg-gray-100 text-gray-800 border-gray-200"
  };

  const filteredShows = shows.filter(show =>
    show.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    show.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (show.description && show.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const liveShows = filteredShows.filter(s => s.status === "live");
  const scheduledShows = filteredShows.filter(s => s.status === "scheduled");
  const pastShows = filteredShows.filter(s => s.status === "ended" || s.status === "cancelled");

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Live Shows</h1>
            <p className="text-gray-600 mt-1">Schedule and manage your livestreams</p>
          </div>
          <Button
            className="bg-gradient-to-r from-purple-600 to-blue-500"
            onClick={() => {
              setEditingShow(null);
              setShowScheduleDialog(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Schedule Show
          </Button>
        </div>

        <Alert className="border-blue-500 bg-blue-50 mb-6">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-900">
            <strong>Your Seller:</strong> {seller.business_name} • <strong>Seller ID:</strong> {seller.id}
            <br />
            <span className="text-xs">Each show has its own unique ShowID and routes to a dedicated host console</span>
          </AlertDescription>
        </Alert>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            type="text"
            placeholder="Search shows by title or ID..."
            className="pl-9 pr-4 py-2 border rounded-md w-full focus:ring-purple-500 focus:border-purple-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Live Shows */}
        {liveShows.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Radio className="w-5 h-5 text-red-500 animate-pulse" />
              Currently Live
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {liveShows.map((show) => (
                <Card key={show.id} className="border-2 border-red-500 shadow-xl">
                  {/* FIXED: Video/Thumbnail Display */}
                  <div className="relative h-40 bg-gradient-to-br from-red-500 to-purple-600 overflow-hidden">
                    {show.video_preview_url ? (
                      <video
                        src={show.video_preview_url}
                        className="w-full h-full object-cover"
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : show.thumbnail_url ? (
                      <img src={show.thumbnail_url} alt={show.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Video className="w-12 h-12 text-white" />
                      </div>
                    )}
                    <Badge className="absolute top-3 right-3 bg-red-500 text-white border-0 animate-pulse z-10">
                      LIVE
                    </Badge>
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-lg mb-2">{show.title}</h3>
                    <div className="bg-gray-50 rounded p-2 mb-3">
                      <p className="text-xs text-gray-600 font-mono">
                        <strong>Show ID:</strong> {show.id}
                      </p>
                      <p className="text-xs text-gray-600 font-mono">
                        <strong>Seller ID:</strong> {show.seller_id}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                      <Users className="w-4 h-4" />
                      {show.viewer_count || 0} viewers
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 bg-gradient-to-r from-purple-600 to-blue-500"
                        onClick={() => handleHostConsoleClick(show)}
                      >
                        Host Console
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => endShow(show)}
                      >
                        End Show
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Scheduled Shows */}
        {scheduledShows.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">Upcoming Shows</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {scheduledShows.map((show) => (
                <Card key={show.id} className="border-0 shadow-lg">
                  {/* FIXED: Video/Thumbnail Display */}
                  <div className="relative h-40 bg-gradient-to-br from-blue-500 to-purple-600 overflow-hidden">
                    {show.video_preview_url ? (
                      <video
                        src={show.video_preview_url}
                        className="w-full h-full object-cover"
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : show.thumbnail_url ? (
                      <img src={show.thumbnail_url} alt={show.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Calendar className="w-12 h-12 text-white" />
                      </div>
                    )}
                    <Badge className={`absolute top-3 right-3 ${statusColors[show.status]} border z-10`}>
                      {show.status}
                    </Badge>
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-lg mb-2">{show.title}</h3>
                    <div className="bg-gray-50 rounded p-2 mb-3">
                      <p className="text-xs text-gray-600 font-mono truncate">
                        <strong>Show ID:</strong> {show.id}
                      </p>
                      <p className="text-xs text-gray-600 font-mono truncate">
                        <strong>Seller ID:</strong> {show.seller_id}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                      <Calendar className="w-4 h-4" />
                      {show.scheduled_start_time
                        ? format(new Date(show.scheduled_start_time), "MMM d, yyyy 'at' h:mm a")
                        : "Not scheduled"}
                    </div>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Button
                          className="flex-1 bg-gradient-to-r from-purple-600 to-blue-500"
                          onClick={() => goLive(show)}
                        >
                          <Radio className="w-4 h-4 mr-2" />
                          Go Live
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingShow(show);
                            setShowScheduleDialog(true);
                          }}
                        >
                          Edit
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        className="w-full border-2 border-green-500 text-green-700 hover:bg-green-50"
                        onClick={() => handleAddProductToShow(show)}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Product to Show
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Past Shows - COLLAPSIBLE */}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {pastShows.map((show) => (
                  <Card key={show.id} className="border-0 shadow-lg opacity-75">
                    {/* FIXED: Video/Thumbnail Display */}
                    <div className="relative h-40 bg-gradient-to-br from-gray-400 to-gray-500 overflow-hidden">
                      {show.video_preview_url ? (
                        <video
                          src={show.video_preview_url}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : show.thumbnail_url ? (
                        <img src={show.thumbnail_url} alt={show.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Video className="w-12 h-12 text-white" />
                        </div>
                      )}
                      <Badge className={`absolute top-3 right-3 ${statusColors[show.status]} border z-10`}>
                        {show.status}
                      </Badge>
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-lg mb-2">{show.title}</h3>
                      <div className="text-sm text-gray-600 space-y-1">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          {show.total_views || 0} total views
                        </div>
                        <div>
                          {show.total_sales || 0} sales
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {shows.length === 0 && !showsLoading && (
          <Card className="border-2 border-dashed border-gray-300">
            <CardContent className="p-12 text-center">
              <Video className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No shows scheduled</h3>
              <p className="text-gray-600 mb-4">Create your first show to start streaming</p>
              <Button
                className="bg-gradient-to-r from-purple-600 to-blue-500"
                onClick={() => {
                  setEditingShow(null);
                  setShowScheduleDialog(true);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Schedule Your First Show
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Show Dialog */}
        <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingShow ? "Edit Show" : "Schedule New Show"}
              </DialogTitle>
            </DialogHeader>
            <ShowForm
              show={editingShow}
              onSave={handleSubmit}
              onCancel={() => {
                setShowScheduleDialog(false);
                setEditingShow(null);
              }}
              isSubmitting={createShowMutation.isPending || updateShowMutation.isPending}
            />
          </DialogContent>
        </Dialog>

        {/* Add Product Dialog */}
        <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Product to Show</DialogTitle>
              {selectedShowForProduct && (
                <p className="text-sm text-gray-500 mt-2">
                  Adding product to: <strong>{selectedShowForProduct.title}</strong>
                  <br />
                  <strong className="text-purple-600">This product will ONLY appear in this specific show</strong>
                </p>
              )}
            </DialogHeader>
            <ProductForm
              product={null}
              onSave={handleSaveProduct}
              onCancel={() => {
                setShowProductDialog(false);
                setSelectedShowForProduct(null);
              }}
              isSubmitting={createProductMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}