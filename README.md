# Quant Screener

빗썸 공개 데이터를 기반으로 조건별 코인 후보를 추려주는 스크리너입니다.

## 구조

- `server.ts`: 빗썸 데이터 조회, 조건 판정, CSV 생성
- `src/App.tsx`: 조건 선택 UI, 검색, 정렬, 결과 표시
- `public/`: PWA 설정 파일과 생성 CSV 위치

## 실행

1. Node.js LTS 설치
2. 의존성 설치
   ```bash
   npm install
   ```
3. 포트 3000 사용 중인 프로세스 정리
   ```powershell
   Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
     Select-Object -ExpandProperty OwningProcess -Unique |
     ForEach-Object { Stop-Process -Id $_ -Force }
   ```
4. 개발 서버 실행
   ```bash
   npm run dev
   ```
5. 브라우저에서 `http://localhost:3000` 접속

## 조건

1. `일봉 정배열`
2. `월봉 정배열`
3. `주봉 정배열`
4. `20·120선 범위`
5. `20·240선 범위`

## 정리

- 산출물, 로그, 생성 CSV 정리
  ```bash
  npm run clean
  ```
- 서버 종료 후 남은 Node 프로세스 정리
  ```powershell
  Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
  ```

## 수정 포인트

- 조건 로직 수정: `server.ts`
- 화면 설명 수정: `src/App.tsx`
- 스타일 수정: `src/index.css`

## 배포

`Railway` 또는 `Render` 같은 Node 지원 서비스에 그대로 올릴 수 있습니다.
