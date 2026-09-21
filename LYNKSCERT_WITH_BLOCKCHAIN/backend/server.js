const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { appendBlockIfChanged, verifyChainIntegrity, loadChain } = require('./blockchain');

const PORT = 3000;
const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
const CERT_DIR = path.join(ROOT, 'Certificates');
const HASH_FILE = path.join(__dirname, 'Certificate_hashes.txt');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');


function syncCertificateRegistry() {
  const pdfFiles = fs.readdirSync(CERT_DIR)
    .filter(name => name.toLowerCase().endsWith('.pdf'))
    .filter(name => !name.toUpperCase().includes('_TAMPERED'))
    .sort((a, b) => a.localeCompare(b));

  const entries = pdfFiles.map(name => {
    const data = fs.readFileSync(path.join(CERT_DIR, name));
    return `${path.basename(name, path.extname(name))}|${sha256(data)}`;
  });

  fs.writeFileSync(HASH_FILE, entries.length ? entries.join('\n') + '\n' : '', 'utf8');
  return entries.length;
}

function loadCertificates() {
  if (!fs.existsSync(HASH_FILE)) throw new Error('Certificate_hashes.txt not found.');
  return fs.readFileSync(HASH_FILE, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [name, hash] = line.split('|').map(v => v.trim());
      return { name, hash: (hash || '').toLowerCase() };
    })
    .filter(c => c.name && /^[a-f0-9]{64}$/.test(c.hash));
}

function merkleRoot(hashes) {
  if (!hashes.length) return null;
  let level = hashes.map(h => h.toLowerCase());
  while (level.length > 1) {
    if (level.length % 2 !== 0) level.push(level[level.length - 1]);
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(sha256(level[i] + level[i + 1]));
    }
    level = next;
  }
  return level[0];
}

function send(res, status, data, contentType = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
}

function getUploadedFileName(req) {
  return decodeURIComponent((req.headers['x-certificate-name'] || 'certificate.pdf').replace(/\+/g, ' '));
}

