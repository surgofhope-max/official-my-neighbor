import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink, TrendingUp, DollarSign, RefreshCw, ShoppingBag } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// BuyerDetailView - Rewired to use analytics_events-backed data
// 
// Props:
//   - buyer: Buyer profile for identity (name, email, user_id)
//   - payments: Order analytics data mapped to payment-like shape
//   - refunds: Empty array (refunds not yet tracked in analytics_events)
//   - sellers: Optional - seller entities for name lookup
//   - startDate/endDate: Date range for filtering
//
// Note: Removed Base44 dependencies for orders and sellers
// ─────────────────────────────────────────────────────────────────────────────

export default function BuyerDetailView({ buyer, startDate, endDate, payments, refunds, sellers = [] }) {
  // Helper to get date from either created_at or created_date
  const getDate = (item) => new Date(item.created_at || item.created_date);
  
  // Filter buyer-specific data by date range
  const buyerPayments = payments.filter(p =>
    p.buyer_id === buyer.user_id &&
    getDate(p) >= startDate &&
    getDate(p) <= endDate
  );

  // Refunds: filter by buyer (refunds array is currently empty)
  const buyerRefunds = refunds.filter(r => {
    const refundDate = getDate(r);
    return r.buyer_id === buyer.user_id &&
      refundDate >= startDate &&
      refundDate <= endDate;
  });

  // Create sellers lookup map if sellers provided
  const sellersMap = sellers.reduce((acc, s) => {
    acc[s.id] = s;
    if (s.user_id) acc[s.user_id] = s;
    return acc;
  }, {});

  // Calculate metrics
  const totalSpend = buyerPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const refundAmount = buyerRefunds.reduce((sum, r) => sum + (r.amount || 0), 0);
  const netSpend = totalSpend - refundAmount;
  const lastPurchase = buyerPayments.length > 0
    ? new Date(Math.max(...buyerPayments.map(p => getDate(p))))
    : null;

  const kpiCards = [
    {
      title: "Total Spend",
      value: `$${totalSpend.toFixed(2)}`,
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
      title: "Net Spend",
      value: `$${netSpend.toFixed(2)}`,
      icon: DollarSign,
      color: "from-blue-500 to-cyan-500"
    },
    {
      title: "Orders",
      value: buyerPayments.length,
      icon: ShoppingBag,
      color: "from-purple-500 to-pink-500"
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900">{buyer.full_name}</h3>
          <p className="text-sm text-gray-600 mt-1">{buyer.email}</p>
          {lastPurchase && (
            <p className="text-xs text-gray-500 mt-1">
              Last purchase: {lastPurchase.toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

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

      {/* Purchases Table */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Purchases ({buyerPayments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buyerPayments.map((payment) => {
                  const seller = sellersMap[payment.seller_id];
                  
                  return (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {payment.order_id?.substring(0, 8) || "—"}...
                        </code>
                      </TableCell>
                      <TableCell>
                        {seller?.business_name || "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ${payment.amount?.toFixed(2) || "0.00"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            payment.status === "succeeded" || payment.status === "fulfilled" || payment.status === "picked_up"
                              ? "bg-green-100 text-green-800 border-green-200"
                              : "bg-gray-100 text-gray-800 border-gray-200"
                          }
                        >
                          {payment.status || "pending"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {getDate(payment).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {buyerPayments.length === 0 && (
            <div className="text-center py-8 text-gray-500">No purchases in this period</div>
          )}
        </CardContent>
      </Card>

      {/* Refunds Table */}
      {buyerRefunds.length > 0 && (
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Refunds ({buyerRefunds.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Refund ID</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buyerRefunds.map((refund) => (
                    <TableRow key={refund.id}>
                      <TableCell>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {refund.id?.substring(0, 12) || "—"}...
                        </code>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-red-600">
                        ${refund.amount?.toFixed(2) || "0.00"}
                      </TableCell>
                      <TableCell>{refund.reason || "N/A"}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            refund.status === "succeeded"
                              ? "bg-green-100 text-green-800 border-green-200"
                              : "bg-gray-100 text-gray-800 border-gray-200"
                          }
                        >
                          {refund.status || "pending"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {getDate(refund).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
