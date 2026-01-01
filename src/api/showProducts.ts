/**
 * Show Products API
 *
 * Manages the link between products and live shows.
 * The show_products table holds live show state (box_number, is_featured, is_givi).
 */

import { supabase } from "@/lib/supabase/supabaseClient";

export interface ShowProduct {
  id: string;
  show_id: string;
  product_id: string;
  seller_id: string;
  box_number: number;
  is_featured: boolean;
  is_givi: boolean;
  created_at?: string;
  updated_at?: string;
  // Joined product data
  product?: {
    id: string;
    title: string;
    description?: string;
    price: number;
    original_price?: number;
    quantity: number;
    quantity_sold?: number;
    images?: any[] | null;
    category?: string;
    status: string;
    givi_type?: string;
  };
}

export interface CreateShowProductInput {
  show_id: string;
  product_id: string;
  seller_id: string;
  box_number?: number;
  is_featured?: boolean;
  is_givi?: boolean;
}

/**
 * Get all show_products for a specific show, joined with product data.
 *
 * @param showId - The show ID to filter by
 * @returns Array of show_products with joined product data, sorted by box_number
 */
export async function getShowProductsByShowId(
  showId: string | null
): Promise<ShowProduct[]> {
  if (!showId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("show_products")
      .select(`
        *,
        product:products (
          id,
          title,
          description,
          price,
          original_price,
          quantity,
          quantity_sold,
          image_urls,
          category,
          status,
          givi_type
        )
      `)
      .eq("show_id", showId)
      .order("box_number", { ascending: true });

    if (error) {
      console.warn("Failed to fetch show_products:", error.message);
      return [];
    }

    return (data as ShowProduct[]) ?? [];
  } catch (err) {
    console.warn("Unexpected error fetching show_products:", err);
    return [];
  }
}

/**
 * Get the next available box_number for a show.
 *
 * @param showId - The show ID
 * @returns Next box number (max + 1, or 1 if none exist)
 */
export async function getNextBoxNumber(showId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("show_products")
      .select("box_number")
      .eq("show_id", showId)
      .order("box_number", { ascending: false })
      .limit(1);

    if (error) {
      console.warn("Failed to get max box_number:", error.message);
      return 1;
    }

    if (data && data.length > 0 && data[0].box_number) {
      return data[0].box_number + 1;
    }

    return 1;
  } catch (err) {
    console.warn("Unexpected error getting next box_number:", err);
    return 1;
  }
}

/**
 * Create a new show_product link.
 *
 * @param input - The show_product data to create
 * @returns The created show_product, or null on error
 */
export async function createShowProduct(
  input: CreateShowProductInput
): Promise<ShowProduct | null> {
  try {
    // Auto-assign box_number if not provided
    let boxNumber = input.box_number;
    if (!boxNumber) {
      boxNumber = await getNextBoxNumber(input.show_id);
    }

    const { data, error } = await supabase
      .from("show_products")
      .insert({
        show_id: input.show_id,
        product_id: input.product_id,
        seller_id: input.seller_id,
        box_number: boxNumber,
        is_featured: input.is_featured ?? false,
        is_givi: input.is_givi ?? false,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create show_product:", error.message);
      return null;
    }

    return data as ShowProduct;
  } catch (err) {
    console.error("Unexpected error creating show_product:", err);
    return null;
  }
}

/**
 * Update an existing show_product.
 *
 * @param id - The show_product ID to update
 * @param updates - Partial fields to update
 * @returns The updated show_product, or null on error
 */
export async function updateShowProduct(
  id: string | null,
  updates: Partial<Pick<ShowProduct, "box_number" | "is_featured" | "is_givi">>
): Promise<ShowProduct | null> {
  if (!id) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("show_products")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Failed to update show_product:", error.message);
      return null;
    }

    return data as ShowProduct;
  } catch (err) {
    console.error("Unexpected error updating show_product:", err);
    return null;
  }
}

/**
 * Update show_product by show_id and product_id.
 *
 * @param showId - The show ID
 * @param productId - The product ID
 * @param updates - Partial fields to update
 * @returns The updated show_product, or null on error
 */
export async function updateShowProductByIds(
  showId: string,
  productId: string,
  updates: Partial<Pick<ShowProduct, "box_number" | "is_featured" | "is_givi">>
): Promise<ShowProduct | null> {
  try {
    const { data, error } = await supabase
      .from("show_products")
      .update(updates)
      .eq("show_id", showId)
      .eq("product_id", productId)
      .select()
      .single();

    if (error) {
      console.error("Failed to update show_product by IDs:", error.message);
      return null;
    }

    return data as ShowProduct;
  } catch (err) {
    console.error("Unexpected error updating show_product by IDs:", err);
    return null;
  }
}

/**
 * Clear featured flag on all show_products for a show.
 *
 * @param showId - The show ID
 * @returns true if successful, false otherwise
 */
export async function clearFeaturedForShow(showId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("show_products")
      .update({ is_featured: false })
      .eq("show_id", showId)
      .eq("is_featured", true);

    if (error) {
      console.error("Failed to clear featured:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Unexpected error clearing featured:", err);
    return false;
  }
}

/**
 * Delete a show_product link.
 *
 * @param id - The show_product ID to delete
 * @returns true if deleted successfully, false otherwise
 */
export async function deleteShowProduct(id: string | null): Promise<boolean> {
  if (!id) {
    return false;
  }

  try {
    const { error } = await supabase
      .from("show_products")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Failed to delete show_product:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Unexpected error deleting show_product:", err);
    return false;
  }
}

/**
 * Delete show_product by show_id and product_id.
 *
 * @param showId - The show ID
 * @param productId - The product ID
 * @returns true if deleted successfully, false otherwise
 */
export async function deleteShowProductByIds(
  showId: string,
  productId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("show_products")
      .delete()
      .eq("show_id", showId)
      .eq("product_id", productId);

    if (error) {
      console.error("Failed to delete show_product by IDs:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Unexpected error deleting show_product by IDs:", err);
    return false;
  }
}

