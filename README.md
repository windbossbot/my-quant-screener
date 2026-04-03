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

배포 시에는 `npm run build` 후 `npm start`를 사용합니다. 서버 헬스체크 경로는 `/healthz` 입니다.

## 전역 조건 부트스트랩

- 단일 기준 파일: [screenerBootstrap.ts](/C:/Users/KGWPC/workspace/my-quant-screener/src/config/screenerBootstrap.ts)
- 진입 프록시 기준 파일: [entryBootstrap.ts](/C:/Users/KGWPC/workspace/my-quant-screener/src/config/entryBootstrap.ts)
- 복붙용 설명 문서: [condition-reference.md](/C:/Users/KGWPC/workspace/my-quant-screener/docs/condition-reference.md)
- 현재 조건 목록 빠른 출력:
  ```bash
  npm run conditions:print
  ```
- 현재 진입 프록시 빠른 출력:
  ```bash
  npm run entry:print
  ```

## 조건

1. `4시간봉 20·120선 눌림`
4시간봉 현재가가 20선 대비 `-1%~+5%`, 120선 대비 `-10%~+2%` 범위에 있고, 일봉 20선 대비 `-3% 이상`이며 상위 매수 10호가 누적금액이 `1억 미만`인 종목

2. `4시간봉 정배열`
4시간봉 20선, 60선, 120선이 상승 정배열이고 상위 매수 10호가 누적금액이 `1억 미만`인 종목

3. `4시간봉 30·120선 눌림 + 일봉 30선 위`
4시간봉 현재가가 30선 대비 `-1%~+5%`, 120선 대비 `-10%~+2%` 범위에 있고, 일봉 30선 위에 있으며 상위 매수 10호가 누적금액이 `1억 미만`인 종목

4. `4시간봉 30·120선 눌림 + 일봉 20선 위`
4시간봉 현재가가 30선 대비 `-1%~+5%`, 120선 대비 `-10%~+2%` 범위에 있고, 일봉 20선 위에 있으며 상위 매수 10호가 누적금액이 `1억 미만`인 종목

11. `4시간봉 1일 20선 터치 + 거래량 유입`
현재 4시간봉이 일봉 20선을 터치하고 종가가 일봉 20선 위에 있으며, 최근 30일 안에 거래량 유입 양봉이 있고 4시간봉 20선 대비 `-1%~+8%`, 120선 또는 240선 대비 `-10%~+4%` 엔벨로프를 만족하며 `24시간 거래대금 1.5억 KRW 이상`, `최근 20개 4시간봉 평균 거래대금 2천만 KRW 이상`인 메이저 제외 종목

5. `일봉 정배열`
일봉 20일선, 60일선, 120일선이 상승 정배열인 종목

6. `일봉 정배열 + 30일선 근접`
일봉 20일선, 60일선, 120일선이 상승 정배열이고 현재가가 30일선 대비 `-1%~+6%` 범위에 있는 종목

7. `일봉 120일선 근접`
일봉 현재가가 120일선 대비 `-1%~+7%` 범위에 있는 종목

8. `일봉 120일선 ±10%`
일봉 현재가가 120일선 대비 `-10%~+10%` 범위에 있는 종목

9. `주봉 정배열 + 일봉 20선 근접`
주봉 20일선, 60일선, 120일선이 상승 정배열이고 현재가가 일봉 20일선 위아래 `5% 이내`인 종목

10. `월봉 정배열 + 일봉 20선 근접`
월봉 20일선, 60일선, 120일선이 상승 정배열이고 현재가가 일봉 20일선 위아래 `5% 이내`인 종목

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
- 서버 빌드 산출물 `build-server/` 는 커밋 대상이 아님
- 구조화 로그 파일은 `logs/app-YYYY-MM-DD.log`
- 화면 즐겨찾기는 브라우저 세션 동안만 유지
- 로컬 메모, 실험안, 백테스팅 파일은 `.local/` 아래에서만 관리
- 백테스팅 폴더만 비우려면
  ```bash
  npm run clean:backtesting
  ```
