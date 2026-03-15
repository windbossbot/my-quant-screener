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
4. `4시간 20·120선 범위`
5. `4시간 20·240선 범위`
6. `4시간봉 정배열`

## 작업 원칙

- 작업 시작 전 `3000` 포트를 쓰는 기존 프로세스가 있으면 먼저 종료
- 작업 중 임시 실행한 로컬 서버와 백그라운드 프로세스는 끝나면 반드시 종료
- 결과 확인 후 불필요한 로그, 생성 CSV, 빌드 산출물은 `npm run clean`으로 정리
- 강제 최신 데이터가 필요할 때만 화면의 `Reload`를 사용

## 종료 체크리스트

1. 로컬 서버 종료
   ```powershell
   Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
     Select-Object -ExpandProperty OwningProcess -Unique |
     ForEach-Object { Stop-Process -Id $_ -Force }
   ```
2. 남은 Node 프로세스 확인 후 필요 시 종료
   ```powershell
   Get-Process node -ErrorAction SilentlyContinue
   ```
3. 산출물 정리
   ```bash
   npm run clean
   ```

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
