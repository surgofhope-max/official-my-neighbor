import React from "react";
import SellerProductDetailContent from "./SellerProductDetailContent";

export default function SellerProductDetailCard({ 
  product, 
  showId, 
  onClose, 
  onPushToLive,
  isFeatured: isFeaturedProp
}) {
  return (
    <>
      {/* Backdrop to close on tap outside */}
      <div 
        className="fixed inset-0 z-[99] bg-black/10" 
        onClick={onClose}
      />

      {/* Card Container - Same position as Buyer Card */}
      <div 
        className="fixed left-4 right-4 z-[100] animate-slide-up flex justify-center"
        style={{ bottom: '150px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <SellerProductDetailContent 
          product={product} 
          showId={showId} 
          onClose={onClose} 
          onPushToLive={onPushToLive} 
          isFeatured={isFeaturedProp} 
        />
      </div>
    </>
  );
}
