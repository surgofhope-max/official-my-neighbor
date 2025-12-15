import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Package,
  User,
  Clock,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  getBatchesForShow,
  getOrdersForBatch,
  markBatchReady,
  completeBatchPickup,
} from "@/api/fulfillment";

const STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  ready: "bg-blue-100 text-blue-800 border-blue-200",
  picked_up: "bg-green-100 text-green-800 border-green-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
};

const STATUS_LABELS = {
  pending: "Pending",
  ready: "Ready for Pickup",
  picked_up: "Picked Up",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function BatchFulfillmentList({
  showId,
  sellerId,
  isAdmin = false,
  onBatchUpdate,
}) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedBatch, setExpandedBatch] = useState(null);
  const [batchOrders, setBatchOrders] = useState({});
  const [updatingBatch, setUpdatingBatch] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadBatches();
    // Poll every 15 seconds
    const interval = setInterval(loadBatches, 15000);
    return () => clearInterval(interval);
  }, [showId, sellerId]);

  const loadBatches = async () => {
    if (!showId || !sellerId) return;

    try {
      const data = await getBatchesForShow(showId, sellerId);
      setBatches(data);
    } catch (err) {
      console.warn("Failed to load batches:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleExpandBatch = async (batchId) => {
    if (expandedBatch === batchId) {
      setExpandedBatch(null);
      return;
    }

    setExpandedBatch(batchId);

    // Load orders if not already loaded
    if (!batchOrders[batchId]) {
      const orders = await getOrdersForBatch(batchId);
      setBatchOrders((prev) => ({ ...prev, [batchId]: orders }));
    }
  };

  const handleMarkReady = async (batchId) => {
    setUpdatingBatch(batchId);
    setError(null);

    const result = await markBatchReady(batchId, sellerId);

    if (result.error) {
      setError(result.error.message);
    } else {
      // Update local state
      setBatches((prev) =>
        prev.map((b) =>
          b.id === batchId ? { ...b, status: "ready", ready_at: new Date().toISOString() } : b
        )
      );
      if (onBatchUpdate) onBatchUpdate(result.data);
    }

    setUpdatingBatch(null);
  };

  const handleCompletePickup = async (batchId) => {
    setUpdatingBatch(batchId);
    setError(null);

    const result = await completeBatchPickup(batchId, sellerId, isAdmin);

    if (result.error) {
      setError(result.error.message);
    } else {
      // Update local state
      setBatches((prev) =>
        prev.map((b) =>
          b.id === batchId
            ? { ...b, status: "picked_up", picked_up_at: new Date().toISOString() }
            : b
        )
      );
      if (onBatchUpdate) onBatchUpdate(result.data);
    }

    setUpdatingBatch(null);
  };

  const formatTime = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No orders yet</p>
        </CardContent>
      </Card>
    );
  }

  // Group batches by status
  const pendingBatches = batches.filter((b) => b.status === "pending");
  const readyBatches = batches.filter((b) => b.status === "ready");
  const completedBatches = batches.filter(
    (b) => b.status === "picked_up" || b.status === "completed"
  );

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Pending Batches */}
      {pendingBatches.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-yellow-700 mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Pending ({pendingBatches.length})
          </h3>
          <div className="space-y-2">
            {pendingBatches.map((batch) => (
              <BatchCard
                key={batch.id}
                batch={batch}
                isExpanded={expandedBatch === batch.id}
                orders={batchOrders[batch.id]}
                isUpdating={updatingBatch === batch.id}
                onToggle={() => handleExpandBatch(batch.id)}
                onMarkReady={() => handleMarkReady(batch.id)}
                onComplete={() => handleCompletePickup(batch.id)}
                formatTime={formatTime}
              />
            ))}
          </div>
        </div>
      )}

      {/* Ready Batches */}
      {readyBatches.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-blue-700 mb-2 flex items-center gap-2">
            <Package className="w-4 h-4" />
            Ready for Pickup ({readyBatches.length})
          </h3>
          <div className="space-y-2">
            {readyBatches.map((batch) => (
              <BatchCard
                key={batch.id}
                batch={batch}
                isExpanded={expandedBatch === batch.id}
                orders={batchOrders[batch.id]}
                isUpdating={updatingBatch === batch.id}
                onToggle={() => handleExpandBatch(batch.id)}
                onComplete={() => handleCompletePickup(batch.id)}
                formatTime={formatTime}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed Batches */}
      {completedBatches.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-green-700 mb-2 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Completed ({completedBatches.length})
          </h3>
          <div className="space-y-2">
            {completedBatches.map((batch) => (
              <BatchCard
                key={batch.id}
                batch={batch}
                isExpanded={expandedBatch === batch.id}
                orders={batchOrders[batch.id]}
                onToggle={() => handleExpandBatch(batch.id)}
                formatTime={formatTime}
                isCompleted
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BatchCard({
  batch,
  isExpanded,
  orders,
  isUpdating,
  onToggle,
  onMarkReady,
  onComplete,
  formatTime,
  isCompleted,
}) {
  return (
    <Card className={`overflow-hidden ${isCompleted ? "opacity-75" : ""}`}>
      <CardHeader
        className={`py-3 px-4 cursor-pointer hover:bg-gray-50 transition-colors ${
          STATUS_COLORS[batch.status]
        }`}
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-sm">{batch.buyer_name}</p>
              <p className="text-xs opacity-75">
                {batch.total_items} items • ${batch.total_amount?.toFixed(2)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {STATUS_LABELS[batch.status]}
            </Badge>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-3 pb-4 space-y-3 bg-white">
          {/* Completion Code */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Completion Code</p>
            <p className="text-xl font-mono font-bold tracking-wider">
              {batch.completion_code}
            </p>
          </div>

          {/* Contact Info */}
          <div className="text-sm space-y-1">
            {batch.buyer_phone && (
              <p className="text-gray-600">📞 {batch.buyer_phone}</p>
            )}
            {batch.buyer_email && (
              <p className="text-gray-600">✉️ {batch.buyer_email}</p>
            )}
          </div>

          {/* Timestamps */}
          <div className="text-xs text-gray-500 space-y-1">
            <p>Created: {formatTime(batch.created_date)}</p>
            {batch.ready_at && <p>Ready: {formatTime(batch.ready_at)}</p>}
            {batch.picked_up_at && (
              <p>Picked up: {formatTime(batch.picked_up_at)}</p>
            )}
          </div>

          {/* Orders */}
          {orders && orders.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-700">Items:</p>
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center gap-2 text-sm bg-gray-50 rounded p-2"
                >
                  {order.product_image_url ? (
                    <img
                      src={order.product_image_url}
                      alt=""
                      className="w-8 h-8 rounded object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center">
                      <Package className="w-4 h-4 text-gray-400" />
                    </div>
                  )}
                  <span className="flex-1 truncate">{order.product_title}</span>
                  <span className="font-semibold">
                    ${order.price?.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          {!isCompleted && (
            <div className="flex gap-2 pt-2">
              {batch.status === "pending" && onMarkReady && (
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkReady();
                  }}
                  disabled={isUpdating}
                  variant="outline"
                  className="flex-1"
                  size="sm"
                >
                  {isUpdating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Mark Ready"
                  )}
                </Button>
              )}
              {onComplete && (
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onComplete();
                  }}
                  disabled={isUpdating}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  size="sm"
                >
                  {isUpdating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Complete Pickup
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}





