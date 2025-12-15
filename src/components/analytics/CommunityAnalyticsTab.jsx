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
import { Download, TrendingUp, DollarSign, RefreshCw, Layers, Video, ShoppingBag } from "lucide-react";
import CommunityDetailView from "./CommunityDetailView";

export default function CommunityAnalyticsTab({ 
  startDate, 
  endDate, 
  searchTerm, 
  communities, 
  shows, 
  orders, 
  payments, 
  refunds 
}) {
  const [selectedCommunity, setSelectedCommunity] = useState(null);
  const [showDetail, setShowDetail] = useState(false);

  // Helper to check date range
  const isInDateRange = (dateStr) => {
    const d = new Date(dateStr);
    return d >= startDate && d <= endDate;
  };

  // Aggregate data by community
  const communityMetrics = communities.map(community => {
    // 1. Find shows in this community
    const communityShows = shows.filter(s => s.community === community.name);
    const communityShowIds = new Set(communityShows.map(s => s.id));

    // 2. Find orders for these shows
    // We filter orders by the shows AND by date (using order created_date or payment date?)
    // Usually analytics uses payment date for GMV. Let's stick to payment date for revenue.
    // But we need to link payment -> order -> show -> community.
    
    // Let's map payments to communities first
    const communityPayments = payments.filter(p => {
      if (!isInDateRange(p.created_date)) return false;
      // Find order
      const order = orders.find(o => o.id === p.order_id);
      if (!order) return false;
      // Check if order's show is in this community
      return communityShowIds.has(order.show_id);
    });

    // Refunds for this community
    const communityRefunds = refunds.filter(r => {
      if (!isInDateRange(r.created_date)) return false;
      // Find payment for this refund to trace back
      const payment = payments.find(p => p.stripe_charge_id === r.stripe_charge_id);
      if (!payment) return false;
      const order = orders.find(o => o.id === payment.order_id);
      if (!order) return false;
      return communityShowIds.has(order.show_id);
    });

    // Calculate sums
    const gmv = communityPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const refundAmount = communityRefunds.reduce((sum, r) => sum + (r.amount || 0), 0);
    const platformFees = communityPayments.reduce((sum, p) => sum + (p.application_fee || 0), 0);
    const netRevenue = gmv - refundAmount - platformFees;

    // Stats within the date range
    const activeShowsCount = communityShows.filter(s => 
      (s.actual_start && isInDateRange(s.actual_start)) || 
      (s.scheduled_start && isInDateRange(s.scheduled_start))
    ).length;

    return {
      ...community,
      gmv,
      refundAmount,
      platformFees,
      netRevenue,
      paymentCount: communityPayments.length,
      showCount: activeShowsCount
    };
  })
  .filter(c => 
    c.label?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.name?.toLowerCase().includes(searchTerm.toLowerCase())
  )
  .sort((a, b) => b.gmv - a.gmv);

  const handleExportCSV = () => {
    const csvHeader = "Community Name,GMV,Refunds,Platform Fees,Net Revenue,Payments,Active Shows\n";
    const csvData = communityMetrics.map(c => 
      `"${c.label || c.name}",${c.gmv.toFixed(2)},${c.refundAmount.toFixed(2)},${c.platformFees.toFixed(2)},${c.netRevenue.toFixed(2)},${c.paymentCount},${c.showCount}`
    ).join("\n");

    const blob = new Blob([csvHeader + csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `community-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  const handleViewCommunity = (community) => {
    setSelectedCommunity(community);
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
                <p className="text-sm font-medium text-gray-600 mb-2">Active Communities</p>
                <p className="text-2xl font-bold text-gray-900">{communityMetrics.filter(c => c.gmv > 0).length}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                <Layers className="w-5 h-5 text-white" />
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
                  ${communityMetrics.reduce((sum, c) => sum + c.gmv, 0).toFixed(2)}
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
                  ${communityMetrics.reduce((sum, c) => sum + c.refundAmount, 0).toFixed(2)}
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
                  ${communityMetrics.reduce((sum, c) => sum + c.platformFees, 0).toFixed(2)}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Communities Table */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Communities List</CardTitle>
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
                  <TableHead>Community Name</TableHead>
                  <TableHead className="text-right">GMV</TableHead>
                  <TableHead className="text-right">Refunds</TableHead>
                  <TableHead className="text-right">Net Revenue</TableHead>
                  <TableHead className="text-right">Payments</TableHead>
                  <TableHead className="text-right">Active Shows</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {communityMetrics.map((community) => (
                  <TableRow key={community.id} className="cursor-pointer hover:bg-gray-50">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {/* Dynamic icon could be added here if needed */}
                        {community.label}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-green-600">
                      ${community.gmv.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      ${community.refundAmount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ${community.netRevenue.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">{community.paymentCount}</TableCell>
                    <TableCell className="text-right">{community.showCount}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewCommunity(community)}
                      >
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {communityMetrics.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No communities found matching your criteria
            </div>
          )}
        </CardContent>
      </Card>

      {/* Community Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Community Analytics: {selectedCommunity?.label}</DialogTitle>
          </DialogHeader>
          {selectedCommunity && (
            <CommunityDetailView
              community={selectedCommunity}
              startDate={startDate}
              endDate={endDate}
              shows={shows}
              orders={orders}
              payments={payments}
              refunds={refunds}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}