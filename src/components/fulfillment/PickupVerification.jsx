import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  XCircle,
  Package,
  User,
  Phone,
  Mail,
  Loader2,
  Search,
  AlertTriangle,
} from "lucide-react";
import { verifyPickupCode, completeBatchPickup } from "@/api/fulfillment";

/**
 * PickupVerification - Base44 Parity
 * 
 * Exact behavior:
 * 1. Single 9-digit numeric input with auto-focus
 * 2. Show hint with expected completion_code
 * 3. Frontend validates code === batch.completion_code
 * 4. On match: execute mutations in exact order
 * 5. Success alert: "✅ Successfully verified {count} orders. Review notification sent."
 */
export default function PickupVerification({ 
  sellerId, 
  sellerEmail,
  sellerName,
  isAdmin = false, 
  onComplete 
}) {
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const inputRef = useRef(null);

  // Auto-focus on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Only allow numeric input, max 9 digits
  const handleCodeChange = (e) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 9);
    setCode(value);
  };

  const handleVerify = async () => {
    // QA HARDENING: Prevent double-submit while verifying
    if (isVerifying) {
      return;
    }

    // Base44: Input must be exactly 9 digits
    if (code.length !== 9) {
      setError("Please enter a 9-digit verification code");
      return;
    }

    setIsVerifying(true);
    setError(null);
    setVerificationResult(null);

    try {
      const result = await verifyPickupCode(code, sellerId, isAdmin);

      if (result.error) {
        // Base44: Show "Invalid verification code" on mismatch
        // QA HARDENING: Show friendly message for already-completed batches
        if (result.error.type === "ALREADY_COMPLETED") {
          setError("This batch has already been picked up");
        } else if (result.error.type === "INVALID_CODE") {
          setError("Invalid verification code");
        } else {
          setError(result.error.message);
        }
      } else {
        setVerificationResult(result.data);
      }
    } catch (err) {
      // QA HARDENING: Catch unexpected errors
      console.warn("Verification error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleComplete = async () => {
    // QA HARDENING: Prevent double-submit while completing
    if (!verificationResult || isCompleting) {
      return;
    }

    setIsCompleting(true);
    setError(null);

    try {
      // Base44 parity: pass seller email and name for picked_up_by and notification
      const result = await completeBatchPickup({
        batchId: verificationResult.id,
        sellerId,
        sellerEmail: sellerEmail || "seller@unknown.com",
        sellerName: sellerName || "Seller",
        isAdmin,
      });

      if (result.error) {
        // QA HARDENING: Show friendly message for already-completed
        if (result.error.type === "ALREADY_COMPLETED") {
          setError("This batch has already been completed");
        } else {
          setError(result.error.message);
        }
      } else {
        // Base44: Success alert with order count and notification status
        const orderCount = result.ordersUpdated;
        const notifText = result.notificationSent 
          ? "Review notification sent." 
          : "";
        setSuccessMessage(`✅ Successfully verified ${orderCount} orders. ${notifText}`);
        
        if (onComplete) {
          onComplete(result.batch, result.ordersUpdated);
        }
      }
    } catch (err) {
      // QA HARDENING: Catch unexpected errors
      console.warn("Completion error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsCompleting(false);
    }
  };

  const handleReset = () => {
    setCode("");
    setVerificationResult(null);
    setError(null);
    setSuccessMessage(null);
    // Re-focus input
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 100);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      if (!verificationResult && code.length === 9) {
        handleVerify();
      }
    }
  };

  // Success state - Base44 parity: show alert message
  if (successMessage) {
    return (
      <Card className="border-green-500 bg-green-50">
        <CardContent className="p-6 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-green-800 mb-2">
            Pickup Complete!
          </h3>
          <p className="text-green-700 mb-4 font-medium">
            {successMessage}
          </p>
          <Button onClick={handleReset} variant="outline">
            Verify Another Pickup
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Code Input - Base44 parity: 9-digit numeric, auto-focus */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="w-5 h-5" />
            Verify Pickup Code
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Enter the buyer's 9-digit verification code to complete pickup.
          </p>
          
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={code}
              onChange={handleCodeChange}
              onKeyDown={handleKeyDown}
              placeholder="000000000"
              className="text-center text-2xl tracking-[0.3em] font-mono"
              maxLength={9}
              inputMode="numeric"
              pattern="[0-9]*"
              disabled={isVerifying || !!verificationResult}
              autoComplete="off"
            />
            {!verificationResult ? (
              <Button
                onClick={handleVerify}
                disabled={isVerifying || code.length !== 9}
                className="min-w-[100px]"
              >
                {isVerifying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Verify"
                )}
              </Button>
            ) : (
              <Button onClick={handleReset} variant="outline">
                Clear
              </Button>
            )}
          </div>

          {/* Show digit count hint */}
          <p className="text-xs text-gray-400 text-center">
            {code.length}/9 digits
          </p>

          {error && (
            <Alert variant="destructive">
              <XCircle className="w-4 h-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isAdmin && (
            <p className="text-xs text-gray-500">
              Admin mode: You can verify any seller's batches
            </p>
          )}
        </CardContent>
      </Card>

      {/* Verification Result */}
      {verificationResult && (
        <Card className="border-blue-500">
          <CardHeader className="pb-3 bg-blue-50">
            <CardTitle className="text-lg flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-blue-500" />
                Code Verified
              </span>
              <Badge
                variant={
                  verificationResult.status === "ready" ? "default" : "secondary"
                }
              >
                {verificationResult.status.toUpperCase()}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {/* Buyer Info */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm text-gray-700">
                Buyer Information
              </h4>
              <div className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400" />
                  <span>{verificationResult.buyer_name || "N/A"}</span>
                </div>
                {verificationResult.buyer_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span>{verificationResult.buyer_phone}</span>
                  </div>
                )}
                {verificationResult.buyer_email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span>{verificationResult.buyer_email}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Order Summary */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm text-gray-700">
                Order Summary
              </h4>
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Items:</span>
                  <span className="font-semibold">
                    {verificationResult.total_items || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total:</span>
                  <span className="font-bold text-lg">
                    ${(verificationResult.total_amount || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Items List */}
            {verificationResult.orders && verificationResult.orders.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-gray-700">Items</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {verificationResult.orders.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center gap-3 bg-gray-50 rounded-lg p-2"
                    >
                      {order.product_image_url ? (
                        <img
                          src={order.product_image_url}
                          alt={order.product_title}
                          className="w-12 h-12 object-cover rounded"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
                          <Package className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {order.product_title}
                        </p>
                        <p className="text-gray-500 text-xs">
                          ${order.price?.toFixed(2)}
                        </p>
                      </div>
                      <Badge
                        variant={order.status === "paid" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {order.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Warning for pending status */}
            {verificationResult.status === "pending" && (
              <Alert>
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>
                  This batch is still pending. Consider marking it as ready
                  before completing pickup.
                </AlertDescription>
              </Alert>
            )}

            {/* Complete Button */}
            <Button
              onClick={handleComplete}
              disabled={isCompleting}
              className="w-full bg-green-600 hover:bg-green-700"
              size="lg"
            >
              {isCompleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Completing...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Confirm Pickup Complete
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

