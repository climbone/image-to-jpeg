/* ── editor.js — 画像編集ロジック ── */

// ── STATE ────────────────────────────────────────────────
const state = {
  tool: 'select',
  color: '#e74c3c',
  lineWidth: 3,
  fontSize: 20,
  objects: [],
  selected: null,
  drawing: false,
  startX: 0, startY: 0,
  currentPath: [],
  imageName: 'edited.jpg',
};

// ── ELEMENTS (init内で設定) ──────────────────────────────
let canvas, ctx, canvasWrap, layersList;
let undoBtn, redoBtn, saveBtn, colorPicker, colorSwatch;
let lineWidthSel, fontSizeSel, mosaicStr;
let editorMain, editorDrop, editorFileIn;
let textInput = null; // インライン入力用div

// undo/redo: { baseImageSrc, objects }[] を保持
let history = [];
let histIdx = -1;
let baseImage = null;

// ── INIT ─────────────────────────────────────────────────
function init() {
  canvas       = document.getElementById('mainCanvas');
  ctx          = canvas ? canvas.getContext('2d') : null;
  canvasWrap   = document.getElementById('canvasWrap');
  layersList   = document.getElementById('layersList');
  undoBtn      = document.getElementById('undoBtn');
  redoBtn      = document.getElementById('redoBtn');
  saveBtn      = document.getElementById('saveBtn');
  colorPicker  = document.getElementById('colorPicker');
  colorSwatch  = document.getElementById('colorSwatch');
  lineWidthSel = document.getElementById('lineWidthSel');
  fontSizeSel  = document.getElementById('fontSizeSel');
  mosaicStr    = document.getElementById('mosaicStr');
  editorMain   = document.getElementById('editorMain');
  editorDrop   = document.getElementById('editorDrop');
  editorFileIn = document.getElementById('editorFileInput');

  if (editorDrop) editorDrop.style.display = 'block';
  if (editorMain) editorMain.style.display = 'none';

  setupToolButtons();
  setupCanvasEvents();
  setupTopbar();
  setupDropZone();
  updateUndoRedo();

  try {
    const src  = sessionStorage.getItem('editorImage');
    const name = sessionStorage.getItem('editorName');
    if (src) {
      sessionStorage.removeItem('editorImage');
      sessionStorage.removeItem('editorName');
      if (name) state.imageName = name;
      loadImageSrc(src);
    }
  } catch(e) { console.warn('sessionStorage unavailable:', e); }
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
    history = [];
    histIdx = -1;
    saveHistory();
    redraw();
    showEditor();
    updateLayersList();
    updateUndoRedo();
  };
  img.onerror = () => alert('画像の読み込みに失敗しました。');
  img.src = src;
}

function showEditor() {
  if (editorDrop) editorDrop.style.display = 'none';
  if (editorMain) editorMain.style.display = 'grid';
}

// ── HISTORY ───────────────────────────────────────────────
// baseImageのsrcも含めてスナップショットを保存（crop対応）
function saveHistory() {
  history = history.slice(0, histIdx + 1);
  history.push({
    src: baseImage ? baseImage.src : null,
    objects: JSON.stringify(state.objects),
  });
  histIdx = history.length - 1;
  updateUndoRedo();
}

function restoreHistory(snap) {
  state.objects = JSON.parse(snap.objects);
  state.selected = null;
  if (snap.src && (!baseImage || baseImage.src !== snap.src)) {
    const img = new Image();
    img.onload = () => {
      baseImage = img;
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      redraw(); updateLayersList(); updateUndoRedo();
    };
    img.src = snap.src;
  } else {
    redraw(); updateLayersList(); updateUndoRedo();
  }
}

function undo() {
  if (histIdx <= 0) return;
  histIdx--;
  restoreHistory(history[histIdx]);
}
function redo() {
  if (histIdx >= history.length - 1) return;
  histIdx++;
  restoreHistory(history[histIdx]);
}
function updateUndoRedo() {
  if (undoBtn) undoBtn.disabled = histIdx <= 0;
  if (redoBtn) redoBtn.disabled = histIdx >= history.length - 1;
}

