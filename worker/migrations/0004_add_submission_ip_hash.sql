-- Store a privacy-preserving hash of the uploader IP (sha256(ip + salt)) so we
-- can rate-limit per uploader without keeping raw IPs.
ALTER TABLE submissions ADD COLUMN ip_hash TEXT;
CREATE INDEX idx_submissions_ip ON submissions (ip_hash, created_at);
