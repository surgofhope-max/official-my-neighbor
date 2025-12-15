import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrendingUp, DollarSign, RefreshCw, Video, Users, ShoppingCart } from "lucide-react";

export default function CommunityDetailView({ 
  community, 
  startDate, 
  endDate, 
  shows, 
  orders, 
  payments, 
  refunds 
}) {
  // Filter data for this community
  const isInDateRange = (dateStr) => {
    const d = new Date(dateStr);
    return d >= startDate && d <= endDate;
  };

  // 1. Get shows for this community
  const communityShows = shows.filter(s => s.community === community.name);
  const communityShowIds = new Set(communityShows.map(s => s.id));

  // 2. Get payments/refunds for these shows
  const communityPayments = payments.filter(p => {
    if (!isInDateRange(p.created_date)) return false;
    const order = orders.find(o => o.id === p.order_id);
    return order && communityShowIds.has(order.show_id);
  });

  const communityRefunds = refunds.filter(r => {
    if (!isInDateRange(r.created_date)) return false;
    const payment = payments.find(p => p.stripe_charge_id === r.stripe_charge_id);
    if (!payment) return false;
    const order = orders.find(o => o.id === payment.order_id);
    return order && communityShowIds.has(order.show_id);
  });

  // Calculate Metrics
  const gmv = communityPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const refundAmount = communityRefunds.reduce((sum, r) => sum + (r.amount || 0), 0);
  const platformFees = communityPayments.reduce((sum, p) => sum + (p.application_fee || 0), 0);
  const netRevenue = gmv - refundAmount - platformFees;

  // Shows in range
  const recentShows = communityShows
    .filter(s => 
      (s.actual_start && isInDateRange(s.actual_start)) || 
      (s.scheduled_start && isInDateRange(s.scheduled_start))
    )
    .map(show => {
      // Calculate revenue for this specific show
      const showOrders = orders.filter(o => o.show_id === show.id);
      const showOrderIds = new Set(showOrders.map(o => o.id));
      
      const showPayments = communityPayments.filter(p => showOrderIds.has(p.order_id));
      const showRevenue = showPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      
      return {
        ...show,
        revenue: showRevenue,
        orderCount: showOrders.length
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const kpiCards = [
    {
      title: "Gross Sales (GMV)",
      value: `$${gmv.toFixed(2)}`,
      icon: TrendingUp,
      color: "from-green-500 to-emerald-500"
    },
    {
      title: "Refunds",
      value: `$${refundAmount.toFixed(2)}`,
      icon: RefreshCw,
      color: "from-orange-500 to-red-500"
    },
    {
      title: "Platform Fee",
      value: `$${platformFees.toFixed(2)}`,
      icon: DollarSign,
      color: "from-purple-500 to-pink-500"
    },
    {
      title: "Net Revenue",
      value: `$${netRevenue.toFixed(2)}`,
      icon: DollarSign,
      color: "from-blue-500 to-cyan-500"
    }
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi, index) => (
          <Card key={index} className="relative overflow-hidden border-0 shadow-lg">
            <div className={`absolute inset-0 bg-gradient-to-br ${kpi.color} opacity-5`}></div>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">{kpi.title}</p>
                  <p className="text-lg font-bold text-gray-900">{kpi.value}</p>
                </div>
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${kpi.color} flex items-center justify-center`}>
                  <kpi.icon className="w-4 h-4 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Top Shows in Community */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Shows in Period ({recentShows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Show Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Viewers</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentShows.map((show) => (
                  <TableRow key={show.id}>
                    <TableCell className="font-medium">{show.title}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          show.status === "live"
                            ? "bg-red-100 text-red-800 border-red-200"
                            : show.status === "ended"
                            ? "bg-gray-100 text-gray-800 border-gray-200"
                            : "bg-blue-100 text-blue-800 border-blue-200"
                        }
                      >
                        {show.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-green-600">
                      ${show.revenue.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">{show.orderCount}</TableCell>
                    <TableCell className="text-right">{show.viewer_count}</TableCell>
                    <TableCell>
                      {new Date(show.actual_start || show.scheduled_start).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {recentShows.length === 0 && (
             <div className="text-center py-8 text-gray-500">No active shows in this period</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}