// ── REDRAW ────────────────────────────────────────────────
function redraw(preview = null) {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (baseImage) ctx.drawImage(baseImage, 0, 0);
  state.objects.forEach((obj, i) => drawObject(ctx, obj, i === state.selected));
  if (preview) drawObject(ctx, preview, false);
}

function drawObject(c, obj, selected) {
  c.save();
  c.globalAlpha = obj.opacity ?? 1;

  switch (obj.type) {
    case 'pen':
      if (!obj.points || obj.points.length < 2) break;
      c.strokeStyle = obj.color; c.lineWidth = obj.lineWidth;
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(obj.points[0].x, obj.points[0].y);
      obj.points.forEach(p => c.lineTo(p.x, p.y));
      c.stroke();
      break;

    case 'rect':
      c.strokeStyle = obj.color; c.lineWidth = obj.lineWidth;
      c.strokeRect(obj.x, obj.y, obj.w, obj.h);
      break;

    case 'ellipse':
      c.strokeStyle = obj.color; c.lineWidth = obj.lineWidth;
      c.beginPath();
      c.ellipse(obj.x + obj.w/2, obj.y + obj.h/2, Math.abs(obj.w/2), Math.abs(obj.h/2), 0, 0, Math.PI*2);
      c.stroke();
      break;

    case 'arrow': {
      const dx = obj.x2-obj.x1, dy = obj.y2-obj.y1;
      const len = Math.sqrt(dx*dx+dy*dy); if (len < 1) break;
      const angle = Math.atan2(dy, dx);
      const head  = Math.max(12, obj.lineWidth * 4);
      c.strokeStyle = obj.color; c.fillStyle = obj.color;
      c.lineWidth = obj.lineWidth; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(obj.x1, obj.y1);
      c.lineTo(obj.x2 - Math.cos(angle)*head*0.5, obj.y2 - Math.sin(angle)*head*0.5);
      c.stroke();
      c.beginPath();
      c.moveTo(obj.x2, obj.y2);
      c.lineTo(obj.x2 - Math.cos(angle-0.4)*head, obj.y2 - Math.sin(angle-0.4)*head);
      c.lineTo(obj.x2 - Math.cos(angle+0.4)*head, obj.y2 - Math.sin(angle+0.4)*head);
      c.closePath(); c.fill();
      break;
    }

    case 'text':
      c.fillStyle = obj.color;
      c.font = `${obj.fontSize}px Inter, sans-serif`;
      c.textBaseline = 'top';
      obj.text.split('\n').forEach((line, li) => {
        c.fillText(line, obj.x, obj.y + li * obj.fontSize * 1.4);
      });
      break;

    case 'mosaic': {
      const bSize = obj.blockSize || 12;
      const sx = Math.min(obj.x, obj.x+obj.w), sy = Math.min(obj.y, obj.y+obj.h);
      const sw = Math.abs(obj.w), sh = Math.abs(obj.h);
      if (sw < 1 || sh < 1 || !baseImage) break;
      const off = document.createElement('canvas');
      off.width = canvas.width; off.height = canvas.height;
      const oc = off.getContext('2d');
      oc.drawImage(baseImage, 0, 0);
      const idx = state.objects.indexOf(obj);
      state.objects.slice(0, idx).forEach(o => drawObject(oc, o, false));
      for (let bx = sx; bx < sx+sw; bx += bSize) {
        for (let by = sy; by < sy+sh; by += bSize) {
          const bw = Math.min(bSize, sx+sw-bx), bh = Math.min(bSize, sy+sh-by);
          const d = oc.getImageData(bx+bw/2, by+bh/2, 1, 1).data;
          c.fillStyle = `rgb(${d[0]},${d[1]},${d[2]})`;
          c.fillRect(bx, by, bw, bh);
        }
      }
      break;
    }
  }

  if (selected) {
    c.globalAlpha = 1;
    c.strokeStyle = '#2980b9'; c.lineWidth = 1.5;
    c.setLineDash([4,3]);
    const bb = getBoundingBox(obj);
    if (bb) c.strokeRect(bb.x-4, bb.y-4, bb.w+8, bb.h+8);
    c.setLineDash([]);
  }
  c.restore();
}

