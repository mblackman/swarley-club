-- Tag each image as a 'photo' or 'artwork' so the gallery can separate them
-- later. Existing rows default to 'photo'.
ALTER TABLE submissions
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'photo'
    CHECK (kind IN ('photo', 'artwork'));
