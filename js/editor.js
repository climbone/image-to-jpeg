/* ── editor.js — 画像編集ロジック ── */

// ── STATE ────────────────────────────────────────────────
const state = {
  tool: 'select',       // select | pen | rect | ellipse | arrow | text | crop | mosaic
  color: '#e74c3c',
  lineWidth: 3,
  fontSize: 20,
  opacity: 1,
  objects: [],          // 描画オブジェクト一覧
  selected: null,       // 選択中オブジェクトのindex
  drawing: false,
  startX: 0, startY: 0,
  currentPath: [],      // フリーハンド用
  cropRect: null,
  imageLoaded: false,
  imageName: 'edited.jpg',
};

// ── ELEMENTS ─────────────────────────────────────────────
const canvas       = document.getElementById('mainCanvas');
const ctx          = canvas.getContext('2d');
const canvasWrap   = document.querySelector('.canvas-wrap');
const textOverlay  = document.getElementById('textOverlay');
const layersList   = document.getElementById('layersList');
const undoBtn      = document.getElementById('undoBtn');
const redoBtn      = document.getElementById('redoBtn');
const saveBtn      = document.getElementById('saveBtn');
const colorPicker  = document.getElementById('colorPicker');
const colorSwatch  = document.getElementById('colorSwatch');
const lineWidthSel = document.getElementById('lineWidthSel');
const fontSizeSel  = document.getElementById('fontSizeSel');
const mosaicStr    = document.getElementById('mosaicStr');
const editorEmpty  = document.getElementById('editorEmpty');
const editorMain   = document.getElementById('editorMain');
const editorDrop   = document.getElementById('editorDrop');
const editorFileIn = document.getElementById('editorFileInput');

// undo/redo history
let history = [];
let histIdx = -1;
let baseImage = null; // HTMLImageElement

// ── INIT ─────────────────────────────────────────────────
function init() {
  // 初期状態: ドロップエリアを表示、エディタ本体を非表示
  if (editorDrop) editorDrop.style.display = 'block';
  if (editorMain) editorMain.style.display = 'none';

  setupToolButtons();
  setupCanvasEvents();
  setupTopbar();
  setupDropZone();
  updateUndoRedo();

  // sessionStorage から画像を読み込む（変換ページから渡された場合）
  try {
    const src  = sessionStorage.getItem('editorImage');
    const name = sessionStorage.getItem('editorName');
    if (src) {
      sessionStorage.removeItem('editorImage');
      sessionStorage.removeItem('editorName');
      if (name) state.imageName = name;
      loadImageSrc(src);
    }
  } catch(e) {
    console.warn('sessionStorage unavailable:', e);
  }
}

// ── LOAD IMAGE ────────────────────────────────────────────
function loadImageSrc(src) {
  const img = new Image();
  img.onload = () => {
    baseImage = img;
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    state.objects = [];
    state.selected = null;
    history = []; histIdx = -1;
    saveHistory();
    redraw();
    showEditor();
    updateLayersList();
    updateUndoRedo();
  };
  img.src = src;
}

function showEditor() {
  if (editorDrop) editorDrop.style.display = 'none';
  if (editorMain) editorMain.style.display = 'grid';
}

// ── HISTORY ───────────────────────────────────────────────
function saveHistory() {
  history = history.slice(0, histIdx + 1);
  history.push(JSON.stringify(state.objects));
  histIdx = history.length - 1;
  updateUndoRedo();
}
function undo() {
  if (histIdx <= 0) return;
  histIdx--;
  state.objects = JSON.parse(history[histIdx]);
  state.selected = null;
  redraw(); updateLayersList(); updateUndoRedo();
}
function redo() {
  if (histIdx >= history.length - 1) return;
  histIdx++;
  state.objects = JSON.parse(history[histIdx]);
  state.selected = null;
  redraw(); updateLayersList(); updateUndoRedo();
}
function updateUndoRedo() {
  if (undoBtn) undoBtn.disabled = histIdx <= 0;
  if (redoBtn) redoBtn.disabled = histIdx >= history.length - 1;
}

