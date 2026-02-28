import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabaseApi as base44 } from "@/api/supabaseClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  X as XIcon, 
  Upload, 
  Minus, 
  Plus, 
  Radio,
  ShoppingBag,
  Check
} from "lucide-react";
import { debounce } from "lodash";

export default function SellerProductDetailContent({ 
  product, 
  showId, 
  onClose, 
  onPushToLive,
  isFeatured: isFeaturedProp
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Edit mode state
  const [editingField, setEditingField] = useState(null); // 'price' | 'delivery_fee' | null
  const [editValue, setEditValue] = useState("");
  
  // Local state for immediate UI updates
  const [formData, setFormData] = useState({
    title: product.title || "",
    description: product.description || "",
    price: product.price || 0,
    delivery_fee: product.delivery_fee || 0,
    quantity: product.quantity || 0,
    image_urls: product.image_urls || []
  });

  // Update local state if product changes externally (e.g. another admin updates it)
  // But only if IDs match to avoid overwriting when switching products
  useEffect(() => {
    if (product.id) {
      setFormData({
        title: product.title || "",
        description: product.description || "",
        price: product.price || 0,
        delivery_fee: product.delivery_fee || 0,
        quantity: product.quantity || 0,
        image_urls: product.image_urls || []
      });
    }
  }, [product.id]);

  // Update mutation
  const updateProductMutation = useMutation({
    mutationFn: async (updates) => {
      await base44.entities.Product.update(product.id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['show-products', showId]);
    }
  });

  // Debounced update ONLY for title/description (non-financial fields)
  const debouncedUpdate = useCallback(
    debounce((updates) => {
      updateProductMutation.mutate(updates);
    }, 500),
    [product.id]
  );

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    debouncedUpdate({ [field]: value });
  };

  // Edit mode handlers for price and delivery_fee
  const startEdit = (field) => {
    setEditingField(field);
    setEditValue(formData[field]?.toString() || "0");
  };

  const confirmEdit = () => {
    const numValue = parseFloat(editValue);
    if (isNaN(numValue) || numValue < 0) {
      alert("Please enter a valid amount");
      return;
    }
    
    setFormData(prev => ({ ...prev, [editingField]: numValue }));
    updateProductMutation.mutate({ [editingField]: numValue });
    setEditingField(null);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue("");
  };

  // Immediate update for buttons (quantity, etc)
  const handleImmediateUpdate = (field, value) => {
    if (field === "quantity" && quantityEditsDisabled) return;
    setFormData(prev => ({ ...prev, [field]: value }));
    updateProductMutation.mutate({ [field]: value });
  };

  const quantityEditsDisabled = true;

  const incrementQty = () => {
    if (quantityEditsDisabled) return;
    handleImmediateUpdate("quantity", (formData.quantity || 0) + 1);
  };
  const decrementQty = () => {
    if (quantityEditsDisabled) return;
    handleImmediateUpdate("quantity", Math.max(0, (formData.quantity || 0) - 1));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const newImages = [file_url, ...(formData.image_urls || []).slice(0, 4)];
      handleImmediateUpdate('image_urls', newImages);
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Failed to upload image");
    }
    setIsUploading(false);
  };

  // Use prop if provided, otherwise fallback to status check
  const isFeatured = isFeaturedProp !== undefined ? isFeaturedProp : (product.status === "featured");

  return (
    <div 
      className="backdrop-blur-md rounded-2xl shadow-xl w-full max-w-sm border border-white/20 overflow-hidden bg-black/60"
      style={{ height: '220px' }}
    >
      {/* Close Button */}
      <div className="absolute top-2 right-2 z-30">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-white hover:bg-black/30 h-8 w-8 rounded-full bg-black/20 backdrop-blur-sm"
        >
          <XIcon className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex h-full">
        {/* Left - Image (40%) */}
        <div className="w-[40%] relative bg-black/20 border-r border-white/10 group">
          {/* Push to Live Overlay Button */}
          <div className="absolute top-2 left-2 right-2 z-20">
              <Button
                onClick={(e) => {
                    e.stopPropagation();
                    onPushToLive(product);
                }}
                className={`w-full h-7 font-bold text-white shadow-lg transition-all text-[10px] tracking-wide
                  ${isFeatured 
                    ? 'bg-green-600 hover:bg-green-700 border border-green-400' 
                    : 'bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700'
                  }
                `}
              >
                {isFeatured ? (
                  <>
                    <Radio className="w-3 h-3 mr-1.5 animate-pulse" />
                    LIVE
                  </>
                ) : (
                  <>
                    <Radio className="w-3 h-3 mr-1.5" />
                    PUSH LIVE
                  </>
                )}
              </Button>
          </div>
          {formData.image_urls?.[0] ? (
            <img
              src={formData.image_urls[0]}
              alt={formData.title}
              className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-60 transition-opacity"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <ShoppingBag className="w-10 h-10 text-white/30" />
            </div>
          )}
          
          {/* Upload Overlay */}
          <div 
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer bg-black/40"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="text-center">
              {isUploading ? (
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto" />
              ) : (
                <>
                  <Upload className="w-6 h-6 text-white mx-auto mb-1" />
                  <span className="text-white text-[10px] font-bold">REPLACE</span>
                </>
              )}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
        </div>

        {/* Right - Content (60%) */}
        <div className="w-[60%] p-3 flex flex-col relative gap-2">
          
          {/* Title Input */}
          <Input
            value={formData.title}
            onChange={(e) => handleChange('title', e.target.value)}
            className="h-8 bg-transparent border-white/20 text-white font-bold text-sm focus:bg-black/40 px-2 rounded-lg"
            placeholder="Product Title"
          />

          {/* Description Input - Compact */}
          <Textarea
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            className="h-[3.5rem] bg-transparent border-white/20 text-white text-xs resize-none focus:bg-black/40 px-2 py-1.5 rounded-lg leading-tight"
            placeholder="Description..."
          />

          {/* Vertical Input Stack */}
          <div className="flex flex-col gap-2 mt-auto">
             {/* Row A - Price */}
             {editingField === 'price' ? (
               <div className="flex items-center bg-yellow-500/20 rounded-lg border-2 border-yellow-500 px-2 h-8 gap-1">
                 <span className="text-white/60 text-xs w-12">Price:</span>
                 <span className="text-white text-xs">$</span>
                 <Input 
                   type="number"
                   step="0.01"
                   value={editValue}
                   onChange={(e) => setEditValue(e.target.value)}
                   onKeyDown={(e) => {
                     if (e.key === 'Enter') confirmEdit();
                     if (e.key === 'Escape') cancelEdit();
                   }}
                   className="flex-1 h-full border-0 bg-transparent p-0 text-white text-sm focus-visible:ring-0 text-right"
                   autoFocus
                 />
                 <Button size="icon" variant="ghost" onClick={confirmEdit} className="h-6 w-6 text-green-400 hover:bg-green-500/20">
                   <Check className="w-4 h-4" />
                 </Button>
                 <Button size="icon" variant="ghost" onClick={cancelEdit} className="h-6 w-6 text-red-400 hover:bg-red-500/20">
                   <XIcon className="w-4 h-4" />
                 </Button>
               </div>
             ) : (
               <button
                 onClick={() => startEdit('price')}
                 className="flex items-center bg-black/20 rounded-lg border border-white/10 px-3 h-8 hover:bg-black/30 transition-colors"
               >
                 <span className="text-white/60 text-xs w-16">Price:</span>
                 <span className="text-white text-xs mr-1">$</span>
                 <span className="flex-1 text-right text-white text-sm font-semibold">
                   {formData.price?.toFixed(2)}
                 </span>
               </button>
             )}

             {/* Row B - Delivery Fee */}
             {editingField === 'delivery_fee' ? (
               <div className="flex items-center bg-yellow-500/20 rounded-lg border-2 border-yellow-500 px-2 h-8 gap-1">
                 <span className="text-white/60 text-xs w-12">Del. Fee:</span>
                 <span className="text-white text-xs">$</span>
                 <Input 
                   type="number"
                   step="0.01"
                   value={editValue}
                   onChange={(e) => setEditValue(e.target.value)}
                   onKeyDown={(e) => {
                     if (e.key === 'Enter') confirmEdit();
                     if (e.key === 'Escape') cancelEdit();
                   }}
                   className="flex-1 h-full border-0 bg-transparent p-0 text-white text-sm focus-visible:ring-0 text-right"
                   autoFocus
                 />
                 <Button size="icon" variant="ghost" onClick={confirmEdit} className="h-6 w-6 text-green-400 hover:bg-green-500/20">
                   <Check className="w-4 h-4" />
                 </Button>
                 <Button size="icon" variant="ghost" onClick={cancelEdit} className="h-6 w-6 text-red-400 hover:bg-red-500/20">
                   <XIcon className="w-4 h-4" />
                 </Button>
               </div>
             ) : (
               <button
                 onClick={() => startEdit('delivery_fee')}
                 className="flex items-center bg-black/20 rounded-lg border border-white/10 px-3 h-8 hover:bg-black/30 transition-colors"
               >
                 <span className="text-white/60 text-xs w-12">Del. Fee:</span>
                 <span className="text-white text-xs mr-1">$</span>
                 <span className="flex-1 text-right text-white text-sm font-semibold">
                   {formData.delivery_fee?.toFixed(2)}
                 </span>
               </button>
             )}

             {/* Row C - Quantity */}
             <div className="flex items-center justify-between bg-black/20 rounded-lg border border-white/10 h-8 overflow-hidden">
                <button 
                    type="button"
                    onClick={decrementQty}
                    disabled={quantityEditsDisabled}
                    title={quantityEditsDisabled ? "Quantity edits disabled on mobile. Use desktop Host Console." : undefined}
                    className={`w-10 h-full flex items-center justify-center transition-colors bg-white/5 ${quantityEditsDisabled ? "opacity-50 cursor-not-allowed text-white/50" : "text-white hover:bg-white/10 active:scale-95"}`}
                >
                    <Minus className="w-3 h-3" />
                </button>
                <div className="flex-1 text-center text-white text-sm font-mono font-bold">
                    {formData.quantity} <span className="text-xs font-normal opacity-60">qty</span>
                </div>
                <button 
                    type="button"
                    onClick={incrementQty}
                    disabled={quantityEditsDisabled}
                    title={quantityEditsDisabled ? "Quantity edits disabled on mobile. Use desktop Host Console." : undefined}
                    className={`w-10 h-full flex items-center justify-center transition-colors bg-white/5 ${quantityEditsDisabled ? "opacity-50 cursor-not-allowed text-white/50" : "text-white hover:bg-white/10 active:scale-95"}`}
                >
                    <Plus className="w-3 h-3" />
                </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
