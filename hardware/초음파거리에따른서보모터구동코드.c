/* USER CODE BEGIN Header */
/*
 * NUCLEO-F103RB + HC-SR04 + SG90 Servo (TIM2 IC + TIM3 PWM + USART2)
 * Pins:
 *   - TRIG  : PA0 (GPIO Output)
 *   - ECHO  : PA1 (TIM2 CH2 Input Capture)  <-- 10k/15k 분압 후 입력!
 *   - USART2: PA2(TX)/PA3(RX) @ 115200 8N1 (ST-LINK VCP)
 *   - SERVO : PA6 (TIM3 CH1 PWM 50Hz, 1us tick, CCR=펄스폭[us])
 *
 * Clock:
 *   - HSI → PLL x16 = SYSCLK 64MHz, APB1=32MHz (Timer x2 rule → TIM on APB1 runs at 64MHz)
 *
 * Notes:
 *   - 각 측정 시작 전/타임아웃 후 항상 RISING으로 '재무장'하여 상태 꼬임 방지
 *   - TIM2/3 tick을 런타임에 1MHz(1us)로 동적 설정 → 클럭 설정에 독립적
 */
/* USER CODE END Header */

/* Includes ------------------------------------------------------------------*/
#include "main.h"
#include "tim.h"
#include "usart.h"
#include "gpio.h"
#include <stdio.h>
#include <string.h>

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
void Error_Handler(void);

/* USER CODE BEGIN PV */
/* ==== 초음파 IC 상태 ==== */
volatile uint8_t  ic_first_captured = 0;
volatile uint32_t echo_duration_us   = 0;  // High 폭(us)
volatile uint8_t  measure_done       = 0;

/* 외부 핸들 (Cube가 생성) */
extern TIM_HandleTypeDef  htim2;   // TIM2 Input Capture (ECHO)
extern TIM_HandleTypeDef  htim3;   // TIM3 PWM (Servo)
extern UART_HandleTypeDef huart2;  // USART2
/* USER CODE END PV */

/* USER CODE BEGIN PFP */
/* 유틸리티 */
static void DWT_Init(void);
static void delay_us(uint32_t us);
static void UART_Print(const char* s);

/* 초음파 */
static void HCSR04_Trigger(void);
static void TIM2_ConfigTo1MHz(void);
static void IC_ArmForRising(void);

/* 서보 */
static void TIM3_ConfigForServo50Hz(void);
static void Servo_SetPulseUS(uint16_t us);
static void Servo_SetAngle(uint16_t deg);
/* USER CODE END PFP */

/* USER CODE BEGIN 0 */
/* ---- DWT 기반 마이크로초 지연 ---- */
static void DWT_Init(void){
  CoreDebug->DEMCR |= CoreDebug_DEMCR_TRCENA_Msk;
  DWT->CYCCNT = 0;
  DWT->CTRL  |= DWT_CTRL_CYCCNTENA_Msk;
}
static void delay_us(uint32_t us){
  uint32_t start = DWT->CYCCNT;
  uint32_t ticks = (SystemCoreClock/1000000U) * us;
  while ((DWT->CYCCNT - start) < ticks) { __NOP(); }
}

/* ---- UART printf 대체 ---- */
static void UART_Print(const char* s){
  HAL_UART_Transmit(&huart2, (uint8_t*)s, (uint16_t)strlen(s), 100);
}

/* ---- 초음파 TRIG 10~12us ---- */
static void HCSR04_Trigger(void){
  HAL_GPIO_WritePin(GPIOA, GPIO_PIN_0, GPIO_PIN_RESET);
  delay_us(2);
  HAL_GPIO_WritePin(GPIOA, GPIO_PIN_0, GPIO_PIN_SET);
  delay_us(12);
  HAL_GPIO_WritePin(GPIOA, GPIO_PIN_0, GPIO_PIN_RESET);
}

/* ---- TIM2 tick 1MHz로 동적 설정 (현재 PCLK1에 따라 계산) ---- */
static void TIM2_ConfigTo1MHz(void){
  uint32_t pclk1 = HAL_RCC_GetPCLK1Freq();
  uint32_t ppre1_bits = (RCC->CFGR >> 8U) & 0x7U;           // PPRE1[2:0]
  uint32_t timclk = (ppre1_bits >= 4U) ? (pclk1 * 2U) : pclk1; // Timer x2 rule
  uint32_t psc = (timclk / 1000000U) - 1U;                  // 1us tick

  __HAL_TIM_DISABLE(&htim2);
  __HAL_TIM_SET_PRESCALER(&htim2, (uint16_t)psc);
  __HAL_TIM_SET_AUTORELOAD(&htim2, 0xFFFF);
  __HAL_TIM_SET_COUNTER(&htim2, 0);
  __HAL_TIM_ENABLE(&htim2);
}

