/**
 * A uuid computed from a seed rather than generated. The same seed always lands
 * on the same row, which is what lets a generator run repeatedly (or on two
 * devices) without producing duplicates — and a tombstone keeps occupying the
 * id, so a row the user deleted doesn't come back.
 */
export async function derivedId(seed: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  const bytes = new Uint8Array(digest).slice(0, 16);

  // Stamp version 8 (custom) and the RFC 4122 variant so Postgres accepts it
  // as a uuid rather than rejecting 16 arbitrary bytes.
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
