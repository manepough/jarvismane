/**
 * src/services/OfflineCommandParser.ts
 * Deterministic rule-matching engine that handles core assistant functions
 * when all external LLM API calls are unreachable.
 *
 * Rules are evaluated in priority order. The first match wins.
 * No network calls are made inside this module.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedCommand {
  matched: boolean
  intent: string
  response: string
  confidence: number
}

interface Rule {
  intent: string
  patterns: RegExp[]
  priority: number
  handler: (input: string, matches: RegExpMatchArray) => string
}

// ─── Rule Definitions ─────────────────────────────────────────────────────────

const RULES: Rule[] = [
  {
    intent: 'time_query',
    priority: 100,
    patterns: [/\b(what(?:'s| is) the time|current time|time now)\b/i],
    handler: (): string => {
      const now = new Date()
      return `Current time: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
    },
  },
  {
    intent: 'date_query',
    priority: 100,
    patterns: [/\b(what(?:'s| is) (the )?date|today(?:'s date)?|current date)\b/i],
    handler: (): string => {
      const now = new Date()
      return `Today is ${now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`
    },
  },
  {
    intent: 'math_expression',
    priority: 90,
    patterns: [/^[\s\d+\-*/^().%,]+$/],
    handler: (input: string): string => {
      try {
        const sanitized = input.replace(/[^0-9+\-*/^().% ]/g, '')
        if (sanitized.trim().length === 0) return 'No valid expression found.'
        const normalized = sanitized.replace(/\^/g, '**')
        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict"; return (${normalized})`)() as number
        if (!isFinite(result)) return 'Math error: result is not a finite number.'
        return `= ${result}`
      } catch {
        return 'Could not evaluate that expression.'
      }
    },
  },
  {
    intent: 'unit_conversion_celsius_fahrenheit',
    priority: 85,
    patterns: [/(\d+(?:\.\d+)?)\s*(?:degrees?\s*)?(?:c|celsius)\s*(?:to|in)\s*(?:f|fahrenheit)/i],
    handler: (_: string, m: RegExpMatchArray): string => {
      const c = parseFloat(m[1] ?? "0")
      const f = (c * 9) / 5 + 32
      return `${c}°C = ${f.toFixed(2)}°F`
    },
  },
  {
    intent: 'unit_conversion_fahrenheit_celsius',
    priority: 85,
    patterns: [/(\d+(?:\.\d+)?)\s*(?:degrees?\s*)?(?:f|fahrenheit)\s*(?:to|in)\s*(?:c|celsius)/i],
    handler: (_: string, m: RegExpMatchArray): string => {
      const f = parseFloat(m[1] ?? "0")
      const c = ((f - 32) * 5) / 9
      return `${f}°F = ${c.toFixed(2)}°C`
    },
  },
  {
    intent: 'unit_conversion_km_miles',
    priority: 85,
    patterns: [/(\d+(?:\.\d+)?)\s*(?:km|kilometers?)\s*(?:to|in)\s*(?:mi|miles?)/i],
    handler: (_: string, m: RegExpMatchArray): string => {
      const km = parseFloat(m[1] ?? "0")
      return `${km} km = ${(km * 0.621371).toFixed(3)} miles`
    },
  },
  {
    intent: 'unit_conversion_miles_km',
    priority: 85,
    patterns: [/(\d+(?:\.\d+)?)\s*(?:mi|miles?)\s*(?:to|in)\s*(?:km|kilometers?)/i],
    handler: (_: string, m: RegExpMatchArray): string => {
      const mi = parseFloat(m[1] ?? "0")
      return `${mi} miles = ${(mi * 1.60934).toFixed(3)} km`
    },
  },
  {
    intent: 'greeting',
    priority: 70,
    patterns: [/^(hey|hi|hello|sup|yo|good morning|good afternoon|good evening)[.!]?\s*$/i],
    handler: (): string => {
      const hour = new Date().getHours()
      const greeting =
        hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
      return `${greeting}. Running in offline mode -- LLM API is unreachable. I can still handle time, date, math, and unit conversions locally.`
    },
  },
  {
    intent: 'status_query',
    priority: 70,
    patterns: [/\b(status|are you (online|offline|connected|working)|ping)\b/i],
    handler: (): string =>
      'Offline mode active. Local parser is running. LLM API is currently unreachable. Responses are limited to deterministic local functions until connectivity is restored.',
  },
  {
    intent: 'help',
    priority: 60,
    patterns: [/\b(help|what can you do|commands|offline capabilities)\b/i],
    handler: (): string =>
      [
        'Offline capabilities (LLM unavailable):',
        '  - Current time: "what is the time"',
        '  - Current date: "what is the date"',
        '  - Math: "42 * 3.14"',
        '  - Temperature: "100c to f"',
        '  - Distance: "5 km to miles"',
        '',
        'Full LLM capabilities resume automatically when network is restored.',
      ].join('\n'),
  },
]

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Attempt to match input against all known offline rules.
 * Returns the response from the highest-priority matching rule,
 * or a fallback message if no rule matches.
 */
export function parseOfflineCommand(input: string): ParsedCommand {
  const trimmed = input.trim()

  if (trimmed.length === 0) {
    return { matched: false, intent: 'empty', response: '', confidence: 0 }
  }

  // Sort by priority descending
  const sorted = [...RULES].sort((a, b) => b.priority - a.priority)

  for (const rule of sorted) {
    for (const pattern of rule.patterns) {
      const match = trimmed.match(pattern)
      if (match !== null) {
        const response = rule.handler(trimmed, match)
        return {
          matched: true,
          intent: rule.intent,
          response,
          confidence: rule.priority / 100,
        }
      }
    }
  }

  return {
    matched: false,
    intent: 'unrecognized',
    response:
      'Offline mode: that request requires the LLM API, which is currently unreachable. Try again when connectivity is restored.',
    confidence: 0,
  }
}
