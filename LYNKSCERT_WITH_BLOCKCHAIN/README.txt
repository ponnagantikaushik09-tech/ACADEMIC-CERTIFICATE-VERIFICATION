LYNKSCERT - ONE-CLICK TRUSTED CERTIFICATE VERIFICATION

QUICK START
1. Make sure Node.js LTS is installed.
2. Double-click START_LYNKSCERT.bat.
3. Wait a few seconds; the browser opens automatically.
4. Use LYNKSCERT normally.

NO POWERSHELL COMMANDS ARE REQUIRED.
NO npm install IS REQUIRED. The backend uses Node.js built-in modules only.
Do NOT use VS Code Live Server for verification.

ADDING A NEW TRUSTED CERTIFICATE
1. Put the original PDF inside the Certificates folder.
2. Double-click START_LYNKSCERT.bat.
3. On startup and before every verification, the backend rebuilds backend/Certificate_hashes.txt from every PDF in Certificates.
4. Files whose names contain _TAMPERED are excluded.
5. Upload the exact same original PDF through the website. It should show VERIFIED.

STOPPING
Double-click STOP_LYNKSCERT.bat.

VERIFICATION FLOW
Certificates folder -> SHA-256 hashes -> Certificate_hashes.txt -> Merkle root -> Block -> Chain (blocks.json)
Uploaded PDF -> SHA-256 -> compare with trusted hashes -> VERIFIED / REJECTED


AUTOMATIC TRUSTED REGISTRY
---------------------------
When a normal PDF is added to Certificates, the running LYNKSCERT backend automatically rebuilds backend/Certificate_hashes.txt. Files containing _TAMPERED in the filename are excluded. You do not need to run SHA.py manually.


BLOCKCHAIN LAYER (backend/blockchain.js, backend/blocks.json)
----------------------------------------------------------------
Every certificate is still hashed with SHA-256 and folded into a Merkle
tree exactly as before. What's new is that the current Merkle root is now
anchored into an actual chain of blocks:

  block = { index, timestamp, merkleRoot, prevHash, hash }
  hash  = SHA-256(index + timestamp + merkleRoot + prevHash)

- A new block is only appended when the registry's Merkle root actually
  changes -- i.e. when a certificate is added, removed, or renamed in the
  Certificates folder. Verifying a certificate NEVER creates a new block;
  it only checks against the current one. This is what ties block creation
  to "the registry changed," not to every verification request.
- blocks.json is the chain itself. GET /api/chain returns the full chain
  plus a live integrity check (chainValid). That check recomputes every
  block's hash and confirms every block's prevHash actually matches the
  previous block's hash -- if you (or anyone) hand-edit an old block in
  blocks.json, chainValid flips to false and tells you which block broke.
  This is the actual "tamper-proof / immutable" claim, demonstrable live:
  open blocks.json in a text editor, change one character, save, and
  reload /api/chain.
- /api/verify's response now also includes which block the current
  registry state is anchored in (block.index, block.hash, block.prevHash)
  and chainValid, alongside the existing Merkle fields.


KNOWN LIMITATIONS (worth stating plainly in the report, not hiding)
----------------------------------------------------------------------
1. Single-node chain. blocks.json lives on one machine with no
   distributed consensus -- this demonstrates the tamper-evidence
   mechanism a real blockchain relies on, not a decentralized network.
2. Tamper detection still leans on the filename when the hash doesn't
   match anything (see the _TAMPERED / _FORGED / etc. suffix check in
   server.js). A forged certificate that keeps its original filename and
   changes content will correctly show REJECTED; the "REJECTED" case just
   can't always say *which* certificate it was pretending to be. Renaming
   with one of those suffixes (as our own tampered test files do) makes
   that identification work correctly.
3. Certificates are hashed as whole files (SHA-256 over the entire PDF).
   Because our sample certificates are scanned images with no text layer,
   field-level (name/grade-only) hashing isn't in scope here -- any
   byte-level change anywhere in the file is what's actually detected.

AUTHENTICATION (login / OTP) is intentionally NOT included in this
version -- by request, held for a separate pass.