function serveStatic(req, res) {
  let requestPath = decodeURIComponent(req.url.split('?')[0]);
  if (requestPath === '/') requestPath = '/index.html';
  const filePath = path.normalize(path.join(FRONTEND, requestPath));
  if (!filePath.startsWith(FRONTEND)) return send(res, 403, { error: 'Forbidden' });
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return send(res, 404, { error: 'Not found' });

  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml'
  };
  res.writeHead(200, {
    'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  fs.createReadStream(filePath).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > MAX_FILE_SIZE + 1024 * 1024) {
        reject(Object.assign(new Error('File is too large. Maximum size is 10MB.'), { code: 'LIMIT_FILE_SIZE' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  try {
    if (req.method === 'GET' && req.url === '/api/health') {
      return send(res, 200, { ok: true, service: 'LYNKSCERT backend' });
    }

    if (req.method === 'GET' && req.url === '/api/chain') {
      const chain = loadChain();
      const integrity = verifyChainIntegrity(chain);
      return send(res, 200, { ok: true, length: chain.length, chainValid: integrity.valid, brokenAt: integrity.brokenAt, reason: integrity.reason, chain });
    }

    if (req.method === 'POST' && req.url === '/api/verify') {
      const contentType = (req.headers['content-type'] || '').toLowerCase();
      const filename = getUploadedFileName(req);
      if (!contentType.includes('application/pdf') && !filename.toLowerCase().endsWith('.pdf')) {
        return send(res, 400, { ok: false, error: 'Please upload a PDF certificate.' });
      }

      // Receive the PDF as raw bytes. This avoids browser multipart parsing issues.
      const data = await readBody(req);
      if (data.length > MAX_FILE_SIZE) return send(res, 413, { ok: false, error: 'File is too large. Maximum size is 10MB.' });

      // Keep the trusted registry synchronized with the Certificates folder.
      syncCertificateRegistry();
      const uploadedHash = sha256(data);
      const certificates = loadCertificates();
      const match = certificates.find(c => c.hash === uploadedHash);

      // Resolve the trusted/original certificate hash from the submitted
      // filename when possible. This lets the UI show both fingerprints
      // even when the submitted PDF is a renamed/tampered copy.
      const normalizedName = path.basename(filename, path.extname(filename))
        .replace(/(?:_TAMPERED|_FORGED|_FAKE|_TEST|_EDITED|_MODIFIED|_ALTERED)(?:[_-].*)?$/i, '');
      const original = certificates.find(c =>
        c.name.toLowerCase() === normalizedName.toLowerCase() ||
        c.name.toLowerCase().startsWith(normalizedName.toLowerCase() + '_')
      );
      const originalHash = (match || original)?.hash || null;
      const root = merkleRoot(certificates.map(c => c.hash));

      // Anchor the current registry state (its Merkle root) into the chain.
      // This only creates a new block when the root has actually changed
      // since the last one -- verifying a certificate never mutates the chain.
      const { block } = appendBlockIfChanged(root);
      const integrity = verifyChainIntegrity();

      return send(res, 200, {
        ok: true,
        verified: Boolean(match),
        certificate: match ? match.name : (original ? original.name : null),
        uploadedHash,
        originalHash,
        merkleRoot: root,
        block: block ? { index: block.index, hash: block.hash, prevHash: block.prevHash, timestamp: block.timestamp } : null,
        chainLength: loadChain().length,
        chainValid: integrity.valid
      });
    }

    if (req.method === 'GET') return serveStatic(req, res);
    return send(res, 404, { ok: false, error: 'Not found.' });
  } catch (err) {
    console.error(err);
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 500;
    return send(res, status, { ok: false, error: err.message || 'Verification failed.' });
  }
});

function anchorRegistryState(context) {
  const certs = loadCertificates();
  const root = merkleRoot(certs.map(c => c.hash));
  const { appended, block } = appendBlockIfChanged(root);
  if (appended) {
    console.log(`[CHAIN] New block #${block.index} anchored (${context}) for ${certs.length} certificate(s). root=${root ? root.slice(0, 12) + '...' : 'null'}`);
  } else {
    console.log(`[CHAIN] Registry state unchanged (${context}) -- still anchored in block #${block ? block.index : '?'}.`);
  }
}

syncCertificateRegistry();
anchorRegistryState('startup');

// Keep the trusted registry synchronized automatically whenever PDFs are
// added, removed, or renamed in the Certificates folder. We use polling instead
// of fs.watch because Windows can miss file-system notifications when files are
// copied into a folder by Explorer or another application.
let lastCertificateSignature = '';
function getCertificateSignature() {
  try {
    return fs.readdirSync(CERT_DIR)
      .filter(name => name.toLowerCase().endsWith('.pdf'))
      .sort((a, b) => a.localeCompare(b))
      .map(name => {
        const stat = fs.statSync(path.join(CERT_DIR, name));
        return `${name}:${stat.size}:${stat.mtimeMs}`;
      }).join('|');
  } catch (_) {
    return '';
  }
}

function refreshRegistryIfChanged() {
  const signature = getCertificateSignature();
  if (signature === lastCertificateSignature) return;
  // A copy operation may briefly expose a partially written PDF. Wait for the
  // same signature on the next polling cycle before hashing it.
  lastCertificateSignature = signature;
  setTimeout(() => {
    const stable = getCertificateSignature();
    if (stable === signature) {
      try {
        const count = syncCertificateRegistry();
        console.log(`[REGISTRY] Certificates folder synchronized. Trusted PDFs: ${count}`);
        anchorRegistryState('registry change');
      } catch (err) {
        console.error('[REGISTRY] Automatic sync failed:', err.message);
      }
    }
  }, 500);
}

try {
  lastCertificateSignature = getCertificateSignature();
  console.log(`[REGISTRY] Initial trusted PDFs: ${syncCertificateRegistry()}`);
  anchorRegistryState('initial poll setup');
  console.log('[REGISTRY] Automatic folder polling: ON');
  setInterval(refreshRegistryIfChanged, 1000);
} catch (err) {
  console.error('[REGISTRY] Automatic sync unavailable:', err.message);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`LYNKSCERT running at http://127.0.0.1:${PORT}`);
  console.log('Open that address in your browser. No npm packages are required.');
});
