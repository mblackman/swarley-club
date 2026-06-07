-- Mark who added each image: 'owner' (admin upload, auto-approved) vs
-- 'community' (public submission). Lets the gallery split owner-curated
-- "favorite" photos from photos shared by everyone else. Existing rows default
-- to 'community'; the owner-upload route sets 'owner' explicitly.
ALTER TABLE submissions
  ADD COLUMN source TEXT NOT NULL DEFAULT 'community'
    CHECK (source IN ('owner', 'community'));
