import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, CheckCircle } from "lucide-react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { supabaseApi as base44 } from "@/api/supabaseClient"; // Keep for entities
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function ReviewRequestBubble({ message }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [submitted, setSubmitted] = useState(false);
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
      
      return await base44.entities.Review.create({
        seller_id: message.metadata.seller_id,
        buyer_id: user.id,
        order_id: message.metadata.order_id,
        star_rating: rating,
        review_text: reviewText.trim(),
        buyer_name: user.full_name || user.email
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-reviews'] });
      setSubmitted(true);
    }
  });

  const handleSubmit = () => {
    if (!rating) return;
    submitReviewMutation.mutate();
  };

  if (submitted) {
    return (
      <div className="flex justify-center my-4">
        <div className="bg-green-50 border border-green-200 rounded-2xl px-6 py-4 max-w-md">
          <div className="flex items-center gap-2 text-green-700 mb-2">
            <CheckCircle className="w-5 h-5" />
            <span className="font-semibold">Review Submitted</span>
          </div>
          <p className="text-sm text-green-600">Thank you for your feedback!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[85%] bg-purple-50 border border-purple-200 rounded-2xl px-4 py-4">
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-5 h-5 text-purple-600" />
              <span className="font-semibold text-gray-900">Leave a Review</span>
            </div>
            <p className="text-sm text-gray-700 mb-1">{message.body}</p>
          </div>

          {/* Star Rating */}
          <div>
            <p className="text-xs text-gray-600 mb-2">How was your experience?</p>
            <div className="flex gap-1">
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
                    className={`w-7 h-7 ${
                      star <= (hoverRating || rating)
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-gray-300"
                    }`}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-xs text-gray-600 mt-1">{rating} out of 5 stars</p>
            )}
          </div>

          {/* Written Review */}
          <div>
            <label className="text-xs text-gray-600 mb-1 block">
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
              rows={3}
              className="resize-none text-sm"
            />
            <p className={`text-xs mt-1 ${wordCount > maxWords ? 'text-red-500' : 'text-gray-500'}`}>
              {wordCount} / {maxWords} words
            </p>
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={!rating || submitReviewMutation.isPending}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-sm h-9"
          >
            {submitReviewMutation.isPending ? "Submitting..." : "Submit Review"}
          </Button>
        </div>
      </div>
    </div>
  );
}