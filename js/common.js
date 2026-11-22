// 분리배출 AI 감독기 — 공통 설정과 함수
// 월요일에 모델을 바꿀 때는 models/폴더 안의 파일 3개만 바꾸면 됩니다. 이 파일은 고치지 않아도 돼요.

const APP = {
  // 판단을 믿을 최소 확률 (이보다 낮으면 "감독기도 잘 모르겠어요")
  THRESHOLD: 0.7,
  // 구슬 병: 이만큼 모이면 미덕 보석
  JAR_SIZE: 10,
  // 같은 물건을 이 시간 안에 다시 통과하면 구슬 없음 (화면에서만 확인, 저장 안 함)
  REPEAT_SECONDS: 30,
  MODELS: {
    label:  { dir: '01_label',  name: '① PET 라벨',        classes: ['label_on', 'label_off'], ko: { label_on: '라벨 있음', label_off: '라벨 없음' } },
    liquid: { dir: '02_liquid', name: '② PET 내용물',      classes: ['liquid', 'empty'],      ko: { liquid: '내용물 남음', empty: '비었음' } },
    vinyl:  { dir: '03_vinyl',  name: '③ 비닐 vs 종이',    classes: ['vinyl', 'paper'],       ko: { vinyl: '비닐·플라스틱', paper: '종이' } },
    wipe:   { dir: '04_wipe',   name: '④ 물티슈 vs 종이',  classes: ['wipe', 'paper'],        ko: { wipe: '휴지·물티슈', paper: '종이' } },
    size:   { dir: '05_size',   name: '⑤ 손바닥 크기',     classes: ['small', 'big'],         ko: { small: '손바닥을 다 못 가림(작음)', big: '손바닥을 다 가림(큼)' } },
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

// ---------- 날짜 ----------
function dayKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

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
