# ♻️ 분리배출 AI 감독기

아이가 먼저 **신고**(무엇인지, 무엇을 했는지, 어디에 버릴지)하면, 감독기가 사진으로 **점검**하는 웹앱이에요.
AI 판단은 모두 **사용하는 기기의 브라우저 안에서** 이루어져요. 서버나 유료 API를 쓰지 않아서 비용이 들지 않아요.

| 페이지 | 하는 일 |
|---|---|
| `index.html` | 학생용 감독기: 번호 → 무엇? → 한 일 → 버릴 곳 → 사진 → 감독 결과. **👩‍🏫 체험하기**(기록 안 남음)와 **🖼️ 사진 올리기**(발표 시연용) 포함 |
| `teacher.html` | 교사용: ① 모델 평가(정분류율, 혼동행렬, 틀린 사진, CSV) ② 감독 기록 ③ 상 후보 ④ 선생님 판정 ⑤ 백업 |
| `collect.html` | 사진 모으기: 감독기와 똑같이 정사각형으로 저장 → ZIP 파일 |

## 폴더 구조
```
index.html  teacher.html  collect.html
css/  js/  lib/            ← 고치지 않아요
models/01_label/  models/02_liquid/  models/03_vinyl/  models/04_wipe/  models/05_size/
models_v0/ (같은 구조)     ← 금요일(v0) 모델 보관용. 월요일 v1과 비교할 때 써요
```
모델 폴더마다 티처블 머신에서 내보낸 `model.json`, `metadata.json`, `weights.bin` 세 파일을 넣어요.

## 클래스 이름 (반드시 이대로)
| 폴더 | 클래스 |
|---|---|
| 01_label | `label_on`, `label_off` |
| 02_liquid | `liquid`, `empty` |
| 03_vinyl | `vinyl`, `paper` |
| 04_wipe | `wipe`, `paper` |
| 05_size | `small`, `big` |

이름이 다르면 감독기 첫 화면에 빨간 안내가 떠요.

## 배포 (GitHub Pages)
1. GitHub에서 **New repository**를 만들어요 (예: `recycle-ai`, Public).
2. **Add file → Upload files**로 이 폴더의 내용을 **전부** 끌어다 놓고 Commit해요.
   - ⚠️ 학생 사진은 올리지 않아요. 모델 파일과 코드만 올려요.
3. **Settings → Pages → Branch: `main` / `/(root)` → Save**를 눌러요.
4. 1~2분 뒤 `https://아이디.github.io/recycle-ai/` 주소가 생겨요. 카메라는 https 주소에서만 켜져요.

## 월요일에 모델 바꾸기
1. 금요일 모델을 `models_v0/` 폴더에 그대로 복사해 둬요. (한 번만)
2. 티처블 머신에서 `.tm` 파일을 열고 → 사진 추가 → 다시 학습 → Tensorflow.js로 내보내요.
3. GitHub에서 `models/05_size/` 같은 폴더로 들어가 **Add file → Upload files**로 세 파일을 덮어써요.
4. 교사용 ① 모델 평가에서 **같은 고정 개발용 사진**으로 `지금 모델`과 `금요일 모델`을 각각 평가해서 비교해요.

## 기록과 개인정보
- 감독 기록은 **이 기기의 브라우저 안에만** 저장되고, **번호만** 저장해요(이름 없음). 인터넷으로 나가지 않아요.
- 감독기는 분리배출 자리의 **기기 1대**에서 쓰고, 매주 교사용 ⑤에서 **백업**해요.
- 이의 제기 기록만 작은 사진(160px)을 함께 저장해요. 선생님 판정용이에요.
- **체험하기**로 한 것은 저장하지 않아요. **사진 올리기**로 한 것은 기록에는 남지만 상 점수에는 넣지 않아요(촬영한 것만 인정).
- 글꼴: Pretendard (SIL Open Font License, `fonts/LICENSE.txt`)

## 설정 바꾸기 (`js/common.js` 맨 위)
- `THRESHOLD: 0.7`: 감독기가 "잘 모르겠어요"라고 하는 확신 기준
- `STUDENTS`: 학급 번호
- `MIN_WEEKLY_FOR_RANK`, `MAX_COUNTED_PER_DAY`, `REPEAT_SECONDS`, `CLASS_GOAL`: 상 점수 규칙
