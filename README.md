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

1. `4시간 20·120선 눌림`
4시간봉 현재가가 20선 대비 `-1%~+5%`, 120선 대비 `-10%~+2%` 범위에 있고, 일봉 20선 대비 `-3% 이상`이며 상위 매수 10호가 누적금액이 `1억 미만`인 종목

2. `4시간봉 정배열`
4시간봉 20선, 60선, 120선이 상승 정배열이고 상위 매수 10호가 누적금액이 `1억 미만`인 종목

3. `4시간 30·120선 눌림`
4시간봉 현재가가 30선 대비 `-1%~+5%`, 120선 대비 `-10%~+2%` 범위에 있고, 일봉 30선 위에 있으며 상위 매수 10호가 누적금액이 `1억 미만`인 종목

4. `4시간 30·120선 + 일봉20`
4시간봉 현재가가 30선 대비 `-1%~+5%`, 120선 대비 `-10%~+2%` 범위에 있고, 일봉 20선 위에 있으며 상위 매수 10호가 누적금액이 `1억 미만`인 종목

5. `일봉 정배열`
일봉 20일선, 60일선, 120일선이 상승 정배열인 종목

6. `일봉 정배열 + 30선 근처`
일봉 정배열이면서 현재가가 30일선 대비 `-1%~+6%` 범위에 있는 종목

7. `일봉 120선 근접`
일봉 현재가가 120일선 대비 `-1%~+7%` 범위에 있는 종목

8. `주봉 정배열`
주봉이 정배열이고 현재가가 일봉 20일선 위아래 `5% 이내`인 종목

9. `월봉 정배열`
월봉이 정배열이고 현재가가 일봉 20일선 위아래 `5% 이내`인 종목

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
