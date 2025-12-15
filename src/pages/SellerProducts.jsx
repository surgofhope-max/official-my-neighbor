import React, { useState, useEffect } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Image as ImageIcon, 
  AlertCircle, 
  ArrowLeft, 
  Video, 
  Package, 
  DollarSign, 
  Calendar,
  Search,
  Gift,
  ShoppingBag,
  ChevronDown,
  ChevronUp,
  Grid
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import ProductForm from "../components/products/ProductForm";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { getProductsBySellerId } from "@/api/products";
import { getShowsBySellerId } from "@/api/shows";

export default function SellerProducts() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [seller, setSeller] = useState(null);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Navigation state: 'shows' | 'products' | 'givey'
  const [view, setView] = useState('shows');
  const [selectedShow, setSelectedShow] = useState(null);
  const [inventoryType, setInventoryType] = useState('products');
  const [showPastShows, setShowPastShows] = useState(false);

  // Data state (replacing React Query for reads)
  const [shows, setShows] = useState([]);
  const [allProducts, setAllProducts] = useState([]);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      
      // CRITICAL: Check for onboarding reset - must complete full onboarding again
      if (currentUser.role !== "admin" && currentUser.seller_onboarding_reset === true) {
        console.log("🔄 Seller onboarding reset detected - redirecting to full onboarding");
        navigate(createPageUrl("SellerSafetyAgreement"), { replace: true });
        return;
      }

      // Check for seller safety agreement
      if (currentUser.role !== "admin" && currentUser.seller_safety_agreed !== true) {
        console.log("🛡️ Seller safety agreement required - redirecting");
        navigate(createPageUrl("SellerSafetyAgreement"), { replace: true });
        return;
      }

      // Check for seller onboarding completion
      if (currentUser.role !== "admin" && !currentUser.seller_onboarding_completed) {
        console.log("📋 Seller onboarding incomplete - redirecting");
        navigate(createPageUrl("SellerOnboarding"), { replace: true });
        return;
      }
      
      // Check if admin is impersonating
      const impersonatingSellerId = sessionStorage.getItem('admin_impersonate_seller_id');
      
      if (impersonatingSellerId && currentUser.role === "admin") {
        const allSellers = await base44.entities.Seller.list();
        const impersonatedSeller = allSellers.find(s => s.id === impersonatingSellerId);
        
        if (impersonatedSeller) {
          setSeller(impersonatedSeller);
          console.log("🔧 Admin impersonating seller in Products:", impersonatedSeller.business_name);
          return; // Exit after setting impersonated seller
        }
      }
      
      // Original logic for regular users or if impersonation ID not found/invalid
      const sellers = await base44.entities.Seller.filter({ created_by: currentUser.email });
      if (sellers.length > 0) {
        const sellerProfile = sellers[0];
        setSeller(sellerProfile);
        
        if (currentUser.role !== "admin" && sellerProfile.status !== "approved") {
          navigate(createPageUrl("Marketplace"));
          return;
        }
      } else {
        navigate(createPageUrl("Marketplace"));
        return;
      }
    } catch (error) {
      console.error("Error loading user:", error);
      navigate(createPageUrl("Marketplace"));
      return;
    }
  };

  // Load shows and products when seller is available
  const loadData = async () => {
    if (!seller?.id) return;

    try {
      const [showsData, productsData] = await Promise.all([
        getShowsBySellerId(seller.id),
        getProductsBySellerId(seller.id),
      ]);
      setShows(showsData);
      setAllProducts(productsData);
    } catch (error) {
      setShows([]);
      setAllProducts([]);
    }
  };

  useEffect(() => {
    if (seller?.id) {
      loadData();
    }
  }, [seller?.id]);

  // Separate regular products from GIVEY items
  const regularProducts = allProducts.filter(p => !p.is_givey);
  const giveyProducts = allProducts.filter(p => p.is_givey);

  const createProductMutation = useMutation({
    mutationFn: (data) => {
      if (!seller?.id) {
        throw new Error("Seller ID is missing");
      }
      const productData = { ...data, seller_id: seller.id };
      return base44.entities.Product.create(productData);
    },
    onSuccess: () => {
      loadData();
      setShowProductDialog(false);
      setEditingProduct(null);
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Product.update(id, data),
    onSuccess: () => {
      loadData();
      setShowProductDialog(false);
      setEditingProduct(null);
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: (id) => base44.entities.Product.delete(id),
    onSuccess: () => {
      loadData();
    },
  });

  const handleSave = (productData) => {
    if (editingProduct) {
      updateProductMutation.mutate({ id: editingProduct.id, data: productData });
    } else {
      createProductMutation.mutate(productData);
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setShowProductDialog(true); // Changed from setShowDialog
  };

  const handleDelete = (id) => {
    if (confirm("Are you sure you want to delete this product?")) {
      deleteProductMutation.mutate(id);
    }
  };

  const handleNewProduct = () => {
    setEditingProduct(null);
    setShowProductDialog(true); // Changed from setShowDialog
  };

  const handleShowClick = (show) => {
    setSelectedShow(show);
    setView('products');
    setInventoryType('products'); // Default to regular products
  };

  const handleBackToShows = () => {
    setView('shows');
    setSelectedShow(null);
    setSearchTerm("");
  };

  const handleViewGivey = () => {
    setView('givey');
    setSearchTerm("");
  };

  // Calculate stats per show (regular products only)
  const showsWithStats = shows.map(show => {
    const showProducts = regularProducts.filter(p => p.show_id === show.id);
    const totalValue = showProducts.reduce((sum, p) => sum + ((p.price || 0) * (p.quantity || 0)), 0);
    
    return {
      ...show,
      productCount: showProducts.length,
      totalValue,
      availableCount: showProducts.filter(p => p.status === 'available').length,
      soldCount: showProducts.filter(p => p.status === 'sold').length
    };
  });

  // Separate active/upcoming shows from ended shows
  const activeShows = showsWithStats.filter(show => 
    show.status === 'live' || show.status === 'scheduled'
  );
  
  const pastShows = showsWithStats.filter(show => 
    show.status === 'ended' || show.status === 'cancelled'
  );

  // Get products for selected show
  const productsForShow = selectedShow 
    ? regularProducts.filter(p => p.show_id === selectedShow.id)
    : [];

  if (!seller) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  // ========================================
  // VIEW 1: SHOWS LIST
  // ========================================
  if (view === 'shows') {
    const filteredActiveShows = activeShows.filter(show =>
      show.title?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    const filteredPastShows = pastShows.filter(show =>
      show.title?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="min-h-screen p-4 sm:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="ghost"
              onClick={() => navigate(createPageUrl("SellerDashboard"))}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </div>
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Product Inventory</h1>
              <p className="text-gray-600 mt-1">Select a show to manage products</p>
            </div>
            <Button
              variant="outline"
              className="border-pink-500 text-pink-600 hover:bg-pink-50"
              onClick={handleViewGivey}
            >
              <Gift className="w-4 h-4 mr-2" />
              GIVEY Inventory ({giveyProducts.length})
            </Button>
          </div>

          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search shows..."
              className="pl-10"
            />
          </div>

          {/* Overall Stats */}
          <div className="flex gap-2">
            <Card className="border-0 shadow-sm flex-1 bg-purple-50">
              <CardContent className="p-2 text-center">
                <p className="text-xs text-gray-600 mb-0.5">Shows</p>
                <p className="text-lg font-bold text-gray-900">{shows.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm flex-1 bg-blue-50">
              <CardContent className="p-2 text-center">
                <p className="text-xs text-gray-600 mb-0.5">Products</p>
                <p className="text-lg font-bold text-gray-900">{regularProducts.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm flex-1 bg-pink-50">
              <CardContent className="p-2 text-center">
                <p className="text-xs text-gray-600 mb-0.5">GIVEYs</p>
                <p className="text-lg font-bold text-gray-900">{giveyProducts.length}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-0 shadow-sm bg-green-50">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-gray-600 mb-0.5">Total Value</p>
              <p className="text-xl font-bold text-gray-900">
                ${regularProducts.reduce((sum, p) => sum + ((p.price || 0) * (p.quantity || 0)), 0).toFixed(2)}
              </p>
            </CardContent>
          </Card>

          {/* Active Shows Grid */}
          {filteredActiveShows.length > 0 ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Your Shows</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredActiveShows.map((show) => (
                  <Card 
                    key={show.id}
                    className="border-0 shadow-lg hover:shadow-xl transition-shadow cursor-pointer"
                    onClick={() => handleShowClick(show)}
                  >
                    <div className="relative h-40 bg-gradient-to-br from-purple-600 to-blue-600 overflow-hidden">
                      {show.thumbnail_url ? (
                        <img 
                          src={show.thumbnail_url}
                          alt={show.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Video className="w-12 h-12 text-white" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                      <div className="absolute bottom-3 left-3 right-3">
                        <h3 className="text-white font-bold text-lg line-clamp-2">{show.title}</h3>
                      </div>
                    </div>
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Date:</span>
                          <span className="font-medium">
                            {format(new Date(show.scheduled_start), "MMM d, yyyy")}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-3 border-t">
                          <div className="text-center">
                            <p className="text-xs text-gray-600">Products</p>
                            <p className="text-lg font-bold text-gray-900">{show.productCount}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-600">Available</p>
                            <p className="text-lg font-bold text-green-600">{show.availableCount}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-600">Value</p>
                            <p className="text-lg font-bold text-gray-900">
                              ${show.totalValue.toFixed(0)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <Card className="border-2 border-dashed border-gray-300">
              <CardContent className="p-12 text-center">
                <Video className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No active shows found</h3>
                <p className="text-gray-600">Create a show to start adding products</p>
              </CardContent>
            </Card>
          )}

          {/* Past Shows - Collapsible Section */}
          {filteredPastShows.length > 0 && (
            <div className="mt-8">
              <button
                onClick={() => setShowPastShows(!showPastShows)}
                className="w-full flex items-center justify-between p-4 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors mb-4"
              >
                <div className="flex items-center gap-3">
                  {showPastShows ? <ChevronUp className="w-5 h-5 text-gray-600" /> : <ChevronDown className="w-5 h-5 text-gray-600" />}
                  <h2 className="text-xl font-semibold text-gray-900">Past Shows</h2>
                  <span className="text-sm text-gray-600">({filteredPastShows.length})</span>
                </div>
              </button>

              {showPastShows && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredPastShows.map((show) => (
                    <Card 
                      key={show.id}
                      className="border-0 shadow-lg hover:shadow-xl transition-shadow cursor-pointer opacity-75"
                      onClick={() => handleShowClick(show)}
                    >
                      <div className="relative h-40 bg-gradient-to-br from-gray-600 to-gray-800 overflow-hidden">
                        {show.thumbnail_url ? (
                          <img 
                            src={show.thumbnail_url}
                            alt={show.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Video className="w-12 h-12 text-white" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                        <div className="absolute top-3 right-3">
                          <Badge className="bg-gray-500 text-white">{show.status}</Badge>
                        </div>
                        <div className="absolute bottom-3 left-3 right-3">
                          <h3 className="text-white font-bold text-lg line-clamp-2">{show.title}</h3>
                        </div>
                      </div>
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Date:</span>
                            <span className="font-medium">
                              {format(new Date(show.scheduled_start), "MMM d, yyyy")}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 pt-3 border-t">
                            <div className="text-center">
                              <p className="text-xs text-gray-600">Products</p>
                              <p className="text-lg font-bold text-gray-900">{show.productCount}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-gray-600">Available</p>
                              <p className="text-lg font-bold text-green-600">{show.availableCount}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-gray-600">Value</p>
                              <p className="text-lg font-bold text-gray-900">
                                ${show.totalValue.toFixed(0)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========================================
  // VIEW 2: PRODUCTS FOR SELECTED SHOW
  // ========================================
  if (view === 'products') {
    const filteredProducts = productsForShow.filter(product =>
      product.title?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="min-h-screen p-4 sm:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={handleBackToShows}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{selectedShow.title}</h1>
              <p className="text-gray-600 mt-1">Manage products for this show</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search products..."
              className="pl-10"
            />
          </div>

          {/* Show Stats */}
          <div className="grid sm:grid-cols-4 gap-4">
            <Card className="border-0 shadow-md">
              <CardContent className="p-6">
                <p className="text-gray-600 text-sm">Total Products</p>
                <p className="text-2xl font-bold text-gray-900">{productsForShow.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md">
              <CardContent className="p-6">
                <p className="text-gray-600 text-sm">Available</p>
                <p className="text-2xl font-bold text-green-600">
                  {productsForShow.filter(p => p.status === 'available').length}
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md">
              <CardContent className="p-6">
                <p className="text-gray-600 text-sm">Sold</p>
                <p className="text-2xl font-bold text-gray-600">
                  {productsForShow.filter(p => p.status === 'sold').length}
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md">
              <CardContent className="p-6">
                <p className="text-gray-600 text-sm">Total Value</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${productsForShow.reduce((sum, p) => sum + ((p.price || 0) * (p.quantity || 0)), 0).toFixed(2)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Products Grid */}
          {filteredProducts.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredProducts.map((product) => (
                <Card key={product.id} className="border-0 shadow-lg hover:shadow-xl transition-all">
                  <div className="relative h-48 bg-gray-100">
                    {product.image_urls?.[0] ? (
                      <img 
                        src={product.image_urls[0]}
                        alt={product.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-12 h-12 text-gray-400" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex gap-2">
                      {product.is_live_item && (
                        <Badge className="bg-purple-600 text-white">Live</Badge>
                      )}
                      {product.status === 'sold' && (
                        <Badge className="bg-gray-600 text-white">Sold</Badge>
                      )}
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-lg mb-2 line-clamp-2">{product.title}</h3>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-2xl font-bold text-purple-600">${product.price?.toFixed(2)}</p>
                      <p className="text-sm text-gray-600">Qty: {product.quantity}</p>
                    </div>
                    {product.category && (
                      <Badge variant="outline" className="mb-3 text-xs">
                        {product.category}
                      </Badge>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleEdit(product)}
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(product.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-2 border-dashed border-gray-300">
              <CardContent className="p-12 text-center">
                <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No products for this show</h3>
                <p className="text-gray-600 mb-4">Add products from Host Console or assign existing products</p>
                <Button
                  className="bg-gradient-to-r from-purple-600 to-blue-500"
                  onClick={handleNewProduct}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Product
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // ========================================
  // VIEW 3: GIVEY INVENTORY
  // ========================================
  if (view === 'givey') {
    const filteredGivey = giveyProducts.filter(product =>
      product.title?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="min-h-screen p-4 sm:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={handleBackToShows}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-orange-600 bg-clip-text text-transparent">
                GIVEY Inventory
              </h1>
              <p className="text-gray-600 mt-1">Manage giveaway and raffle items</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search GIVEY items..."
              className="pl-10"
            />
          </div>

          {/* GIVEY Notice */}
          <Alert className="bg-gradient-to-r from-pink-50 to-orange-50 border-pink-200">
            <Gift className="h-5 w-5 text-pink-600" />
            <AlertDescription className="text-gray-900">
              <strong>GIVEY Items:</strong> These products are for giveaways and raffles. When activated 
              during a live show, viewers will only see a countdown timer and share button - no pricing 
              or checkout options will be displayed.
            </AlertDescription>
          </Alert>

          {/* GIVEY Stats */}
          <div className="grid sm:grid-cols-3 gap-4">
            <Card className="border-0 shadow-md bg-gradient-to-r from-pink-50 to-orange-50">
              <CardContent className="p-6">
                <p className="text-gray-600 text-sm">Total GIVEY Items</p>
                <p className="text-2xl font-bold text-pink-600">{giveyProducts.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md bg-gradient-to-r from-pink-50 to-orange-50">
              <CardContent className="p-6">
                <p className="text-gray-600 text-sm">Available</p>
                <p className="text-2xl font-bold text-orange-600">
                  {giveyProducts.filter(p => p.status === 'available').length}
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md bg-gradient-to-r from-pink-50 to-orange-50">
              <CardContent className="p-6">
                <p className="text-gray-600 text-sm">Completed</p>
                <p className="text-2xl font-bold text-gray-600">
                  {giveyProducts.filter(p => p.status === 'sold').length}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* GIVEY Products Grid */}
          {filteredGivey.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredGivey.map((product) => (
                <Card key={product.id} className="border-2 border-pink-200 shadow-lg hover:shadow-xl transition-all">
                  <div className="relative h-48 bg-gradient-to-br from-pink-100 to-orange-100">
                    {product.image_urls?.[0] ? (
                      <img 
                        src={product.image_urls[0]}
                        alt={product.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Gift className="w-12 h-12 text-pink-400" />
                      </div>
                    )}
                    <Badge className="absolute top-2 right-2 bg-gradient-to-r from-pink-500 to-orange-500 text-white border-0">
                      <Gift className="w-3 h-3 mr-1" />
                      GIVEY
                    </Badge>
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-lg mb-2 line-clamp-2">{product.title}</h3>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-gray-600">No pricing displayed</p>
                      <p className="text-sm text-gray-600">Qty: {product.quantity}</p>
                    </div>
                    {product.show_id && (
                      <Badge variant="outline" className="mb-3 text-xs">
                        Assigned to Show
                      </Badge>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-pink-500 text-pink-600"
                        onClick={() => handleEdit(product)}
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(product.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-2 border-dashed border-pink-300">
              <CardContent className="p-12 text-center">
                <Gift className="w-16 h-16 text-pink-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No GIVEY items yet</h3>
                <p className="text-gray-600 mb-4">Create products with the GIVEY toggle enabled</p>
                <Button
                  className="bg-gradient-to-r from-pink-500 to-orange-500"
                  onClick={handleNewProduct}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add GIVEY Item
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Product Dialog */}
      <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}> {/* Changed from showDialog */}
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "Edit Product" : "Add New Product"}
            </DialogTitle>
          </DialogHeader>
          <ProductForm
            product={editingProduct}
            onSave={handleSave}
            onCancel={() => {
              setShowProductDialog(false); // Changed from setShowDialog
              setEditingProduct(null);
            }}
            isSubmitting={createProductMutation.isPending || updateProductMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}