# Livestock Intelligence Hub

`goodnews724/github_page` 저장소에서 운영하는 GitHub Pages 정적 분석 앱입니다.

기존 `/home/goodnews/바탕화면/ZM_DX_PROJECTS/02_스트림릿` 의 Streamlit 기능을
GitHub Pages 구조로 옮겼습니다.

## 페이지 주소

- 저장소: https://github.com/goodnews724/github_page
- 배포 주소: https://goodnews724.github.io/github_page/

## 포함 기능

- `Inventory Studio`
  - 재고 검색
  - 창고 / 브랜드 필터
  - 재고만 보기
  - 상세 패널
  - 관리코드 복사
- `Market Atlas`
  - 검역량 연도별 월별 비교
  - USDA 일일 데이터 비교
  - 국가별 축산 지표 비교
  - 단일 / 이중축 추이 그래프
  - 월평균 / 분기별 / 반기별 집계
- `Data Ops`
  - 정적 스냅샷 생성 명령
  - 데이터 소스 구조 확인

## 데이터 구조

GitHub Pages에서는 비공개 Google Sheets 자격증명을 브라우저에서 사용할 수 없으므로,
로컬에서 시트를 읽어 정적 JSON으로 export 한 뒤 배포합니다.

- `data/inventory.json`
- `data/analytics.json`
- `data/metadata.json`

## 스냅샷 갱신

```bash
/home/goodnews/바탕화면/ZM_DX_PROJECTS/venv/bin/python \
  /home/goodnews/바탕화면/ZM_DX_PROJECTS/03_깃헙_페이지/scripts/export_streamlit_data.py
```

## 배포

```bash
cd /home/goodnews/바탕화면/ZM_DX_PROJECTS/03_깃헙_페이지
git add .
git commit -m "Refresh pages snapshot"
git push
```

## 주요 파일

- `index.html`: 앱 셸
- `app.js`: UI 상태 관리, 필터, 차트 로직
- `styles.css`: 전체 디자인 시스템
- `scripts/export_streamlit_data.py`: Google Sheets → 정적 JSON export