// ── REDRAW ────────────────────────────────────────────────
function redraw(preview = null) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ベース画像
  if (baseImage) ctx.drawImage(baseImage, 0, 0);

  // 確定済みオブジェクト
  state.objects.forEach((obj, i) => {
    drawObject(ctx, obj, i === state.selected);
  });

  // プレビュー（描画中）
  if (preview) drawObject(ctx, preview, false);
}

function drawObject(c, obj, selected) {
  c.save();
  c.globalAlpha = obj.opacity ?? 1;

  switch (obj.type) {
    case 'pen':
      if (!obj.points || obj.points.length < 2) break;
      c.strokeStyle = obj.color;
      c.lineWidth   = obj.lineWidth;
      c.lineCap     = 'round';
      c.lineJoin    = 'round';
      c.beginPath();
      c.moveTo(obj.points[0].x, obj.points[0].y);
      obj.points.forEach(p => c.lineTo(p.x, p.y));
      c.stroke();
      break;

    case 'rect':
      c.strokeStyle = obj.color;
      c.lineWidth   = obj.lineWidth;
      c.strokeRect(obj.x, obj.y, obj.w, obj.h);
      if (obj.fill) { c.fillStyle = obj.color; c.globalAlpha = 0.15; c.fillRect(obj.x, obj.y, obj.w, obj.h); }
      break;

    case 'ellipse':
      c.strokeStyle = obj.color;
      c.lineWidth   = obj.lineWidth;
      c.beginPath();
      c.ellipse(obj.x + obj.w / 2, obj.y + obj.h / 2, Math.abs(obj.w / 2), Math.abs(obj.h / 2), 0, 0, Math.PI * 2);
      c.stroke();
      break;

    case 'arrow': {
      const dx = obj.x2 - obj.x1, dy = obj.y2 - obj.y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) break;
      const angle = Math.atan2(dy, dx);
      const head  = Math.max(12, obj.lineWidth * 4);
      c.strokeStyle = obj.color;
      c.fillStyle   = obj.color;
      c.lineWidth   = obj.lineWidth;
      c.lineCap     = 'round';
      c.beginPath();
      c.moveTo(obj.x1, obj.y1);
      c.lineTo(obj.x2 - Math.cos(angle) * head * 0.5, obj.y2 - Math.sin(angle) * head * 0.5);
      c.stroke();
      c.beginPath();
      c.moveTo(obj.x2, obj.y2);
      c.lineTo(obj.x2 - Math.cos(angle - 0.4) * head, obj.y2 - Math.sin(angle - 0.4) * head);
      c.lineTo(obj.x2 - Math.cos(angle + 0.4) * head, obj.y2 - Math.sin(angle + 0.4) * head);
      c.closePath();
      c.fill();
      break;
    }

    case 'text':
      c.fillStyle  = obj.color;
      c.font       = `${obj.fontSize}px Inter, sans-serif`;
      c.textBaseline = 'top';
      // 複数行対応
      obj.text.split('\n').forEach((line, li) => {
        c.fillText(line, obj.x, obj.y + li * (obj.fontSize * 1.4));
      });
      break;

    case 'mosaic': {
      // モザイク：元画像のピクセルをブロック化
      const bSize = obj.blockSize || 12;
      const sx = Math.min(obj.x, obj.x + obj.w), sy = Math.min(obj.y, obj.y + obj.h);
      const sw = Math.abs(obj.w), sh = Math.abs(obj.h);
      if (sw < 1 || sh < 1 || !baseImage) break;
      // オフスクリーンで元画像を描画してピクセル取得
      const off = document.createElement('canvas');
      off.width = canvas.width; off.height = canvas.height;
      const oc = off.getContext('2d');
      oc.drawImage(baseImage, 0, 0);
      // 既存オブジェクト（このオブジェクトより前）も反映
      const idx = state.objects.indexOf(obj);
      state.objects.slice(0, idx).forEach(o => drawObject(oc, o, false));
      for (let bx = sx; bx < sx + sw; bx += bSize) {
        for (let by = sy; by < sy + sh; by += bSize) {
          const bw = Math.min(bSize, sx + sw - bx);
          const bh = Math.min(bSize, sy + sh - by);
          const d  = oc.getImageData(bx + bw / 2, by + bh / 2, 1, 1).data;
          c.fillStyle = `rgb(${d[0]},${d[1]},${d[2]})`;
          c.fillRect(bx, by, bw, bh);
        }
      }
      break;
    }
  }

  // 選択ハンドル
  if (selected) {
    c.globalAlpha = 1;
    c.strokeStyle = '#2980b9';
    c.lineWidth   = 1.5;
    c.setLineDash([4, 3]);
    const bb = getBoundingBox(obj);
    if (bb) c.strokeRect(bb.x - 4, bb.y - 4, bb.w + 8, bb.h + 8);
    c.setLineDash([]);
  }
  c.restore();
}

