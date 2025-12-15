
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
import BuyerDetailView from "./BuyerDetailView.jsx"; // Changed import to include .jsx extension

export default function BuyerAnalyticsTab({ startDate, endDate, searchTerm, buyers, payments, refunds }) {
  const [selectedBuyer, setSelectedBuyer] = useState(null);
  const [showDetail, setShowDetail] = useState(false);

  // Filter and aggregate buyer data
  const buyerMetrics = buyers.map(buyer => {
    const buyerPayments = payments.filter(p =>
      p.buyer_id === buyer.user_id &&
      new Date(p.created_date) >= startDate &&
      new Date(p.created_date) <= endDate
    );

    const buyerRefunds = refunds.filter(r => {
      const payment = payments.find(p => p.stripe_charge_id === r.stripe_charge_id);
      return payment && payment.buyer_id === buyer.user_id &&
        new Date(r.created_date) >= startDate &&
        new Date(r.created_date) <= endDate;
    });

    const totalSpend = buyerPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const refundAmount = buyerRefunds.reduce((sum, r) => sum + (r.amount || 0), 0);
    const netSpend = totalSpend - refundAmount;

    return {
      ...buyer,
      totalSpend,
      refundAmount,
      netSpend,
      orderCount: buyerPayments.length,
      refundCount: buyerRefunds.length,
      lastPurchase: buyerPayments.length > 0
        ? new Date(Math.max(...buyerPayments.map(p => new Date(p.created_date))))
        : null
    };
  })
    .filter(b =>
      b.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.email?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => b.totalSpend - a.totalSpend);

  const handleExportCSV = () => {
    const csvHeader = "Buyer Name,Email,Total Spend,Refunds,Net Spend,Orders,Last Purchase\n";
    const csvData = buyerMetrics.map(b =>
      `"${b.full_name}","${b.email}",${b.totalSpend.toFixed(2)},${b.refundAmount.toFixed(2)},${b.netSpend.toFixed(2)},${b.orderCount},"${b.lastPurchase ? b.lastPurchase.toLocaleDateString() : 'N/A'}"`
    ).join("\n");

    const blob = new Blob([csvHeader + csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buyers-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  const handleViewBuyer = (buyer) => {
    setSelectedBuyer(buyer);
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
                <p className="text-sm font-medium text-gray-600 mb-2">Total Buyers</p>
                <p className="text-2xl font-bold text-gray-900">{buyerMetrics.length}</p>
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
                <p className="text-sm font-medium text-gray-600 mb-2">Total Spend</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${buyerMetrics.reduce((sum, b) => sum + b.totalSpend, 0).toFixed(2)}
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
                  ${buyerMetrics.reduce((sum, b) => sum + b.refundAmount, 0).toFixed(2)}
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
                <p className="text-sm font-medium text-gray-600 mb-2">Avg Order Value</p>
                <p className="text-2xl font-bold text-gray-900">
                  $
                  {buyerMetrics.length > 0
                    ? (
                        buyerMetrics.reduce((sum, b) => sum + b.totalSpend, 0) /
                        buyerMetrics.reduce((sum, b) => sum + b.orderCount, 0)
                      ).toFixed(2)
                    : "0.00"}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Buyers Table */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Buyers List</CardTitle>
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
                  <TableHead>Buyer Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Total Spend</TableHead>
                  <TableHead className="text-right">Refunds</TableHead>
                  <TableHead className="text-right">Net Spend</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead>Last Purchase</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buyerMetrics.map((buyer) => (
                  <TableRow key={buyer.id} className="cursor-pointer hover:bg-gray-50">
                    <TableCell className="font-medium">{buyer.full_name}</TableCell>
                    <TableCell>{buyer.email}</TableCell>
                    <TableCell className="text-right font-semibold text-green-600">
                      ${buyer.totalSpend.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      ${buyer.refundAmount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ${buyer.netSpend.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">{buyer.orderCount}</TableCell>
                    <TableCell>
                      {buyer.lastPurchase ? buyer.lastPurchase.toLocaleDateString() : "N/A"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewBuyer(buyer)}
                      >
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {buyerMetrics.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No buyers found matching your criteria
            </div>
          )}
        </CardContent>
      </Card>

      {/* Buyer Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Buyer Analytics: {selectedBuyer?.full_name}</DialogTitle>
          </DialogHeader>
          {selectedBuyer && (
            <BuyerDetailView
              buyer={selectedBuyer}
              startDate={startDate}
              endDate={endDate}
              payments={payments}
              refunds={refunds}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
