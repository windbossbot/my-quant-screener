# Quant Screener

빗썸 공개 데이터를 기반으로 조건별 코인 후보를 추려주는 스크리너입니다.

## 실행

1. 의존성 설치
   ```bash
   npm install
   ```
2. 포트 3000 사용 중인 프로세스 정리
   ```powershell
   Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
     Select-Object -ExpandProperty OwningProcess -Unique |
     ForEach-Object { Stop-Process -Id $_ -Force }
   ```
3. 개발 서버 실행
   ```bash
   npm run dev
   ```
4. 브라우저에서 `http://localhost:3000` 접속

## 조건

1. `일봉 정배열`
2. `월봉 정배열`
3. `주봉 정배열`
4. `4시간 20·120선 범위 + 일봉 20선 -3% 이상`
5. `4시간봉 정배열`

## 정리

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
- 로컬 메모, 실험안, 백테스팅 파일은 `.local/` 아래에서만 관리
