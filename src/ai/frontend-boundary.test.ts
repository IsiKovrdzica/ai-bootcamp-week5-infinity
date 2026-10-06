import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('frontend production import boundary', () => {
  it('keeps browser entry points and AI modules free of server and Gemini implementation references', () => {
    for (const sourceUrl of [
      new URL('../main.ts', import.meta.url),
      new URL('./api-client.ts', import.meta.url),
      new URL('./coach-controller.ts', import.meta.url),
      new URL('./game-summary.ts', import.meta.url),
      new URL('./training-api-client.ts', import.meta.url),
      new URL('./training-controller.ts', import.meta.url),
      new URL('./training-contracts.ts', import.meta.url),
    ]) {
      const source = readFileSync(sourceUrl, 'utf8')
      expect(source).not.toMatch(/server\//)
      expect(source).not.toMatch(/@google\/genai/)
      expect(source).not.toMatch(/GEMINI_API_KEY|GEMINI_MODEL/)
      expect(source).not.toMatch(/GeminiAiAdviceProvider|brickpulse-post-game-coach\/v1/)
    }
  })
})
