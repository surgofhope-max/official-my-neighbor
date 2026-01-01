
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { supabaseApi as base44 } from "@/api/supabaseClient"; // Keep for entities
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Package,
  Video,
  ShoppingBag,
  Users,
  Star,
  MessageCircle,
  MapPin,
  Phone,
  Mail,
  CheckCircle,
  XCircle,
  AlertCircle,
  Shield,
  Ban
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { isAdmin } from "@/lib/auth/routeGuards";
import { format } from "date-fns";
import BannedBuyersManager from "../components/seller/BannedBuyersManager";

export default function AdminSellerData() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const sellerId = urlParams.get('sellerid') || urlParams.get('sellerId'); // Updated to check both lowercase and camelCase
  const [user, setUser] = useState(null);

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔍 AdminSellerData - URL Params Debug");
  console.log("   Full URL:", window.location.href);
  console.log("   Search String:", window.location.search);
  console.log("   sellerid (lowercase):", urlParams.get('sellerid')); // Added specific log
  console.log("   sellerId (capital I):", urlParams.get('sellerId')); // Added specific log
  console.log("   Final sellerId used:", sellerId); // Added specific log
  console.log("   All URL params:", Object.fromEntries(urlParams));
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("[AdminSellerData] auth load failed", error);
        navigate(createPageUrl("Marketplace"));
        return;
      }
      const currentUser = data?.user ?? null;
      if (!currentUser) {
        navigate(createPageUrl("Marketplace"));
        return;
      }
      setUser(currentUser);
      
      // ADMIN GATING: Uses DB truth (public.users.role), allows 'admin' OR 'super_admin'
      if (!isAdmin(currentUser)) {
        navigate(createPageUrl("Marketplace"));
        return;
      }
    } catch (error) {
      console.error("Error loading user:", error);
      navigate(createPageUrl("Marketplace"));
    }
  };

  const { data: seller } = useQuery({
    queryKey: ['admin-seller-detail', sellerId],
    queryFn: async () => {
      console.log("📦 Fetching seller with ID:", sellerId);
      const allSellers = await base44.entities.Seller.list();
      const foundSeller = allSellers.find(s => s.id === sellerId);
      console.log("✅ Seller found:", foundSeller ? foundSeller.business_name : "NOT FOUND");
      return foundSeller;
    },
    enabled: !!sellerId && !!user && isAdmin(user)
  });

  const { data: products = [] } = useQuery({
    queryKey: ['admin-seller-products', sellerId],
    queryFn: () => base44.entities.Product.filter({ seller_id: sellerId }),
    enabled: !!sellerId && !!user && isAdmin(user)
  });

  const { data: shows = [] } = useQuery({
    queryKey: ['admin-seller-shows', sellerId],
    queryFn: () => base44.entities.Show.filter({ seller_id: sellerId }), // Removed sort from queryFn per outline
    enabled: !!sellerId && !!user && isAdmin(user)
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['admin-seller-orders', sellerId],
    queryFn: () => base44.entities.Order.filter({ seller_id: sellerId }), // Removed sort from queryFn per outline
    enabled: !!sellerId && !!user && isAdmin(user)
  });

  const { data: batches = [] } = useQuery({
    queryKey: ['admin-seller-batches', sellerId],
    queryFn: () => base44.entities.Batch.filter({ seller_id: sellerId }), // Removed sort from queryFn per outline
    enabled: !!sellerId && !!user && isAdmin(user)
  });

  const { data: followers = 0 } = useQuery({ // Default to 0 for count
    queryKey: ['admin-seller-followers', sellerId],
    queryFn: async () => {
      const follows = await base44.entities.FollowedSeller.filter({ seller_id: sellerId });
      return follows.length; // Return length directly
    },
    enabled: !!sellerId && !!user && isAdmin(user)
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ['admin-seller-reviews', sellerId],
    queryFn: () => base44.entities.Review.filter({ seller_id: sellerId }), // Removed sort from queryFn per outline
    enabled: !!sellerId && !!user && isAdmin(user)
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ['admin-seller-conversations', sellerId],
    queryFn: () => base44.entities.Conversation.filter({ seller_id: sellerId }), // Removed sort from queryFn per outline
    enabled: !!sellerId && !!user && isAdmin(user)
  });

  if (!sellerId) {
    return (
      <div className="min-h-screen p-4 sm:p-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <Card className="border-2 border-dashed border-gray-300">
            <CardContent className="p-12 text-center">
              <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Seller ID Provided</h3>
              <p className="text-gray-600 mb-2">Please select a seller from the Seller Management page.</p>
              <div className="bg-gray-100 rounded p-3 text-left text-xs font-mono mb-4"> {/* Updated debug info */}
                <p><strong>Debug Info:</strong></p>
                <p>URL: {window.location.href}</p>
                <p>sellerid (lowercase): {urlParams.get('sellerid') || 'null'}</p>
                <p>sellerId (capital I): {urlParams.get('sellerId') || 'null'}</p>
              </div>
              <Button
                className="mt-4"
                onClick={() => navigate(createPageUrl("AdminSellers"))}
              >
                Go to Seller Management
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!seller) { // Removed sellerLoading check as it's no longer destructured
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading seller data...</p>
          <p className="text-xs text-gray-500 font-mono mt-2">Seller ID: {sellerId}</p>
        </div>
      </div>
    );
  }

  const statusColors = {
    pending: "bg-gray-100 text-gray-800 border-gray-200",
    approved: "bg-green-100 text-green-800 border-green-200",
    declined: "bg-red-100 text-red-800 border-red-200",
    suspended: "bg-yellow-100 text-yellow-800 border-yellow-200"
  };

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) // Changed r.star_rating to r.rating
    : "N/A";

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with Admin Badge */}
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(createPageUrl("AdminSellers"))}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">{seller.business_name}</h1>
              <Badge className="bg-gradient-to-r from-purple-600 to-blue-500 text-white border-0">
                <Shield className="w-3 h-3 mr-1" />
                ADMIN VIEW
              </Badge>
              <Badge className={`${statusColors[seller.status]} border`}>
                {seller.status}
              </Badge>
            </div>
            <p className="text-gray-600 mt-1">Seller ID: {seller.id}</p>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Package className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="text-sm text-gray-600">Products</p>
                  <p className="text-2xl font-bold text-gray-900">{products.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Video className="w-8 h-8 text-purple-600" />
                <div>
                  <p className="text-sm text-gray-600">Shows</p>
                  <p className="text-2xl font-bold text-gray-900">{shows.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <ShoppingBag className="w-8 h-8 text-green-600" />
                <div>
                  <p className="text-sm text-gray-600">Orders</p>
                  <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Users className="w-8 h-8 text-orange-600" />
                <div>
                  <p className="text-sm text-gray-600">Followers</p>
                  <p className="text-2xl font-bold text-gray-900">{followers}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Star className="w-8 h-8 text-yellow-600" />
                <div>
                  <p className="text-sm text-gray-600">Rating</p>
                  <p className="text-2xl font-bold text-gray-900">{avgRating}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <MessageCircle className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="text-sm text-gray-600">Messages</p>
                  <p className="text-2xl font-bold text-gray-900">{conversations.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Seller Profile Info */}
        <Card className="shadow-lg border-0">
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-600">Business Name</p>
                <p className="text-gray-900">{seller.business_name}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-600">Created By</p>
                <p className="text-gray-900">{seller.created_by}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-600">Contact Email</p>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-500" />
                  <p className="text-gray-900">{seller.contact_email || "Not provided"}</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-600">Contact Phone</p>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-500" />
                  <p className="text-gray-900">{seller.contact_phone || "Not provided"}</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-600">Pickup Location</p>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-500" />
                  <p className="text-gray-900">
                    {seller.pickup_address || "Not provided"}, {seller.pickup_city}, {seller.pickup_state} {seller.pickup_zip}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-600">Stripe Status</p>
                {seller.stripe_connected ? (
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Connected
                  </Badge>
                ) : (
                  <Badge className="bg-gray-100 text-gray-800 border-gray-200">
                    <XCircle className="w-3 h-3 mr-1" />
                    Not Connected
                  </Badge>
                )}
              </div>
            </div>
            {seller.bio && (
              <div>
                <p className="text-sm font-semibold text-gray-600 mb-1">Bio</p>
                <p className="text-gray-900">{seller.bio}</p>
              </div>
            )}
            {seller.status_reason && (
              <Alert className="border-yellow-500 bg-yellow-50">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
                <AlertDescription className="text-yellow-900">
                  <strong>Status Reason:</strong> {seller.status_reason}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Detailed Tabs */}
        <Tabs defaultValue="products" className="space-y-4">
          <TabsList className="grid w-full grid-cols-6 bg-white"> {/* Adjusted grid-cols to 6 */}
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="shows">Shows</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
            <TabsTrigger value="conversations">Messages</TabsTrigger>
            <TabsTrigger value="banned">
              <Ban className="w-4 h-4 mr-2" />
              Banned Buyers
            </TabsTrigger>
          </TabsList>

          <TabsContent value="products">
            <Card>
              <CardContent className="p-6">
                {products.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No products</p>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {products.map((product) => (
                      <Card key={product.id} className="border-gray-200">
                        <div className="relative h-40 bg-gray-100">
                          {product.image_urls?.[0] ? (
                            <img src={product.image_urls[0]} alt={product.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="w-12 h-12 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <CardContent className="p-3">
                          <h4 className="font-semibold text-gray-900 line-clamp-1">{product.title}</h4>
                          <p className="text-sm text-gray-600 line-clamp-2 mb-2">{product.description}</p>
                          <div className="flex items-center justify-between">
                            <p className="font-bold text-gray-900">${product.price?.toFixed(2)}</p>
                            <Badge className="bg-gray-100 text-gray-700">Qty: {product.quantity}</Badge>
                          </div>
                          <Badge className="mt-2">{product.status}</Badge>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="shows">
            <Card>
              <CardContent className="p-6">
                {shows.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No shows</p>
                ) : (
                  <div className="space-y-3">
                    {shows.map((show) => (
                      <Card key={show.id} className="border-gray-200">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h4 className="font-semibold text-gray-900">{show.title}</h4>
                              <p className="text-sm text-gray-600">{show.description}</p>
                              <div className="flex items-center gap-3 mt-2">
                                <Badge className={
                                  show.status === "live" ? "bg-red-500 text-white" :
                                  show.status === "scheduled" ? "bg-blue-500 text-white" :
                                  "bg-gray-500 text-white"
                                }>
                                  {show.status}
                                </Badge>
                                <p className="text-xs text-gray-500">
                                  {format(new Date(show.scheduled_start), "MMM d, yyyy h:mm a")}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-gray-600">Viewers</p>
                              <p className="text-xl font-bold text-gray-900">{show.viewer_count || 0}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders">
            <Card>
              <CardContent className="p-6">
                {orders.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No orders</p>
                ) : (
                  <div className="space-y-3">
                    {orders.map((order) => (
                      <Card key={order.id} className="border-gray-200">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h4 className="font-semibold text-gray-900">{order.product_title}</h4>
                              <p className="text-sm text-gray-600">Buyer: {order.buyer_name} ({order.buyer_email})</p>
                              <div className="flex items-center gap-3 mt-2">
                                <Badge className={
                                  order.status === "paid" ? "bg-green-100 text-green-800" :
                                  order.status === "picked_up" ? "bg-blue-100 text-blue-800" :
                                  "bg-gray-100 text-gray-800"
                                }>
                                  {order.status}
                                </Badge>
                                <p className="text-xs text-gray-500">
                                  {format(new Date(order.created_date), "MMM d, yyyy")}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-gray-600">Amount</p>
                              <p className="text-xl font-bold text-gray-900">${order.price?.toFixed(2)}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reviews">
            <Card>
              <CardContent className="p-6">
                {reviews.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No reviews</p>
                ) : (
                  <div className="space-y-3">
                    {reviews.map((review) => (
                      <Card key={review.id} className="border-gray-200">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-semibold text-gray-900">{review.buyer_name}</p>
                                <div className="flex items-center">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <Star
                                      key={star}
                                      className={`w-4 h-4 ${
                                        star <= review.rating // Changed to review.rating
                                          ? "fill-yellow-400 text-yellow-400"
                                          : "text-gray-300"
                                      }`}
                                    />
                                  ))}
                                </div>
                              </div>
                              <p className="text-sm text-gray-600">{review.review_text}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                {format(new Date(review.created_date), "MMM d, yyyy")}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="conversations">
            <Card>
              <CardContent className="p-6">
                {conversations.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No conversations</p>
                ) : (
                  <div className="space-y-3">
                    {conversations.map((conv) => (
                      <Card key={conv.id} className="border-gray-200">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <p className="font-semibold text-gray-900">Conversation with Buyer ID: {conv.buyer_id}</p>
                              <p className="text-sm text-gray-600 line-clamp-1">{conv.last_message_preview}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                Last message: {format(new Date(conv.last_message_at), "MMM d, yyyy h:mm a")}
                              </p>
                            </div>
                            {conv.seller_unread_count > 0 && (
                              <Badge className="bg-red-500 text-white">
                                {conv.seller_unread_count} unread
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="banned">
            <BannedBuyersManager sellerId={seller.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
