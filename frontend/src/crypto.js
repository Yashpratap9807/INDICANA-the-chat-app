/**
 * INDICANA Crypto Module
 *
 * All cryptographic operations happen here — on the client only.
 * Uses TweetNaCl: X25519 key exchange + XSalsa20-Poly1305 AEAD (nacl.box).
 *
 * Loaded via CDN in index.html:
 *   - nacl (tweetnacl)
 *   - naclUtil (tweetnacl-util)
 */

const Crypto = (() => {
  /**
   * Generate a fresh X25519 key pair.
   * Returns Base64-encoded strings suitable for storage and API calls.
   */
  function generateKeyPair() {
    const kp = nacl.box.keyPair();
    return {
      publicKey: nacl.util.encodeBase64(kp.publicKey),
      secretKey: nacl.util.encodeBase64(kp.secretKey),
    };
  }

  /**
   * Encrypt a plaintext string for a specific recipient.
   *
   * @param {string} plaintext       — the message to encrypt
   * @param {string} theirPublicKey  — recipient's Base64 X25519 public key
   * @param {string} mySecretKey     — sender's Base64 X25519 secret key
   * @returns {{ ciphertext: string, nonce: string }} — both Base64-encoded
   */
  function encryptMessage(plaintext, theirPublicKey, mySecretKey) {
    const messageBytes = nacl.util.decodeUTF8(plaintext);
    const nonce = nacl.randomBytes(nacl.box.nonceLength); // 24 bytes
    const theirPKBytes = nacl.util.decodeBase64(theirPublicKey);
    const mySkBytes = nacl.util.decodeBase64(mySecretKey);

    const ciphertextBytes = nacl.box(messageBytes, nonce, theirPKBytes, mySkBytes);
    if (!ciphertextBytes) {
      throw new Error('Encryption failed');
    }

    return {
      ciphertext: nacl.util.encodeBase64(ciphertextBytes),
      nonce: nacl.util.encodeBase64(nonce),
    };
  }

  /**
   * Decrypt a ciphertext received from a specific sender.
   *
   * @param {string} ciphertext     — Base64-encoded ciphertext
   * @param {string} nonce          — Base64-encoded 24-byte nonce
   * @param {string} theirPublicKey — sender's Base64 X25519 public key
   * @param {string} mySecretKey    — recipient's Base64 X25519 secret key
   * @returns {string} plaintext, or null if authentication/decryption fails
   */
  function decryptMessage(ciphertext, nonce, theirPublicKey, mySecretKey) {
    const ciphertextBytes = nacl.util.decodeBase64(ciphertext);
    const nonceBytes = nacl.util.decodeBase64(nonce);
    const theirPKBytes = nacl.util.decodeBase64(theirPublicKey);
    const mySkBytes = nacl.util.decodeBase64(mySecretKey);

    const plaintextBytes = nacl.box.open(ciphertextBytes, nonceBytes, theirPKBytes, mySkBytes);
    if (!plaintextBytes) {
      return null; // Authentication tag mismatch — message tampered or wrong keys
    }

    return nacl.util.encodeUTF8(plaintextBytes);
  }

  return { generateKeyPair, encryptMessage, decryptMessage };
})();