function getBoundingBox(obj) {
  switch (obj.type) {
    case 'rect':
    case 'ellipse':
    case 'mosaic':
      return { x: Math.min(obj.x, obj.x + obj.w), y: Math.min(obj.y, obj.y + obj.h), w: Math.abs(obj.w), h: Math.abs(obj.h) };
    case 'arrow':
      return { x: Math.min(obj.x1, obj.x2), y: Math.min(obj.y1, obj.y2), w: Math.abs(obj.x2 - obj.x1), h: Math.abs(obj.y2 - obj.y1) };
    case 'pen': {
      if (!obj.points.length) return null;
      const xs = obj.points.map(p => p.x), ys = obj.points.map(p => p.y);
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    case 'text':
      return { x: obj.x, y: obj.y, w: 200, h: obj.fontSize * 1.6 };
    default: return null;
  }
}

// ── CANVAS EVENTS ─────────────────────────────────────────
function getPos(e) {
  const r  = canvas.getBoundingClientRect();
  const sx = canvas.width  / r.width;
  const sy = canvas.height / r.height;
  const cx = (e.clientX ?? e.touches?.[0].clientX) - r.left;
  const cy = (e.clientY ?? e.touches?.[0].clientY) - r.top;
  return { x: cx * sx, y: cy * sy };
}

function setupCanvasEvents() {
  canvas.addEventListener('mousedown',  onDown);
  canvas.addEventListener('mousemove',  onMove);
  canvas.addEventListener('mouseup',    onUp);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); onDown(e); }, { passive: false });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); onMove(e); }, { passive: false });
  canvas.addEventListener('touchend',   e => { e.preventDefault(); onUp(e);   }, { passive: false });
}

function onDown(e) {
  if (!baseImage) return;
  const pos = getPos(e);
  state.startX = pos.x; state.startY = pos.y;
  state.drawing = true;

  if (state.tool === 'select') {
    // クリックで選択
    let hit = -1;
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const bb = getBoundingBox(state.objects[i]);
      if (bb && pos.x >= bb.x - 6 && pos.x <= bb.x + bb.w + 6 && pos.y >= bb.y - 6 && pos.y <= bb.y + bb.h + 6) {
        hit = i; break;
      }
    }
    state.selected = hit >= 0 ? hit : null;
    redraw(); updateLayersList();
    return;
  }

  if (state.tool === 'text') {
    commitText();
    showTextOverlay(pos.x, pos.y);
    return;
  }

  if (state.tool === 'pen') {
    state.currentPath = [{ x: pos.x, y: pos.y }];
  }
}

function onMove(e) {
  if (!state.drawing || !baseImage) return;
  if (state.tool === 'select' || state.tool === 'text') return;
  const pos = getPos(e);

  if (state.tool === 'pen') {
    state.currentPath.push({ x: pos.x, y: pos.y });
    redraw({ type: 'pen', points: state.currentPath, color: state.color, lineWidth: state.lineWidth, opacity: state.opacity });
    return;
  }

  const preview = makePreview(pos);
  if (preview) redraw(preview);
}