function getBoundingBox(obj) {
  switch(obj.type) {
    case 'rect': case 'ellipse': case 'mosaic':
      return { x: Math.min(obj.x,obj.x+obj.w), y: Math.min(obj.y,obj.y+obj.h), w: Math.abs(obj.w), h: Math.abs(obj.h) };
    case 'arrow':
      return { x: Math.min(obj.x1,obj.x2), y: Math.min(obj.y1,obj.y2), w: Math.abs(obj.x2-obj.x1), h: Math.abs(obj.y2-obj.y1) };
    case 'pen': {
      if (!obj.points.length) return null;
      const xs = obj.points.map(p=>p.x), ys = obj.points.map(p=>p.y);
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs)-x, h: Math.max(...ys)-y };
    }
    case 'text': return { x: obj.x, y: obj.y, w: 200, h: obj.fontSize*1.6 };
    default: return null;
  }
}

// ── CANVAS COORDS ─────────────────────────────────────────
function getPos(e) {
  const r  = canvas.getBoundingClientRect();
  const sx = canvas.width  / r.width;
  const sy = canvas.height / r.height;
  const cx = (e.clientX ?? e.touches?.[0].clientX) - r.left;
  const cy = (e.clientY ?? e.touches?.[0].clientY) - r.top;
  return { x: cx*sx, y: cy*sy };
}

// ── CANVAS EVENTS ─────────────────────────────────────────
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
    commitText();
    let hit = -1;
    for (let i = state.objects.length-1; i >= 0; i--) {
      const bb = getBoundingBox(state.objects[i]);
      if (bb && pos.x>=bb.x-6 && pos.x<=bb.x+bb.w+6 && pos.y>=bb.y-6 && pos.y<=bb.y+bb.h+6) { hit=i; break; }
    }
    state.selected = hit >= 0 ? hit : null;
    redraw(); updateLayersList();
    return;
  }

  if (state.tool === 'text') {
    // onUpで座標を使うためstartX/Yだけ記録、drawingはtrueのまま
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
    redraw({ type:'pen', points: state.currentPath, color: state.color, lineWidth: state.lineWidth, opacity: 1 });
    return;
  }
  const preview = makePreview(pos);
  if (preview) redraw(preview);
}

function onUp(e) {
  if (!state.drawing || !baseImage) return;
  state.drawing = false;
  if (state.tool === 'select') return;
  if (state.tool === 'text') {
    showTextInput(state.startX, state.startY);
    return;
  }

  const pos = getPos(e);
  let obj = null;

  if (state.tool === 'pen') {
    if (state.currentPath.length < 2) { redraw(); return; }
    obj = { type:'pen', points:[...state.currentPath], color: state.color, lineWidth: state.lineWidth, opacity: 1 };
    state.currentPath = [];
  } else if (state.tool === 'crop') {
    applyCrop(state.startX, state.startY, pos.x, pos.y);
    return;
  } else {
    obj = makePreview(pos);
  }

  if (obj) {
    state.objects.push(obj);
    saveHistory(); redraw(); updateLayersList();
  }
}

function makePreview(pos) {
  const x = state.startX, y = state.startY;
  const w = pos.x-x, h = pos.y-y;
  const base = { color: state.color, lineWidth: state.lineWidth, opacity: 1 };
  switch(state.tool) {
    case 'rect':    return { ...base, type:'rect',    x, y, w, h };
    case 'ellipse': return { ...base, type:'ellipse', x, y, w, h };
    case 'arrow':   return { ...base, type:'arrow',   x1:x, y1:y, x2:pos.x, y2:pos.y };
    case 'mosaic':  return { type:'mosaic', x, y, w, h, blockSize: parseInt(mosaicStr?.value||12) };
    default: return null;
  }
}

