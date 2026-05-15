/* ── converter.js — 変換ロジック ── */

const files = [];
let converting = false;

const fileInput      = document.getElementById('fileInput');
const dropZone       = document.getElementById('dropZone');
const fileList       = document.getElementById('fileList');
const actions        = document.getElementById('actions');
const convertBtn     = document.getElementById('convertBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const clearBtn       = document.getElementById('clearBtn');
const quality        = document.getElementById('quality');
const qualityVal     = document.getElementById('qualityVal');
const bgColor        = document.getElementById('bgColor');
const maxWidth       = document.getElementById('maxWidth');
const progressWrap   = document.getElementById('progressWrap');
const progressBar    = document.getElementById('progressBar');
const statsArea      = document.getElementById('statsArea');
const statTotal      = document.getElementById('statTotal');
const statDone       = document.getElementById('statDone');
const statSaved      = document.getElementById('statSaved');
const heicNote       = document.getElementById('heicNote');
const dragOverlay    = document.getElementById('dragOverlay');

// ── QUALITY SLIDER ──────────────────────────────────────
quality.addEventListener('input', () => { qualityVal.textContent = quality.value; });

// ── FILE INPUT ──────────────────────────────────────────
fileInput.addEventListener('change', e => addFiles(Array.from(e.target.files)));
dropZone.addEventListener('click', () => fileInput.click());

// ── DRAG & DROP ─────────────────────────────────────────
let dragCounter = 0;
window.addEventListener('dragenter', e => {
  e.preventDefault(); dragCounter++;
  dragOverlay.classList.add('active');
});
window.addEventListener('dragleave', () => {
  dragCounter--;
  if (dragCounter <= 0) { dragCounter = 0; dragOverlay.classList.remove('active'); }
});
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
  e.preventDefault(); dragCounter = 0; dragOverlay.classList.remove('active');
  addFiles(Array.from(e.dataTransfer.files).filter(
    f => f.type.startsWith('image/') || /\.(heic|heif|tiff?|bmp|ico|avif)$/i.test(f.name)
  ));
});

// ── ADD FILES ────────────────────────────────────────────
function addFiles(newFiles) {
  let hasHeic = false;
  newFiles.forEach(f => {
    if (/\.(heic|heif)$/i.test(f.name) || f.type === 'image/heic' || f.type === 'image/heif') {
      hasHeic = true; return;
    }
    if (files.find(x => x.name === f.name && x.size === f.size)) return;
    files.push({ file: f, name: f.name, size: f.size, type: f.type, status: 'wait', blob: null, originalSize: f.size });
  });
  heicNote.classList.toggle('visible', hasHeic);
  renderList();
  if (files.length > 0) { actions.style.display = 'flex'; updateStats(); }
}

// ── RENDER FILE LIST ─────────────────────────────────────
function renderList() {
  if (files.length === 0) { fileList.style.display = 'none'; return; }
  fileList.style.display = 'flex';
  fileList.innerHTML = '';

  files.forEach((f, i) => {
    const item = document.createElement('div');
    item.className = 'file-item' + (f.status === 'error' ? ' error' : '');

    const dlLink = f.blob
      ? `<a class="file-dl" href="${URL.createObjectURL(f.blob)}" download="${base(f.name)}.jpg">DL</a>`
      : '';
    const editBtn = f.blob
      ? `<button class="file-edit-btn" data-idx="${i}">編集</button>`
      : '';

    item.innerHTML = `
      <div class="file-thumb-ph" id="thumb-${i}"></div>
      <div class="file-info">
        <div class="file-name">${esc(f.name)}</div>
        <div class="file-meta">${fmtBytes(f.size)} · ${f.type || ext(f.name)}</div>
      </div>
      <div class="file-actions">
        <span class="file-status s-${statusClass(f.status)}" id="status-${i}">${statusText(f.status)}</span>
        ${dlLink}
        ${editBtn}
        <button class="file-remove" data-idx="${i}" title="削除">&times;</button>
      </div>
    `;
    fileList.appendChild(item);

    // サムネイル
    if (f.status === 'done' && f.blob) {
      const el = document.getElementById(`thumb-${i}`);
      if (el) { const img = document.createElement('img'); img.className = 'file-thumb'; img.src = URL.createObjectURL(f.blob); el.replaceWith(img); }
    } else {
      const reader = new FileReader();
      reader.onload = ev => {
        const el = document.getElementById(`thumb-${i}`);
        if (!el) return;
        const img = document.createElement('img'); img.className = 'file-thumb'; img.src = ev.target.result; el.replaceWith(img);
      };
      reader.readAsDataURL(f.file);
    }
  });

  // 削除ボタン
  fileList.querySelectorAll('.file-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      files.splice(parseInt(btn.dataset.idx), 1);
      renderList();
      if (files.length === 0) { actions.style.display = 'none'; statsArea.style.display = 'none'; }
      else updateStats();
    });
  });

  // 編集ボタン → editor.html へ blob を渡す
  fileList.querySelectorAll('.file-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = files[parseInt(btn.dataset.idx)];
      if (!f.blob) return;
      const reader = new FileReader();
      reader.onload = ev => {
        sessionStorage.setItem('editorImage', ev.target.result);
        sessionStorage.setItem('editorName', base(f.name) + '.jpg');
        window.location.href = 'editor.html';
      };
      reader.readAsDataURL(f.blob);
    });
  });
}

