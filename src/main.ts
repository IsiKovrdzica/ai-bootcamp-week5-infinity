import './style.css'
import { createAdviceTransport } from './ai/api-client'
import { CoachController, type CoachState } from './ai/coach-controller'
import { createTrainingPlanTransport } from './ai/training-api-client'
import { TrainingController, type TrainingState } from './ai/training-controller'
import { deriveGameSummary } from './ai/game-summary'
import { DEFAULT_CONFIG } from './config'
import { createGame, updateGame } from './game'
import { InputController } from './input'
import { renderGame } from './render'

declare global {
  interface Window {
    __brickPulseSmoke?: {
      complete: (status: 'WON' | 'GAME_OVER') => void
      restart: () => void
    }
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#game')
const errorElement = document.querySelector<HTMLParagraphElement>('#error')
const coachElement = document.querySelector<HTMLElement>('#ai-coach')
const coachButton = document.querySelector<HTMLButtonElement>('#ask-ai-coach')
const coachStatus = document.querySelector<HTMLParagraphElement>('#ai-coach-status')
const coachSummary = document.querySelector<HTMLParagraphElement>('#ai-coach-summary')
const coachRecommendation = document.querySelector<HTMLParagraphElement>('#ai-coach-recommendation')
const coachCategory = document.querySelector<HTMLParagraphElement>('#ai-coach-category')
const plannerElement = document.querySelector<HTMLElement>('#training-planner')
const plannerButton = document.querySelector<HTMLButtonElement>('#create-training-plan')
const plannerStatus = document.querySelector<HTMLParagraphElement>('#training-planner-status')
const plannerSummary = document.querySelector<HTMLParagraphElement>('#training-plan-summary')
const plannerFocus = document.querySelector<HTMLParagraphElement>('#training-plan-focus')
const plannerRecommendation = document.querySelector<HTMLParagraphElement>('#training-plan-recommendation')
const plannerEvidence = document.querySelector<HTMLUListElement>('#training-plan-evidence')

if (
  !canvas ||
  !errorElement ||
  !coachElement ||
  !coachButton ||
  !coachStatus ||
  !coachSummary ||
  !coachRecommendation ||
  !coachCategory || !plannerElement || !plannerButton || !plannerStatus || !plannerSummary || !plannerFocus || !plannerRecommendation || !plannerEvidence
) {
  throw new Error('Required page elements are missing.')
}

const context = canvas.getContext('2d')
if (!context) {
  errorElement.textContent = 'Canvas is not supported by this browser.'
} else {
  const creation = createGame(DEFAULT_CONFIG)
  if (!creation.ok) {
    errorElement.textContent = `Invalid game configuration: ${creation.error}`
  } else {
    const state = creation.state
    const input = new InputController(window)
    const controller = new CoachController({
      transport: createAdviceTransport(fetch),
      onStateChange: (coachState) => renderCoachState(
        coachState,
        coachElement,
        coachButton,
        coachStatus,
        coachSummary,
        coachRecommendation,
        coachCategory,
      ),
    })
    const plannerController = new TrainingController({
      transport: createTrainingPlanTransport(fetch),
      onStateChange: (plannerState) => renderTrainingState(plannerState, plannerElement, plannerButton, plannerStatus, plannerSummary, plannerFocus, plannerRecommendation, plannerEvidence),
    })
    coachButton.addEventListener('click', () => controller.requestAdvice())
    plannerButton.addEventListener('click', () => plannerController.requestPlan())
    let previousTime = performance.now()
    let previousStatus = state.status

    if (import.meta.env.MODE === 'smoke') {
      window.__brickPulseSmoke = {
        complete: (status) => {
          state.status = status
          if (status === 'WON') {
            state.bricks.forEach((brick) => { brick.alive = false })
            state.score = 320
          } else {
            state.lives = 0
          }
          const summary = deriveGameSummary(state)
          if (summary) { controller.showTerminal(summary); plannerController.showTerminal(summary) }
          previousStatus = state.status
        },
        restart: () => {
          updateGame(state, { move: 0, start: true }, 0)
          controller.restart()
          plannerController.restart()
          previousStatus = state.status
        },
      }
    }

    const frame = (currentTime: number) => {
      const deltaSeconds = (currentTime - previousTime) / 1000
      previousTime = currentTime
      updateGame(state, input.read(), deltaSeconds)
      if (
        (state.status === 'WON' || state.status === 'GAME_OVER') &&
        previousStatus !== state.status
      ) {
        const summary = deriveGameSummary(state)
        if (summary) { controller.showTerminal(summary); plannerController.showTerminal(summary) }
      } else if (
        previousStatus === 'WON' ||
        previousStatus === 'GAME_OVER'
      ) {
        if (state.status === 'READY') { controller.restart(); plannerController.restart() }
      }
      previousStatus = state.status
      renderGame(context, state)
      requestAnimationFrame(frame)
    }

    renderGame(context, state)
    requestAnimationFrame(frame)
  }
}

function renderTrainingState(state: TrainingState, element: HTMLElement, button: HTMLButtonElement, status: HTMLParagraphElement, summary: HTMLParagraphElement, focus: HTMLParagraphElement, recommendation: HTMLParagraphElement, evidence: HTMLUListElement): void {
  element.hidden = state.kind === 'hidden'
  button.disabled = state.kind === 'hidden' || state.kind === 'pending'
  status.textContent = ''; summary.textContent = ''; focus.textContent = ''; recommendation.textContent = ''; evidence.replaceChildren()
  if (state.kind === 'pending') status.textContent = 'CREATING TRAINING PLAN...'
  else if (state.kind === 'failure') status.textContent = 'Training plan is temporarily unavailable. Please try again later.'
  else if (state.kind === 'success') {
    summary.textContent = state.plan.summary; focus.textContent = state.plan.focus; recommendation.textContent = state.plan.recommendation
    for (const item of state.plan.evidence) { const entry = document.createElement('li'); entry.textContent = item.finding; evidence.append(entry) }
  }
}

function renderCoachState(
  state: CoachState,
  coachElement: HTMLElement,
  coachButton: HTMLButtonElement,
  status: HTMLParagraphElement,
  summary: HTMLParagraphElement,
  recommendation: HTMLParagraphElement,
  category: HTMLParagraphElement,
): void {
  coachElement.hidden = state.kind === 'hidden'
  coachButton.disabled = state.kind === 'hidden' || state.kind === 'pending'
  status.textContent = ''
  summary.textContent = ''
  recommendation.textContent = ''
  category.textContent = ''

  if (state.kind === 'pending') {
    status.textContent = 'ANALYZING...'
  } else if (state.kind === 'success') {
    summary.textContent = state.advice.summary
    recommendation.textContent = state.advice.recommendation
    category.textContent = state.advice.category
  } else if (state.kind === 'failure') {
    status.textContent = 'AI advice is temporarily unavailable. Please try again later.'
  }
}
