import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase/supabaseClient";
import { Upload, X, Gift, Video } from "lucide-react";
import { FEATURES } from "@/config/features";

export default function ProductForm({ product, onSave, onCancel, isSubmitting }) {
  const [formData, setFormData] = useState({
    title: product?.title || "",
    description: product?.description || "",
    price: product?.price || "",
    quantity: product?.quantity || 1,
    pickup_notes: product?.pickup_notes || "",
    is_live_item: product?.is_live_item || false,
    is_givey: product?.is_givey || false,
    category: product?.category || "",
    image_urls: product?.image_urls || []
  });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const categories = [
    { value: "tools", label: "Tools" },
    { value: "electronics", label: "Electronics" },
    { value: "home", label: "Home Goods" },
    { value: "apparel", label: "Apparel" },
    { value: "charity", label: "Charity Auctions" },
    { value: "vintage", label: "Vintage" },
    { value: "yard_sales", label: "Yard Sales" },
    { value: "swap_meets", label: "Swap Meets" },
    { value: "stores", label: "Stores" }
  ];

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setUploading(true);
    const uploadedUrls = [];

    for (const file of files) {
      const fileExt = file.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = fileName;

      const { error } = await supabase.storage
        .from("products")
        .upload(filePath, file, { upsert: true });

      if (error) {
        console.error("Product image upload failed:", error);
        continue;
      }

      const { data } = supabase.storage
        .from("products")
        .getPublicUrl(filePath);

      uploadedUrls.push(data.publicUrl);
    }

    setFormData(prev => ({
      ...prev,
      image_urls: [...(prev.image_urls || []), ...uploadedUrls]
    }));

    setUploading(false);
  };

  const removeImage = (index) => {
    setFormData(prev => ({
      ...prev,
      image_urls: (prev.image_urls || []).filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      price: parseFloat(formData.price),
      quantity: parseInt(formData.quantity)
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Images */}
      <div className="space-y-3">
        <Label>Product Images</Label>
        <div className="grid grid-cols-3 gap-3">
          {(formData.image_urls || []).map((url, index) => (
            <div key={index} className="relative group">
              <img
                src={url}
                alt={`Product ${index + 1}`}
                className="w-full h-24 object-cover rounded-lg"
              />
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-purple-500 transition-colors"
            disabled={uploading}
          >
            <Upload className="w-5 h-5 text-gray-400 mb-1" />
            <span className="text-xs text-gray-500">
              {uploading ? "Uploading..." : "Add Photo"}
            </span>
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* Title */}
      <div className="space-y-2">
        <Label>Title *</Label>
        <Input
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Product name"
          required
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Describe your product..."
          rows={4}
        />
      </div>

      {/* Category Dropdown */}
      <div className="space-y-2">
        <Label>Category</Label>
        <Select
          value={formData.category}
          onValueChange={(value) => setFormData({ ...formData, category: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent className="z-[1100]">
            {categories.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-500">
          Products will appear in the selected category on the Marketplace
        </p>
      </div>

      {/* Price & Quantity */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Price (USD) *</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            placeholder="0.00"
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Quantity *</Label>
          <Input
            type="number"
            min="0"
            value={formData.quantity}
            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
            placeholder="1"
            required
          />
        </div>
      </div>

      {/* Pickup Notes */}
      <div className="space-y-2">
        <Label>Pickup Instructions</Label>
        <Textarea
          value={formData.pickup_notes}
          onChange={(e) => setFormData({ ...formData, pickup_notes: e.target.value })}
          placeholder="Special instructions for this item..."
          rows={2}
        />
      </div>

      {/* Live Item Toggle */}
      <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
            <Video className="w-5 h-5 text-white" />
          </div>
          <div>
            <Label className="text-base font-semibold">Enable for Live Shows</Label>
            <p className="text-sm text-gray-600 mt-1">
              Allow this product to be featured in livestreams
            </p>
          </div>
        </div>
        <Switch
          checked={formData.is_live_item}
          onCheckedChange={(checked) => setFormData({ ...formData, is_live_item: checked })}
        />
      </div>

      {/* GIVEY Toggle - Gated by feature flag */}
      {FEATURES.givi && (
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-pink-50 to-orange-50 rounded-lg border-2 border-pink-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-orange-500 rounded-lg flex items-center justify-center">
              <Gift className="w-5 h-5 text-white" />
            </div>
            <div>
              <Label className="text-base font-semibold">Mark as GIVEY Item</Label>
              <p className="text-sm text-gray-600 mt-1">
                Giveaway/raffle item - Shows timer and share button only (no pricing/checkout)
              </p>
            </div>
          </div>
          <Switch
            checked={formData.is_givey}
            onCheckedChange={(checked) => setFormData({ ...formData, is_givey: checked })}
          />
        </div>
      )}

      {/* GIVEY Notice - Only shows when GIVI enabled AND toggle is on */}
      {FEATURES.givi && formData.is_givey && (
        <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-4">
          <p className="text-sm text-orange-900">
            <strong>📢 GIVEY Mode:</strong> This item will appear in your GIVEY Inventory 
            (separate from regular products). During live shows, viewers will only see a 
            countdown timer and share button - no pricing or buy buttons will be displayed.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1 bg-gradient-to-r from-purple-600 to-blue-500"
          disabled={isSubmitting || uploading}
        >
          {isSubmitting ? "Saving..." : "Save Product"}
        </Button>
      </div>
    </form>
  );
}