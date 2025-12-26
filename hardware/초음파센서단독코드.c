/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : Main program body
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2025 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "main.h"
#include "tim.h"
#include "usart.h"
#include "gpio.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
#include <stdio.h>
#include <string.h>
/* USER CODE END Includes */

/* USER CODE BEGIN PV */
volatile uint8_t  ic_first_captured = 0;
volatile uint32_t echo_duration_us = 0;
volatile uint8_t  measure_done = 0;
/* USER CODE END PV */

/* USER CODE BEGIN PFP */
static void DWT_Init(void);
static void delay_us(uint32_t us);
static void HCSR04_Trigger(void);
static void UART_Print(const char* s);
static void TIM2_ConfigTo1MHz(void);
/* USER CODE END PFP */

/* USER CODE BEGIN 0 */
extern UART_HandleTypeDef huart2;
extern TIM_HandleTypeDef  htim2;

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
static void HCSR04_Trigger(void){
  HAL_GPIO_WritePin(GPIOA, GPIO_PIN_0, GPIO_PIN_RESET);
  delay_us(2);
  HAL_GPIO_WritePin(GPIOA, GPIO_PIN_0, GPIO_PIN_SET);
  delay_us(12);          // 10us 이상
  HAL_GPIO_WritePin(GPIOA, GPIO_PIN_0, GPIO_PIN_RESET);
}
static void UART_Print(const char* s){
  HAL_UART_Transmit(&huart2, (uint8_t*)s, (uint16_t)strlen(s), 100);
}

/* TIM2 클럭을 "정확히 1 MHz tick"이 되도록 동적으로 맞춤 */
static void TIM2_ConfigTo1MHz(void){
  // APB1 프리스케일러가 1이 아니면 타이머 클럭은 PCLK1의 2배(F1 규칙)
  uint32_t pclk1 = HAL_RCC_GetPCLK1Freq();
  uint32_t ppre1_bits = (RCC->CFGR >> 8U) & 0x7U;     // PPRE1[2:0]
  uint32_t timclk = (ppre1_bits >= 4U) ? (pclk1 * 2U) : pclk1;
  uint32_t psc = (timclk / 1000000U) - 1U;            // 1us tick

  __HAL_TIM_DISABLE(&htim2);
  __HAL_TIM_SET_PRESCALER(&htim2, (uint16_t)psc);
  __HAL_TIM_SET_COUNTER(&htim2, 0);
  __HAL_TIM_ENABLE(&htim2);
}

/* RISING 으로 다시 맞추는 헬퍼 */
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
/* USER CODE END 0 */

int main(void)
{
  HAL_Init();
  SystemClock_Config();     // 너가 앞서 추가한 함수 유지!

  MX_GPIO_Init();
  MX_USART2_UART_Init();
  MX_TIM2_Init();

  /* USER CODE BEGIN 2 */
  DWT_Init();
  TIM2_ConfigTo1MHz();

  // CH2를 Rising부터 받게 시작
  HAL_TIM_IC_Start_IT(&htim2, TIM_CHANNEL_2);

  UART_Print("\r\n[HC-SR04] TIM2 Input Capture start\r\n");
  /* USER CODE END 2 */

  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  while (1)
  {
    measure_done = 0;
    ic_first_captured = 0;

    IC_ArmForRising();

    HCSR04_Trigger();

    uint32_t t0 = HAL_GetTick();
    while (!measure_done && (HAL_GetTick() - t0) < 60) { /* wait up to 60ms */ }

    if (measure_done){
      uint32_t mm = (echo_duration_us * 1715U) / 10000U;

      if (echo_duration_us < 100) {
    	  UART_Print("Too close; move back\r\n"); // 없어도 되려나?
      } else {
          char buf[64];
          snprintf(buf, sizeof(buf), "Echo: %lu us, Dist: %lu mm\r\n",
                   (unsigned long)echo_duration_us, (unsigned long)mm);
          UART_Print(buf);
      }
    } else {
    	UART_Print("Too close; move back\r\n");
    	//UART_Print("Timeout (IC)\r\n");

    	IC_ArmForRising();
    }
    HAL_Delay(70);   // 센서 최소 간격 > 60ms
  }
  /* USER CODE END WHILE */
}

