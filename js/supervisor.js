// 감독 규칙: 아이의 신고(claims)와 AI 판단(ai)을 비교해 점검 결과를 만듭니다.

const ITEMS = {
  pet:   { ko: '페트병',        em: '🧴', hint: '음료수병, 생수병',
           checklist: [
             { k: 'emptied', q: '내용물을 다 비웠어요', ai: 'liquid' },
             { k: 'rinsed',  q: '물로 헹궜어요',        self: true },
             { k: 'label',   q: '라벨을 뗐어요',        ai: 'label' },
           ],
           photos: [{ k: 'object', guide: '병을 검정 판 앞에 세워요. 물 높이와 라벨 자리가 보이게 옆에서 찍어요.' }] },
  vinyl: { ko: '비닐·과자봉지', em: '🍬', hint: '과자봉지, 사탕 껍질, 비닐',
           checklist: [ { k: 'shaken', q: '부스러기를 털었어요', self: true } ],
           photos: [{ k: 'object', guide: '봉지를 검정 판 앞에 들고, 화면 가운데에 크게 찍어요.' }] },
  paper: { ko: '종이',          em: '📄', hint: '학습지, 색종이, 종이 상자',
           checklist: [ { k: 'tape', q: '테이프·스테이플러를 뗐어요', self: true } ],
           sizeQ: true,
           photos: [
             { k: 'object', guide: '종이를 검정 판 앞에 들고, 화면 가운데에 크게 찍어요.' },
             { k: 'palm',   guide: '✋ 한 손 손가락으로 종이 끝을 집고, 다른 손바닥을 종이 바로 뒤에 펴요(손가락 붙이기). 종이를 펴고, 손바닥 전체가 보이게 찍어요.' },
           ] },
  wipe:  { ko: '휴지·물티슈',   em: '🧻', hint: '휴지, 물티슈, 냅킨',
           checklist: [],
           photos: [{ k: 'object', guide: '휴지·물티슈를 검정 판 앞에 들고, 화면 가운데에 크게 찍어요.' }] },
  other: { ko: '기타 / 잘 모르겠어요', em: '❓', hint: '우유팩, 캔, 그 밖의 것' },
};

const BOXES = {
  paper:   { ko: '종이 상자',     em: '📄' },
  plastic: { ko: '플라스틱 상자', em: '🧴' },
  general: { ko: '일반쓰레기',    em: '🗑️' },
};

// photos: {object: canvas224, palm: canvas224}
async function runModels(item, photos) {
  const jobs = {};
  if (item === 'pet')   { jobs.liquid = ['liquid', photos.object]; jobs.label = ['label', photos.object]; }
  if (item === 'vinyl') { jobs.vinyl = ['vinyl', photos.object]; }
  if (item === 'paper') { jobs.vinyl = ['vinyl', photos.object]; jobs.wipe = ['wipe', photos.object]; jobs.size = ['size', photos.palm]; }
  if (item === 'wipe')  { jobs.wipe = ['wipe', photos.object]; }
  const keys = Object.keys(jobs);
  // 같은 사진을 여러 모델에 동시에 넣습니다.
  const res = await Promise.all(keys.map(k => predict(jobs[k][0], jobs[k][1])));
  const ai = {};
  keys.forEach((k, i) => ai[k] = res[i]);
  return ai;
}

function p100(x) { return Math.round(x * 100) + '%'; }
function aiNote(key, r) { return `감독기: ${APP.MODELS[key].ko[r.label] || r.label} (확신 ${p100(r.prob)})`; }

function evaluate(item, claims, box, ai) {
  const checks = [];
  const add = (key, title, status, msg, aiKey) => checks.push({ key, title, status, msg, ai: aiKey && ai[aiKey] ? { model: aiKey, label: ai[aiKey].label, prob: +ai[aiKey].prob.toFixed(3) } : null });
  const unsureMsg = '감독기도 잘 모르겠어요. 검정 판 앞에서 다시 찍어 볼까요?';
  let expected = null;

  if (item === 'pet') {
    // 비우기
    if (claims.emptied === false) add('emptied', '비우기', 'warn', '아직 안 비웠다고 했어요. 내용물을 비우고 다시 와요.');
    else { const r = ai.liquid;
      if (!r.sure) add('emptied', '비우기', 'unsure', unsureMsg, 'liquid');
      else if (r.label === 'liquid') add('emptied', '비우기', 'warn', '"비웠어요"라고 했는데, 감독기에는 내용물이 남아 보여요.', 'liquid');
      else add('emptied', '비우기', 'ok', '다 비운 것을 확인했어요!', 'liquid'); }
    // 헹구기 (AI가 볼 수 없음)
    if (claims.rinsed === false) add('rinsed', '헹구기', 'warn', '아직 안 헹궜다고 했어요. 헹구고 다시 와요.');
    else add('rinsed', '헹구기', 'self', '감독기는 헹군 것을 볼 수 없어요. 스스로 한 약속이에요!');
    // 분리하기 (라벨)
    if (claims.label === false) add('label', '라벨 떼기', 'warn', '아직 라벨을 안 뗐다고 했어요. 라벨을 떼고 다시 와요.');
    else { const r = ai.label;
      if (!r.sure) add('label', '라벨 떼기', 'unsure', unsureMsg, 'label');
      else if (r.label === 'label_on') add('label', '라벨 떼기', 'warn', '"뗐어요"라고 했는데, 감독기에는 라벨이 보여요.', 'label');
      else add('label', '라벨 떼기', 'ok', '라벨을 뗀 것을 확인했어요!', 'label'); }
    expected = 'plastic';
  }

  if (item === 'vinyl') {
    const r = ai.vinyl;
    if (!r.sure) add('kind', '비닐이 맞나요?', 'unsure', unsureMsg, 'vinyl');
    else if (r.label === 'paper') add('kind', '비닐이 맞나요?', 'warn', '감독기에는 종이처럼 보여요. 종이라면 종이 상자예요.', 'vinyl');
    else add('kind', '비닐이 맞나요?', 'ok', '비닐·플라스틱이 맞아요!', 'vinyl');
    if (claims.shaken === false) add('shaken', '부스러기 털기', 'warn', '아직 안 털었다고 했어요. 털고 다시 와요.');
    else add('shaken', '부스러기 털기', 'self', '감독기는 볼 수 없어요. 스스로 한 약속이에요!');
    expected = 'plastic';
  }

  if (item === 'paper') {
    const v = ai.vinyl, w = ai.wipe, s = ai.size;
    if (!v.sure) add('kind', '종이가 맞나요?', 'unsure', unsureMsg, 'vinyl');
    else if (v.label === 'vinyl') add('kind', '종이가 맞나요?', 'warn', '감독기에는 비닐처럼 보여요. 비닐이면 플라스틱 상자예요.', 'vinyl');
    else add('kind', '종이가 맞나요?', 'ok', '종이가 맞아요!', 'vinyl');

    if (!w.sure) add('wipe', '휴지·물티슈가 아닌가요?', 'unsure', unsureMsg, 'wipe');
    else if (w.label === 'wipe') add('wipe', '휴지·물티슈가 아닌가요?', 'warn', '감독기에는 휴지·물티슈처럼 보여요. 휴지·물티슈는 일반쓰레기예요.', 'wipe');
    else add('wipe', '휴지·물티슈가 아닌가요?', 'ok', '휴지·물티슈가 아니에요!', 'wipe');

    const claimSmall = claims.size === 'small';
    if (!s.sure) add('size', '손바닥 크기', 'unsure', '감독기도 크기를 잘 모르겠어요. 종이를 펴고, 손바닥 전체가 종이 바로 뒤에 보이게 다시 찍어 볼까요?', 'size');
    else if ((s.label === 'small') !== claimSmall)
      add('size', '손바닥 크기', 'warn', s.label === 'small'
        ? '"손바닥을 다 가려요"라고 했는데, 감독기에는 손바닥을 다 못 가리는 것 같아요. 길이만 길어도 작은 조각이에요 → 일반쓰레기.'
        : '"손바닥을 못 가려요"라고 했는데, 감독기에는 손바닥을 다 가리는 큰 종이로 보여요 → 종이 상자.', 'size');
    else add('size', '손바닥 크기', 'ok', claimSmall ? '손바닥을 다 못 가리는 작은 조각이 맞아요.' : '손바닥을 다 가리는 큰 종이가 맞아요.', 'size');

    if (claims.tape === false) add('tape', '테이프 떼기', 'warn', '아직 안 뗐다고 했어요. 떼고 다시 와요.');
    else add('tape', '테이프 떼기', 'self', '감독기는 볼 수 없어요. 스스로 한 약속이에요!');

    if (w.sure && w.label === 'wipe') expected = 'general';
    else if (s.sure) expected = s.label === 'small' ? 'general' : 'paper';
    else expected = claimSmall ? 'general' : 'paper';
  }

  if (item === 'wipe') {
    const r = ai.wipe;
    if (!r.sure) add('kind', '휴지·물티슈가 맞나요?', 'unsure', unsureMsg, 'wipe');
    else if (r.label === 'paper') add('kind', '휴지·물티슈가 맞나요?', 'warn', '감독기에는 종이처럼 보여요. 손바닥보다 큰 종이라면 종이 상자예요.', 'wipe');
    else add('kind', '휴지·물티슈가 맞나요?', 'ok', '휴지·물티슈가 맞아요!', 'wipe');
    expected = 'general';
  }

  // 섞지 않기: 고른 상자 확인
  if (box === expected) add('box', '버릴 곳', 'ok', `${BOXES[box].ko}에 넣으면 돼요!`);
  else add('box', '버릴 곳', 'warn', `${BOXES[box].ko}가 아니라 ${BOXES[expected].ko}에 넣어야 해요.`);

  const pass = checks.every(c => c.status === 'ok' || c.status === 'self');
  return { checks, expected, pass };
}

