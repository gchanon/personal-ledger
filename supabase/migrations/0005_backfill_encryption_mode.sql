-- Backfill for 0004, which added encryption_mode as nullable and left existing
-- ledgers on NULL. NULL makes sync bail out before it pulls, so every ledger
-- that predated the column silently stopped syncing the moment 0004 shipped —
-- the data was intact on the server and simply never fetched.
--
-- 'plaintext' is the truthful value for those rows: their content columns are
-- readable and no payload was ever written. Owners can switch to e2ee in
-- settings, which rewrites every row.

update ledgers set encryption_mode = 'plaintext' where encryption_mode is null;
