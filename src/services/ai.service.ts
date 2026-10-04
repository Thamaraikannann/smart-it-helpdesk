import axios from 'axios';
import { IncidentCategory, IncidentPriority } from '@prisma/client';
import { logger } from '../middleware/requestLogger';

export interface AISuggestions {
  category: IncidentCategory;
  priority: IncidentPriority;
  summary: string; // truncated to 150 chars
}

const VALID_CATEGORIES = new Set<string>(Object.values(IncidentCategory));
const VALID_PRIORITIES = new Set<string>(Object.values(IncidentPriority));
const MAX_SUMMARY_LENGTH = 150;

/**
 * Validates and coerces raw parsed JSON into a typed AISuggestions object.
 * Returns null if any required field is missing or has an invalid value.
 */
export function parseAISuggestions(data: unknown): AISuggestions | null {
  if (typeof data !== 'object' || data === null) return null;

  const d = data as Record<string, unknown>;
  const category = d.category;
  const priority = d.priority;
  const summary = d.summary;

  if (typeof category !== 'string' || !VALID_CATEGORIES.has(category)) return null;
  if (typeof priority !== 'string' || !VALID_PRIORITIES.has(priority)) return null;
  if (typeof summary !== 'string') return null;

  return {
    category: category as IncidentCategory,
    priority: priority as IncidentPriority,
    summary: summary.slice(0, MAX_SUMMARY_LENGTH),
  };
}

/**
 * Calls the external LLM API to analyze an incident description.
 *
 * Returns an AISuggestions object on success, or null on:
 *   - timeout (>5 s)
 *   - network error
 *   - non-2xx response
 *   - JSON parse failure
 *   - invalid / missing fields in the response
 *
 * This function NEVER throws — incident creation must succeed regardless of
 * AI availability.
 *
 * Feature: smart-it-helpdesk, Property 13: AI analysis non-blocking
 */
export async function analyzeIncident(description: string): Promise<AISuggestions | null> {
  try {
    const AI_API_URL = process.env.AI_API_URL;
    const AI_API_KEY = process.env.AI_API_KEY;

    if (!AI_API_URL || !AI_API_KEY) {
      logger.warn('AI_API_URL or AI_API_KEY not configured — skipping AI analysis');
      return null;
    }

    const validCategories = [...VALID_CATEGORIES].join(', ');
    const validPriorities = [...VALID_PRIORITIES].join(', ');

    const prompt =
      `Analyze this IT support incident description and return JSON with exactly these fields:\n` +
      `  category (one of: ${validCategories})\n` +
      `  priority (one of: ${validPriorities})\n` +
      `  summary (brief summary, up to 150 characters)\n\n` +
      `Description: ${description}\n\n` +
      `Respond with valid JSON only — no prose, no markdown fences.`;

    const response = await axios.post(
      AI_API_URL,
      {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.3,
      },
      {
        timeout: 5000,
        headers: {
          Authorization: `Bearer ${AI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      },
    );

    // Support both OpenAI-style chat-completions envelope and plain JSON body.
    const rawContent: unknown =
      response.data?.choices?.[0]?.message?.content ?? response.data;

    const parsed: unknown =
      typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;

    return parseAISuggestions(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ error: message }, 'AI analysis failed or timed out');
    return null; // NEVER propagate — incident creation must succeed regardless
  }
}