// 🌍 지구 카드: 통과할 때마다 한 장 (저장하지 않음)
const EARTH_CARDS = [
  { em: '🧴', t: '깨끗하게 모은 투명 페트병은 다시 실이 되어 옷이나 가방으로 태어날 수 있어요.' },
  { em: '🏷️', t: '라벨을 떼야 하는 이유! 라벨은 병과 재질이 달라서, 붙어 있으면 재활용이 어려워져요.' },
  { em: '🫗', t: '음료가 조금만 남아도 다른 재활용품까지 더러워질 수 있어요. 비우기가 첫걸음!' },
  { em: '📄', t: '종이는 다시 종이로 태어날 수 있어요. 깨끗하고 마른 종이일수록 좋아요.' },
  { em: '🧻', t: '휴지와 물티슈는 재활용이 안 돼요. 특히 물티슈에는 플라스틱 섬유가 들어 있어요.' },
  { em: '✂️', t: '너무 작은 종이 조각은 재활용 과정에서 걸러지기 어려워요. 그래서 일반쓰레기로!' },
  { em: '🍬', t: '과자 봉지는 비닐류예요. 부스러기를 털고 버리면 재활용이 쉬워져요.' },
  { em: '🌳', t: '종이를 재활용하면 새 종이를 만들 때보다 나무와 물을 아낄 수 있어요.' },
  { em: '🌏', t: '분리배출을 잘하면 쓰레기를 태우거나 묻는 양이 줄어 지구가 숨쉬기 편해져요.' },
  { em: '💪', t: '비우고, 헹구고, 분리하고, 섞지 않기. 오늘 한 번이 내일의 습관이 돼요!' },
];
function earthCard() { return EARTH_CARDS[Math.floor(Math.random() * EARTH_CARDS.length)]; }
