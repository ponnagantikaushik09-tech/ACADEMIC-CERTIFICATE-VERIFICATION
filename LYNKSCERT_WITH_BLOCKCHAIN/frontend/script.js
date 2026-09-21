const $ = id => document.getElementById(id);



let currentObjectUrl = null;
let verificationRunning = false;
let scanTimer = null;
let scanProgress = 0;
let selectedFile = null;
let previewObjectUrl = null;

function escapeHtml(value){
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'}[c]));
}

function updateFile(file){
  const box = $('fileName');
  const chooseButton = $('chooseFileButton');
  const changeButton = $('changeFileButton');
  selectedFile = file || null;

  if(file){
    box.innerHTML = '<span>●</span> Selected: ' + escapeHtml(file.name);
    box.classList.add('selected');
    // Once a file is selected, replace CHOOSE FILE with VIEW DOCUMENT.
    if(chooseButton){
      chooseButton.textContent = 'VIEW DOCUMENT';
      chooseButton.classList.add('viewDocumentButton');
      chooseButton.setAttribute('aria-label', `View ${file.name}`);
    }
    if(changeButton) changeButton.hidden = false;
    if($('consoleFileName')) $('consoleFileName').textContent = file.name;
    if($('consoleFileMeta')) $('consoleFileMeta').textContent = `PDF // ${(file.size / 1024).toFixed(1)} KB`;
  } else {
    box.innerHTML = '<span>○</span> No certificate selected';
    box.classList.remove('selected');
    if(chooseButton){
      chooseButton.textContent = 'CHOOSE FILE';
      chooseButton.classList.remove('viewDocumentButton');
      chooseButton.setAttribute('aria-label', 'Choose certificate file');
    }
    if(changeButton) changeButton.hidden = true;
    if($('consoleFileName')) $('consoleFileName').textContent = 'No document';
    if($('consoleFileMeta')) $('consoleFileMeta').textContent = 'PDF // 0 KB';
  }
}

