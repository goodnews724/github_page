# github_page

`goodnews724/github_page` 저장소로 관리하는 GitHub Pages 시작용 프로젝트입니다.

## 페이지 주소

- 저장소: https://github.com/goodnews724/github_page
- 배포 주소: https://goodnews724.github.io/github_page/

## 파일 구성

- `index.html`: 메인 페이지
- `styles.css`: 스타일 파일
- `.nojekyll`: 정적 파일 그대로 배포

## 기본 배포 순서

```bash
git add .
git commit -m "Initial GitHub Pages site"
git push -u origin main
```

GitHub 저장소에서 `Settings > Pages`로 들어가 `Deploy from a branch`를 선택하고,
브랜치는 `main`, 폴더는 `/ (root)`로 설정하면 됩니다.
