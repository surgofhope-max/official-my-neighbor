import React, { useState } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, Eye, CheckCircle, XCircle, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

export default function AdminReports() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedReport, setSelectedReport] = useState(null);
  const [adminNotes, setAdminNotes] = useState("");

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['all-reports'],
    queryFn: () => base44.entities.Report.list('-created_date')
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders-for-reports'],
    queryFn: () => base44.entities.Order.list()
  });

  const updateReportMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Report.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-reports'] });
      setSelectedReport(null);
      setAdminNotes("");
    },
  });

  const handleUpdateStatus = (status) => {
    updateReportMutation.mutate({
      id: selectedReport.id,
      data: {
        status,
        admin_notes: adminNotes,
        resolved_at: status === "resolved" ? new Date().toISOString() : null
      }
    });
  };

  const statusColors = {
    pending: "bg-orange-100 text-orange-800 border-orange-200",
    investigating: "bg-blue-100 text-blue-800 border-blue-200",
    resolved: "bg-green-100 text-green-800 border-green-200",
    dismissed: "bg-gray-100 text-gray-800 border-gray-200"
  };

  const typeLabels = {
    did_not_receive: "Did Not Receive Item",
    item_not_as_described: "Item Not As Described",
    seller_unresponsive: "Seller Unresponsive",
    other: "Other"
  };

  return (
    <div className="min-h-screen p-4 sm:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Reports & Issues</h1>
            <p className="text-gray-600 mt-1">Manage buyer reports and disputes</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid sm:grid-cols-4 gap-4">
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-orange-600">
                {reports.filter(r => r.status === "pending").length}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <p className="text-sm text-gray-600">Investigating</p>
              <p className="text-2xl font-bold text-blue-600">
                {reports.filter(r => r.status === "investigating").length}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <p className="text-sm text-gray-600">Resolved</p>
              <p className="text-2xl font-bold text-green-600">
                {reports.filter(r => r.status === "resolved").length}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <p className="text-sm text-gray-600">Dismissed</p>
              <p className="text-2xl font-bold text-gray-600">
                {reports.filter(r => r.status === "dismissed").length}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Reports List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : reports.length === 0 ? (
          <Card className="border-2 border-dashed border-gray-300">
            <CardContent className="p-12 text-center">
              <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No reports</h3>
              <p className="text-gray-600">All clear! No buyer reports to review.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => {
              const relatedOrder = orders.find(o => o.id === report.order_id);
              return (
                <Card
                  key={report.id}
                  className={`shadow-lg border-2 ${
                    report.status === "pending" ? "border-orange-500" : "border-gray-200"
                  }`}
                >
                  <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Badge className={`${statusColors[report.status]} border`}>
                            {report.status}
                          </Badge>
                          <Badge variant="outline">
                            {typeLabels[report.report_type]}
                          </Badge>
                        </div>
                        <p className="text-gray-600 text-sm mb-1">
                          Reported by: {report.reporter_email}
                        </p>
                        <p className="text-gray-500 text-xs">
                          {format(new Date(report.created_date), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSelectedReport(report);
                          setAdminNotes(report.admin_notes || "");
                        }}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Details
                      </Button>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-gray-900">{report.description}</p>
                      {relatedOrder && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-sm text-gray-600">
                            <strong>Order:</strong> {relatedOrder.product_title} - ${relatedOrder.price?.toFixed(2)}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Report Details Dialog */}
        {selectedReport && (
          <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Report Details</DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                <div>
                  <Badge className={`${statusColors[selectedReport.status]} border`}>
                    {selectedReport.status}
                  </Badge>
                  <Badge variant="outline" className="ml-2">
                    {typeLabels[selectedReport.report_type]}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    <strong>Reporter:</strong> {selectedReport.reporter_email}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Reported:</strong> {format(new Date(selectedReport.created_date), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Description</h4>
                  <p className="text-gray-700 bg-gray-50 p-4 rounded-lg">
                    {selectedReport.description}
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold">Admin Notes</h4>
                  <Textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Add internal notes about this report..."
                    rows={4}
                  />
                </div>

                <div className="flex gap-3">
                  {selectedReport.status !== "investigating" && (
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleUpdateStatus("investigating")}
                    >
                      <AlertCircle className="w-4 h-4 mr-2" />
                      Mark as Investigating
                    </Button>
                  )}
                  {selectedReport.status !== "resolved" && (
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={() => handleUpdateStatus("resolved")}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Resolve
                    </Button>
                  )}
                  {selectedReport.status !== "dismissed" && (
                    <Button
                      variant="outline"
                      className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => handleUpdateStatus("dismissed")}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Dismiss
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}