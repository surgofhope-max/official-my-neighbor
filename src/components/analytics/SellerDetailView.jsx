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
import { ExternalLink, TrendingUp, DollarSign, RefreshCw, AlertCircle, Info } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// SellerDetailView - Rewired to use analytics_events-backed data
// 
// Props:
//   - seller: Seller entity for identity (name, stripe_account_id)
//   - payments: Order analytics data mapped to payment-like shape
//   - orders: Raw orders for delivery fee calculation
//   - refunds: Empty array (refunds not yet tracked in analytics_events)
//   - startDate/endDate: Date range for filtering
//
// Note: Transfer and Payout data removed - not yet tracked in analytics_events
// ─────────────────────────────────────────────────────────────────────────────

export default function SellerDetailView({ seller, startDate, endDate, payments, refunds, orders = [] }) {
  // Helper to get date from either created_at or created_date
  const getDate = (item) => new Date(item.created_at || item.created_date);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // READ PATH (Step T3.5): Prefer seller_entity_id (canonical), fallback to seller_id (legacy)
  // Analytics data may have seller_id as entity ID (new) or user ID (legacy)
  // ═══════════════════════════════════════════════════════════════════════════
  const sellerPayments = payments.filter(p => {
    // Canonical: seller_id or seller_entity_id matches seller.id (entity PK)
    const matchesCanonical = p.seller_entity_id === seller.id || p.seller_id === seller.id;
    // Legacy fallback: seller_id matches seller.user_id (when seller_entity_id is null)
    const matchesLegacy = !p.seller_entity_id && p.seller_id === seller.user_id;
    return (matchesCanonical || matchesLegacy) &&
      getDate(p) >= startDate &&
      getDate(p) <= endDate;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // READ PATH (Step T3.5): Prefer seller_entity_id (canonical), fallback to seller_id (legacy)
  // - New orders: seller_entity_id = seller.id
  // - Legacy orders: seller_id = seller.user_id (seller_entity_id is null)
  // ═══════════════════════════════════════════════════════════════════════════
  const sellerOrders = orders.filter(o => {
    // Canonical: seller_entity_id matches seller.id
    const matchesCanonical = o.seller_entity_id === seller.id;
    // Legacy fallback: seller_id matches seller.user_id (when seller_entity_id is null)
    const matchesLegacy = !o.seller_entity_id && o.seller_id === seller.user_id;
    return (matchesCanonical || matchesLegacy) &&
      getDate(o) >= startDate &&
      getDate(o) <= endDate;
  });

  // Refunds: filter by seller (refunds array is currently empty)
  // Apply same canonical + legacy fallback for consistency
  const sellerRefunds = refunds.filter(r => {
    const refundDate = getDate(r);
    // Canonical: seller_entity_id or seller_id matches seller.id
    const matchesCanonical = r.seller_entity_id === seller.id || r.seller_id === seller.id;
    // Legacy fallback: seller_id matches seller.user_id
    const matchesLegacy = !r.seller_entity_id && r.seller_id === seller.user_id;
    return (matchesCanonical || matchesLegacy) &&
      refundDate >= startDate &&
      refundDate <= endDate;
  });

  // Calculate metrics from analytics data
  const gmv = sellerPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const deliveryFees = sellerOrders.reduce((sum, o) => sum + (o.delivery_fee || 0), 0);
  const refundAmount = sellerRefunds.reduce((sum, r) => sum + (r.amount || 0), 0);
  // Platform fees not tracked in analytics_events yet
  const platformFees = sellerPayments.reduce((sum, p) => sum + (p.application_fee || 0), 0);
  const netToSeller = gmv - refundAmount - platformFees;

  const kpiCards = [
    {
      title: "Gross Sales (GMV)",
      value: `$${gmv.toFixed(2)}`,
      icon: TrendingUp,
      color: "from-green-500 to-emerald-500"
    },
    {
      title: "Delivery Fees",
      value: `$${deliveryFees.toFixed(2)}`,
      icon: AlertCircle,
      color: "from-blue-500 to-cyan-500"
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
      color: "from-purple-500 to-pink-500",
      note: platformFees === 0 ? "Not tracked yet" : null
    },
    {
      title: "Net to Seller",
      value: `$${netToSeller.toFixed(2)}`,
      icon: DollarSign,
      color: "from-blue-500 to-cyan-500"
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900">{seller.business_name}</h3>
          <div className="flex items-center gap-2 mt-2">
            <code className="text-sm bg-gray-100 px-2 py-1 rounded">
              {seller.stripe_account_id || "Not connected"}
            </code>
            <Badge
              className={
                seller.stripe_connected
                  ? "bg-green-100 text-green-800 border-green-200"
                  : "bg-yellow-100 text-yellow-800 border-yellow-200"
              }
            >
              {seller.stripe_connected ? "Connected" : "Pending"}
            </Badge>
          </div>
        </div>
        {seller.stripe_account_id && (
          <Button
            variant="outline"
            onClick={() =>
              window.open(
                `https://dashboard.stripe.com/connect/accounts/${seller.stripe_account_id}`,
                "_blank"
              )
            }
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            View in Stripe
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {kpiCards.map((kpi, index) => (
          <Card key={index} className="relative overflow-hidden border-0 shadow-lg">
            <div className={`absolute inset-0 bg-gradient-to-br ${kpi.color} opacity-5`}></div>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">{kpi.title}</p>
                  <p className="text-lg font-bold text-gray-900">{kpi.value}</p>
                  {kpi.note && (
                    <p className="text-xs text-gray-400 mt-1">{kpi.note}</p>
                  )}
                </div>
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${kpi.color} flex items-center justify-center`}>
                  <kpi.icon className="w-4 h-4 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Payments/Orders Table */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Orders ({sellerPayments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sellerPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {payment.order_id?.substring(0, 8) || "—"}...
                      </code>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ${payment.amount?.toFixed(2) || "0.00"}
                    </TableCell>
                    <TableCell className="text-right text-purple-600">
                      ${payment.application_fee?.toFixed(2) || "0.00"}
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
                ))}
              </TableBody>
            </Table>
          </div>
          {sellerPayments.length === 0 && (
            <div className="text-center py-8 text-gray-500">No orders in this period</div>
          )}
        </CardContent>
      </Card>

      {/* Refunds Table */}
      {sellerRefunds.length > 0 && (
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Refunds ({sellerRefunds.length})</CardTitle>
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
                  {sellerRefunds.map((refund) => (
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

      {/* Payouts Notice */}
      <Card className="border-0 shadow-lg bg-gray-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 text-gray-600">
            <Info className="w-5 h-5" />
            <div>
              <p className="text-sm font-medium">Payout & Transfer History</p>
              <p className="text-xs text-gray-500">
                Stripe payout data will be available in a future update. 
                View payout details directly in the{" "}
                {seller.stripe_account_id ? (
                  <Button
                    variant="link"
                    className="p-0 h-auto text-xs text-blue-600"
                    onClick={() =>
                      window.open(
                        `https://dashboard.stripe.com/connect/accounts/${seller.stripe_account_id}`,
                        "_blank"
                      )
                    }
                  >
                    Stripe Dashboard
                  </Button>
                ) : (
                  "Stripe Dashboard"
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
