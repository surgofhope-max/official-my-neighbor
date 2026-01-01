/**
 * ReviewSubmitDialog
 * 
 * Modal dialog for buyers to submit a review for a completed order.
 * Reviews are immutable once submitted.
 */
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Star, Loader2, Store, Package, AlertCircle } from "lucide-react";
import { submitReview } from "@/api/reviews";
import { supabase } from "@/lib/supabase/supabaseClient";

export default function ReviewSubmitDialog({
  open,
  onOpenChange,
  order,
  seller,
  onSuccess,
  notificationId,  // Optional: ID of review_request notification to mark as read
  currentUserId,   // Optional: auth.uid() for RLS
}) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (rating === 0) {
      setError("Please select a rating");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await submitReview({
        order_id: order.id,
        buyer_id: order.buyer_id,
        seller_id: order.seller_id,
        product_id: order.product_id,
        star_rating: rating,
        review_text: reviewText.trim() || null,
        buyer_name: order.buyer_name || null,
        buyer_profile_image_url: order.buyer_profile_image_url || null,
      });

      if (!result.success) {
        setError(result.error || "Failed to submit review");
        return;
      }

      // Mark review_request notification as read (fire-and-forget)
      if (notificationId && currentUserId) {
        try {
          supabase
            .from("notifications")
            .update({ read_at: new Date().toISOString() })
            .eq("id", notificationId)
            .eq("user_id", currentUserId)
            .then(({ error: notifError }) => {
              if (notifError) {
                console.warn("Failed to mark notification as read:", notifError.message);
              }
            });
        } catch (notifErr) {
          console.warn("Error marking notification as read:", notifErr);
        }
      }

      // Reset form and close
      setRating(0);
      setReviewText("");
      onSuccess?.();
    } catch (err) {
      console.error("Review submission error:", err);
      setError("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setRating(0);
      setReviewText("");
      setError(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            Leave a Review
          </DialogTitle>
          <DialogDescription>
            Share your experience with this purchase
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Order Summary */}
          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
            {order.product_image_url ? (
              <img
                src={order.product_image_url}
                alt={order.product_title}
                className="w-12 h-12 object-cover rounded-md"
              />
            ) : (
              <div className="w-12 h-12 bg-gray-200 rounded-md flex items-center justify-center">
                <Package className="w-6 h-6 text-gray-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 text-sm line-clamp-1">
                {order.product_title || "Product"}
              </p>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Store className="w-3 h-3" />
                <span>{seller?.business_name || "Seller"}</span>
              </div>
            </div>
          </div>

          {/* Star Rating */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              How was your experience?
            </label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="p-1 transition-transform hover:scale-110 focus:outline-none"
                  disabled={submitting}
                >
                  <Star
                    className={`w-8 h-8 transition-colors ${
                      star <= (hoveredRating || rating)
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-gray-300 hover:text-yellow-300"
                    }`}
                  />
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              {rating === 1 && "Poor"}
              {rating === 2 && "Fair"}
              {rating === 3 && "Good"}
              {rating === 4 && "Very Good"}
              {rating === 5 && "Excellent"}
            </p>
          </div>

          {/* Review Text */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Write a review (optional)
            </label>
            <Textarea
              placeholder="Share details about your experience..."
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              rows={4}
              maxLength={1000}
              disabled={submitting}
              className="resize-none"
            />
            <p className="text-xs text-gray-500 text-right">
              {reviewText.length}/1000
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={submitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || rating === 0}
              className="flex-1 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Review"
              )}
            </Button>
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-gray-500 text-center">
            Reviews cannot be edited after submission
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