function openDocumentPreview(file = selectedFile){
  if(!file) return;
  const modal = $('documentPreviewModal');
  const frame = $('documentPreviewFrame');
  if(!modal || !frame) return;
  if(previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = URL.createObjectURL(file);
  frame.src = previewObjectUrl;
  $('previewFileName').textContent = file.name;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
}

function closeDocumentPreview(){
  const modal = $('documentPreviewModal');
  const frame = $('documentPreviewFrame');
  if(!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  if(frame) frame.removeAttribute('src');
  if(previewObjectUrl){ URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = null; }
}

function setSequence(step, state, message){
  const el = document.querySelector(`.sequenceStep[data-step="${step}"]`);
  if(!el) return;
  el.classList.remove('active','done','failed');
  if(state) el.classList.add(state);
  const mark = el.querySelector('.stepMark');
  if(mark) mark.textContent = state === 'done' ? '✓' : state === 'failed' ? '✕' : state === 'active' ? '◌' : '•';
  if(message) el.querySelector('small').textContent = message;
}

function stopScan(finalValue = null){
  if(scanTimer){ clearInterval(scanTimer); scanTimer = null; }
  if(finalValue !== null) scanProgress = finalValue;
  const value = $('scanProgressValue');
  if(value) value.textContent = `${scanProgress}%`;

  // The scan animation must disappear completely once analysis is finished.
  const beam = $('scanBeam');
  if(beam){
    beam.classList.add('stopped');
    beam.style.top = '';
  }

  if($('scanLabel')){
    $('scanLabel').innerHTML = `DOCUMENT SCAN COMPLETE <b>${scanProgress}%</b>`;
  }
  if($('scanLock')) $('scanLock').classList.add('show');
}

function startScan(){
  if(scanTimer) clearInterval(scanTimer);
  scanProgress = 6;
  $('scanProgressValue').textContent = '6%';
  $('scanProgressText').textContent = 'ANALYZING DOCUMENT LAYERS';
  $('scanBeam').classList.remove('stopped');
  $('scanLock').classList.remove('show');
  scanTimer = setInterval(() => {
    if(!verificationRunning){ stopScan(); return; }
    scanProgress = Math.min(94, scanProgress + Math.floor(Math.random()*4)+1);
    $('scanProgressValue').textContent = `${scanProgress}%`;
    $('scanLabel').innerHTML = `SCANNING DOCUMENT <b>${scanProgress}%</b>`;
  }, 85);
}

function resetConsole(file){
  if(scanTimer){ clearInterval(scanTimer); scanTimer = null; }
  scanProgress = 0;
  document.querySelectorAll('.sequenceStep').forEach(el => {
    el.classList.remove('active','done','failed');
    el.querySelector('.stepMark').textContent = '•';
  });
  $('consoleResult').className = 'consoleResult';
  $('consoleResult').innerHTML = '';
  $('liveReadout').querySelector('strong').textContent = 'Initializing secure verification core...';
  $('consoleState').textContent = 'SYSTEM READY';
  $('scanReadout').textContent = 'SCANNING';
  $('scanProgressValue').textContent = '0%';
  $('scanProgressText').textContent = 'ANALYZING DOCUMENT LAYERS';
  $('scanLabel').innerHTML = 'INITIALIZING SCAN <b>0%</b>';
  $('scanBeam').classList.remove('stopped');
  $('scanLock').classList.remove('show');
  $('documentViewport').classList.remove('complete','failed');
  $('consoleFileName').textContent = file ? file.name : 'No document';
  $('consoleFileMeta').textContent = file ? `PDF // ${(file.size / 1024).toFixed(1)} KB` : 'PDF // 0 KB';
}

function openConsole(file){
  resetConsole(file);
  $('verificationConsole').classList.add('open');
  $('verificationConsole').setAttribute('aria-hidden','false');
  document.body.classList.add('console-open');
  if(currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(file);
  $('certificateFrame').src = currentObjectUrl;
}

function closeConsole(){
  if(verificationRunning) return;
  $('verificationConsole').classList.remove('open');
  $('verificationConsole').setAttribute('aria-hidden','true');
  document.body.classList.remove('console-open');
  $('certificateFrame').removeAttribute('src');
  if(currentObjectUrl){ URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
}

function delay(ms){ return new Promise(r => setTimeout(r, ms)); }

async function scanDocument(){
  startScan();
}

async function verify(){
  if(verificationRunning) return;
  const f = $('pdfUpload').files[0];
  if(!f) return alert('Please upload a PDF certificate first.');
  if(f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) return alert('Please select a PDF certificate.');
  if(f.size > 10 * 1024 * 1024) return alert('File is too large. Maximum size is 10MB.');

  verificationRunning = true;
  openConsole(f);
  setSequence(1, 'done', 'Certificate received and loaded');
  setSequence(2, 'active', 'Generating SHA-256 fingerprint on secure backend');
  $('consoleState').textContent = 'DOCUMENT SCAN ACTIVE';
  $('liveReadout').querySelector('strong').textContent = 'Visual scan active. Locking document into verification core...';

  await scanDocument();

  try {
    await delay(650);

    // Send the PDF as raw bytes. This is more reliable than multipart/form-data
    // and keeps the SHA-256 calculation based on the exact uploaded file bytes.
    const pdfBytes = await f.arrayBuffer();
    const response = await fetch('/api/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf',
        'X-Certificate-Name': encodeURIComponent(f.name)
      },
      body: pdfBytes
    });

    const data = await response.json();
    if(!response.ok || !data.ok) throw new Error(data.error || 'Backend verification failed.');

    setSequence(2, 'done', `SHA-256 generated: ${data.uploadedHash.slice(0, 18)}...`);
    $('liveReadout').querySelector('strong').textContent = 'Fingerprint generated by the verification server. Comparing against the live trusted registry.';

    setSequence(3, 'active', 'Tracing trusted Merkle verification path');
    await delay(650);

    if(data.verified){
      setSequence(3, 'done', 'Trusted Merkle path calculated');
      $('liveReadout').querySelector('strong').textContent = 'Merkle path resolved. Authenticity decision ready.';
    } else {
      setSequence(3, 'failed', 'No trusted Merkle proof for this fingerprint');
      $('liveReadout').querySelector('strong').textContent = 'Trusted Merkle proof unavailable. Certificate authenticity failed.';
    }

    setSequence(4, 'active', 'Evaluating certificate authenticity');
    await delay(550);
    setSequence(4, data.verified ? 'done' : 'failed', data.verified
      ? 'Certificate authenticity confirmed'
      : 'Certificate rejected after trusted-record mismatch');

    $('consoleState').textContent = data.verified ? 'VERIFICATION COMPLETE' : 'VERIFICATION FAILED';
    $('documentViewport').classList.add(data.verified ? 'complete' : 'failed');
    $('liveReadout').querySelector('strong').textContent = data.verified
      ? 'Certificate verified. Trusted fingerprint confirmed.'
      : 'Certificate rejected. Trusted fingerprint mismatch detected.';

    stopScan(100);
    $('scanReadout').textContent = data.verified ? 'AUTHENTIC' : 'FORGED';
    $('scanProgressText').textContent = data.verified ? 'DOCUMENT ANALYSIS COMPLETE' : 'ANALYSIS TERMINATED // TRUST FAILURE';
    $('consoleResult').className = 'consoleResult ' + (data.verified ? 'verified' : 'rejected');
    $('consoleResult').innerHTML = data.verified
      ? `<strong>✓ CERTIFICATE VERIFIED</strong><span>${escapeHtml(data.certificate)} matches the live trusted registry.</span><code>UPLOADED HASH // ${escapeHtml(data.uploadedHash)}<br>ORIGINAL HASH // ${escapeHtml(data.originalHash || 'N/A')}<br>MERKLE ROOT // ${escapeHtml(data.merkleRoot || 'N/A')}</code>`
      : `<strong>✕ FORGED CERTIFICATE</strong><span>The submitted fingerprint does not match any trusted certificate. The trusted registry was synchronized from the Certificates folder before this check.</span><code>UPLOADED HASH // ${escapeHtml(data.uploadedHash)}<br>ORIGINAL HASH // ${escapeHtml(data.originalHash || 'N/A')}<br>MERKLE ROOT // ${escapeHtml(data.merkleRoot || 'N/A')}</code>`;

  } catch(e) {
    console.error(e);
    stopScan(100);
    $('consoleState').textContent = 'SYSTEM ERROR';
    $('scanReadout').textContent = 'ERROR';
    $('documentViewport').classList.add('failed');
    setSequence(4, 'failed', 'Verification process interrupted');
    $('liveReadout').querySelector('strong').textContent = 'Verification core reported an error.';
    $('consoleResult').className = 'consoleResult rejected';
    $('consoleResult').innerHTML = `<strong>✕ VERIFICATION ERROR</strong><span>${escapeHtml(e.message || 'Unable to process this PDF.')}</span>`;
  } finally {
    verificationRunning = false;
  }
}


$('pdfUpload').addEventListener('change', e => {
  const file = e.target.files && e.target.files[0];
  updateFile(file);
});

$('chooseFileButton').addEventListener('click', e => {
  e.preventDefault();
  e.stopPropagation();
  // After selection this button becomes VIEW DOCUMENT.
  if(selectedFile){
    openDocumentPreview(selectedFile);
    return;
  }
  const input = $('pdfUpload');
  input.value = '';
  input.click();
});

$('changeFileButton').addEventListener('click', e => {
  e.preventDefault();
  e.stopPropagation();
  const input = $('pdfUpload');
  input.value = '';
  input.click();
});

$('uploadArea').addEventListener('click', e => {
  if(e.target.closest('button')) return;
  $('pdfUpload').click();
});

const upload = $('uploadArea');
['dragenter','dragover'].forEach(ev => upload.addEventListener(ev, e => { e.preventDefault(); upload.classList.add('dragover'); }));
['dragleave','drop'].forEach(ev => upload.addEventListener(ev, e => { e.preventDefault(); upload.classList.remove('dragover'); }));
upload.addEventListener('drop', e => {
  const file = e.dataTransfer.files[0];
  if(file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))){
    const dt = new DataTransfer(); dt.items.add(file); $('pdfUpload').files = dt.files; updateFile(file);
  } else alert('Please select a PDF certificate.');
});

$('startVerification').addEventListener('click', verify);
$('closeConsole').addEventListener('click', closeConsole);
$('closeDocumentPreview').addEventListener('click', closeDocumentPreview);
$('documentPreviewModal').addEventListener('click', e => { if(e.target.classList.contains('documentPreviewBackdrop')) closeDocumentPreview(); });

document.querySelectorAll('a[href="#verify"]').forEach(link => link.addEventListener('click', e => {
  e.preventDefault();
  document.querySelector('#verify').scrollIntoView({behavior:'smooth', block:'center'});
}));

document.addEventListener('keydown', e => { if(e.key === 'Escape' && !verificationRunning){ closeDocumentPreview(); closeConsole(); } });
