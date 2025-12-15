import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Package } from "lucide-react";

const statusColors = {
  available: "bg-green-100 text-green-800 border-green-200",
  featured: "bg-purple-100 text-purple-800 border-purple-200",
  locked: "bg-orange-100 text-orange-800 border-orange-200",
  sold: "bg-gray-100 text-gray-800 border-gray-200"
};

export default function ProductCard({ product, onEdit, onDelete }) {
  return (
    <Card className="group overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300">
      <div className="relative h-48 bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
        {product.image_urls && product.image_urls.length > 0 ? (
          <img
            src={product.image_urls[0]}
            alt={product.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-16 h-16 text-gray-400" />
          </div>
        )}
        <div className="absolute top-3 right-3">
          <Badge className={`${statusColors[product.status]} border`}>
            {product.status}
          </Badge>
        </div>
        {product.is_live_item && (
          <div className="absolute top-3 left-3">
            <Badge className="bg-red-500 text-white border-0">
              Live Item
            </Badge>
          </div>
        )}
      </div>
      <CardContent className="p-4">
        <h3 className="font-semibold text-lg text-gray-900 mb-1 line-clamp-1">
          {product.title}
        </h3>
        <p className="text-gray-600 text-sm mb-3 line-clamp-2">
          {product.description || "No description"}
        </p>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-2xl font-bold text-gray-900">
              ${product.price?.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500">
              Qty: {product.quantity || 0}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onEdit(product)}
          >
            <Edit className="w-4 h-4 mr-1" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => onDelete(product.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}