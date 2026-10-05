import type {
  IncomingMessage,
  ServerResponse,
} from 'node:http'
import {
  AI_ADVICE_UNAVAILABLE_ERROR,
  INVALID_GAME_SUMMARY_ERROR,
} from '../src/ai/contracts.js'
import type { AdviceService } from './ai/advice-service.js'
import type { TrainingPlannerService } from './composition.js'
import { validateGameSummary } from './ai/validation.js'

export const MAX_REQUEST_BODY_BYTES = 16 * 1024

export type AppRequest = {
  method: string
  path: string
  body: string
}

export type AppResponse = {
  status: number
  headers: Record<string, string>
  body: string
}

export type AppHandler = (request: AppRequest) => Promise<AppResponse>

function jsonResponse(status: number, body: unknown): AppResponse {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function invalidSummaryResponse(): AppResponse {
  return jsonResponse(400, INVALID_GAME_SUMMARY_ERROR)
}

function unavailableResponse(): AppResponse {
  return jsonResponse(503, AI_ADVICE_UNAVAILABLE_ERROR)
}

function trainingRejectedResponse(run: unknown): AppResponse {
  return jsonResponse(422, { run, error: { code: 'TRAINING_PLAN_REJECTED', message: 'Training plan could not be completed safely.' } })
}

function trainingUnavailableResponse(run: unknown): AppResponse {
  return jsonResponse(503, { run, error: { code: 'TRAINING_PLAN_UNAVAILABLE', message: 'Training plan is temporarily unavailable. Please try again later.' } })
}

export function createApp(service: AdviceService, trainingPlanner?: TrainingPlannerService): AppHandler {
  return async (request) => {
    const isAdvice = request.path === '/api/ai/advice'
    const isTrainingPlan = request.path === '/api/ai/training-plan'
    if (!isAdvice && !isTrainingPlan) {
      return jsonResponse(404, { error: { code: 'NOT_FOUND' } })
    }
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: { code: 'METHOD_NOT_ALLOWED' } })
    }
    if (Buffer.byteLength(request.body, 'utf8') > MAX_REQUEST_BODY_BYTES) {
      return invalidSummaryResponse()
    }

    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(request.body)
    } catch {
      return invalidSummaryResponse()
    }

    const summaryValidation = validateGameSummary(parsedBody)
    if (!summaryValidation.ok) {
      return invalidSummaryResponse()
    }

    if (isTrainingPlan) {
      if (!trainingPlanner) return jsonResponse(404, { error: { code: 'NOT_FOUND' } })
      try {
        const result = await trainingPlanner.createTrainingPlan(summaryValidation.value)
        if (result.kind === 'completed') return jsonResponse(200, { run: result.run, plan: result.plan })
        return result.kind === 'rejected' ? trainingRejectedResponse(result.run) : trainingUnavailableResponse(result.run)
      } catch {
        return trainingUnavailableResponse({ runId: 'unavailable', status: 'failed', stopReason: 'provider_failure', stepCount: 0, providerAttemptCount: 0, toolCallCount: 0, elapsedMs: 0 })
      }
    }

    try {
      const result = await service.requestAdvice(summaryValidation.value)
      if (!result.ok) {
        return result.kind === 'invalid_summary'
          ? invalidSummaryResponse()
          : unavailableResponse()
      }

      const { summary, recommendation, category } = result.advice
      return jsonResponse(200, { summary, recommendation, category })
    } catch {
      return unavailableResponse()
    }
  }
}

export function createNodeHttpHandler(handler: AppHandler) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    const chunks: Buffer[] = []
    let byteLength = 0
    let responded = false

    const write = (result: AppResponse) => {
      if (responded) return
      responded = true
      response.writeHead(result.status, result.headers)
      response.end(result.body)
    }

    request.on('data', (chunk: Buffer) => {
      byteLength += chunk.length
      if (byteLength > MAX_REQUEST_BODY_BYTES) {
        request.resume()
        write(invalidSummaryResponse())
        return
      }
      chunks.push(chunk)
    })

    request.on('error', () => {
      write(invalidSummaryResponse())
    })

    request.on('end', () => {
      if (responded) return
      void handler({
        method: request.method ?? '',
        path: request.url ?? '',
        body: Buffer.concat(chunks).toString('utf8'),
      }).then(write, () => write(unavailableResponse()))
    })
  }
}
