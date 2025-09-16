# 🚗 Robot Workcell Dashboard & Controller


**목표**  
자동차 버튼 도색 공정에서 사람이 수작업으로 수행하던 **부품 지그(판) 끼우기/빼기 작업**을 로봇이 대신 수행하고,  
이를 **웹 대시보드**에서 원격으로 제어·모니터링할 수 있도록 구현한 프로젝트입니다. (with ChatGPT) 

- **실시간 센서 시각화 (HC-SR04)**
- **원격 지그 잠금/해제 (SG90 Servo)**
- **LED 제어 및 긴급정지**
- **웹 UI(React + Next.js) 기반 컨트롤러**
- **SQLite 로그 기록 및 색상별 로그 뷰어**


## 📸 프로젝트 개념도
[사용자] <-> [웹 대시보드 (Next.js/React, Chart.js, WebSocket)]
<-> [Next.js 서버 (API + WS Hub + SQLite)]
<-> [STM32 Nucleo (C, HAL)]
├─ 초음파 센서 HC-SR04 (부품 접근 감지)
├─ SG90 서보 (지그 잠금/해제)
└─ LED (원격 상태 표시)


## 🛠️ 사용 기술 스택

### Frontend
- **React + Next.js** : UI & API 통합
- **Chart.js + react-chartjs-2** : 실시간 센서 그래프
- **WebSocket API** : 실시간 상태 업데이트
- **TailwindCSS** : UI 스타일링

### Backend
- **Next.js Route Handlers**
- **SQLite3 (better-sqlite3)** : 로깅 DB
- **ws** : WebSocket 서버
- **serialport** : PC ↔ STM32 통신

### Hardware
- **STM32 Nucleo** 보드
- **HC-SR04 초음파 센서** : 물체 접근 감지
- **SG90 서보 모터** : 지그 잠금/해제 동작
- **LED + 저항** : 원격 상태 표시
- **브레드보드 & 점퍼 케이블**


## 🔧 하드웨어 연결 (핀맵)

| 장치        | STM32 핀 | 메모 |
|-------------|---------|------|
| HC-SR04 TRIG | PA8     | Output |
| HC-SR04 ECHO | PA9     | Input (5V → 3.3V 분압) |
| SG90 Servo   | PB3     | PWM (TIM2_CH2) |
| LED          | PB5     | Output (330Ω 직렬 저항) |
| GND          | GND     | 모든 장치와 공통 |
| VCC          | 5V      | HC-SR04, SG90, LED |


## 🗂️ 프로젝트 구조
```
root/
├─ app/ # Next.js App Router
│ ├─ page.tsx # Dashboard UI
│ └─ api/
│ ├─ logs/route.ts # GET /api/logs
│ └─ command/route.ts # POST /api/command
├─ components/
│ ├─ StatusCards.tsx
│ ├─ TelemetryChart.tsx
│ ├─ ControlPanel.tsx
│ └─ LogTable.tsx
├─ lib/
│ ├─ db.ts # SQLite init
│ ├─ serial.ts # SerialPort bridge
│ └─ ws-server.ts # WebSocket server
├─ stm32/ # 펌웨어 코드 (HAL 기반)
│ ├─ hcsr04.c
│ ├─ servo.c
│ └─ main.c
└─ README.md
```

## 📊 DB 스키마

```sql
CREATE TABLE IF NOT EXISTS robot_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts DATETIME DEFAULT (datetime('now','localtime')),
  level TEXT CHECK(level IN ('info','warn','error')) NOT NULL,
  source TEXT,
  action TEXT,
  payload TEXT,
  status_code INTEGER
);
```


## 🖥️ 주요 기능 화면

### 1. 실시간 차트

* 거리(cm), 서보 각도, 속도(PWM) 등을 WebSocket으로 실시간 업데이트

### 2. 컨트롤 패널

* LED On/Off

* 속도 조절 (PWM 슬라이더)

* 방향 전환 버튼 (좌/우)

* 지그 잠금/해제 슬라이더

* E-STOP 버튼

### 3. 로그 테이블

* 최근 이벤트 200개 표시

* 레벨별 색상 하이라이트


## 🚀 실행 방법

### 1. STM32 펌웨어

* CubeMX에서 TIM2(1MHz), UART2(115200), GPIO(PA8, PA9, PB3, PB5) 설정

* HC-SR04 & Servo 코드 빌드 → 보드에 업로드

### 2. Next.js 서버

```bash
npm install
npm run dev
```
* WebSocket: ws://localhost:7071

* API: http://localhost:3000/api/...

### 3. 브라우저에서 대시보드 접속

* http://localhost:3000



## 🌱 확장 가능성

모터 드라이버(H-Bridge) 연결로 실제 속도/방향 제어

온습도/미세먼지 센서 연계 → 도색 환경 품질 관리

JWT 인증/권한 제어 추가 → 협업 대시보드

수집된 로그 데이터 기반 이상 감지/예측 모델 학습