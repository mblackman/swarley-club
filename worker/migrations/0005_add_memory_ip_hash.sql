-- Store a privacy-preserving hash of the author IP (sha256(ip + salt)) so we can
-- rate-limit guestbook entries per author without keeping raw IPs. Mirrors the
-- submissions ip_hash scheme (migration 0004).
ALTER TABLE memories ADD COLUMN ip_hash TEXT;
CREATE INDEX idx_memories_ip ON memories (ip_hash, created_at);
