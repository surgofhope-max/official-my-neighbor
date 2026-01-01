/**
 * SellerReviewsSection
 * 
 * Displays seller rating statistics and reviews list.
 * Used on seller profile/storefront pages.
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, MessageSquare, User, Package } from "lucide-react";
import { format } from "date-fns";
import { getReviewsForSeller, getSellerRatingStats } from "@/api/reviews";

// ═══════════════════════════════════════════════════════════════════════════════
// RATING STARS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function RatingStars({ rating, size = "default" }) {
  const starSize = size === "small" ? "w-3 h-3" : size === "large" ? "w-6 h-6" : "w-4 h-4";
  
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${starSize} ${
            star <= rating
              ? "fill-yellow-400 text-yellow-400"
              : star <= Math.ceil(rating) && rating % 1 >= 0.5
              ? "fill-yellow-400/50 text-yellow-400"
              : "text-gray-300"
          }`}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RATING SUMMARY COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function RatingSummary({ stats }) {
  const { average_rating, review_count } = stats;

  if (review_count === 0) {
    return (
      <div className="text-center py-4">
        <RatingStars rating={0} size="large" />
        <p className="text-sm text-gray-500 mt-2">No reviews yet</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div className="text-center">
        <div className="text-4xl font-bold text-gray-900">
          {average_rating.toFixed(1)}
        </div>
        <RatingStars rating={Math.round(average_rating)} size="default" />
      </div>
      <div className="flex-1">
        <p className="text-sm text-gray-600">
          Based on <span className="font-semibold">{review_count}</span>{" "}
          {review_count === 1 ? "review" : "reviews"}
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVIEW CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function ReviewCard({ review }) {
  return (
    <div className="border-b border-gray-100 pb-4 mb-4 last:border-0 last:pb-0 last:mb-0">
      {/* Header: User + Rating + Date */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {review.buyer_avatar ? (
            <img
              src={review.buyer_avatar}
              alt={review.buyer_name}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
              <User className="w-4 h-4 text-gray-500" />
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-gray-900">
              {review.buyer_name}
            </p>
            <RatingStars rating={review.star_rating} size="small" />
          </div>
        </div>
        <span className="text-xs text-gray-500">
          {format(new Date(review.created_date), "MMM d, yyyy")}
        </span>
      </div>

      {/* Product Info (if available) */}
      {review.product_title && (
        <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
          <Package className="w-3 h-3" />
          <span>{review.product_title}</span>
        </div>
      )}

      {/* Review Text */}
      {review.review_text && (
        <p className="text-sm text-gray-700 mt-2">{review.review_text}</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function SellerReviewsSection({ 
  sellerId,
  limit = 5,
  showHeader = true,
  compact = false,
}) {
  // Fetch rating stats
  const { data: stats = { average_rating: 0, review_count: 0 } } = useQuery({
    queryKey: ["seller-rating-stats", sellerId],
    queryFn: () => getSellerRatingStats(sellerId),
    enabled: !!sellerId,
  });

  // Fetch reviews
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["seller-reviews", sellerId, limit],
    queryFn: () => getReviewsForSeller(sellerId, { limit }),
    enabled: !!sellerId,
  });

  if (compact) {
    // Compact version for cards/lists
    return (
      <div className="flex items-center gap-2">
        <RatingStars rating={Math.round(stats.average_rating)} size="small" />
        <span className="text-sm text-gray-600">
          {stats.average_rating > 0 
            ? `${stats.average_rating.toFixed(1)} (${stats.review_count})`
            : "No reviews"
          }
        </span>
      </div>
    );
  }

  return (
    <Card>
      {showHeader && (
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="w-5 h-5" />
            Reviews
          </CardTitle>
        </CardHeader>
      )}
      
      <CardContent className="space-y-4">
        {/* Rating Summary */}
        <RatingSummary stats={stats} />

        {/* Reviews List */}
        {isLoading ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500">Loading reviews...</p>
          </div>
        ) : reviews.length > 0 ? (
          <div className="mt-4">
            {reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        ) : stats.review_count === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500">
              Be the first to leave a review!
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { RatingStars, RatingSummary, ReviewCard };