/* ---- 매 프레임 시작/타임아웃 복구용: RISING 엣지로 재무장 ---- */
static void IC_ArmForRising(void){
  TIM_IC_InitTypeDef s = {0};
  s.ICPolarity  = TIM_INPUTCHANNELPOLARITY_RISING;
  s.ICSelection = TIM_ICSELECTION_DIRECTTI;
  s.ICPrescaler = TIM_ICPSC_DIV1;
  s.ICFilter    = 0;

  HAL_TIM_IC_Stop_IT(&htim2, TIM_CHANNEL_2);
  __HAL_TIM_DISABLE_IT(&htim2, TIM_IT_CC2);
  __HAL_TIM_CLEAR_IT(&htim2, TIM_IT_CC2);
  __HAL_TIM_CLEAR_FLAG(&htim2, TIM_FLAG_CC2 | TIM_FLAG_UPDATE);
  __HAL_TIM_SET_COUNTER(&htim2, 0);

  HAL_TIM_IC_ConfigChannel(&htim2, &s, TIM_CHANNEL_2);
  HAL_TIM_IC_Start_IT(&htim2, TIM_CHANNEL_2);
}

/* ---- TIM3: 50Hz(20ms), tick=1us, 초기 펄스 1500us ---- */
static void TIM3_ConfigForServo50Hz(void){
  uint32_t pclk1 = HAL_RCC_GetPCLK1Freq();
  uint32_t ppre1_bits = (RCC->CFGR >> 8U) & 0x7U;
  uint32_t timclk = (ppre1_bits >= 4U) ? (pclk1 * 2U) : pclk1; // APB1 timer x2
  uint32_t psc = (timclk / 1000000U) - 1U;                     // 1us tick

  __HAL_TIM_DISABLE(&htim3);
  __HAL_TIM_SET_PRESCALER(&htim3, (uint16_t)psc);
  __HAL_TIM_SET_AUTORELOAD(&htim3, 20000U - 1U);               // 20,000us = 20ms
  __HAL_TIM_SET_COUNTER(&htim3, 0);
  __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, 1500U);         // 1.5ms(중립)
  __HAL_TIM_ENABLE(&htim3);
}

/* ---- 서보 제어 ---- */
static void Servo_SetPulseUS(uint16_t us){
  if (us < 500U)  us = 500U;   // SG90 최소 범위 안전값
  if (us > 2500U) us = 2500U;  // SG90 최대 범위 안전값
  __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, us);
}
static void Servo_SetAngle(uint16_t deg){
  if (deg > 180U) deg = 180U;
  uint16_t us = 500U + (uint16_t)((2000U * (uint32_t)deg) / 180U); // 500~2500us
  Servo_SetPulseUS(us);
}
/* USER CODE END 0 */

int main(void)
{
  /* MCU Configuration--------------------------------------------------------*/
  HAL_Init();
  SystemClock_Config();     // (아래 정의) HSI→PLL x16 = 64MHz

  MX_GPIO_Init();
  MX_USART2_UART_Init();
  MX_TIM2_Init();           // ECHO: TIM2 CH2 Input Capture
  MX_TIM3_Init();           // SERVO: TIM3 CH1 PWM

  /* USER CODE BEGIN 2 */
  DWT_Init();

  /* TIM 설정 보정 */
  TIM2_ConfigTo1MHz();
  TIM3_ConfigForServo50Hz();

  /* PWM 시작 (PA6 / TIM3_CH1) */
  HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);
  Servo_SetAngle(90); // 중립으로 시작

  /* 입력캡처 시작: 매 프레임마다 재무장하지만, 첫 시작도 RISING으로 */
  IC_ArmForRising();

  UART_Print("\r\n[HC-SR04 + SG90] Start\r\n");
  /* USER CODE END 2 */

  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  while (1)
  {
    /* 프레임 시작: 상태 초기화 + RISING 재무장 */
    measure_done = 0;
    ic_first_captured = 0;
    IC_ArmForRising();

    /* 트리거 */
    HCSR04_Trigger();

    /* 최대 80ms 대기 */
    uint32_t t0 = HAL_GetTick();
    while (!measure_done && (HAL_GetTick() - t0) < 80) { /* wait */ }

    if (measure_done){
      /* 거리 계산 (mm) = us * 0.1715 */
      uint32_t distance_mm = (echo_duration_us * 1715U) / 10000U;

      /* 로그 출력 */
      char buf[64];
      snprintf(buf, sizeof(buf), "Echo: %lu us, Dist: %lu mm\r\n",
               (unsigned long)echo_duration_us, (unsigned long)distance_mm);
      UART_Print(buf);

      /* (예시) 50~300mm → 0~180도 매핑하여 서보 구동 */
      uint32_t d = distance_mm;
      if (d < 50U)  d = 50U;
      if (d > 300U) d = 300U;
      uint16_t angle = (uint16_t)((d - 50U) * 180U / (300U - 50U));
      Servo_SetAngle(angle);
    } else {
      UART_Print("Timeout (IC)\r\n");
      /* 타임아웃 즉시 복구: 다음 프레임을 위해 RISING 재무장 */
      IC_ArmForRising();
    }

    HAL_Delay(70); // 프레임 간격: HC-SR04는 60ms 이상 권장
  }
  /* USER CODE END WHILE */
}

