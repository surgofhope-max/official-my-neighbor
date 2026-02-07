/**
 * Show Storage API
 * 
 * Handles file uploads for show-related assets (thumbnails, previews).
 * Uses Supabase Storage with the 'shows' bucket.
 * 
 * PHASE S1: Image-only thumbnail upload
 */

import { supabase } from "@/lib/supabase/supabaseClient";

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const SHOWS_BUCKET = "shows";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

export const MAX_VIDEO_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface UploadShowThumbnailInput {
  showId?: string; // Optional - if not provided, generates a unique path
  file: File;
}

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function validateImageFile(file: File): { valid: boolean; error?: string } {
  // Validate file type
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type: ${file.type}. Allowed: JPEG, PNG, WebP`,
    };
  }

  // Validate file size
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File too large: ${sizeMB}MB. Maximum: 5MB`,
    };
  }

  return { valid: true };
}

/**
 * Generate a unique ID for file paths
 */
function generateUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UPLOAD FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Upload a thumbnail image for a show.
 * 
 * - Validates file type (JPEG, PNG, WebP)
 * - Validates file size (≤ 5MB)
 * - Uploads to: shows/{showId}/thumbnail.{ext} OR shows/pending/{uniqueId}.{ext}
 * - Uses upsert (overwrites existing)
 * - Returns public URL
 * 
 * @param input.showId - The show's UUID (optional - if not provided, uses pending folder)
 * @param input.file - The image file to upload
 * @returns Promise with success status and URL or error
 */
export async function uploadShowThumbnail(
  input: UploadShowThumbnailInput
): Promise<UploadResult> {
  const { showId, file } = input;

  if (!file) {
    return { success: false, error: "File is required" };
  }

  // Validate file
  const validation = validateImageFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    // Determine file extension from type
    const ext = file.type === "image/png" ? "png" 
              : file.type === "image/webp" ? "webp" 
              : "jpg";
    
    // ═══════════════════════════════════════════════════════════════════════════
    // TEMP RLS TEST: Using flat path like BuyerProfile to test if nested paths cause RLS failure
    // Original: `${showId}/thumbnail.${ext}` or `pending/${generateUniqueId()}.${ext}`
    // ═══════════════════════════════════════════════════════════════════════════
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const session = sessionData?.session;
    const userId = session?.user?.id;
    
    if (!userId) {
      console.error("[showStorage] No authenticated user for upload");
      return { success: false, error: "Authentication required for upload" };
    }
    
    // TEMP: Flat path matching BuyerProfile pattern: {userId}-{timestamp}.{ext}
    const filePath = `${userId}-${Date.now()}.${ext}`;

    console.log(`[showStorage] Uploading thumbnail to: ${SHOWS_BUCKET}/${filePath}`);
    console.log("[SHOW_UPLOAD_DEBUG] session exists:", !!session);
    console.log("[SHOW_UPLOAD_DEBUG] user id:", userId);
    console.log("[SHOW_UPLOAD_DEBUG] bucket:", SHOWS_BUCKET, "path:", filePath);
    // ═══════════════════════════════════════════════════════════════════════════

    // Upload with upsert (overwrite if exists)
    const { data, error: uploadError } = await supabase.storage
      .from(SHOWS_BUCKET)
      .upload(filePath, file, {
        upsert: true,
        contentType: file.type,
      });

    if (uploadError) {
      console.error("[showStorage] Upload error:", uploadError.message);
      return { success: false, error: uploadError.message };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(SHOWS_BUCKET)
      .getPublicUrl(filePath);

    if (!urlData?.publicUrl) {
      return { success: false, error: "Failed to get public URL" };
    }

    console.log(`[showStorage] Upload successful: ${urlData.publicUrl}`);

    return {
      success: true,
      url: urlData.publicUrl,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[showStorage] Unexpected error:", errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Delete a show's thumbnail from storage.
 * 
 * @param showId - The show's UUID
 * @returns Promise with success status
 */
export async function deleteShowThumbnail(showId: string): Promise<{ success: boolean; error?: string }> {
  if (!showId) {
    return { success: false, error: "Show ID is required" };
  }

  try {
    // Try to delete all possible extensions
    const extensions = ["jpg", "png", "webp"];
    const paths = extensions.map(ext => `${showId}/thumbnail.${ext}`);

    const { error } = await supabase.storage
      .from(SHOWS_BUCKET)
      .remove(paths);

    if (error) {
      console.error("[showStorage] Delete error:", error.message);
      return { success: false, error: error.message };
    }

    console.log(`[showStorage] Deleted thumbnails for show: ${showId}`);
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[showStorage] Delete unexpected error:", errorMessage);
    return { success: false, error: errorMessage };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIDEO UPLOAD FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sanitize filename to safe characters only
 */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .substring(0, 64);
}

/**
 * Upload a preview video for a show.
 * 
 * - Validates file type (MP4, WebM, QuickTime)
 * - Validates file size (≤ 25MB)
 * - Uploads to: shows/{userId}-{timestamp}-{safeName}
 * - Uses upsert (overwrites existing)
 * - Returns public URL
 * 
 * @param params.file - The video file to upload
 * @param params.userId - Optional user ID override (defaults to session user)
 * @returns Promise with public URL string
 * @throws Error if validation fails or upload fails
 */
export async function uploadShowPreviewVideo(
  params: { file: File; userId?: string }
): Promise<string> {
  const { file, userId: paramUserId } = params;

  // Validate file exists
  if (!file) {
    throw new Error("File is required");
  }

  // Validate file size
  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    throw new Error(`File too large: ${sizeMB}MB. Maximum: 25MB`);
  }

  // Validate file type
  if (!ALLOWED_VIDEO_MIME_TYPES.includes(file.type)) {
    throw new Error(`Invalid file type: ${file.type}. Allowed: MP4, WebM, QuickTime`);
  }

  // Auth check
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(`Auth error: ${sessionError.message}`);
  }
  
  const session = sessionData?.session;
  if (!session) {
    throw new Error("Not authenticated");
  }

  // Determine effective user ID
  const effectiveUserId = paramUserId ?? session.user.id;

  // Build safe path
  const safeName = sanitizeFileName(file.name);
  const filePath = `${effectiveUserId}-${Date.now()}-${safeName}`;

  console.log(`[showStorage] Uploading preview video to: ${SHOWS_BUCKET}/${filePath}`);

  // Upload with upsert
  const { error: uploadError } = await supabase.storage
    .from(SHOWS_BUCKET)
    .upload(filePath, file, {
      upsert: true,
      contentType: file.type,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  // Get public URL
  const { data: pub } = supabase.storage
    .from(SHOWS_BUCKET)
    .getPublicUrl(filePath);

  if (!pub?.publicUrl) {
    throw new Error("Failed to get public URL");
  }

  console.log(`[showStorage] Video upload successful: ${pub.publicUrl}`);

  return pub.publicUrl;
}

