const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CHAIN_FILE = path.join(__dirname, 'blocks.json');
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const GENESIS_PREV_HASH = '0'.repeat(64);

function computeBlockHash(block) {
  return sha256(`${block.index}|${block.timestamp}|${block.merkleRoot}|${block.prevHash}`);
}

function loadChain() {
  if (!fs.existsSync(CHAIN_FILE)) return [];
  try {
    const raw = fs.readFileSync(CHAIN_FILE, 'utf8').trim();
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('[CHAIN] Failed to read blocks.json, starting a fresh chain:', err.message);
    return [];
  }
}

function saveChain(chain) {
  fs.writeFileSync(CHAIN_FILE, JSON.stringify(chain, null, 2), 'utf8');
}

/**
 * Appends a new block only when the registry's Merkle root has actually
 * changed since the last recorded block. This is what ties block creation
 * to "the registry changed" (a certificate was added/removed/renamed),
 * rather than to every verification request.
 */
function appendBlockIfChanged(merkleRoot, chain = loadChain()) {
  const last = chain[chain.length - 1] || null;
  if (last && last.merkleRoot === merkleRoot) {
    return { chain, block: last, appended: false };
  }

  const block = {
    index: chain.length,
    timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }),
    merkleRoot,
    prevHash: last ? last.hash : GENESIS_PREV_HASH
  };
  block.hash = computeBlockHash(block);

  const updated = [...chain, block];
  saveChain(updated);
  return { chain: updated, block, appended: true };
}

/**
 * Walks the whole chain and confirms every block's stored hash matches a
 * fresh recomputation, and every block's prevHash actually matches the
 * previous block's hash. This is the chain's own tamper-evidence check --
 * separate from, and in addition to, the certificate-level Merkle proof.
 */
function verifyChainIntegrity(chain = loadChain()) {
  for (let i = 0; i < chain.length; i++) {
    const block = chain[i];
    const expectedHash = computeBlockHash(block);

    if (block.hash !== expectedHash) {
      return { valid: false, brokenAt: i, reason: `Block ${i}'s hash does not match its recomputed hash -- its contents were altered.` };
    }
    if (i === 0 && block.prevHash !== GENESIS_PREV_HASH) {
      return { valid: false, brokenAt: 0, reason: 'Genesis block prevHash is not the expected zero-hash.' };
    }
    if (i > 0 && block.prevHash !== chain[i - 1].hash) {
      return { valid: false, brokenAt: i, reason: `Block ${i}'s prevHash does not match block ${i - 1}'s actual hash -- the chain link is broken.` };
    }
  }
  return { valid: true, brokenAt: null, reason: null };
}

module.exports = { loadChain, saveChain, appendBlockIfChanged, verifyChainIntegrity, computeBlockHash };