/* ==== TIM2 입력캡처 콜백: Rising→Falling→Rising 토글 ==== */
void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim)
{
  if (htim->Instance == TIM2 && htim->Channel == HAL_TIM_ACTIVE_CHANNEL_2)
  {
    if (ic_first_captured == 0) {
      /* 첫 엣지: Rising → 카운터 0으로 리셋 후 Falling 대기 */
      ic_first_captured = 1;
      __HAL_TIM_SET_COUNTER(&htim2, 0);

      TIM_IC_InitTypeDef s = {0};
      s.ICPolarity  = TIM_INPUTCHANNELPOLARITY_FALLING;
      s.ICSelection = TIM_ICSELECTION_DIRECTTI;
      s.ICPrescaler = TIM_ICPSC_DIV1;
      s.ICFilter    = 0;

      HAL_TIM_IC_Stop_IT(&htim2, TIM_CHANNEL_2);
      __HAL_TIM_CLEAR_IT(&htim2, TIM_IT_CC2);
      HAL_TIM_IC_ConfigChannel(&htim2, &s, TIM_CHANNEL_2);
      HAL_TIM_IC_Start_IT(&htim2, TIM_CHANNEL_2);
    } else {
      /* 두 번째 엣지: Falling → 카운터 값 = High 시간(us) */
      echo_duration_us = __HAL_TIM_GET_COUNTER(&htim2);
      measure_done = 1;
      ic_first_captured = 0;

      /* 다음 측정을 위해 다시 Rising으로 복귀 */
      IC_ArmForRising();
    }
  }
}

/* ===================== System Clock Config (HSI→PLL=64MHz) ===================== */
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  __HAL_RCC_AFIO_CLK_ENABLE();
  __HAL_RCC_PWR_CLK_ENABLE();

  /* HSI ON, PLL ON (HSI/2 * 16 = 64MHz) */
  RCC_OscInitStruct.OscillatorType      = RCC_OSCILLATORTYPE_HSI;
  RCC_OscInitStruct.HSIState            = RCC_HSI_ON;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.PLL.PLLState        = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource       = RCC_PLLSOURCE_HSI_DIV2;
  RCC_OscInitStruct.PLL.PLLMUL          = RCC_PLL_MUL16;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK) {
    Error_Handler();
  }

  /* SYSCLK=64MHz, HCLK=64, APB1=32 (DIV2), APB2=64 */
  RCC_ClkInitStruct.ClockType      = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK
                                   | RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource   = RCC_SYSCLKSOURCE_PLLCLK;
  RCC_ClkInitStruct.AHBCLKDivider  = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV2;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_2) != HAL_OK) {
    Error_Handler();
  }

  /* JTAG-DP Disable and SW-DP Enable */
  __HAL_AFIO_REMAP_SWJ_NOJTAG();
}

void Error_Handler(void)
{
  __disable_irq();
  while (1) {
    /* 필요 시 여기서 LED 토글 등 에러 표시 */
  }
}

#ifdef  USE_FULL_ASSERT
void assert_failed(uint8_t *file, uint32_t line)
{
  (void)file; (void)line;
  /* 사용자 정의: assert 정보 출력 가능 */
}
#endif
