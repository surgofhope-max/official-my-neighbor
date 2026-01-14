-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE S1: Create shows storage bucket for thumbnails and previews
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create the shows bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shows',
  'shows',
  true,  -- Public read access
  5242880,  -- 5MB max file size
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

-- ═══════════════════════════════════════════════════════════════════════════════
-- Storage RLS Policies
-- ═══════════════════════════════════════════════════════════════════════════════

-- Allow public read access to all files in the shows bucket
CREATE POLICY "Public read access for shows bucket"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'shows');

-- Allow authenticated users to upload files
-- Sellers can upload to their show folders or the pending folder
CREATE POLICY "Authenticated users can upload to shows bucket"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'shows'
  AND (
    -- Allow uploads to pending folder (for new shows)
    name LIKE 'pending/%'
    OR
    -- Allow uploads to show folders (seller must own the show)
    EXISTS (
      SELECT 1 FROM public.shows s
      INNER JOIN public.sellers sel ON sel.id = s.seller_id
      WHERE 
        sel.user_id = auth.uid()
        AND split_part(name, '/', 1) = s.id::text
    )
  )
);

-- Allow sellers to update (upsert) their own show files
CREATE POLICY "Sellers can update their show files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'shows'
  AND (
    name LIKE 'pending/%'
    OR
    EXISTS (
      SELECT 1 FROM public.shows s
      INNER JOIN public.sellers sel ON sel.id = s.seller_id
      WHERE 
        sel.user_id = auth.uid()
        AND split_part(name, '/', 1) = s.id::text
    )
  )
);

-- Allow sellers to delete their own show files
CREATE POLICY "Sellers can delete their show files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'shows'
  AND (
    name LIKE 'pending/%'
    OR
    EXISTS (
      SELECT 1 FROM public.shows s
      INNER JOIN public.sellers sel ON sel.id = s.seller_id
      WHERE 
        sel.user_id = auth.uid()
        AND split_part(name, '/', 1) = s.id::text
    )
  )
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Comments
-- ═══════════════════════════════════════════════════════════════════════════════
COMMENT ON POLICY "Public read access for shows bucket" ON storage.objects IS 
  'Anyone can view show thumbnails and previews';

COMMENT ON POLICY "Authenticated users can upload to shows bucket" ON storage.objects IS 
  'Sellers can upload to pending folder or their own show folders';

COMMENT ON POLICY "Sellers can update their show files" ON storage.objects IS 
  'Sellers can upsert files in pending folder or their own show folders';

COMMENT ON POLICY "Sellers can delete their show files" ON storage.objects IS 
  'Sellers can delete files from pending folder or their own show folders';
















