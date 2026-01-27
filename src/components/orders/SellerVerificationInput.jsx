/**
 * SellerVerificationInput
 * 
 * Allows sellers to enter buyer verification codes to confirm pickup.
 * Used in SellerOrders and HostConsole fulfillment flows.
 */
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  Clock,
  Loader2,
  ShieldCheck,
  AlertCircle,
  KeyRound,
} from "lucide-react";
import { 
  getVerificationStatusForSeller, 
  verifyOrderDirect 
} from "@/api/verifications";

export default function SellerVerificationInput({ 
  orderId, 
  sellerId,
  onVerified,
  compact = false,
}) {
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState(null);
  const queryClient = useQueryClient();

  // Fetch verification status
  const { data: verificationStatus, isLoading } = useQuery({
    queryKey: ["verification-status", orderId, sellerId],
    queryFn: () => getVerificationStatusForSeller(orderId, sellerId),
    enabled: !!orderId && !!sellerId,
  });

  // Verify mutation
  const verifyMutation = useMutation({
    mutationFn: () => verifyOrderDirect(orderId, verificationCode, sellerId),
    onSuccess: (result) => {
      if (result.success) {
        setVerificationCode("");
        setError(null);
        // Invalidate queries to refresh status
        queryClient.invalidateQueries({ queryKey: ["verification-status", orderId] });
        onVerified?.();
      } else {
        setError(result.error || "Verification failed");
      }
    },
    onError: (err) => {
      setError(err.message || "Verification failed");
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    if (!verificationCode.trim()) {
      setError("Please enter the verification code");
      return;
    }

    verifyMutation.mutate();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading verification status...</span>
      </div>
    );
  }

  // No verification exists yet (order not completed)
  if (!verificationStatus?.exists) {
    return null;
  }

  // Already verified
  if (verificationStatus.verified) {
    if (compact) {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-300">
          <CheckCircle className="w-3 h-3 mr-1" />
          Verified
        </Badge>
      );
    }

    return (
      <Alert className="bg-green-50 border-green-200">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800">
          <strong>Buyer Verified</strong>
          {verificationStatus.verified_at && (
            <span className="text-green-600 ml-2 text-sm">
              {new Date(verificationStatus.verified_at).toLocaleDateString()}
            </span>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  // Awaiting verification - show input
  if (compact) {
    return (
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <Input
          type="text"
          placeholder="Code"
          value={verificationCode}
          onChange={(e) => setVerificationCode(e.target.value)}
          className="w-24 h-8 text-sm"
          maxLength={6}
        />
        <Button
          type="submit"
          size="sm"
          disabled={verifyMutation.isPending}
          className="h-8"
        >
          {verifyMutation.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <ShieldCheck className="w-3 h-3" />
          )}
        </Button>
      </form>
    );
  }

  return (
    <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-medium text-amber-900">
            Awaiting Buyer Verification
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <KeyRound className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Enter 6-digit code"
                value={verificationCode}
                onChange={(e) => {
                  // Only allow digits
                  const value = e.target.value.replace(/\D/g, "");
                  setVerificationCode(value);
                }}
                className="pl-10 font-mono tracking-widest text-center"
                maxLength={6}
                disabled={verifyMutation.isPending}
              />
            </div>
            <Button
              type="submit"
              disabled={verifyMutation.isPending || verificationCode.length < 6}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {verifyMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Verify
                </>
              )}
            </Button>
          </div>

          {error && (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          )}
        </form>

        <p className="text-xs text-gray-600">
          Ask the buyer to show their pickup verification code
        </p>
      </CardContent>
    </Card>
  );
}