// ── CONVERT ──────────────────────────────────────────────
convertBtn.addEventListener('click', async () => {
  if (converting || files.length === 0) return;
  converting = true;
  convertBtn.disabled = true;
  downloadAllBtn.disabled = true;
  progressWrap.classList.add('visible');

  const q  = parseInt(quality.value) / 100;
  const bg = bgColor.value;
  const mw = parseInt(maxWidth.value);
  let done = 0;

  for (let i = 0; i < files.length; i++) {
    if (files[i].status === 'done') { done++; continue; }
    files[i].status = 'processing'; updateItemStatus(i);
    try {
      files[i].blob = await convertToJpeg(files[i].file, q, bg, mw);
      files[i].status = 'done'; done++;
    } catch (e) {
      files[i].status = 'error'; console.error(e);
    }
    updateItemStatus(i);
    progressBar.style.width = (done / files.length * 100) + '%';
    updateStats();
  }

  converting = false;
  convertBtn.disabled = false;
  const allDone = files.every(f => f.status === 'done');
  downloadAllBtn.disabled = !allDone;
  if (allDone) renderList();
});

// ── CONVERT SINGLE FILE ───────────────────────────────────
function convertToJpeg(file, quality, bgHex, maxW) {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
      const reader = new FileReader();
      reader.onload = e => {
        const blob = new Blob([e.target.result], { type: 'image/svg+xml' });
        const url  = URL.createObjectURL(blob);
        const img  = new Image();
        img.onload = () => { resolve(drawToJpeg(img, img.naturalWidth || 800, img.naturalHeight || 600, quality, bgHex, maxW)); URL.revokeObjectURL(url); };
        img.onerror = reject; img.src = url;
      };
      reader.readAsText(file); return;
    }
    createImageBitmap(file)
      .then(bmp => resolve(drawToJpeg(bmp, bmp.width, bmp.height, quality, bgHex, maxW)))
      .catch(() => {
        const reader = new FileReader();
        reader.onload = e => {
          const img = new Image();
          img.onload = () => resolve(drawToJpeg(img, img.naturalWidth, img.naturalHeight, quality, bgHex, maxW));
          img.onerror = reject; img.src = e.target.result;
        };
        reader.onerror = reject; reader.readAsDataURL(file);
      });
  });
}

function drawToJpeg(src, w, h, quality, bgHex, maxW) {
  let dw = w, dh = h;
  if (maxW > 0 && w > maxW) { dw = maxW; dh = Math.round(h * maxW / w); }
  const canvas = document.createElement('canvas');
  canvas.width = dw; canvas.height = dh;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bgHex; ctx.fillRect(0, 0, dw, dh);
  ctx.drawImage(src, 0, 0, dw, dh);
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/jpeg', quality));
}

// ── DOWNLOAD ALL AS ZIP ───────────────────────────────────
downloadAllBtn.addEventListener('click', async () => {
  const done = files.filter(f => f.status === 'done' && f.blob);
  if (!done.length) return;
  downloadAllBtn.disabled = true; downloadAllBtn.textContent = '作成中...';
  const zip = new JSZip();
  for (const f of done) zip.file(base(f.name) + '.jpg', await f.blob.arrayBuffer());
  const content = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(content); a.download = 'converted.zip'; a.click();
  downloadAllBtn.textContent = 'ZIP でダウンロード'; downloadAllBtn.disabled = false;
});

// ── CLEAR ─────────────────────────────────────────────────
clearBtn.addEventListener('click', () => {
  files.length = 0; fileList.innerHTML = ''; fileList.style.display = 'none';
  actions.style.display = 'none'; statsArea.style.display = 'none';
  progressWrap.classList.remove('visible'); progressBar.style.width = '0%';
  fileInput.value = ''; heicNote.classList.remove('visible');
});

// ── HELPERS ───────────────────────────────────────────────
function updateItemStatus(i) {
  const el = document.getElementById(`status-${i}`);
  if (el) { el.className = `file-status s-${statusClass(files[i].status)}`; el.textContent = statusText(files[i].status); }
}
function updateStats() {
  const done = files.filter(f => f.status === 'done');
  statTotal.textContent = files.length; statDone.textContent = done.length;
  if (done.length) {
    const orig  = done.reduce((s, f) => s + f.originalSize, 0);
    const nw    = done.reduce((s, f) => s + (f.blob ? f.blob.size : 0), 0);
    const saved = orig - nw, pct = orig > 0 ? Math.round(saved / orig * 100) : 0;
    statSaved.textContent = (saved >= 0 ? '-' : '+') + fmtBytes(Math.abs(saved)) + ' (' + pct + '%)';
  }
  statsArea.style.display = 'flex';
}
function statusClass(s) { return { wait: 'wait', processing: 'proc', done: 'done', error: 'error' }[s] || 'wait'; }
function statusText(s)  { return { wait: '待機中', processing: '変換中', done: '完了', error: 'エラー' }[s] || s; }
function fmtBytes(b) { return b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB'; }
function base(n) { return n.replace(/\.[^.]+$/, ''); }
function ext(n)  { return (n.match(/\.([^.]+)$/) || ['', '?'])[1].toUpperCase(); }
function esc(s)  { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
