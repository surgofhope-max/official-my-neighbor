import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExternalLink, Download, TrendingUp, DollarSign, Package, Users } from "lucide-react";
import SellerDetailView from "./SellerDetailView.jsx";

// ─────────────────────────────────────────────────────────────────────────────
// SellerAnalyticsTab - Rewired to use analytics_events-backed data
// 
// Props:
//   - sellers: Raw seller entities for identity (name, email, status)
//   - payments: Order analytics data mapped to payment-like shape (from admin_order_fulfillment_analytics)
//   - orders: Raw orders for status-based filtering
//   - refunds: Empty array (refunds not yet tracked in analytics_events)
//   - startDate/endDate: Date range for filtering
//   - searchTerm: Search filter
// ─────────────────────────────────────────────────────────────────────────────

export default function SellerAnalyticsTab({ startDate, endDate, searchTerm, sellers, payments, refunds, orders = [] }) {
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [showDetail, setShowDetail] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // SELLER METRICS COMPUTATION
  // Groups order data by seller_id and computes analytics metrics
  // Uses orders for counts/status, payments (analytics) for GMV
  // ─────────────────────────────────────────────────────────────────────────
  const sellerMetrics = sellers
    .filter(s => s.status === "approved")
    .map(seller => {
      // ═══════════════════════════════════════════════════════════════════════════
      // READ PATH (Step T3.5): Prefer seller_entity_id (canonical), fallback to seller_id (legacy)
      // - New orders: seller_entity_id = seller.id
      // - Legacy orders: seller_id = seller.user_id (seller_entity_id is null)
      // ═══════════════════════════════════════════════════════════════════════════
      const canonicalSellerEntityId =
        seller?.entity_id ||
        seller?.seller_entity_id ||
        seller?.id;

      const sellerOrders = orders.filter(o => {
        const orderDate = new Date(o.created_at || o.created_date);
        // Canonical: seller_entity_id matches canonical seller entity id
        const matchesCanonical = o.seller_entity_id === canonicalSellerEntityId;
        // Legacy fallback: seller_id matches seller.user_id (when seller_entity_id is null)
        const matchesLegacy = !o.seller_entity_id && o.seller_id === seller.user_id;
        const inDateRange = orderDate >= startDate && orderDate <= endDate;
        return (matchesCanonical || matchesLegacy) && inDateRange;
      });

      // Count fulfilled orders (status = 'fulfilled', 'picked_up', or 'completed')
      const fulfilledOrders = sellerOrders.filter(o => 
        ['fulfilled', 'picked_up', 'completed'].includes(o.status)
      );

      // Calculate GMV from orders (price sum)
      const grossGMV = sellerOrders.reduce((sum, o) => sum + (parseFloat(o.price) || 0), 0);
      
      // Calculate fulfilled GMV (only fulfilled orders)
      const fulfilledGMV = fulfilledOrders.reduce((sum, o) => sum + (parseFloat(o.price) || 0), 0);

      // Delivery fees from orders
      const deliveryFees = sellerOrders.reduce((sum, o) => sum + (parseFloat(o.delivery_fee) || 0), 0);

      // Find last order date
      const lastOrderDate = sellerOrders.length > 0
        ? new Date(Math.max(...sellerOrders.map(o => new Date(o.created_at || o.created_date))))
        : null;

      return {
        ...seller,
        // Core metrics
        totalOrders: sellerOrders.length,
        fulfilledOrders: fulfilledOrders.length,
        grossGMV,
        fulfilledGMV,
        deliveryFees,
        lastOrderDate,
        // Legacy field mappings for UI compatibility
        gmv: grossGMV,
        netToSeller: grossGMV, // No platform fees tracked yet
        paymentCount: sellerOrders.length,
        refundAmount: 0, // Refunds not tracked in analytics_events yet
        platformFees: 0, // Platform fees not tracked in analytics_events yet
      };
    })
    .filter(s =>
      s.business_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.stripe_account_id?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => b.gmv - a.gmv);

  const handleExportCSV = () => {
    const csvHeader = "Seller Name,Stripe Account ID,Total Orders,Fulfilled Orders,GMV,Fulfilled GMV,Delivery Fees,Status\n";
    const csvData = sellerMetrics.map(s =>
      `"${s.business_name}","${s.stripe_account_id || 'N/A'}",${s.totalOrders},${s.fulfilledOrders},${s.grossGMV.toFixed(2)},${s.fulfilledGMV.toFixed(2)},${s.deliveryFees.toFixed(2)},"${s.status}"`
    ).join("\n");

    const blob = new Blob([csvHeader + csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sellers-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  const handleViewSeller = (seller) => {
    setSelectedSeller(seller);
    setShowDetail(true);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // AGGREGATE TOTALS for summary cards
  // ─────────────────────────────────────────────────────────────────────────
  const totalSellers = sellerMetrics.length;
  const totalOrders = sellerMetrics.reduce((sum, s) => sum + s.totalOrders, 0);
  const totalFulfilled = sellerMetrics.reduce((sum, s) => sum + s.fulfilledOrders, 0);
  const totalGMV = sellerMetrics.reduce((sum, s) => sum + s.grossGMV, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">Active Sellers</p>
                <p className="text-2xl font-bold text-gray-900">{totalSellers}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">Total GMV</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${totalGMV.toFixed(2)}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">Total Orders</p>
                <p className="text-2xl font-bold text-gray-900">{totalOrders}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
                <Package className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">Fulfilled Orders</p>
                <p className="text-2xl font-bold text-gray-900">{totalFulfilled}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sellers Table */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Sellers List</CardTitle>
            <Button variant="outline" onClick={handleExportCSV}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seller Name</TableHead>
                  <TableHead>Stripe Account ID</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Fulfilled</TableHead>
                  <TableHead className="text-right">GMV</TableHead>
                  <TableHead className="text-right">Fulfilled GMV</TableHead>
                  <TableHead className="text-right">Delivery</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sellerMetrics.map((seller) => (
                  <TableRow key={seller.id} className="cursor-pointer hover:bg-gray-50">
                    <TableCell className="font-medium">{seller.business_name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {seller.stripe_account_id || "Not connected"}
                      </code>
                    </TableCell>
                    <TableCell className="text-right">{seller.totalOrders}</TableCell>
                    <TableCell className="text-right text-purple-600">{seller.fulfilledOrders}</TableCell>
                    <TableCell className="text-right font-semibold text-green-600">
                      ${seller.grossGMV.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-emerald-600">
                      ${seller.fulfilledGMV.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-blue-600">
                      ${seller.deliveryFees.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          seller.stripe_connected
                            ? "bg-green-100 text-green-800 border-green-200"
                            : "bg-yellow-100 text-yellow-800 border-yellow-200"
                        }
                      >
                        {seller.stripe_connected ? "Connected" : "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewSeller(seller)}
                        >
                          View Details
                        </Button>
                        {seller.stripe_account_id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              window.open(
                                `https://dashboard.stripe.com/connect/accounts/${seller.stripe_account_id}`,
                                "_blank"
                              )
                            }
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {sellerMetrics.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No sellers found matching your criteria
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seller Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Seller Analytics: {selectedSeller?.business_name}</DialogTitle>
          </DialogHeader>
          {selectedSeller && (
            <SellerDetailView
              seller={selectedSeller}
              startDate={startDate}
              endDate={endDate}
              payments={payments}
              refunds={refunds}
              orders={orders}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}