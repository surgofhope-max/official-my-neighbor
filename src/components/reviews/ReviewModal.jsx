import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { supabaseApi as base44 } from "@/api/supabaseClient"; // Keep for entities
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function ReviewModal({ seller, orderId, onClose }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const queryClient = useQueryClient();

  const wordCount = reviewText.trim().split(/\s+/).filter(Boolean).length;
  const maxWords = 50;

  const submitReviewMutation = useMutation({
    mutationFn: async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        throw new Error("Not authenticated");
      }
      const user = authData.user;
      
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📝 CREATING REVIEW");
      console.log("   Current User ID:", user.id);
      console.log("   Current User Email:", user.email);
      console.log("   Current User Name:", user.full_name);
      
      // Fetch buyer profile to get profile image
      const buyerProfiles = await base44.entities.BuyerProfile.filter({ user_id: user.id });
      console.log("   Found Buyer Profiles:", buyerProfiles.length);
      
      const buyerProfile = buyerProfiles.length > 0 ? buyerProfiles[0] : null;
      
      if (buyerProfile) {
        console.log("   ✅ Buyer Profile Found:", {
          profile_id: buyerProfile.id,
          user_id: buyerProfile.user_id,
          full_name: buyerProfile.full_name,
          has_image: !!buyerProfile.profile_image_url,
          image_url: buyerProfile.profile_image_url
        });
      } else {
        console.log("   ⚠️ NO Buyer Profile Found!");
      }
      
      const reviewData = {
        seller_id: seller.id,
        buyer_id: user.id,
        order_id: orderId,
        star_rating: rating,
        review_text: reviewText.trim(),
        buyer_name: user.full_name || user.email,
        buyer_profile_image_url: buyerProfile?.profile_image_url || null
      };
      
      console.log("   📤 Review Data to Save:", reviewData);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      return await base44.entities.Review.create(reviewData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-reviews'] });
      onClose();
    }
  });

  const handleSubmit = async () => {
    if (!rating) return;
    submitReviewMutation.mutate();
  };

  return (
    <Dialog open={!!seller} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Leave a Review for {seller?.business_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Star Rating */}
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-3">How was your experience?</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-10 h-10 ${
                      star <= (hoverRating || rating)
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-gray-300"
                    }`}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-sm text-gray-600 mt-2">{rating} out of 5 stars</p>
            )}
          </div>

          {/* Written Review */}
          <div>
            <label className="text-sm font-medium text-gray-900 mb-2 block">
              Write a review (optional)
            </label>
            <Textarea
              value={reviewText}
              onChange={(e) => {
                const words = e.target.value.trim().split(/\s+/).filter(Boolean);
                if (words.length <= maxWords) {
                  setReviewText(e.target.value);
                }
              }}
              placeholder="Share your experience..."
              rows={4}
              className="resize-none"
            />
            <p className={`text-xs mt-1 ${wordCount > maxWords ? 'text-red-500' : 'text-gray-500'}`}>
              {wordCount} / {maxWords} words
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!rating || submitReviewMutation.isPending}
              className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600"
            >
              {submitReviewMutation.isPending ? "Submitting..." : "Submit Review"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}