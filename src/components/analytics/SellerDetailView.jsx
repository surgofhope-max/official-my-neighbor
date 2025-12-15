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
import { ExternalLink, TrendingUp, DollarSign, RefreshCw, AlertCircle } from "lucide-react";

export default function SellerDetailView({ seller, startDate, endDate, payments, refunds, orders = [] }) {
  // Filter seller-specific data
  const sellerPayments = payments.filter(p =>
    p.seller_id === seller.id &&
    new Date(p.created_date) >= startDate &&
    new Date(p.created_date) <= endDate
  );

  const sellerOrders = orders.filter(o =>
    o.seller_id === seller.id &&
    new Date(o.created_date) >= startDate &&
    new Date(o.created_date) <= endDate
  );

  const sellerRefunds = refunds.filter(r => {
    const payment = payments.find(p => p.stripe_charge_id === r.stripe_charge_id);
    return payment && payment.seller_id === seller.id &&
      new Date(r.created_date) >= startDate &&
      new Date(r.created_date) <= endDate;
  });

  // Fetch transfers and payouts
  const { data: transfers = [] } = useQuery({
    queryKey: ['seller-transfers', seller.id],
    queryFn: async () => {
      const allTransfers = await base44.entities.Transfer.list();
      return allTransfers.filter(t =>
        t.stripe_destination_account === seller.stripe_account_id
      );
    }
  });

  const { data: payouts = [] } = useQuery({
    queryKey: ['seller-payouts', seller.id],
    queryFn: async () => {
      const allPayouts = await base44.entities.Payout.list();
      return allPayouts.filter(p =>
        p.stripe_account_id === seller.stripe_account_id
      );
    }
  });

  // Calculate metrics
  const gmv = sellerPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const deliveryFees = sellerOrders.reduce((sum, o) => sum + (o.delivery_fee || 0), 0);
  const refundAmount = sellerRefunds.reduce((sum, r) => sum + (r.amount || 0), 0);
  const platformFees = sellerPayments.reduce((sum, p) => sum + (p.application_fee || 0), 0);
  const netToSeller = gmv - refundAmount - platformFees;
  const lastPayout = payouts.length > 0 ? payouts[payouts.length - 1] : null;

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
      icon: AlertCircle, // Using AlertCircle as a placeholder for Truck if needed
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
      color: "from-purple-500 to-pink-500"
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

      {/* Last Payout Info */}
      {lastPayout && (
        <Card className="border-0 shadow-lg bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-900">Last Payout</p>
                <p className="text-lg font-bold text-blue-900">${lastPayout.amount?.toFixed(2)}</p>
                <p className="text-xs text-blue-700">
                  {new Date(lastPayout.paid_at || lastPayout.created_date).toLocaleDateString()}
                </p>
              </div>
              <Badge className="bg-blue-500 text-white border-0">
                {lastPayout.status}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payments Table */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Payments ({sellerPayments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Charge ID</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sellerPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {payment.order_id?.substring(0, 8)}...
                      </code>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {payment.stripe_charge_id?.substring(0, 12)}...
                      </code>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ${payment.amount?.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-purple-600">
                      ${payment.application_fee?.toFixed(2) || "0.00"}
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
                ))}
              </TableBody>
            </Table>
          </div>
          {sellerPayments.length === 0 && (
            <div className="text-center py-8 text-gray-500">No payments in this period</div>
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
                    <TableHead>Charge ID</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sellerRefunds.map((refund) => (
                    <TableRow key={refund.id}>
                      <TableCell>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {refund.stripe_refund_id?.substring(0, 12)}...
                        </code>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {refund.stripe_charge_id?.substring(0, 12)}...
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

      {/* Payouts Table */}
      {payouts.length > 0 && (
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Payouts ({payouts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payout ID</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Arrival Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((payout) => (
                    <TableRow key={payout.id}>
                      <TableCell>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {payout.stripe_payout_id?.substring(0, 12)}...
                        </code>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ${payout.amount?.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            payout.status === "paid"
                              ? "bg-green-100 text-green-800 border-green-200"
                              : payout.status === "failed"
                              ? "bg-red-100 text-red-800 border-red-200"
                              : "bg-yellow-100 text-yellow-800 border-yellow-200"
                          }
                        >
                          {payout.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {payout.arrival_date ? new Date(payout.arrival_date).toLocaleDateString() : "N/A"}
                      </TableCell>
                      <TableCell className="text-right">
                        {payout.stripe_payout_id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              window.open(
                                `https://dashboard.stripe.com/payouts/${payout.stripe_payout_id}`,
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