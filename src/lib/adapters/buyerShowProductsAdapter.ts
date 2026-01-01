/**
 * Buyer Show Products Adapter
 *
 * TEMPORARY COMPATIBILITY LAYER for BuyerMirror migration.
 *
 * This adapter transforms the `show_products` JOIN `products` response
 * into a flattened product array that matches the existing LiveShow.jsx
 * component expectations.
 *
 * Once LiveShow.jsx is fully migrated to use the new data shape directly,
 * this adapter can be removed.
 *
 * Migration path:
 * 1. LiveShow reads from show_products via API
 * 2. Adapter flattens data to match old shape
 * 3. LiveShow renders without changes
 * 4. Eventually: update LiveShow to use new shape, remove adapter
 */

/**
 * Raw show_product row with joined product data.
 * Matches the shape returned by `getShowProductsByShowId()`.
 */
export interface RawShowProduct {
  id: string;
  show_id: string;
  product_id: string;
  seller_id: string;
  box_number: number;
  is_featured: boolean;
  is_givi: boolean;
  created_at?: string;
  updated_at?: string;
  product?: {
    id: string;
    title: string;
    description?: string;
    price: number;
    original_price?: number;
    quantity: number;
    quantity_sold?: number;
    image_urls?: string[] | null;
    images?: any[] | null; // Legacy fallback
    category?: string;
    status: string;
    givi_type?: string;
  } | null;
}

/**
 * Adapted product shape that matches LiveShow.jsx expectations.
 * Flattened with backwards-compatible field names.
 */
export interface AdaptedBuyerProduct {
  // Core product fields (from products table)
  id: string;
  title: string;
  description?: string;
  price: number;
  original_price?: number;
  quantity: number;
  quantity_sold?: number;
  category?: string;
  status: string;
  givi_type?: string;

  // Show-level state (from show_products table)
  show_product_id: string;
  box_number: number;
  is_featured: boolean;
  is_givi: boolean;

  // Backwards-compatible image field alias
  // LiveShow.jsx uses `image_urls`, but DB stores `images`
  image_urls: any[];
}

/**
 * Transform raw show_products JOIN response into flattened product array
 * compatible with existing LiveShow.jsx rendering logic.
 *
 * @param showProductsRaw - Array from `getShowProductsByShowId()`
 * @returns Flattened product array matching LiveShow.jsx expectations
 *
 * This adapter:
 * - Flattens nested `sp.product` fields to top level
 * - Injects show-level fields (box_number, is_featured, is_givi)
 * - Aliases `images` → `image_urls` for backwards compatibility
 * - Filters out entries with missing product data
 * - Does NOT mutate input array
 */
export function adaptShowProductsForBuyer(
  showProductsRaw: RawShowProduct[]
): AdaptedBuyerProduct[] {
  if (!Array.isArray(showProductsRaw)) {
    return [];
  }

  return showProductsRaw
    .map((sp): AdaptedBuyerProduct | null => {
      // Skip if product data is missing
      if (!sp.product || !sp.product.id) {
        return null;
      }

      const product = sp.product;

      return {
        // Core product fields (flattened from nested product)
        id: product.id,
        title: product.title,
        description: product.description,
        price: product.price,
        original_price: product.original_price,
        quantity: product.quantity,
        quantity_sold: product.quantity_sold,
        category: product.category,
        status: product.status,
        givi_type: product.givi_type,

        // Show-level state (from show_products row)
        show_product_id: sp.id,
        box_number: sp.box_number,
        is_featured: sp.is_featured,
        is_givi: sp.is_givi,

        // Canonical: prefer image_urls, fallback to legacy images
        image_urls: Array.isArray(product.image_urls)
          ? product.image_urls
          : (Array.isArray(product.images) ? product.images : []),
      };
    })
    .filter((p): p is AdaptedBuyerProduct => p !== null);
}




