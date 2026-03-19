# Quant Screener

빗썸 공개 데이터를 기반으로 조건별 코인 후보를 추려주는 스크리너입니다.

## 실행

1. 의존성 설치
   ```bash
   npm install
   ```
2. 환경변수 템플릿 복사
   ```bash
   copy .env.example .env
   ```
3. 로컬 작업 폴더 준비
   ```bash
   npm run setup:local
   ```
4. 포트 3000 사용 중인 프로세스 정리
   ```powershell
   Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
     Select-Object -ExpandProperty OwningProcess -Unique |
     ForEach-Object { Stop-Process -Id $_ -Force }
   ```
5. 개발 서버 실행
   ```bash
   npm run dev
   ```
6. 브라우저에서 `http://localhost:3000` 접속

## 조건

1. `4시간 20·120선 범위 + 일봉 20선 -3% 이상 + 상위 매수 10호가 1억 미만`
2. `4시간봉 정배열 + 상위 매수 10호가 1억 미만`
3. `4시간 30·120선 범위 + 일봉 30선 상단 + 상위 매수 10호가 1억 미만`
4. `4시간 30·120선 범위 + 일봉 20선 상단 + 상위 매수 10호가 1억 미만`
5. `일봉 정배열`
6. `일봉 120선 근접 (-1%~+5%)`
7. `주봉 정배열`
8. `월봉 정배열`

## 정리

- 실행 전 포트 충돌은 `npm run preflight`가 먼저 확인
- 로컬 서버 종료
  ```powershell
  Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force }
  ```
- 산출물 정리
  ```bash
  npm run clean
  ```
- 구조화 로그 파일은 `logs/app-YYYY-MM-DD.log`
- 화면 즐겨찾기는 브라우저 세션 동안만 유지
- 로컬 메모, 실험안, 백테스팅 파일은 `.local/` 아래에서만 관리
- 백테스팅 폴더만 비우려면
  ```bash
  npm run clean:backtesting
  ```
