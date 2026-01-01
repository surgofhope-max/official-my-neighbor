/**
 * OrderVerificationCard
 * 
 * Displays order verification code for buyers and allows leaving reviews
 * for completed and verified orders.
 */
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Copy,
  Check,
  Star,
  CheckCircle,
  Clock,
  MessageSquare,
} from "lucide-react";
import { getVerificationForOrder } from "@/api/verifications";
import { getReviewForOrder, isOrderReviewEligible } from "@/api/reviews";
import ReviewSubmitDialog from "./ReviewSubmitDialog";

export default function OrderVerificationCard({ 
  order, 
  seller,
  onReviewSubmitted 
}) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);

  // Fetch verification for this order
  const { data: verification, isLoading: verificationLoading } = useQuery({
    queryKey: ["order-verification", order.id],
    queryFn: () => getVerificationForOrder(order.id),
    enabled: !!order.id && order.status === "completed",
  });

  // Fetch existing review for this order
  const { data: existingReview, refetch: refetchReview } = useQuery({
    queryKey: ["order-review", order.id],
    queryFn: () => getReviewForOrder(order.id),
    enabled: !!order.id,
  });

  // Check if order is review eligible
  const { data: reviewEligible } = useQuery({
    queryKey: ["review-eligible", order.id],
    queryFn: () => isOrderReviewEligible(order.id),
    enabled: !!order.id && order.status === "completed" && !existingReview,
  });

  const copyVerificationCode = async () => {
    if (!verification?.verification_code) return;
    
    try {
      await navigator.clipboard.writeText(verification.verification_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  const handleReviewSubmitted = () => {
    setShowReviewDialog(false);
    refetchReview();
    onReviewSubmitted?.();
  };

  // Only show for completed orders
  if (order.status !== "completed") {
    return null;
  }

  return (
    <>
      <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50">
        <CardContent className="p-4 space-y-4">
          {/* Verification Code Section */}
          {verification && !verification.verified_at && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-900">
                  Awaiting Seller Verification
                </span>
              </div>
              
              <Alert className="bg-white border-purple-300">
                <AlertDescription className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-center sm:text-left">
                    <p className="text-xs text-gray-600 mb-1">
                      Show this code to the seller to confirm pickup:
                    </p>
                    <div className="flex items-center gap-2 justify-center sm:justify-start">
                      <span className="text-2xl font-bold text-purple-600 tracking-widest font-mono">
                        {verification.verification_code}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={copyVerificationCode}
                        className="h-8 w-8 p-0"
                      >
                        {copiedCode ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Verified Status */}
          {verification?.verified_at && (
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-green-800">
                Verified by Seller
              </span>
              <span className="text-xs text-gray-500">
                {new Date(verification.verified_at).toLocaleDateString()}
              </span>
            </div>
          )}

          {/* Review Section */}
          {existingReview ? (
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-gray-900">
                  Your Review
                </span>
              </div>
              <div className="flex items-center gap-1 mb-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-4 h-4 ${
                      star <= existingReview.star_rating
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-gray-300"
                    }`}
                  />
                ))}
              </div>
              {existingReview.review_text && (
                <p className="text-sm text-gray-700">
                  "{existingReview.review_text}"
                </p>
              )}
            </div>
          ) : reviewEligible ? (
            <div className="border-t pt-4">
              <Button
                onClick={() => setShowReviewDialog(true)}
                className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white"
              >
                <Star className="w-4 h-4 mr-2" />
                Leave a Review
              </Button>
              <p className="text-xs text-gray-500 text-center mt-2">
                Share your experience with other buyers
              </p>
            </div>
          ) : verification && !verification.verified_at ? (
            <div className="border-t pt-4">
              <p className="text-xs text-gray-500 text-center">
                Review will be available after seller verification
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <ReviewSubmitDialog
        open={showReviewDialog}
        onOpenChange={setShowReviewDialog}
        order={order}
        seller={seller}
        onSuccess={handleReviewSubmitted}
      />
    </>
  );
}