// ── TEXT INPUT（canvasWrap内にtextareaを生成） ────────────
function showTextInput(cx, cy) {
  commitText();
  if (!canvasWrap || !canvas) return;

  const r   = canvas.getBoundingClientRect();
  const wr  = canvasWrap.getBoundingClientRect();
  const scx = r.width  / canvas.width;
  const scy = r.height / canvas.height;

  const left = (r.left - wr.left) + cx * scx;
  const top  = (r.top  - wr.top)  + cy * scy;

  // ラッパーdiv（textarea + 確定ボタンをまとめる）
  const wrap = document.createElement('div');
  wrap.style.cssText = [
    'position:absolute',
    `left:${left}px`,
    `top:${top}px`,
    'z-index:20',
    'display:flex',
    'flex-direction:column',
    'gap:4px',
  ].join(';');

  const ta = document.createElement('textarea');
  ta.style.cssText = [
    'min-width:160px',
    `min-height:${state.fontSize * scx * 2}px`,
    `font-size:${state.fontSize * scx}px`,
    'font-family:Inter,sans-serif',
    `color:${state.color}`,
    'background:rgba(255,255,255,0.92)',
    'border:2px solid #555',
    'border-radius:3px',
    'outline:none',
    'resize:both',
    'padding:4px 6px',
    'line-height:1.4',
    'box-shadow:0 2px 8px rgba(0,0,0,0.2)',
  ].join(';');
  ta._cx = cx;
  ta._cy = cy;

  const btn = document.createElement('button');
  btn.textContent = '確定 (Enter)';
  btn.style.cssText = [
    'padding:4px 10px',
    'font-size:12px',
    'font-family:Inter,sans-serif',
    'background:#1a1a18',
    'color:#f5f4f0',
    'border:none',
    'border-radius:4px',
    'cursor:pointer',
    'align-self:flex-start',
  ].join(';');

  wrap.appendChild(ta);
  wrap.appendChild(btn);
  textInput = wrap;
  textInput._ta = ta;
  textInput._cx = cx;
  textInput._cy = cy;
  canvasWrap.appendChild(wrap);

  // 伝播を止める
  wrap.addEventListener('mousedown', e => e.stopPropagation());
  wrap.addEventListener('mouseup',   e => e.stopPropagation());
  wrap.addEventListener('touchstart', e => e.stopPropagation());

  // 確定ボタン
  btn.addEventListener('mousedown', e => e.stopPropagation());
  btn.addEventListener('click', () => commitText());

  // キーボード
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); }
    if (e.key === 'Escape') { wrap.remove(); textInput = null; }
  });

  setTimeout(() => { ta.focus(); }, 10);
}

function commitText() {
  if (!textInput) return;
  const wrap = textInput;
  textInput  = null;
  const ta   = wrap._ta;
  const text = ta ? ta.value.trim() : '';
  wrap.remove();
  if (text) {
    state.objects.push({
      type: 'text', text,
      x: wrap._cx, y: wrap._cy,
      color: state.color, fontSize: state.fontSize, opacity: 1,
    });
    saveHistory(); redraw(); updateLayersList();
  }
}

