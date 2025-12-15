/**
 * Products API
 *
 * Provides read-only queries for product data.
 */

import { supabase } from "@/lib/supabase/supabaseClient";

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
  image_url?: string;
  images?: string[];
  category?: string;
  box_number?: number;
  status: "active" | "sold_out" | "hidden" | "deleted";
  is_givi?: boolean;
  givi_type?: string;
  created_date?: string;
  updated_date?: string;
}

/**
 * Get all products for a specific show.
 *
 * @param showId - The show ID to filter by
 * @returns Array of products for the show, sorted by box_number
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
      .order("box_number", { ascending: true });

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
 * Get all products for a specific seller.
 *
 * @param sellerId - The seller ID to filter by
 * @returns Array of products for the seller, sorted by created_date DESC
 *
 * This function:
 * - Never throws
 * - Returns [] for null sellerId
 * - Returns [] on any error
 */
export async function getProductsBySellerId(
  sellerId: string | null
): Promise<Product[]> {
  if (!sellerId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("seller_id", sellerId)
      .order("created_date", { ascending: false });

    if (error) {
      console.warn("Failed to fetch products by seller ID:", error.message);
      return [];
    }

    return (data as Product[]) ?? [];
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
      .order("created_date", { ascending: false });

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
      .order("box_number", { ascending: true });

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







