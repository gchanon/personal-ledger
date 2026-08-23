-- Per-ledger choice: encrypt content end-to-end, or keep it readable.
--
-- The trade the user is actually making is privacy against recoverability —
-- encrypted means the project owner cannot read it, and also that a forgotten
-- passphrase is unrecoverable. NULL means the user has not been asked yet.

alter table ledgers add column encryption_mode text
  check (encryption_mode in ('e2ee', 'plaintext'));

comment on column ledgers.encryption_mode is
  'e2ee = content lives in payload as AES-GCM ciphertext; plaintext = content '
  'stays in its own columns and is readable by the project owner. NULL = not '
  'yet chosen, the client asks on next open.';