// ── CROP ──────────────────────────────────────────────────
function applyCrop(x1, y1, x2, y2) {
  const sx = Math.min(x1,x2), sy = Math.min(y1,y2);
  const sw = Math.abs(x2-x1), sh = Math.abs(y2-y1);
  if (sw < 4 || sh < 4) return;

  // 現在の全描画（baseImage + objects）を合成してクロップ
  const off = document.createElement('canvas');
  off.width = canvas.width; off.height = canvas.height;
  const oc = off.getContext('2d');
  if (baseImage) oc.drawImage(baseImage, 0, 0);
  state.objects.forEach(o => drawObject(oc, o, false));

  const crop = document.createElement('canvas');
  crop.width = sw; crop.height = sh;
  crop.getContext('2d').drawImage(off, sx, sy, sw, sh, 0, 0, sw, sh);

  // クロップ後の画像をbaseImageとして新たに読み込む（objectsはリセット）
  const newSrc = crop.toDataURL('image/png');
  const img = new Image();
  img.onload = () => {
    baseImage = img;
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    state.objects = [];
    state.selected = null;
    saveHistory(); // cropをhistoryに積む
    redraw(); updateLayersList(); updateUndoRedo();
  };
  img.src = newSrc;
}

// ── KEYBOARD SHORTCUTS ────────────────────────────────────
document.addEventListener('keydown', e => {
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected !== null) {
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
      if (canvasWrap) canvasWrap.className = 'canvas-wrap tool-' + state.tool;
    });
  });
  document.querySelector('.tool-btn[data-tool="select"]')?.classList.add('active');
}

// ── TOPBAR ────────────────────────────────────────────────
function setupTopbar() {
  colorPicker?.addEventListener('input', e => {
    state.color = e.target.value;
    if (colorSwatch) colorSwatch.style.background = e.target.value;
    if (state.selected !== null && state.objects[state.selected]) {
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
    // 全描画を合成して保存
    const off = document.createElement('canvas');
    off.width = canvas.width; off.height = canvas.height;
    const oc = off.getContext('2d');
    if (baseImage) oc.drawImage(baseImage, 0, 0);
    state.objects.forEach(o => drawObject(oc, o, false));
    const a = document.createElement('a');
    a.href     = off.toDataURL('image/jpeg', 0.92);
    a.download = state.imageName || 'edited.jpg';
    a.click();
  });

  document.getElementById('clearAllBtn')?.addEventListener('click', () => {
    state.objects = []; state.selected = null;
    saveHistory(); redraw(); updateLayersList();
  });

  // 画像選択し直しボタン
  document.getElementById('reloadImageBtn')?.addEventListener('click', () => {
    commitText();
    if (editorFileIn) editorFileIn.click();
  });
}

// ── DROP ZONE ─────────────────────────────────────────────
function setupDropZone() {
  if (editorDrop) {
    editorDrop.addEventListener('click', () => { if (editorFileIn) editorFileIn.click(); });
  }
  if (editorFileIn) {
    editorFileIn.addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = ev => {
        state.imageName = f.name;
        loadImageSrc(ev.target.result);
        editorFileIn.value = '';
      };
      reader.onerror = () => alert('画像の読み込みに失敗しました。');
      reader.readAsDataURL(f);
    });
  }

  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault();
    const f = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
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
  if (state.objects.length === 0) {
    layersList.innerHTML = '<div style="font-size:12px;font-family:var(--mono);color:var(--text-faint);padding:8px 0">まだオブジェクトがありません</div>';
    return;
  }
  const typeIcon = { pen:'✏', rect:'▭', ellipse:'◯', arrow:'↗', text:'T', mosaic:'▦' };
  const typeName = { pen:'フリーハンド', rect:'四角形', ellipse:'円', arrow:'矢印', text:'テキスト', mosaic:'モザイク' };
  [...state.objects].reverse().forEach((obj, ri) => {
    const i = state.objects.length - 1 - ri;
    const item = document.createElement('div');
    item.className = 'layer-item' + (i === state.selected ? ' selected' : '');
    item.innerHTML = `
      <span class="layer-icon">${typeIcon[obj.type]||'?'}</span>
      <span class="layer-name">${typeName[obj.type]||obj.type}${obj.type==='text'?' — '+obj.text.slice(0,8):''}</span>
      <button class="layer-del" data-idx="${i}">&times;</button>
    `;
    item.addEventListener('click', ev => {
      if (ev.target.classList.contains('layer-del')) return;
      state.selected = i; redraw(); updateLayersList();
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
