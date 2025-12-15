import React from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useQuery } from "@tanstack/react-query";
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

export default function BuyerDetailView({ buyer, startDate, endDate, payments, refunds }) {
  // Filter buyer-specific data
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

  // Fetch orders for this buyer
  const { data: orders = [] } = useQuery({
    queryKey: ['buyer-orders', buyer.user_id],
    queryFn: async () => {
      const allOrders = await base44.entities.Order.list();
      return allOrders.filter(o => o.buyer_id === buyer.user_id);
    }
  });

  // Fetch sellers for seller names
  const { data: sellers = [] } = useQuery({
    queryKey: ['all-sellers'],
    queryFn: () => base44.entities.Seller.list()
  });

  const sellersMap = sellers.reduce((acc, s) => {
    acc[s.id] = s;
    return acc;
  }, {});

  // Calculate metrics
  const totalSpend = buyerPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const refundAmount = buyerRefunds.reduce((sum, r) => sum + (r.amount || 0), 0);
  const netSpend = totalSpend - refundAmount;
  const lastPurchase = buyerPayments.length > 0
    ? new Date(Math.max(...buyerPayments.map(p => new Date(p.created_date))))
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
                  <TableHead>Charge ID</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buyerPayments.map((payment) => {
                  const order = orders.find(o => o.id === payment.order_id);
                  const seller = sellersMap[payment.seller_id];
                  
                  return (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {payment.order_id?.substring(0, 8)}...
                        </code>
                      </TableCell>
                      <TableCell>
                        {seller?.business_name || "Unknown Seller"}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {payment.stripe_charge_id?.substring(0, 12)}...
                        </code>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ${payment.amount?.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            payment.status === "succeeded"
                              ? "bg-green-100 text-green-800 border-green-200"
                              : "bg-gray-100 text-gray-800 border-gray-200"
                          }
                        >
                          {payment.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(payment.created_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {payment.stripe_charge_id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              window.open(
                                `https://dashboard.stripe.com/payments/${payment.stripe_charge_id}`,
                                "_blank"
                              )
                            }
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        )}
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
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buyerRefunds.map((refund) => (
                    <TableRow key={refund.id}>
                      <TableCell>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {refund.stripe_refund_id?.substring(0, 12)}...
                        </code>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-red-600">
                        ${refund.amount?.toFixed(2)}
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
                          {refund.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(refund.created_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {refund.stripe_refund_id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              window.open(
                                `https://dashboard.stripe.com/refunds/${refund.stripe_refund_id}`,
                                "_blank"
                              )
                            }
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        )}
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