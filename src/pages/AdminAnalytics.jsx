import React, { useState, useEffect } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
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
      const currentUser = await base44.auth.me();
      if (currentUser.role !== "admin") {
        alert("Unauthorized - Admin access required");
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

  // Fetch overview metrics
  const { data: payments = [] } = useQuery({
    queryKey: ['admin-payments'],
    queryFn: () => base44.entities.Payment.list(),
    enabled: !!user
  });

  const { data: refunds = [] } = useQuery({
    queryKey: ['admin-refunds'],
    queryFn: () => base44.entities.Refund.list(),
    enabled: !!user
  });

  const { data: sellers = [] } = useQuery({
    queryKey: ['admin-sellers'],
    queryFn: () => base44.entities.Seller.list(),
    enabled: !!user
  });

  const { data: buyers = [] } = useQuery({
    queryKey: ['admin-buyers'],
    queryFn: () => base44.entities.BuyerProfile.list(),
    enabled: !!user
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => base44.entities.Order.list(),
    enabled: !!user
  });

  const { data: shows = [] } = useQuery({
    queryKey: ['admin-shows'],
    queryFn: () => base44.entities.Show.list(),
    enabled: !!user
  });

  const { data: communities = [] } = useQuery({
    queryKey: ['admin-communities'],
    queryFn: () => base44.entities.Community.list(),
    enabled: !!user
  });

  // Calculate overview metrics
  const totalGMV = payments
    .filter(p => new Date(p.created_date) >= startDate && new Date(p.created_date) <= endDate)
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const totalRefunds = refunds
    .filter(r => new Date(r.created_date) >= startDate && new Date(r.created_date) <= endDate)
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  const platformFees = payments
    .filter(p => new Date(p.created_date) >= startDate && new Date(p.created_date) <= endDate)
    .reduce((sum, p) => sum + (p.application_fee || 0), 0);

  const netRevenue = totalGMV - totalRefunds;

  const overviewStats = [
    {
      title: "Gross Merchandise Value",
      value: `$${totalGMV.toFixed(2)}`,
      icon: TrendingUp,
      color: "from-green-500 to-emerald-500"
    },
    {
      title: "Platform Fees",
      value: `$${platformFees.toFixed(2)}`,
      icon: DollarSign,
      color: "from-purple-500 to-pink-500"
    },
    {
      title: "Total Refunds",
      value: `$${totalRefunds.toFixed(2)}`,
      icon: RefreshCw,
      color: "from-orange-500 to-red-500"
    },
    {
      title: "Net Revenue",
      value: `$${netRevenue.toFixed(2)}`,
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