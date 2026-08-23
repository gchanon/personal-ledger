/**
 * End-to-end encryption.
 *
 * Two-level keys. A random 256-bit data key (DEK) encrypts every row; the user's
 * passphrase derives a wrapping key (KEK) that encrypts only the DEK. Changing
 * the passphrase re-wraps 32 bytes instead of re-encrypting the whole ledger,
 * and every device unwraps the same DEK so they can read each other's rows.
 *
 * The server stores the wrapped DEK and the salt. Neither is secret: without the
 * passphrase they are 600k PBKDF2 iterations away from being useful.
 */

const PBKDF2_ITERATIONS = 600_000; // OWASP guidance for PBKDF2-HMAC-SHA256
const SALT_BYTES = 16;
const IV_BYTES = 12; // AES-GCM standard nonce length

export type WrappedKey = {
  salt: string;
  iterations: number;
  wrapped: string;
};

// ─── Encoding ────────────────────────────────────────────────────────────────

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// ─── Keys ────────────────────────────────────────────────────────────────────

async function deriveKek(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

/** Creates a fresh ledger key and returns it alongside its passphrase-wrapped form. */
export async function createDataKey(
  passphrase: string,
): Promise<{ dek: CryptoKey; wrapped: WrappedKey }> {
  const dek = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const kek = await deriveKek(passphrase, salt, PBKDF2_ITERATIONS);

  const wrapped = await crypto.subtle.wrapKey("raw", dek, kek, {
    name: "AES-GCM",
    iv: iv as BufferSource,
  });

  return {
    dek,
    wrapped: {
      salt: toBase64(salt),
      iterations: PBKDF2_ITERATIONS,
      // The IV travels with the ciphertext; it is not secret, only unique.
      wrapped: `${toBase64(iv)}.${toBase64(wrapped)}`,
    },
  };
}

/** Throws when the passphrase is wrong — GCM's auth tag makes that unambiguous. */
export async function unwrapDataKey(
  passphrase: string,
  stored: WrappedKey,
): Promise<CryptoKey> {
  const [ivPart, keyPart] = stored.wrapped.split(".");
  const kek = await deriveKek(passphrase, fromBase64(stored.salt), stored.iterations);

  return crypto.subtle.unwrapKey(
    "raw",
    fromBase64(keyPart) as BufferSource,
    kek,
    { name: "AES-GCM", iv: fromBase64(ivPart) as BufferSource },
    { name: "AES-GCM", length: 256 },
    // Non-extractable: once unwrapped, no script can read the raw bytes back out,
    // including after it is cached in IndexedDB.
    false,
    ["encrypt", "decrypt"],
  );
}

/** Re-wraps the same DEK under a new passphrase. Row ciphertext is untouched. */
export async function rewrapDataKey(
  dek: CryptoKey,
  passphrase: string,
): Promise<WrappedKey> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const kek = await deriveKek(passphrase, salt, PBKDF2_ITERATIONS);

  const wrapped = await crypto.subtle.wrapKey("raw", dek, kek, {
    name: "AES-GCM",
    iv: iv as BufferSource,
  });

  return {
    salt: toBase64(salt),
    iterations: PBKDF2_ITERATIONS,
    wrapped: `${toBase64(iv)}.${toBase64(wrapped)}`,
  };
}

// ─── Payloads ────────────────────────────────────────────────────────────────

/**
 * A fresh IV per call. Reusing one with the same key breaks AES-GCM completely,
 * so this must never be hoisted out or derived from the row.
 */
export async function encryptJson(dek: CryptoKey, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    dek,
    plaintext,
  );

  return `${toBase64(iv)}.${toBase64(ciphertext)}`;
}

export async function decryptJson<T>(dek: CryptoKey, payload: string): Promise<T> {
  const [ivPart, dataPart] = payload.split(".");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivPart) as BufferSource },
    dek,
    fromBase64(dataPart) as BufferSource,
  );

  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
