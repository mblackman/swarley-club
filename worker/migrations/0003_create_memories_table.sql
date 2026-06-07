-- Guestbook "leave a memory" entries. Nothing public until status = 'approved'.
CREATE TABLE memories (
    id          TEXT PRIMARY KEY,        -- crypto.randomUUID()
    author      TEXT,                    -- optional name
    message     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at  INTEGER NOT NULL,        -- Date.now()
    reviewed_at INTEGER
);

CREATE INDEX idx_memories_status ON memories (status, created_at);
