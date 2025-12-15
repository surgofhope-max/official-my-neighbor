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
import { ExternalLink, Download, TrendingUp, DollarSign, RefreshCw, Users } from "lucide-react";
import SellerDetailView from "./SellerDetailView.jsx";

export default function SellerAnalyticsTab({ startDate, endDate, searchTerm, sellers, payments, refunds, orders = [] }) {
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [showDetail, setShowDetail] = useState(false);

  // Filter and aggregate seller data
  const sellerMetrics = sellers
    .filter(s => s.status === "approved")
    .map(seller => {
      const sellerPayments = payments.filter(p =>
        p.seller_id === seller.id &&
        new Date(p.created_date) >= startDate &&
        new Date(p.created_date) <= endDate
      );

      const sellerRefunds = refunds.filter(r => {
        const payment = payments.find(p => p.stripe_charge_id === r.stripe_charge_id);
        return payment && payment.seller_id === seller.id &&
          new Date(r.created_date) >= startDate &&
          new Date(r.created_date) <= endDate;
      });

      const sellerOrders = orders.filter(o =>
        o.seller_id === seller.id &&
        new Date(o.created_date) >= startDate &&
        new Date(o.created_date) <= endDate
      );

      const deliveryFees = sellerOrders.reduce((sum, o) => sum + (o.delivery_fee || 0), 0);
      const gmv = sellerPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const refundAmount = sellerRefunds.reduce((sum, r) => sum + (r.amount || 0), 0);
      const platformFees = sellerPayments.reduce((sum, p) => sum + (p.application_fee || 0), 0);
      const netToSeller = gmv - refundAmount - platformFees;

      return {
        ...seller,
        gmv,
        deliveryFees,
        refundAmount,
        platformFees,
        netToSeller,
        paymentCount: sellerPayments.length,
        refundCount: sellerRefunds.length
      };
    })
    .filter(s =>
      s.business_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.stripe_account_id?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => b.gmv - a.gmv);

  const handleExportCSV = () => {
    const csvHeader = "Seller Name,Stripe Account ID,GMV,Refunds,Platform Fees,Net to Seller,Payment Count,Status\n";
    const csvData = sellerMetrics.map(s =>
      `"${s.business_name}","${s.stripe_account_id || 'N/A'}",${s.gmv.toFixed(2)},${s.refundAmount.toFixed(2)},${s.platformFees.toFixed(2)},${s.netToSeller.toFixed(2)},${s.paymentCount},"${s.status}"`
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

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">Active Sellers</p>
                <p className="text-2xl font-bold text-gray-900">{sellerMetrics.length}</p>
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
                  ${sellerMetrics.reduce((sum, s) => sum + s.gmv, 0).toFixed(2)}
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
                <p className="text-sm font-medium text-gray-600 mb-2">Total Refunds</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${sellerMetrics.reduce((sum, s) => sum + s.refundAmount, 0).toFixed(2)}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">Platform Fees</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${sellerMetrics.reduce((sum, s) => sum + s.platformFees, 0).toFixed(2)}
                </p>
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
                  <TableHead className="text-right">GMV</TableHead>
                  <TableHead className="text-right">Delivery</TableHead>
                  <TableHead className="text-right">Refunds</TableHead>
                  <TableHead className="text-right">Net to Seller</TableHead>
                  <TableHead className="text-right">Payments</TableHead>
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
                    <TableCell className="text-right font-semibold text-green-600">
                      ${seller.gmv.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-blue-600">
                      ${seller.deliveryFees.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      ${seller.refundAmount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ${seller.netToSeller.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">{seller.paymentCount}</TableCell>
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