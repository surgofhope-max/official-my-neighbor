import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { SHOWS_ADMIN_FIELDS } from "@/api/shows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  DollarSign,
  Users,
  ShoppingBag,
  Download,
  ExternalLink,
  Search,
  Calendar,
  RefreshCw,
  ArrowLeft,
  Layers
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { isAdmin } from "@/lib/auth/routeGuards";
import SellerAnalyticsTab from "../components/analytics/SellerAnalyticsTab";
import BuyerAnalyticsTab from "../components/analytics/BuyerAnalyticsTab";
import CommunityAnalyticsTab from "../components/analytics/CommunityAnalyticsTab";

export default function AdminAnalytics() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [dateRange, setDateRange] = useState("30"); // 7, 30, or "custom"
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("[AdminAnalytics] auth load failed", error);
        navigate(createPageUrl("Login"));
        return;
      }
      const currentUser = data?.user ?? null;
      if (!currentUser) {
        navigate(createPageUrl("Login"));
        return;
      }
      // ADMIN GATING: Uses DB truth (public.users.role), allows 'admin' OR 'super_admin'
      if (!isAdmin(currentUser)) {
        navigate(createPageUrl("Marketplace"));
        return;
      }
      setUser(currentUser);
    } catch (error) {
      console.error("Error loading user:", error);
      navigate(createPageUrl("Login"));
    }
  };

  // Calculate date range
  const getDateRange = () => {
    const end = new Date();
    const start = new Date();
    
    if (dateRange === "custom") {
      return {
        start: customStartDate ? new Date(customStartDate) : new Date(start.setDate(start.getDate() - 30)),
        end: customEndDate ? new Date(customEndDate) : end
      };
    }
    
    start.setDate(start.getDate() - parseInt(dateRange));
    return { start, end };
  };

  const { start: startDate, end: endDate } = getDateRange();

  // ─────────────────────────────────────────────────────────────────────────
  // ANALYTICS KPIs from admin_analytics_kpis view (Supabase)
  // Provides high-level totals for overview stats
  // ─────────────────────────────────────────────────────────────────────────
  const { data: analyticsKpis } = useQuery({
    queryKey: ['admin-analytics-kpis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_analytics_kpis")
        .select("*")
        .limit(1)
        .maybeSingle();
      
      if (error) {
        console.warn("[AdminAnalytics] Failed to load analytics KPIs:", error.message);
        return null;
      }
      return data;
    },
    enabled: !!user,
    staleTime: 30000,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ORDER FULFILLMENT ANALYTICS from admin_order_fulfillment_analytics view
  // Provides per-order data with seller/buyer/show context
  // ─────────────────────────────────────────────────────────────────────────
  const { data: orderAnalytics = [] } = useQuery({
    queryKey: ['admin-order-fulfillment-analytics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_order_fulfillment_analytics")
        .select("*");
      
      if (error) {
        console.warn("[AdminAnalytics] Failed to load order analytics:", error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!user,
    staleTime: 30000,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ENTITY DATA for child tabs (Supabase direct queries)
  // These replace broken base44.entities.* queries
  // ─────────────────────────────────────────────────────────────────────────
  const { data: sellers = [] } = useQuery({
    queryKey: ['admin-sellers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sellers")
        .select("*");
      if (error) {
        console.warn("[AdminAnalytics] Failed to load sellers:", error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!user
  });

  const { data: buyers = [] } = useQuery({
    queryKey: ['admin-buyers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buyer_profiles")
        .select("*");
      if (error) {
        console.warn("[AdminAnalytics] Failed to load buyers:", error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!user
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*");
      if (error) {
        console.warn("[AdminAnalytics] Failed to load orders:", error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!user
  });

  // Shows query (ADMIN context - full access)
  const { data: shows = [] } = useQuery({
    queryKey: ['admin-shows'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shows")
        .select(SHOWS_ADMIN_FIELDS);
      if (error) {
        console.warn("[AdminAnalytics] Failed to load shows:", error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!user
  });

  const { data: communities = [] } = useQuery({
    queryKey: ['admin-communities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communities")
        .select("*");
      if (error) {
        console.warn("[AdminAnalytics] Failed to load communities:", error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!user
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVED DATA for child tabs
  // Transform analytics data into shapes expected by child tabs
  // ─────────────────────────────────────────────────────────────────────────
  
  // Build payments-like array from order analytics for child tabs
  // Child tabs expect: { seller_id, seller_entity_id, buyer_id, amount, ... }
  // Include both seller IDs for canonical + legacy fallback matching
  const payments = orderAnalytics.map(o => ({
    id: o.order_id,
    order_id: o.order_id,
    seller_id: o.seller_user_id || o.seller_entity_id || null, // Legacy fallback
    seller_entity_id: o.seller_entity_id || null,              // Canonical (new orders)
    seller_name: o.seller_name || null,                        // For direct display
    buyer_id: o.buyer_id,
    amount: parseFloat(o.order_amount) || 0,                   // Correct field from view
    application_fee: 0, // Platform fee not tracked in analytics_events yet
    created_date: o.order_created_at,
    created_at: o.order_created_at,
    stripe_charge_id: null, // Not available from analytics
    status: "succeeded",
  }));

  // Empty refunds array - refunds not yet tracked in analytics_events
  const refunds = [];

  // ─────────────────────────────────────────────────────────────────────────
  // OVERVIEW STATS from admin_analytics_kpis view
  // Uses analytics-backed totals instead of client-side aggregation
  // ─────────────────────────────────────────────────────────────────────────
  const totalGMV = parseFloat(analyticsKpis?.total_gmv || 0);
  const totalRefunds = 0; // Refunds not yet tracked
  const platformFees = 0; // Platform fees not yet tracked in analytics_events
  const netRevenue = totalGMV - totalRefunds;

  const overviewStats = [
    {
      title: "Gross Merchandise Value",
      value: `$${totalGMV.toFixed(2)}`,
      icon: TrendingUp,
      color: "from-green-500 to-emerald-500"
    },
    {
      title: "Total Orders",
      value: analyticsKpis?.total_orders ?? 0,
      icon: ShoppingBag,
      color: "from-purple-500 to-pink-500"
    },
    {
      title: "Fulfilled Orders",
      value: analyticsKpis?.fulfilled_orders ?? 0,
      icon: RefreshCw,
      color: "from-orange-500 to-red-500"
    },
    {
      title: "Batches Picked Up",
      value: analyticsKpis?.batches_picked_up ?? 0,
      icon: DollarSign,
      color: "from-blue-500 to-cyan-500"
    }
  ];

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 p-4 sm:p-8">
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
              <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
              <p className="text-gray-600 mt-1">Stripe-integrated revenue & transaction analytics</p>
            </div>
          </div>
        </div>

        {/* Date Range Filters */}
        <Card className="border-0 shadow-lg">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <Calendar className="w-5 h-5 text-gray-500" />
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 Days</SelectItem>
                  <SelectItem value="30">Last 30 Days</SelectItem>
                  <SelectItem value="90">Last 90 Days</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>

              {dateRange === "custom" && (
                <>
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-40"
                  />
                  <span className="text-gray-500">to</span>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-40"
                  />
                </>
              )}

              <div className="flex-1 flex items-center gap-2 ml-auto">
                <Search className="w-4 h-4 text-gray-500" />
                <Input
                  placeholder="Search sellers or buyers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overview Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {overviewStats.map((stat, index) => (
            <Card key={index} className="relative overflow-hidden border-0 shadow-lg">
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-5`}></div>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-2">{stat.title}</p>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                    <stat.icon className="w-6 h-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Stripe Connect Notice - shown when GMV is 0 */}
        {totalGMV === 0 && (
          <Card className="border-0 shadow-md bg-amber-50 border-l-4 border-l-amber-400">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Layers className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    Stripe Connect Not Yet Enabled
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    Revenue analytics will populate after Stripe payments are active. 
                    Platform fees are calculated from Stripe Connect application fees.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs for Sellers, Buyers & Communities */}
        <Tabs defaultValue="sellers" className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-3">
            <TabsTrigger value="sellers">
              <Users className="w-4 h-4 mr-2" />
              Sellers
            </TabsTrigger>
            <TabsTrigger value="buyers">
              <ShoppingBag className="w-4 h-4 mr-2" />
              Buyers
            </TabsTrigger>
            <TabsTrigger value="communities">
              <Layers className="w-4 h-4 mr-2" />
              Communities
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sellers">
            <SellerAnalyticsTab
              startDate={startDate}
              endDate={endDate}
              searchTerm={searchTerm}
              sellers={sellers}
              payments={payments}
              refunds={refunds}
              orders={orders}
            />
          </TabsContent>

          <TabsContent value="buyers">
            <BuyerAnalyticsTab
              startDate={startDate}
              endDate={endDate}
              searchTerm={searchTerm}
              buyers={buyers}
              payments={payments}
              refunds={refunds}
              orders={orders}
              sellers={sellers}
            />
          </TabsContent>

          <TabsContent value="communities">
            <CommunityAnalyticsTab
              startDate={startDate}
              endDate={endDate}
              searchTerm={searchTerm}
              communities={communities}
              shows={shows}
              orders={orders}
              payments={payments}
              refunds={refunds}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}