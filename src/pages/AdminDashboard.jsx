import React, { useState, useRef } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAllSellers } from "@/api/sellers";
import { SHOWS_ADMIN_FIELDS } from "@/api/shows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Users, Package, Video, AlertCircle, DollarSign, TrendingUp, CheckCircle, XCircle, Ban, Download, FileJson, FileSpreadsheet, Database, Edit, Plus, Upload, X as CloseIcon, Trash2, Grid, Image as ImageIcon, BarChart3, ChevronRight, Minimize2, Activity, Gift, Mail, ArrowLeft, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCommunityDialog, setShowCommunityDialog] = useState(false);
  const [editingCommunity, setEditingCommunity] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef(null);
  
  // Toggle States
  const [communityManagementExpanded, setCommunityManagementExpanded] = useState(false);
  const [dataExportExpanded, setDataExportExpanded] = useState(false);
  const [analyticsOverviewExpanded, setAnalyticsOverviewExpanded] = useState(false);
  const [giviDiagnosticsExpanded, setGiviDiagnosticsExpanded] = useState(false);
  const [emailSettingsExpanded, setEmailSettingsExpanded] = useState(false);

  const [communityForm, setCommunityForm] = useState({
    name: "",
    label: "",
    bio: "",
    icon_name: "",
    bg_image_url: "",
    color_gradient: "",
    sort_order: 0,
    is_active: true,
    zip_code: ""
  });

  // Email Settings State
  const [emailSettings, setEmailSettings] = useState({
    provider: "base44",
    api_key: "",
    from_email: ""
  });
  const [savingEmailSettings, setSavingEmailSettings] = useState(false);

  const { data: sellers = [] } = useQuery({
    queryKey: ['all-sellers'],
    queryFn: () => getAllSellers()
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ANALYTICS KPIs from admin_analytics_kpis view (Supabase)
  // Replaces broken base44.entities.* queries for analytics overview
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
        console.warn("[AdminDashboard] Failed to load analytics KPIs:", error.message);
        return null;
      }
      return data;
    },
    staleTime: 30000, // Cache for 30 seconds
  });

  const { data: reports = [] } = useQuery({
    queryKey: ['all-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("*");
      if (error) {
        console.warn("[AdminDashboard] Failed to load reports:", error.message);
        return [];
      }
      return data || [];
    }
  });

  // Shows query for data export (ADMIN context - full access)
  const { data: shows = [] } = useQuery({
    queryKey: ['all-shows'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shows")
        .select(SHOWS_ADMIN_FIELDS);
      if (error) {
        console.warn("[AdminDashboard] Failed to load shows:", error.message);
        return [];
      }
      return data || [];
    }
  });

  // Orders query for data export (converted from Base44)
  const { data: orders = [] } = useQuery({
    queryKey: ['all-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*");
      if (error) {
        console.warn("[AdminDashboard] Failed to load orders:", error.message);
        return [];
      }
      return data || [];
    }
  });

  const { data: products = [] } = useQuery({
    queryKey: ['all-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(`
          *,
          show:shows (
            id,
            status
          )
        `)
        .not("show.status", "in", '("ended","cancelled","completed")')
        .order("created_at", { ascending: false });
      if (error) {
        console.warn("[AdminDashboard] Failed to load products:", error.message);
        return [];
      }
      // Strip joined show object before returning (preserve product shape)
      return (data || []).map(({ show, ...product }) => product);
    }
  });

  const { data: buyerProfiles = [] } = useQuery({
    queryKey: ['all-buyer-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buyer_profiles")
        .select("*");
      if (error) {
        console.warn("[AdminDashboard] Failed to load buyer profiles:", error.message);
        return [];
      }
      return data || [];
    }
  });

  const { data: communities = [] } = useQuery({
    queryKey: ['all-communities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communities")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) {
        console.warn("[AdminDashboard] Failed to load communities:", error.message);
        return [];
      }
      return data || [];
    }
  });

  // Fetch email settings from PlatformSettings
  const { data: emailSettingsData } = useQuery({
    queryKey: ['email-settings'],
    queryFn: async () => {
      const settings = await base44.entities.PlatformSettings.list();
      const providerSetting = settings.find(s => s.setting_key === 'email_provider');
      const apiKeySetting = settings.find(s => s.setting_key === 'email_api_key');
      const fromEmailSetting = settings.find(s => s.setting_key === 'email_from_email');
      
      return {
        provider: providerSetting?.setting_value || "base44",
        api_key: apiKeySetting?.setting_value || "",
        from_email: fromEmailSetting?.setting_value || ""
      };
    }
  });

  // Update local state when data is loaded
  React.useEffect(() => {
    if (emailSettingsData) {
      setEmailSettings(emailSettingsData);
    }
  }, [emailSettingsData]);

  const updateSellerStatusMutation = useMutation({
    mutationFn: ({ id, status, reason }) => base44.entities.Seller.update(id, {
      status,
      status_reason: reason || null
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-sellers'] });
    },
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP C6-C: Community CRUD — Direct Supabase (replaces base44.entities.Community)
  // ═══════════════════════════════════════════════════════════════════════════
  const createCommunityMutation = useMutation({
    mutationFn: async (data) => {
      const { data: created, error } = await supabase
        .from("communities")
        .insert({
          name: data.name,
          label: data.label,
          bio: data.bio ?? null,
          icon_name: data.icon_name ?? null,
          bg_image_url: data.bg_image_url ?? null,
          color_gradient: data.color_gradient ?? null,
          sort_order: data.sort_order ?? 0,
          is_active: data.is_active ?? true,
          zip_code: data.zip_code ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-communities'] });
      queryClient.invalidateQueries({ queryKey: ['communities'] });
      setShowCommunityDialog(false);
      setEditingCommunity(null);
      resetCommunityForm();
    },
  });

  const updateCommunityMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const { data: updated, error } = await supabase
        .from("communities")
        .update({
          name: data.name,
          label: data.label,
          bio: data.bio ?? null,
          icon_name: data.icon_name ?? null,
          bg_image_url: data.bg_image_url ?? null,
          color_gradient: data.color_gradient ?? null,
          sort_order: data.sort_order ?? 0,
          is_active: data.is_active ?? true,
          zip_code: data.zip_code ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-communities'] });
      queryClient.invalidateQueries({ queryKey: ['communities'] });
      setShowCommunityDialog(false);
      setEditingCommunity(null);
      resetCommunityForm();
    },
  });

  const deleteCommunityMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from("communities")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-communities'] });
      queryClient.invalidateQueries({ queryKey: ['communities'] });
    },
  });

  const resetCommunityForm = () => {
    setCommunityForm({
      name: "",
      label: "",
      bio: "",
      icon_name: "",
      bg_image_url: "",
      color_gradient: "",
      sort_order: 0,
      is_active: true,
      zip_code: ""
    });
  };

  const handleStatusChange = (seller, newStatus) => {
    if (seller.business_name === "Surge of Hope" || seller.created_by === "admin@surge.org") {
      alert("Cannot change status of the primary admin account (Surge of Hope LLC)");
      return;
    }

    let reason = null;
    if (newStatus === "declined" || newStatus === "suspended") {
      reason = prompt(`Please provide a reason for ${newStatus === "declined" ? "declining" : "suspending"} this seller:`);
      if (!reason) return;
    }

    updateSellerStatusMutation.mutate({ id: seller.id, status: newStatus, reason });
  };

  const handleEditCommunity = (community) => {
    setEditingCommunity(community);
    setCommunityForm({
      name: community.name,
      label: community.label,
      bio: community.bio || "",
      icon_name: community.icon_name,
      bg_image_url: community.bg_image_url,
      color_gradient: community.color_gradient,
      sort_order: community.sort_order,
      is_active: community.is_active,
      zip_code: community.zip_code || ""
    });
    setShowCommunityDialog(true);
  };

  const handleDeleteCommunity = (community) => {
    if (confirm(`Are you sure you want to delete "${community.label}"? This cannot be undone.`)) {
      deleteCommunityMutation.mutate(community.id);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;

      const { error } = await supabase.storage
        .from("communities")
        .upload(fileName, file, { upsert: true });

      if (error) {
        console.error("Error uploading community image:", error);
        alert("Failed to upload image. Please try again.");
        return;
      }

      const { data } = supabase.storage
        .from("communities")
        .getPublicUrl(fileName);

      setCommunityForm(prev => ({
        ...prev,
        bg_image_url: data.publicUrl
      }));
    } catch (err) {
      console.error("Unexpected error uploading community image:", err);
      alert("Failed to upload image. Please try again.");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveCommunity = () => {
    if (editingCommunity) {
      updateCommunityMutation.mutate({ id: editingCommunity.id, data: communityForm });
    } else {
      createCommunityMutation.mutate(communityForm);
    }
  };

  const handleSaveEmailSettings = async () => {
    setSavingEmailSettings(true);
    try {
      // Get all existing settings
      const allSettings = await base44.entities.PlatformSettings.list();
      
      // Update or create provider setting
      const providerSetting = allSettings.find(s => s.setting_key === 'email_provider');
      if (providerSetting) {
        await base44.entities.PlatformSettings.update(providerSetting.id, {
          setting_value: emailSettings.provider
        });
      } else {
        await base44.entities.PlatformSettings.create({
          setting_key: 'email_provider',
          setting_value: emailSettings.provider,
          setting_type: 'text',
          description: 'Email service provider (base44, sendgrid, ses, mailgun, postmark)'
        });
      }

      // Update or create API key setting
      const apiKeySetting = allSettings.find(s => s.setting_key === 'email_api_key');
      if (apiKeySetting) {
        await base44.entities.PlatformSettings.update(apiKeySetting.id, {
          setting_value: emailSettings.api_key
        });
      } else {
        await base44.entities.PlatformSettings.create({
          setting_key: 'email_api_key',
          setting_value: emailSettings.api_key,
          setting_type: 'text',
          description: 'API key for email provider'
        });
      }

      // Update or create from email setting
      const fromEmailSetting = allSettings.find(s => s.setting_key === 'email_from_email');
      if (fromEmailSetting) {
        await base44.entities.PlatformSettings.update(fromEmailSetting.id, {
          setting_value: emailSettings.from_email
        });
      } else {
        await base44.entities.PlatformSettings.create({
          setting_key: 'email_from_email',
          setting_value: emailSettings.from_email,
          setting_type: 'text',
          description: 'From email address for notifications'
        });
      }

      queryClient.invalidateQueries({ queryKey: ['email-settings'] });
      alert('Email settings saved successfully!');
    } catch (error) {
      console.error('Error saving email settings:', error);
      alert('Failed to save email settings. Please try again.');
    }
    setSavingEmailSettings(false);
  };

  const exportToCSV = (data, filename) => {
    if (!data || data.length === 0) {
      alert("No data to export");
      return;
    }

    const allKeys = [...new Set(data.flatMap(obj => Object.keys(obj)))];
    const header = allKeys.join(',');
    const rows = data.map(obj => {
      return allKeys.map(key => {
        const value = obj[key];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',');
    });
    
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const exportToJSON = (data, filename) => {
    if (!data || data.length === 0) {
      alert("No data to export");
      return;
    }

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const exportAllData = (format) => {
    const allData = {
      sellers: sellers,
      shows: shows,
      products: products,
      orders: orders,
      reports: reports,
      buyerProfiles: buyerProfiles,
      communities: communities,
      exportDate: new Date().toISOString(),
      totalRecords: sellers.length + shows.length + products.length + orders.length + reports.length + buyerProfiles.length + communities.length
    };

    if (format === 'json') {
      const json = JSON.stringify(allData, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `livemarket_full_export_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
    } else {
      exportToCSV(sellers, 'sellers');
      exportToCSV(shows, 'shows');
      exportToCSV(products, 'products');
      exportToCSV(orders, 'orders');
      exportToCSV(reports, 'reports');
      exportToCSV(buyerProfiles, 'buyer_profiles');
      exportToCSV(communities, 'communities');
      alert('All data exported as separate CSV files');
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case "approved": return "bg-green-100 text-green-800 border-green-200";
      case "pending": return "bg-gray-100 text-gray-800 border-gray-200";
      case "declined": return "bg-red-100 text-red-800 border-red-200";
      case "suspended": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case "approved": return <CheckCircle className="w-4 h-4" />;
      case "pending": return <AlertCircle className="w-4 h-4" />;
      case "declined": return <XCircle className="w-4 h-4" />;
      case "suspended": return <Ban className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ANALYTICS OVERVIEW STATS
  // Uses admin_analytics_kpis view for accurate metrics
  // Falls back to 0 if KPIs not yet loaded
  // ─────────────────────────────────────────────────────────────────────────
  const stats = [
    {
      title: "Total Sellers",
      value: analyticsKpis?.active_sellers ?? sellers.length,
      subtitle: `${sellers.filter(s => s.status === "pending").length} pending approval`,
      icon: Users,
      color: "from-blue-500 to-cyan-500",
      action: () => navigate(createPageUrl("AdminSellers"))
    },
    {
      title: "Total Buyers",
      value: analyticsKpis?.active_buyers ?? 0,
      subtitle: "Active buyers",
      icon: Users,
      color: "from-purple-500 to-pink-500",
      action: () => {}
    },
    {
      title: "Total Orders",
      value: analyticsKpis?.total_orders ?? 0,
      subtitle: `${analyticsKpis?.fulfilled_orders ?? 0} fulfilled`,
      icon: Package,
      color: "from-green-500 to-emerald-500",
      action: () => {}
    },
    {
      title: "Open Reports",
      value: reports.filter(r => r.status === "pending").length,
      subtitle: `${reports.filter(r => r.status === "investigating").length} investigating`,
      icon: AlertCircle,
      color: "from-red-500 to-orange-500",
      action: () => navigate(createPageUrl("AdminReports"))
    },
    {
      title: "Platform Revenue",
      value: `$${parseFloat(analyticsKpis?.total_gmv || 0).toFixed(2)}`,
      subtitle: "Total GMV",
      icon: DollarSign,
      color: "from-yellow-500 to-orange-500",
      action: () => navigate(createPageUrl("AdminAnalytics")),
      // Show helper text when revenue is 0
      helperText: parseFloat(analyticsKpis?.total_gmv || 0) === 0 
        ? "Revenue will appear once Stripe Connect is enabled." 
        : null,
      tooltip: "Platform revenue is calculated from Stripe application fees."
    },
    {
      title: "Batches Picked Up",
      value: analyticsKpis?.batches_picked_up ?? 0,
      subtitle: "Completed fulfillments",
      icon: TrendingUp,
      color: "from-indigo-500 to-purple-500",
      action: () => {}
    }
  ];

  const navigationCards = [
    {
      title: "GIVI Diagnostics",
      description: "Debug GIVI routing & authentication issues",
      icon: Gift,
      color: "from-yellow-500 to-orange-500",
      onClick: () => navigate(createPageUrl("GIVIDiagnostics"))
    },
  ];

  const pendingSellers = sellers.filter(s => s.status === "pending");

  const availableIcons = [
    "None", // No icon option
    "Package", "Store", "Home", "ShoppingCart", "Sparkles", "Truck", "Leaf", "Video", "Key",
    "Users", "Heart", "Star", "ShoppingBag", "Gift", "Coffee", "Music", "Book", "MapPin", "Camera", "Feather", "Gamepad", "Globe", "Megaphone"
  ];

  const gradientPresets = [
    { label: "Purple to Blue", value: "from-purple-500 to-blue-500" },
    { label: "Blue to Cyan", value: "from-blue-500 to-cyan-500" },
    { label: "Green to Emerald", value: "from-green-500 to-emerald-500" },
    { label: "Orange to Red", value: "from-orange-500 to-red-500" },
    { label: "Amber to Yellow", value: "from-amber-500 to-yellow-500" },
    { label: "Red to Orange", value: "from-red-500 to-orange-500" },
    { label: "Lime to Green", value: "from-lime-500 to-green-500" },
    { label: "Teal to Cyan", value: "from-teal-500 to-cyan-500" },
    { label: "Indigo to Purple", value: "from-indigo-500 to-purple-500" },
    { label: "Pink to Rose", value: "from-pink-500 to-rose-500" }
  ];

  // Calculate total records for data export summary
  const totalRecords = sellers.length + shows.length + products.length + orders.length + reports.length + buyerProfiles.length + communities.length;

  return (
    <div className="min-h-screen p-4 sm:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(createPageUrl("SellerDashboard"))}
              className="rounded-full"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-gray-600 mt-1">Platform overview and management</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => navigate(createPageUrl("AdminAnalytics"))}
              className="border-purple-500 text-purple-600 hover:bg-purple-50"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              Analytics & Revenue
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(createPageUrl("AdminSellers"))}
            >
              <Users className="w-4 h-4 mr-2" />
              Manage Sellers
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(createPageUrl("ManageUsers"))}
            >
              <Users className="w-4 h-4 mr-2" />
              Manage Users
            </Button>
            <Button
              className="bg-gradient-to-r from-red-600 to-orange-600"
              onClick={() => navigate(createPageUrl("AdminReports"))}
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              View Reports
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate(createPageUrl("Marketplace"), { replace: true });
              }}
              className="border-gray-400 text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-400"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        {/* Analytics Overview - Minimized/Expanded Toggle */}
        {!analyticsOverviewExpanded ? (
          /* MINIMIZED VIEW - Compact Card */
          <Card 
            className="shadow-lg border-2 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
            onClick={() => setAnalyticsOverviewExpanded(true)}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-green-600 to-emerald-600 flex items-center justify-center shadow-lg">
                    <Activity className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-green-900 mb-1">Analytics Overview</h3>
                    <p className="text-sm text-gray-600">
                      6 key metrics • {analyticsKpis?.active_sellers ?? 0} sellers • {analyticsKpis?.total_orders ?? 0} orders
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className="bg-green-100 text-green-800 border-green-200 text-sm px-3 py-1">
                    Live Data
                  </Badge>
                  <ChevronRight className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* EXPANDED VIEW - Full Analytics Stats Grid */
          <Card className="shadow-lg border-2 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 animate-fadeIn">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-600 to-emerald-600 flex items-center justify-center">
                    <Activity className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-green-900">Analytics Overview</CardTitle>
                    <p className="text-sm text-gray-600 mt-1">
                      Real-time platform metrics and key performance indicators
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setAnalyticsOverviewExpanded(false)}
                  className="border-green-300 text-green-700 hover:bg-green-100"
                >
                  <Minimize2 className="w-4 h-4 mr-2" />
                  Minimize
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
                {stats.map((stat, index) => (
                  <Card
                    key={index}
                    className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer"
                    onClick={stat.action}
                    title={stat.tooltip || ""}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-5`}></div>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                          <stat.icon className="w-6 h-6 text-white" />
                        </div>
                      </div>
                      <p className="text-sm font-medium text-gray-600 mb-1">{stat.title}</p>
                      <p className="text-3xl font-bold text-gray-900 mb-2">{stat.value}</p>
                      <p className="text-sm text-gray-500">{stat.subtitle}</p>
                      {stat.helperText && (
                        <p className="text-xs text-amber-600 mt-2 italic">{stat.helperText}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Community Management - Minimized/Expanded Toggle */}
        {!communityManagementExpanded ? (
          /* MINIMIZED VIEW - Compact Card */
          <Card 
            className="shadow-lg border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
            onClick={() => setCommunityManagementExpanded(true)}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg">
                    <Grid className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-indigo-900 mb-1">Community Management</h3>
                    <p className="text-sm text-gray-600">
                      {communities.length} communities • Click to manage categories
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-sm px-3 py-1">
                    {communities.filter(c => c.is_active).length} Active
                  </Badge>
                  <ChevronRight className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* EXPANDED VIEW - Full Community Management */
          <Card className="shadow-lg border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 animate-fadeIn">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
                    <Grid className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-indigo-900">Community Management</CardTitle>
                    <p className="text-sm text-gray-600 mt-1">
                      Add, edit, or remove community categories shown throughout the app
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setEditingCommunity(null);
                      resetCommunityForm();
                      setShowCommunityDialog(true);
                    }}
                    className="bg-gradient-to-r from-indigo-600 to-purple-600"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Community
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setCommunityManagementExpanded(false)}
                    className="border-indigo-300 text-indigo-700 hover:bg-indigo-100"
                  >
                    <Minimize2 className="w-4 h-4 mr-2" />
                    Minimize
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {communities.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-300">
                  <Grid className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Communities Yet</h3>
                  <p className="text-gray-600 mb-4">Add your first community category to organize shows</p>
                  <Button
                    onClick={() => {
                      setEditingCommunity(null);
                      resetCommunityForm();
                      setShowCommunityDialog(true);
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Community
                  </Button>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {communities.map((community) => (
                    <Card key={community.id} className="border-0 shadow-md hover:shadow-lg transition-all">
                      <div className="relative h-24 overflow-hidden rounded-t-lg">
                        <img
                          src={community.bg_image_url}
                          alt={community.label}
                          className="w-full h-full object-cover"
                        />
                        <div className={`absolute inset-0 bg-gradient-to-br ${community.color_gradient} opacity-80`}></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <h3 className="text-white font-bold text-lg">{community.label}</h3>
                        </div>
                        {!community.is_active && (
                          <Badge className="absolute top-2 right-2 bg-red-500 text-white">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <CardContent className="p-3">
                        <div className="text-xs text-gray-600 space-y-1 mb-3">
                          <p><strong>Name:</strong> {community.name}</p>
                          <p><strong>Icon:</strong> {community.icon_name || "None"}</p>
                          <p><strong>Order:</strong> {community.sort_order}</p>
                          {community.zip_code && ( // Conditionally display ZIP Code
                            <p><strong>ZIP:</strong> {community.zip_code}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditCommunity(community)}
                            className="flex-1"
                          >
                            <Edit className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteCommunity(community)}
                            className="text-red-600 border-red-200 hover:bg-red-50"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Data Export & Integration - Minimized/Expanded Toggle */}
        {!dataExportExpanded ? (
          /* MINIMIZED VIEW - Compact Card */
          <Card 
            className="shadow-lg border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50 cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
            onClick={() => setDataExportExpanded(true)}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg">
                    <Database className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-purple-900 mb-1">Data Export & Integration</h3>
                    <p className="text-sm text-gray-600">
                      {totalRecords.toLocaleString()} total records • Click to export data
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-sm px-3 py-1">
                    7 Entities
                  </Badge>
                  <ChevronRight className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* EXPANDED VIEW - Full Data Export & Integration */
          <Card className="shadow-lg border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50 animate-fadeIn">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                    <Database className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-purple-900">Data Export & Integration</CardTitle>
                    <p className="text-sm text-gray-600 mt-1">
                      Export all platform data for backup or integration with external systems
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setDataExportExpanded(false)}
                  className="border-purple-300 text-purple-700 hover:bg-purple-100"
                >
                  <Minimize2 className="w-4 h-4 mr-2" />
                  Minimize
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {/* Individual Exports */}
                <div className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-5 h-5 text-blue-600" />
                    <h4 className="font-semibold text-gray-900">Sellers</h4>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{sellers.length} records</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportToCSV(sellers, 'sellers')}
                    >
                      <FileSpreadsheet className="w-4 h-4 mr-1" />
                      CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportToJSON(sellers, 'sellers')}
                    >
                      <FileJson className="w-4 h-4 mr-1" />
                      JSON
                    </Button>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2 mb-2">
                    <Video className="w-5 h-5 text-purple-600" />
                    <h4 className="font-semibold text-gray-900">Shows</h4>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{shows.length} records</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportToCSV(shows, 'shows')}
                    >
                      <FileSpreadsheet className="w-4 h-4 mr-1" />
                      CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportToJSON(shows, 'shows')}
                    >
                      <FileJson className="w-4 h-4 mr-1" />
                      JSON
                    </Button>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-5 h-5 text-green-600" />
                    <h4 className="font-semibold text-gray-900">Products</h4>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{products.length} records</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportToCSV(products, 'products')}
                    >
                      <FileSpreadsheet className="w-4 h-4 mr-1" />
                      CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportToJSON(products, 'products')}
                    >
                      <FileJson className="w-4 h-4 mr-1" />
                      JSON
                    </Button>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-5 h-5 text-yellow-600" />
                    <h4 className="font-semibold text-gray-900">Orders</h4>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{orders.length} records</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportToCSV(orders, 'orders')}
                    >
                      <FileSpreadsheet className="w-4 h-4 mr-1" />
                      CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportToJSON(orders, 'orders')}
                    >
                      <FileJson className="w-4 h-4 mr-1" />
                      JSON
                    </Button>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <h4 className="font-semibold text-gray-900">Reports</h4>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{reports.length} records</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportToCSV(reports, 'reports')}
                    >
                      <FileSpreadsheet className="w-4 h-4 mr-1" />
                      CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportToJSON(reports, 'reports')}
                    >
                      <FileJson className="w-4 h-4 mr-1" />
                      JSON
                    </Button>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-5 h-5 text-indigo-600" />
                    <h4 className="font-semibold text-gray-900">Buyer Profiles</h4>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{buyerProfiles.length} records</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportToCSV(buyerProfiles, 'buyer_profiles')}
                    >
                      <FileSpreadsheet className="w-4 h-4 mr-1" />
                      CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportToJSON(buyerProfiles, 'buyer_profiles')}
                    >
                      <FileJson className="w-4 h-4 mr-1" />
                      JSON
                    </Button>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2 mb-2">
                    <Grid className="w-5 h-5 text-indigo-600" />
                    <h4 className="font-semibold text-gray-900">Communities</h4>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{communities.length} records</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportToCSV(communities, 'communities')}
                    >
                      <FileSpreadsheet className="w-4 h-4 mr-1" />
                      CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exportToJSON(communities, 'communities')}
                    >
                      <FileJson className="w-4 h-4 mr-1" />
                      JSON
                    </Button>
                  </div>
                </div>
              </div>

              {/* Full Export Buttons */}
              <div className="border-t border-gray-200 pt-6">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Download className="w-5 h-5 text-purple-600" />
                  Export All Data
                </h4>
                <p className="text-sm text-gray-600 mb-4">
                  Download complete platform data export including all sellers, shows, products, orders, reports, buyer profiles, and communities.
                </p>
                <div className="flex gap-3">
                  <Button
                    className="bg-gradient-to-r from-purple-600 to-blue-600"
                    onClick={() => exportAllData('json')}
                  >
                    <FileJson className="w-4 h-4 mr-2" />
                    Export All as JSON
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => exportAllData('csv')}
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export All as CSV
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Email Notification Settings - Minimized/Expanded Toggle */}
        {!emailSettingsExpanded ? (
          /* MINIMIZED VIEW - Compact Card */
          <Card 
            className="shadow-lg border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
            onClick={() => setEmailSettingsExpanded(true)}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center shadow-lg">
                    <Mail className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-blue-900 mb-1">Email Notifications Settings</h3>
                    <p className="text-sm text-gray-600">
                      Configure email provider • Current: {emailSettings.provider}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-sm px-3 py-1">
                    {emailSettings.api_key ? "Configured" : "Not Set"}
                  </Badge>
                  <ChevronRight className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* EXPANDED VIEW - Email Settings Form */
          <Card className="shadow-lg border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 animate-fadeIn">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center">
                    <Mail className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-blue-900">Email Notifications Settings</CardTitle>
                    <p className="text-sm text-gray-600 mt-1">
                      Configure your email service provider for sending notifications
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setEmailSettingsExpanded(false)}
                  className="border-blue-300 text-blue-700 hover:bg-blue-100"
                >
                  <Minimize2 className="w-4 h-4 mr-2" />
                  Minimize
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-white rounded-lg p-6 space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email-provider">Email Provider</Label>
                  <Select
                    value={emailSettings.provider}
                    onValueChange={(value) => setEmailSettings({ ...emailSettings, provider: value })}
                  >
                    <SelectTrigger id="email-provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="base44">Base44 (Default)</SelectItem>
                      <SelectItem value="sendgrid">SendGrid</SelectItem>
                      <SelectItem value="ses">Amazon SES</SelectItem>
                      <SelectItem value="mailgun">Mailgun</SelectItem>
                      <SelectItem value="postmark">Postmark</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">
                    Choose your email service provider. Base44 is the default and requires no setup.
                  </p>
                </div>

                {emailSettings.provider !== "base44" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="api-key">API Key</Label>
                      <Input
                        id="api-key"
                        type="password"
                        value={emailSettings.api_key}
                        onChange={(e) => setEmailSettings({ ...emailSettings, api_key: e.target.value })}
                        placeholder="Enter your API key"
                        className="font-mono"
                      />
                      <p className="text-xs text-gray-500">
                        Your {emailSettings.provider} API key. This will be securely encrypted.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="from-email">From Email Address</Label>
                      <Input
                        id="from-email"
                        type="email"
                        value={emailSettings.from_email}
                        onChange={(e) => setEmailSettings({ ...emailSettings, from_email: e.target.value })}
                        placeholder="noreply@yourdomain.com"
                      />
                      <p className="text-xs text-gray-500">
                        The email address that notifications will be sent from.
                      </p>
                    </div>
                  </>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-900">
                      <p className="font-semibold mb-1">Notification Types</p>
                      <ul className="list-disc list-inside space-y-1 text-blue-800">
                        <li>Show Go Live alerts for bookmarked shows</li>
                        <li>Order confirmations and pickup reminders</li>
                        <li>Seller approval notifications</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleSaveEmailSettings}
                  disabled={savingEmailSettings}
                  className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                >
                  {savingEmailSettings ? "Saving..." : "Save Email Settings"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* GIVI Diagnostics - Minimized/Expanded Toggle */}
        {!giviDiagnosticsExpanded ? (
          /* MINIMIZED VIEW - Compact Card */
          <Card 
            className="shadow-lg border-2 border-yellow-200 bg-gradient-to-r from-yellow-50 to-orange-50 cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
            onClick={() => setGiviDiagnosticsExpanded(true)}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-yellow-600 to-orange-600 flex items-center justify-center shadow-lg">
                    <Gift className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-yellow-900 mb-1">GIVI Diagnostics</h3>
                    <p className="text-sm text-gray-600">
                      Debug GIVI routing & authentication issues
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-sm px-3 py-1">
                    Admin Tool
                  </Badge>
                  <ChevronRight className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* EXPANDED VIEW - Full GIVI Diagnostics Tools */
          <Card className="shadow-lg border-2 border-yellow-200 bg-gradient-to-r from-yellow-50 to-orange-50 animate-fadeIn">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-600 to-orange-600 flex items-center justify-center">
                    <Gift className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-yellow-900">GIVI Diagnostics</CardTitle>
                    <p className="text-sm text-gray-600 mt-1">
                      Tools for debugging GIVI related issues, such as routing and authentication.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setGiviDiagnosticsExpanded(false)}
                  className="border-yellow-300 text-yellow-700 hover:bg-yellow-100"
                >
                  <Minimize2 className="w-4 h-4 mr-2" />
                  Minimize
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
                {navigationCards.map((card, index) => (
                  <Card
                    key={index}
                    className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer"
                    onClick={card.onClick}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-5`}></div>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center`}>
                          <card.icon className="w-6 h-6 text-white" />
                        </div>
                      </div>
                      <p className="text-sm font-medium text-gray-600 mb-1">{card.title}</p>
                      <p className="text-md font-semibold text-gray-900 mb-2">{card.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Seller Approval Controls */}
        <Card className="shadow-lg border-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-orange-600" />
              Seller Approval Controls
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingSellers.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No pending seller approvals</p>
            ) : (
              <div className="space-y-4">
                {pendingSellers.map((seller) => (
                  <Card key={seller.id} className="border-2 border-orange-200 bg-orange-50">
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-bold text-lg text-gray-900">
                              {seller.business_name}
                            </h3>
                            <Badge className={`${getStatusColor(seller.status)} border`}>
                              {getStatusIcon(seller.status)}
                              <span className="ml-1">{seller.status}</span>
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-600 space-y-1">
                            <p><strong>Email:</strong> {seller.contact_email}</p>
                            <p><strong>Phone:</strong> {seller.contact_phone}</p>
                            <p><strong>Location:</strong> {seller.pickup_city}, {seller.pickup_state}</p>
                            {seller.stripe_connected && (
                              <Badge className="bg-green-100 text-green-800 border-green-200 border mt-2">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Stripe Connected
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => handleStatusChange(seller, "approved")}
                            disabled={updateSellerStatusMutation.isPending}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => handleStatusChange(seller, "declined")}
                            disabled={updateSellerStatusMutation.isPending}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Decline
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-yellow-600 border-yellow-200 hover:bg-yellow-50"
                            onClick={() => handleStatusChange(seller, "suspended")}
                            disabled={updateSellerStatusMutation.isPending}
                          >
                            <Ban className="w-4 h-4 mr-1" />
                            Suspend
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="shadow-lg border-0">
            <CardHeader>
              <CardTitle>All Sellers Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sellers.slice(0, 5).map((seller) => (
                  <div key={seller.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-semibold">{seller.business_name}</p>
                      <p className="text-sm text-gray-600">{seller.contact_email}</p>
                    </div>
                    <Badge className={`${getStatusColor(seller.status)} border`}>
                      {seller.status}
                    </Badge>
                  </div>
                ))}
              </div>
              {sellers.length > 5 && (
                <Button
                  variant="outline"
                  className="w-full mt-4"
                  onClick={() => navigate(createPageUrl("AdminSellers"))}
                >
                  View All Sellers
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-lg border-0">
            <CardHeader>
              <CardTitle>Recent Reports</CardTitle>
            </CardHeader>
            <CardContent>
              {reports.filter(r => r.status === "pending").length === 0 ? (
                <p className="text-gray-500 text-center py-8">No pending reports</p>
              ) : (
                <div className="space-y-3">
                  {reports.filter(r => r.status === "pending").slice(0, 5).map((report) => (
                    <div key={report.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <div>
                        <p className="font-semibold text-red-900">{report.report_type.replace(/_/g, ' ')}</p>
                        <p className="text-sm text-red-700">{report.reporter_email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Community Dialog */}
      <Dialog open={showCommunityDialog} onOpenChange={setShowCommunityDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCommunity ? "Edit Community" : "Add New Community"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="community-name">Community Name (Code)</Label>
              <Input
                id="community-name"
                value={communityForm.name}
                onChange={(e) => setCommunityForm({ ...communityForm, name: e.target.value })}
                placeholder="e.g., vintage, swap_meets"
              />
              <p className="text-xs text-gray-500">Used in code and URLs (lowercase, underscores allowed)</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="community-label">Display Label</Label>
              <Input
                id="community-label"
                value={communityForm.label}
                onChange={(e) => setCommunityForm({ ...communityForm, label: e.target.value })}
                placeholder="e.g., Vintage, Swap Meets"
              />
              <p className="text-xs text-gray-500">Shown to users in the app</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="community-bio">Community Bio</Label>
              <textarea
                id="community-bio"
                value={communityForm.bio}
                onChange={(e) => setCommunityForm({ ...communityForm, bio: e.target.value })}
                placeholder="Describe your community..."
                className="w-full min-h-[80px] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-vertical"
              />
              <p className="text-xs text-gray-500">Brief description shown on community cards and pages</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="community-zip">ZIP Code *</Label>
              <Input
                id="community-zip"
                value={communityForm.zip_code}
                onChange={(e) => {
                  // Only allow digits and limit to 5 characters
                  const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                  setCommunityForm({ ...communityForm, zip_code: value });
                }}
                placeholder="85001"
                maxLength={5}
                inputMode="numeric" // Hint for mobile keyboards
                pattern="\d{5}" // HTML5 pattern for 5 digits
              />
              <p className="text-xs text-gray-500">5-digit ZIP code for Near Me distance filtering</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="community-icon">Icon Name</Label>
              <Select
                value={communityForm.icon_name || "None"}
                onValueChange={(value) => setCommunityForm({ ...communityForm, icon_name: value === "None" ? "" : value })}
              >
                <SelectTrigger id="community-icon">
                  <SelectValue placeholder="Select an icon" />
                </SelectTrigger>
                <SelectContent>
                  {availableIcons.map((icon) => (
                    <SelectItem key={icon} value={icon}>
                      {icon === "None" ? "None / No Icon" : icon}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">Lucide React icon to display (select "None" for no icon)</p>
            </div>

            <div className="space-y-2">
              <Label>Background Image</Label>
              <div className="flex flex-col gap-3">
                {communityForm.bg_image_url ? (
                  <div className="relative">
                    <img
                      src={communityForm.bg_image_url}
                      alt="Preview"
                      className="w-full h-32 object-cover rounded-lg border-2 border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => setCommunityForm({ ...communityForm, bg_image_url: "" })}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                    >
                      <CloseIcon className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-full h-32 rounded-lg bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300">
                    <ImageIcon className="w-12 h-12 text-gray-400" />
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="w-full"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {uploadingImage ? "Uploading..." : "Upload Image"}
                </Button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
              <p className="text-xs text-gray-500">Recommended: 400×300px aspect ratio</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="community-gradient">Color Gradient</Label>
              <Select
                value={communityForm.color_gradient}
                onValueChange={(value) => setCommunityForm({ ...communityForm, color_gradient: value })}
              >
                <SelectTrigger id="community-gradient">
                  <SelectValue placeholder="Select a gradient" />
                </SelectTrigger>
                <SelectContent>
                  {gradientPresets.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded bg-gradient-to-r ${preset.value}`}></div>
                        {preset.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">Gradient overlay on image</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="community-sort-order">Sort Order</Label>
              <Input
                id="community-sort-order"
                type="number"
                value={communityForm.sort_order}
                onChange={(e) => setCommunityForm({ ...communityForm, sort_order: parseInt(e.target.value) || 0 })}
                placeholder="0"
              />
              <p className="text-xs text-gray-500">Lower numbers appear first</p>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <input
                type="checkbox"
                id="is_active"
                checked={communityForm.is_active}
                onChange={(e) => setCommunityForm({ ...communityForm, is_active: e.target.checked })}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <Label htmlFor="is_active" className="text-sm font-medium text-gray-900">Active (visible to users)</Label>
            </div>

            <div className="flex gap-3 pt-6">
              <Button
                onClick={handleSaveCommunity}
                disabled={createCommunityMutation.isPending || updateCommunityMutation.isPending || uploadingImage}
                className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
              >
                {createCommunityMutation.isPending || updateCommunityMutation.isPending
                  ? "Saving..."
                  : editingCommunity
                  ? "Update Community"
                  : "Create Community"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCommunityDialog(false);
                  setEditingCommunity(null);
                  resetCommunityForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom Animation CSS */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}