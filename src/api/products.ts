/**
 * Products API
 *
 * Provides queries and mutations for product data.
 */

/*
 * AUDIT: Supabase SQL Editor snippet - check image_urls column data_type.
 * Run in Supabase SQL Editor to verify DB column types for products + inventory_products.
 *
 * SELECT
 *   table_schema,
 *   table_name,
 *   column_name,
 *   data_type,
 *   udt_name
 * FROM information_schema.columns
 * WHERE table_schema = 'public'
 *   AND table_name IN ('products', 'inventory_products')
 *   AND column_name = 'image_urls';
 */

import { supabase } from "@/lib/supabase/supabaseClient";

/** Clamp quantity to 0 or 1 for MVP binary inventory. null/undefined -> undefined; NaN -> 1. */
function clampQty01(n: unknown): number | undefined {
  if (n == null) return undefined;
  const num = typeof n === "number" ? n : Number(n);
  if (Number.isNaN(num)) return 1;
  return num <= 0 ? 0 : 1;
}

export interface Product {
  id: string;
  seller_id: string;
  show_id?: string;
  title: string;
  description?: string;
  price: number;
  original_price?: number;
  quantity: number;
  quantity_sold?: number;
  images?: any[] | null;
  category?: string;
  status: "active" | "sold_out" | "hidden" | "deleted";
  givi_type?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Get all products for a specific show.
 *
 * @param showId - The show ID to filter by
 * @returns Array of products for the show, sorted by created_at
 *
 * This function:
 * - Never throws
 * - Returns [] for null showId
 * - Returns [] on any error
 */
export async function getProductsByShowId(
  showId: string | null
): Promise<Product[]> {
  if (!showId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("show_id", showId)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("Failed to fetch products by show ID:", error.message);
      return [];
    }

    return (data as Product[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching products by show:", err);
    return [];
  }
}

/**
 * Get all products for a specific seller (show-aware).
 *
 * @param sellerId - The seller ID to filter by
 * @returns Array of products for the seller, sorted by created_at DESC
 *
 * This function:
 * - Never throws
 * - Returns [] for null sellerId
 * - Returns [] on any error
 * - Excludes products from ended/cancelled/completed shows
 */
export async function getProductsBySellerId(
  sellerId: string | null
): Promise<Product[]> {
  if (!sellerId) return [];

  try {
    const { data, error } = await supabase
      .from("products")
      .select(`
        *,
        show:shows (
          id,
          status
        )
      `)
      .eq("seller_id", sellerId)
      .not("show.status", "in", '("ended","cancelled","completed")')
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getProductsBySellerId] error:", error.message);
      return [];
    }

    // Strip joined show object before returning (preserve Product shape)
    return (data || []).map(({ show, ...product }) => product as Product);
  } catch (err) {
    console.warn("Unexpected error fetching products by seller:", err);
    return [];
  }
}

/**
 * Get a single product by ID.
 *
 * @param productId - The product ID to look up
 * @returns The product if found, null otherwise
 *
 * This function:
 * - Never throws
 * - Returns null for null productId
 * - Returns null on any error
 */
export async function getProductById(
  productId: string | null
): Promise<Product | null> {
  if (!productId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .maybeSingle();

    if (error) {
      console.warn("Failed to fetch product by ID:", error.message);
      return null;
    }

    return data as Product | null;
  } catch (err) {
    console.warn("Unexpected error fetching product:", err);
    return null;
  }
}

/**
 * Get all products (for admin/reference purposes).
 *
 * @returns Array of all products
 *
 * This function:
 * - Never throws
 * - Returns [] on any error
 */
export async function getAllProducts(): Promise<Product[]> {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Failed to fetch all products:", error.message);
      return [];
    }

    return (data as Product[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching all products:", err);
    return [];
  }
}

/**
 * Get active products for a show (not sold out or hidden).
 *
 * @param showId - The show ID to filter by
 * @returns Array of active products for the show
 *
 * This function:
 * - Never throws
 * - Returns [] for null showId
 * - Returns [] on any error
 */
export async function getActiveProductsByShowId(
  showId: string | null
): Promise<Product[]> {
  if (!showId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("show_id", showId)
      .eq("status", "active")
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("Failed to fetch active products by show ID:", error.message);
      return [];
    }

    return (data as Product[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching active products:", err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// WRITE OPERATIONS
// ─────────────────────────────────────────────────────────────

export interface CreateProductInput {
  seller_id: string;
  show_id?: string;
  title: string;
  description?: string;
  price: number;
  original_price?: number;
  quantity: number;
  image_urls?: string[] | null;
  category?: string;
  givi_type?: string;
  status?: "active" | "sold_out" | "hidden" | "deleted";
}

/**
 * Create a new product.
 *
 * @param input - The product data to create
 * @returns The created product, or null on error
 *
 * This function:
 * - Never throws
 * - Returns null on any error
 */
export async function createProduct(
  input: CreateProductInput
): Promise<Product | null> {
  try {
    if (input.image_urls !== undefined && !Array.isArray(input.image_urls)) {
      console.error("[AUDIT] products.createProduct: input.image_urls is defined and not an array", {
        route: "api/products.createProduct",
        typeofValue: typeof input.image_urls,
        value: input.image_urls,
        stack: new Error().stack,
      });
    }
    const qty = clampQty01(input.quantity) ?? 1;
    const { data, error } = await supabase
      .from("products")
      .insert({
        seller_id: input.seller_id,
        show_id: input.show_id ?? null,
        title: input.title,
        description: input.description ?? null,
        price: input.price,
        original_price: input.original_price ?? null,
        quantity: qty,
        image_urls: input.image_urls ?? [],
        category: input.category ?? null,
        givi_type: input.givi_type ?? null,
        status: input.status ?? "active",
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create product:", error.message);
      return null;
    }

    return data as Product;
  } catch (err) {
    console.error("Unexpected error creating product:", err);
    return null;
  }
}

/**
 * Update an existing product.
 *
 * @param productId - The product ID to update
 * @param updates - Partial product fields to update
 * @returns The updated product, or null on error
 *
 * This function:
 * - Never throws
 * - Returns null for null productId
 * - Returns null on any error
 */
export async function updateProduct(
  productId: string | null,
  updates: Partial<Omit<Product, "id">>
): Promise<Product | null> {
  if (!productId) {
    return null;
  }

  try {
    if ("quantity" in updates) {
      (updates as { quantity?: number }).quantity = clampQty01((updates as { quantity?: unknown }).quantity) ?? 1;
    }
    const { data, error } = await supabase
      .from("products")
      .update(updates)
      .eq("id", productId)
      .select()
      .single();

    if (error) {
      console.error("Failed to update product:", error.message);
      return null;
    }

    return data as Product;
  } catch (err) {
    console.error("Unexpected error updating product:", err);
    return null;
  }
}

/**
 * Delete a product (soft delete by setting status to "deleted").
 *
 * @param productId - The product ID to delete
 * @returns true if deleted successfully, false otherwise
 *
 * This function:
 * - Never throws
 * - Returns false for null productId
 * - Returns false on any error
 */
export async function deleteProduct(productId: string | null): Promise<boolean> {
  if (!productId) {
    return false;
  }

  try {
    const { error } = await supabase
      .from("products")
      .update({ status: "deleted", quantity: 0 })
      .eq("id", productId);

    if (error) {
      console.error("Failed to delete product:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Unexpected error deleting product:", err);
    return false;
  }
}