/* ====== 인터럽트 콜백 (Rising → Falling 토글) ====== */
void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim)
{
  if (htim->Instance == TIM2 && htim->Channel == HAL_TIM_ACTIVE_CHANNEL_2)
  {
    if (ic_first_captured == 0){
      // 첫 엣지: Rising
      ic_first_captured = 1;
      __HAL_TIM_SET_COUNTER(&htim2, 0);  // High 폭만 재기 위해 0으로 리셋

      // 다음 엣지는 Falling으로 재설정
      TIM_IC_InitTypeDef s = {0};
      s.ICPolarity  = TIM_INPUTCHANNELPOLARITY_FALLING;
      s.ICSelection = TIM_ICSELECTION_DIRECTTI;
      s.ICPrescaler = TIM_ICPSC_DIV1;
      s.ICFilter    = 0;
      HAL_TIM_IC_Stop_IT(&htim2, TIM_CHANNEL_2);
      HAL_TIM_IC_ConfigChannel(&htim2, &s, TIM_CHANNEL_2);
      HAL_TIM_IC_Start_IT(&htim2, TIM_CHANNEL_2);
    } else {
      // 두 번째 엣지: Falling → 카운터 값 = High 시간(µs)
      echo_duration_us = __HAL_TIM_GET_COUNTER(&htim2);
      measure_done = 1;
      ic_first_captured = 0;

      // 다음 측정을 위해 다시 Rising 으로 복귀
      TIM_IC_InitTypeDef s = {0};
      s.ICPolarity  = TIM_INPUTCHANNELPOLARITY_RISING;
      s.ICSelection = TIM_ICSELECTION_DIRECTTI;
      s.ICPrescaler = TIM_ICPSC_DIV1;
      s.ICFilter    = 0;
      HAL_TIM_IC_Stop_IT(&htim2, TIM_CHANNEL_2);
      HAL_TIM_IC_ConfigChannel(&htim2, &s, TIM_CHANNEL_2);
      HAL_TIM_IC_Start_IT(&htim2, TIM_CHANNEL_2);
    }
  }
}


/**
  * @brief System Clock Configuration
  * @retval None
  **/
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  /** Initializes the RCC Oscillators according to the specified parameters
  * in the RCC_OscInitTypeDef structure.
  */
  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
  RCC_OscInitStruct.HSIState = RCC_HSI_ON;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSI_DIV2;
  RCC_OscInitStruct.PLL.PLLMUL = RCC_PLL_MUL16;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

  /** Initializes the CPU, AHB and APB buses clocks
  */
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV2;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_2) != HAL_OK)
  {
    Error_Handler();
  }
}

/* USER CODE BEGIN 4 */

/* USER CODE END 4 */

/**
  * @brief  This function is executed in case of error occurrence.
  * @retval None
  */
void Error_Handler(void)
{
  /* USER CODE BEGIN Error_Handler_Debug */
  /* User can add his own implementation to report the HAL error return state */
  __disable_irq();
  while (1)
  {
  }
  /* USER CODE END Error_Handler_Debug */
}
#ifdef USE_FULL_ASSERT
/**
  * @brief  Reports the name of the source file and the source line number
  *         where the assert_param error has occurred.
  * @param  file: pointer to the source file name
  * @param  line: assert_param error line source number
  * @retval None
  */
void assert_failed(uint8_t *file, uint32_t line)
{
  /* USER CODE BEGIN 6 */
  /* User can add his own implementation to report the file name and line number,
     ex: printf("Wrong parameters value: file %s on line %d\r\n", file, line) */
  /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */
