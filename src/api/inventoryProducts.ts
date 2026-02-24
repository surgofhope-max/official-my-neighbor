/**
 * Inventory Products API
 *
 * Manages the master inventory library (inventory_products table).
 * Products can be copied to shows via copyInventoryToShow.
 */

import { supabase } from "@/lib/supabase/supabaseClient";
import { createProduct } from "@/api/products";
import { createShowProduct } from "@/api/showProducts";

export interface InventoryProduct {
  id: string;
  seller_id: string;
  title: string;
  description?: string | null;
  price: number;
  image_urls?: string[] | null;
  category?: string | null;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateInventoryProductInput {
  seller_id: string;
  title: string;
  description?: string | null;
  price: number;
  image_urls?: string[] | null;
  category?: string | null;
}

export async function getInventoryBySeller(
  sellerId: string | null
): Promise<InventoryProduct[]> {
  if (!sellerId) return [];

  const { data, error } = await supabase
    .from("inventory_products")
    .select("*")
    .eq("seller_id", sellerId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch inventory: ${error.message}`);
  }

  return (data as InventoryProduct[]) ?? [];
}

export async function createInventoryProduct(
  input: CreateInventoryProductInput
): Promise<InventoryProduct> {
  const { data, error } = await supabase
    .from("inventory_products")
    .insert({
      seller_id: input.seller_id,
      title: input.title,
      description: input.description ?? null,
      price: input.price,
      image_urls: input.image_urls ?? [],
      category: input.category ?? null,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create inventory product: ${error.message}`);
  }

  return data as InventoryProduct;
}

export async function updateInventoryProduct(
  id: string,
  updates: Partial<Omit<InventoryProduct, "id" | "created_at">>
): Promise<InventoryProduct> {
  const { data, error } = await supabase
    .from("inventory_products")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update inventory product: ${error.message}`);
  }

  return data as InventoryProduct;
}

export async function archiveInventoryProduct(id: string): Promise<InventoryProduct> {
  return updateInventoryProduct(id, { status: "archived" });
}

export async function copyInventoryToShow(
  inventoryId: string,
  showId: string,
  sellerId: string
): Promise<string> {
  const { data: inventory, error: fetchError } = await supabase
    .from("inventory_products")
    .select("*")
    .eq("id", inventoryId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to fetch inventory product: ${fetchError.message}`);
  }

  if (!inventory) {
    throw new Error("Inventory product not found");
  }

  if (inventory.seller_id !== sellerId) {
    throw new Error("Seller mismatch: inventory does not belong to this seller");
  }

  const newProduct = await createProduct({
    seller_id: sellerId,
    title: inventory.title,
    description: inventory.description ?? null,
    price: inventory.price,
    quantity: 0,
    image_urls: inventory.image_urls ?? [],
    category: inventory.category ?? null,
    status: "active",
  });

  if (!newProduct) {
    throw new Error("Failed to create product from inventory");
  }

  const showProduct = await createShowProduct({
    show_id: showId,
    product_id: newProduct.id,
    seller_id: sellerId,
    is_featured: false,
    is_givi: false,
  });

  if (!showProduct) {
    throw new Error("Failed to link product to show");
  }

  return newProduct.id;
}