function onUp(e) {
  if (!state.drawing || !baseImage) return;
  state.drawing = false;
  if (state.tool === 'select' || state.tool === 'text') return;

  const pos = getPos(e);
  let obj = null;

  if (state.tool === 'pen') {
    if (state.currentPath.length < 2) { redraw(); return; }
    obj = { type: 'pen', points: [...state.currentPath], color: state.color, lineWidth: state.lineWidth, opacity: state.opacity };
    state.currentPath = [];
  } else if (state.tool === 'crop') {
    applyCrop(state.startX, state.startY, pos.x, pos.y);
    return;
  } else {
    obj = makePreview(pos);
  }

  if (obj) {
    state.objects.push(obj);
    saveHistory();
    redraw();
    updateLayersList();
  }
}

function makePreview(pos) {
  const x = state.startX, y = state.startY;
  const w = pos.x - x, h = pos.y - y;
  const base = { color: state.color, lineWidth: state.lineWidth, opacity: state.opacity };

  switch (state.tool) {
    case 'rect':    return { ...base, type: 'rect',    x, y, w, h };
    case 'ellipse': return { ...base, type: 'ellipse', x, y, w, h };
    case 'arrow':   return { ...base, type: 'arrow',   x1: x, y1: y, x2: pos.x, y2: pos.y };
    case 'mosaic':  return { type: 'mosaic', x, y, w, h, blockSize: parseInt(mosaicStr?.value || 12) };
    default: return null;
  }
}

// ── TEXT ──────────────────────────────────────────────────
function showTextOverlay(cx, cy) {
  const r   = canvas.getBoundingClientRect();
  const scx = r.width  / canvas.width;
  const scy = r.height / canvas.height;
  textOverlay.style.left     = (r.left + cx * scx) + 'px';
  textOverlay.style.top      = (r.top  + cy * scy + window.scrollY) + 'px';
  textOverlay.style.fontSize = (state.fontSize * scx) + 'px';
  textOverlay.style.color    = state.color;
  textOverlay.style.display  = 'block';
  textOverlay._cx = cx; textOverlay._cy = cy;
  textOverlay.value = '';
  textOverlay.focus();
}

function commitText() {
  if (textOverlay.style.display === 'none') return;
  const text = textOverlay.value.trim();
  if (text) {
    state.objects.push({
      type: 'text', text,
      x: textOverlay._cx, y: textOverlay._cy,
      color: state.color, fontSize: state.fontSize, opacity: state.opacity,
    });
    saveHistory();
    redraw();
    updateLayersList();
  }
  textOverlay.style.display = 'none';
  textOverlay.value = '';
}
textOverlay?.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); }
  if (e.key === 'Escape') { textOverlay.style.display = 'none'; }
});
textOverlay?.addEventListener('blur', commitText);

// ── CROP ──────────────────────────────────────────────────
function applyCrop(x1, y1, x2, y2) {
  const sx = Math.min(x1, x2), sy = Math.min(y1, y2);
  const sw = Math.abs(x2 - x1), sh = Math.abs(y2 - y1);
  if (sw < 4 || sh < 4) return;

  // 現在の描画内容をオフスクリーンに合成
  const off = document.createElement('canvas');
  off.width = canvas.width; off.height = canvas.height;
  off.getContext('2d').drawImage(canvas, 0, 0);

  // ベース画像を切り抜いた新しい Image を作る
  const crop = document.createElement('canvas');
  crop.width = sw; crop.height = sh;
  crop.getContext('2d').drawImage(off, sx, sy, sw, sh, 0, 0, sw, sh);

  const newSrc = crop.toDataURL('image/jpeg', 0.95);
  state.objects = [];
  loadImageSrc(newSrc);
}

