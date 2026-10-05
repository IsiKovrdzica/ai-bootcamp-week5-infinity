import { GoogleGenAI } from '@google/genai'
import type { GeminiConfig } from './config.js'
import { classifyGeminiFailure, extractSafeTokenUsage } from './gemini-provider.js'
import { ProviderFailure } from './provider.js'
import { buildTrainingStepPrompt, TRAINING_STEP_JSON_SCHEMAS } from './training-prompt.js'
import type { AgentModelProvider, ModelStepRequest, SafeTokenUsage } from './training-provider.js'

export type GeminiTrainingGenerateContent = (request: {
  model: string
  contents: string
  config: { abortSignal: AbortSignal; responseMimeType: 'application/json'; responseJsonSchema: object; maxOutputTokens: number; httpOptions: { retryOptions: { attempts: 1 } } }
}) => Promise<{ text?: string; usageMetadata?: unknown }>

export type TrainingTokenUsageSink = (usage: SafeTokenUsage) => void

export class GeminiTrainingStepProvider implements AgentModelProvider {
  private readonly generateContent: GeminiTrainingGenerateContent
  constructor(private readonly configuration: Readonly<GeminiConfig>, generateContent?: GeminiTrainingGenerateContent, private readonly tokenUsageSink?: TrainingTokenUsageSink) {
    if (generateContent) { this.generateContent = generateContent; return }
    const client = new GoogleGenAI({ apiKey: configuration.apiKey })
    this.generateContent = request => client.models.generateContent(request)
  }

  async generateStep(request: Readonly<ModelStepRequest>, { signal, onTokenUsage }: { signal: AbortSignal; onTokenUsage?: (usage: SafeTokenUsage) => void }): Promise<unknown> {
    if (signal.aborted) throw new ProviderFailure('client_cancelled')
    try {
      const response = await this.generateContent({
        model: this.configuration.model,
        contents: buildTrainingStepPrompt(request),
        config: { abortSignal: signal, responseMimeType: 'application/json', responseJsonSchema: TRAINING_STEP_JSON_SCHEMAS[request.phase], maxOutputTokens: 2048, httpOptions: { retryOptions: { attempts: 1 } } },
      })
      const usage = extractSafeTokenUsage(response.usageMetadata)
      if (usage) {
        try { this.tokenUsageSink?.(usage) } catch { /* Observability is non-authoritative. */ }
        try { onTokenUsage?.(usage) } catch { /* Observability is non-authoritative. */ }
      }
      if (typeof response.text !== 'string') throw new ProviderFailure('invalid_output')
      try { return JSON.parse(response.text) as unknown } catch { throw new ProviderFailure('invalid_output') }
    } catch (error) {
      if (error instanceof ProviderFailure) throw error
      throw new ProviderFailure(classifyGeminiFailure(error, signal))
    }
  }
}
