// 분리배출 AI 감독기 — 공통 설정과 함수
// 월요일에 모델을 바꿀 때는 models/폴더 안의 파일 3개만 바꾸면 됩니다. 이 파일은 고치지 않아도 돼요.

const APP = {
  // 판단을 믿을 최소 확률 (이보다 낮으면 "감독기도 잘 모르겠어요")
  THRESHOLD: 0.7,
  // 우리 반 번호 (53번 전출)
  STUDENTS: [1,2,3,4,5,6,7,8,9,10,11,51,52,54,55,56,57,58,59,60,61,62],
  // 점수 규칙
  MIN_WEEKLY_FOR_RANK: 5,   // 주 5회 이상 써야 순위에 들어감
  MAX_COUNTED_PER_DAY: 5,   // 하루 최대 5회까지만 점수에 넣음
  REPEAT_SECONDS: 60,       // 60초 안에 다시 하면 1회로 셈
  CLASS_GOAL: 0.9,          // 학급 목표 통과율
  STORAGE_KEY: 'recycle_supervisor_records_v1',
  MODELS: {
    label:  { dir: '01_label',  name: '① PET 라벨',        classes: ['label_on', 'label_off'], ko: { label_on: '라벨 있음', label_off: '라벨 없음' } },
    liquid: { dir: '02_liquid', name: '② PET 내용물',      classes: ['liquid', 'empty'],      ko: { liquid: '내용물 남음', empty: '비었음' } },
    vinyl:  { dir: '03_vinyl',  name: '③ 비닐 vs 종이',    classes: ['vinyl', 'paper'],       ko: { vinyl: '비닐·플라스틱', paper: '종이' } },
    wipe:   { dir: '04_wipe',   name: '④ 물티슈 vs 종이',  classes: ['wipe', 'paper'],        ko: { wipe: '휴지·물티슈', paper: '종이' } },
    size:   { dir: '05_size',   name: '⑤ 손바닥 크기',     classes: ['small', 'big'],         ko: { small: '손바닥보다 작음', big: '손바닥보다 큼' } },
  },
};

// ---------- 사진 처리 ----------
// 카메라 화면이나 사진 전체를 자르지 않고 정사각형으로 눌러 맞춥니다 (학습 사진 v3와 같은 처리).
function squishToCanvas(source, size = 224) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const w = source.videoWidth || source.naturalWidth || source.width;
  const h = source.videoHeight || source.naturalHeight || source.height;
  c.getContext('2d').drawImage(source, 0, 0, w, h, 0, 0, size, size);
  return c;
}

function canvasToDataURL(canvas, size = 160, quality = 0.7) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(canvas, 0, 0, size, size);
  return c.toDataURL('image/jpeg', quality);
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(img.src); resolve(img); };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ---------- 모델 ----------
const _modelCache = {};
async function loadModel(key, base = 'models') {
  const id = base + '/' + key;
  if (_modelCache[id]) return _modelCache[id];
  const m = APP.MODELS[key];
  const url = `${base}/${m.dir}/`;
  const p = tmImage.load(url + 'model.json', url + 'metadata.json').then(model => {
    const labels = model.getClassLabels();
    const missing = m.classes.filter(c => !labels.includes(c));
    model._ok = missing.length === 0;
    model._labels = labels;
    model._missing = missing;
    return model;
  });
  _modelCache[id] = p;
  p.catch(() => delete _modelCache[id]);
  return p;
}

// 결과: { label, prob, sure, all: {class: prob} }
async function predict(key, canvas224, base = 'models') {
  const model = await loadModel(key, base);
  const out = await model.predict(canvas224);
  const all = {};
  out.forEach(o => { all[o.className] = o.probability; });
  let best = out.reduce((a, b) => (b.probability > a.probability ? b : a));
  return { label: best.className, prob: best.probability, sure: best.probability >= APP.THRESHOLD, all };
}

// ---------- 카메라 ----------
async function startCamera(video, deviceId) {
  if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
  const constraints = deviceId
    ? { video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }
    : { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
  await video.play();
  return stream;
}

async function listCameras() {
  const devs = await navigator.mediaDevices.enumerateDevices();
  return devs.filter(d => d.kind === 'videoinput');
}

// ---------- 기록 저장 (이 기기의 브라우저 안에만 저장) ----------
const Store = {
  load() {
    try { return JSON.parse(localStorage.getItem(APP.STORAGE_KEY)) || []; }
    catch (e) { return []; }
  },
  save(list) {
    try { localStorage.setItem(APP.STORAGE_KEY, JSON.stringify(list)); return true; }
    catch (e) { alert('기록을 저장하지 못했어요. 선생님께 알려 주세요. (저장 공간 부족)'); return false; }
  },
  upsert(rec) {
    const list = Store.load();
    const i = list.findIndex(r => r.id === rec.id);
    if (i >= 0) list[i] = rec; else list.push(rec);
    Store.save(list);
  },
};

// ---------- 점수 계산 ----------
function dayKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function weekStart(ts) { const d = new Date(ts); const day = (d.getDay() + 6) % 7; d.setHours(0,0,0,0); d.setDate(d.getDate() - day); return d.getTime(); }
function monthStart(ts, offset = 0) { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth() + offset, 1).getTime(); }

// 기록마다 counted(점수에 들어가는지), firstPass(한 번에 통과)를 정합니다.
function scoreRecords(all) {
  const recs = all.filter(r => r.num != null && r.item !== 'other').sort((a, b) => a.ts - b.ts);
  const lastTs = {}, perDay = {};
  for (const r of recs) {
    r._counted = false; r._why = '';
    if (r.disputed && !r.verdict) { r._why = '선생님 판정 대기'; continue; }
    if (r.uploaded) { r._why = '사진 올리기로 함(촬영 아님)'; continue; }
    const prev = lastTs[r.num];
    lastTs[r.num] = r.ts;
    if (prev && r.ts - prev < APP.REPEAT_SECONDS * 1000) { r._why = '1분 안에 다시 함'; continue; }
    const k = r.num + '|' + dayKey(r.ts);
    perDay[k] = (perDay[k] || 0) + 1;
    if (perDay[k] > APP.MAX_COUNTED_PER_DAY) { r._why = '하루 5회 초과'; continue; }
    r._counted = true;
    r._firstPass = r.verdict === 'child' ? true : r.verdict === 'ai' ? false : !!r.firstPass;
  }
  return recs;
}

function summarize(recs, from, to) {
  const by = {};
  APP.STUDENTS.forEach(n => by[n] = { num: n, uses: 0, counted: 0, pass: 0, days: new Set() });
  for (const r of recs) {
    if (r.ts < from || r.ts >= to || !by[r.num]) continue;
    const s = by[r.num];
    s.uses++; s.days.add(dayKey(r.ts));
    if (r._counted) { s.counted++; if (r._firstPass) s.pass++; }
  }
  return APP.STUDENTS.map(n => { const s = by[n]; return { ...s, days: s.days.size, rate: s.counted ? s.pass / s.counted : null }; });
}

// ---------- CSV ----------
function toCSV(rows) {
  return '﻿' + rows.map(r => r.map(v => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\n');
}
function download(name, content, type = 'text/csv') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function fmtTime(ts) { const d = new Date(ts); return `${dayKey(ts)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function pct(x) { return x == null ? '–' : Math.round(x * 100) + '%'; }
