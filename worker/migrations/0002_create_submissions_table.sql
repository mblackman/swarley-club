-- Photo/art submissions. Nothing is public until status = 'approved'.
CREATE TABLE submissions (
    id          TEXT PRIMARY KEY,        -- crypto.randomUUID()
    r2_key      TEXT NOT NULL,           -- object key in the R2 bucket
    filename    TEXT,                    -- original filename (best-effort)
    submitter   TEXT,                    -- optional name to credit
    caption     TEXT,                    -- optional caption / memory
    mime        TEXT NOT NULL,
    size        INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at  INTEGER NOT NULL,        -- Date.now()
    reviewed_at INTEGER
);

CREATE INDEX idx_submissions_status ON submissions (status, created_at);