// ── DELETE SELECTED ───────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.key === 'Delete' || e.key === 'Backspace') &&
      state.selected !== null &&
      document.activeElement.tagName !== 'INPUT' &&
      document.activeElement.tagName !== 'TEXTAREA') {
    state.objects.splice(state.selected, 1);
    state.selected = null;
    saveHistory(); redraw(); updateLayersList();
  }
  if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
  if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
});

// ── TOOL BUTTONS ─────────────────────────────────────────
function setupToolButtons() {
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      commitText();
      state.tool = btn.dataset.tool;
      document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // カーソル更新
      canvasWrap.className = 'canvas-wrap tool-' + state.tool;
    });
  });
  // 初期ツールをアクティブ化
  document.querySelector('.tool-btn[data-tool="select"]')?.classList.add('active');
}

// ── TOPBAR ────────────────────────────────────────────────
function setupTopbar() {
  colorPicker?.addEventListener('input', e => {
    state.color = e.target.value;
    colorSwatch.style.background = e.target.value;
    if (state.selected !== null) {
      state.objects[state.selected].color = e.target.value;
      saveHistory(); redraw();
    }
  });
  lineWidthSel?.addEventListener('change', e => { state.lineWidth = parseInt(e.target.value); });
  fontSizeSel?.addEventListener('change',  e => { state.fontSize  = parseInt(e.target.value); });

  undoBtn?.addEventListener('click', undo);
  redoBtn?.addEventListener('click', redo);

  saveBtn?.addEventListener('click', () => {
    commitText();
    redraw();
    const a = document.createElement('a');
    a.href     = canvas.toDataURL('image/jpeg', 0.92);
    a.download = state.imageName || 'edited.jpg';
    a.click();
  });

  document.getElementById('clearAllBtn')?.addEventListener('click', () => {
    state.objects = []; state.selected = null;
    saveHistory(); redraw(); updateLayersList();
  });
}

// ── DROP ZONE (editor page) ───────────────────────────────
function setupDropZone() {
  if (editorDrop) {
    editorDrop.addEventListener('click', () => { if (editorFileIn) editorFileIn.click(); });
  }
  if (editorFileIn) {
    editorFileIn.addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = ev => { state.imageName = f.name; loadImageSrc(ev.target.result); };
      reader.readAsDataURL(f);
      editorFileIn.value = '';
    });
  }

  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault();
    const f = Array.from(e.dataTransfer.files).find(file => file.type.startsWith('image/'));
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => { state.imageName = f.name; loadImageSrc(ev.target.result); };
    reader.readAsDataURL(f);
  });
}

// ── LAYERS LIST ───────────────────────────────────────────
function updateLayersList() {
  if (!layersList) return;
  layersList.innerHTML = '';
  const typeIcon = { pen: '✏', rect: '▭', ellipse: '◯', arrow: '↗', text: 'T', mosaic: '▦', crop: '⌗' };
  const typeName = { pen: 'フリーハンド', rect: '四角形', ellipse: '円', arrow: '矢印', text: 'テキスト', mosaic: 'モザイク' };
  [...state.objects].reverse().forEach((obj, ri) => {
    const i = state.objects.length - 1 - ri;
    const item = document.createElement('div');
    item.className = 'layer-item' + (i === state.selected ? ' selected' : '');
    item.innerHTML = `
      <span class="layer-icon">${typeIcon[obj.type] || '?'}</span>
      <span class="layer-name">${typeName[obj.type] || obj.type}${obj.type === 'text' ? ' — ' + obj.text.slice(0, 8) : ''}</span>
      <button class="layer-del" data-idx="${i}" title="削除">&times;</button>
    `;
    item.addEventListener('click', ev => {
      if (ev.target.classList.contains('layer-del')) return;
      state.selected = i;
      redraw(); updateLayersList();
    });
    item.querySelector('.layer-del').addEventListener('click', () => {
      state.objects.splice(i, 1);
      if (state.selected === i) state.selected = null;
      saveHistory(); redraw(); updateLayersList();
    });
    layersList.appendChild(item);
  });
}

// ── START ─────────────────────────────────────────────────
init();
