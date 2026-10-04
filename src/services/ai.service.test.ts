import axios from 'axios';
import { IncidentCategory, IncidentPriority } from '@prisma/client';
import { analyzeIncident, parseAISuggestions } from './ai.service';

// ---------------------------------------------------------------------------
// Mock axios so no real HTTP calls are made
// ---------------------------------------------------------------------------
jest.mock('axios');
const mockedAxiosPost = axios.post as jest.MockedFunction<typeof axios.post>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wraps a plain object in an OpenAI-style chat-completions envelope. */
function openAiEnvelope(obj: unknown): { data: unknown } {
  return {
    data: {
      choices: [
        {
          message: {
            content: JSON.stringify(obj),
          },
        },
      ],
    },
  };
}

/** A valid AI response payload. */
const VALID_PAYLOAD = {
  category: IncidentCategory.Software,
  priority: IncidentPriority.Medium,
  summary: 'User cannot open the application after the latest update.',
};

// ---------------------------------------------------------------------------
// Unit tests for parseAISuggestions (pure function — no I/O)
// ---------------------------------------------------------------------------

describe('parseAISuggestions', () => {
  it('returns AISuggestions for a valid object', () => {
    const result = parseAISuggestions(VALID_PAYLOAD);
    expect(result).toEqual(VALID_PAYLOAD);
  });

  it('truncates summary to exactly 150 characters', () => {
    const longSummary = 'A'.repeat(200);
    const result = parseAISuggestions({ ...VALID_PAYLOAD, summary: longSummary });
    expect(result).not.toBeNull();
    expect(result!.summary).toHaveLength(150);
    expect(result!.summary).toBe('A'.repeat(150));
  });

  it('returns null when category is invalid', () => {
    expect(parseAISuggestions({ ...VALID_PAYLOAD, category: 'InvalidCategory' })).toBeNull();
  });

  it('returns null when priority is invalid', () => {
    expect(parseAISuggestions({ ...VALID_PAYLOAD, priority: 'Urgent' })).toBeNull();
  });

  it('returns null when summary is missing', () => {
    const { summary: _omitted, ...rest } = VALID_PAYLOAD;
    expect(parseAISuggestions(rest)).toBeNull();
  });

  it('returns null when summary is not a string', () => {
    expect(parseAISuggestions({ ...VALID_PAYLOAD, summary: 42 })).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parseAISuggestions(null)).toBeNull();
  });

  it('returns null for a primitive input', () => {
    expect(parseAISuggestions('not an object')).toBeNull();
  });

  it('keeps summary of exactly 150 characters unchanged', () => {
    const exactSummary = 'B'.repeat(150);
    const result = parseAISuggestions({ ...VALID_PAYLOAD, summary: exactSummary });
    expect(result!.summary).toHaveLength(150);
  });

  it('accepts all valid IncidentCategory values', () => {
    for (const cat of Object.values(IncidentCategory)) {
      const result = parseAISuggestions({ ...VALID_PAYLOAD, category: cat });
      expect(result).not.toBeNull();
      expect(result!.category).toBe(cat);
    }
  });

  it('accepts all valid IncidentPriority values', () => {
    for (const pri of Object.values(IncidentPriority)) {
      const result = parseAISuggestions({ ...VALID_PAYLOAD, priority: pri });
      expect(result).not.toBeNull();
      expect(result!.priority).toBe(pri);
    }
  });
});

// ---------------------------------------------------------------------------
// Integration tests for analyzeIncident (mocked axios)
// ---------------------------------------------------------------------------

describe('analyzeIncident', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    // Provide valid env vars so the function doesn't bail out early
    process.env = {
      ...ORIGINAL_ENV,
      AI_API_URL: 'https://api.openai.com/v1/chat/completions',
      AI_API_KEY: 'test-key-123',
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('returns AISuggestions when the API responds with a valid OpenAI envelope', async () => {
    mockedAxiosPost.mockResolvedValueOnce(openAiEnvelope(VALID_PAYLOAD));

    const result = await analyzeIncident('My computer will not start.');
    expect(result).toEqual(VALID_PAYLOAD);
  });

  it('returns AISuggestions when the API returns plain JSON (no chat-completions wrapper)', async () => {
    mockedAxiosPost.mockResolvedValueOnce({ data: VALID_PAYLOAD });

    const result = await analyzeIncident('Network drive is inaccessible.');
    expect(result).toEqual(VALID_PAYLOAD);
  });

  it('truncates summary to 150 chars when the API returns a longer summary', async () => {
    const longSummary = 'X'.repeat(300);
    mockedAxiosPost.mockResolvedValueOnce(
      openAiEnvelope({ ...VALID_PAYLOAD, summary: longSummary }),
    );

    const result = await analyzeIncident('Some description');
    expect(result).not.toBeNull();
    expect(result!.summary).toHaveLength(150);
  });

  // -------------------------------------------------------------------------
  // Error paths — must all return null and never throw
  // -------------------------------------------------------------------------

  it('returns null on a network error (axios rejects)', async () => {
    mockedAxiosPost.mockRejectedValueOnce(new Error('Network Error'));

    const result = await analyzeIncident('My laptop screen is broken.');
    expect(result).toBeNull();
  });

  it('returns null on a timeout (ECONNABORTED)', async () => {
    const timeoutErr = Object.assign(new Error('timeout of 5000ms exceeded'), {
      code: 'ECONNABORTED',
    });
    mockedAxiosPost.mockRejectedValueOnce(timeoutErr);

    const result = await analyzeIncident('Printer not working.');
    expect(result).toBeNull();
  });

  it('returns null when the response contains an invalid category', async () => {
    mockedAxiosPost.mockResolvedValueOnce(
      openAiEnvelope({ ...VALID_PAYLOAD, category: 'Unknown' }),
    );

    const result = await analyzeIncident('Something is broken.');
    expect(result).toBeNull();
  });

  it('returns null when the response contains an invalid priority', async () => {
    mockedAxiosPost.mockResolvedValueOnce(
      openAiEnvelope({ ...VALID_PAYLOAD, priority: 'Emergency' }),
    );

    const result = await analyzeIncident('Something is very broken.');
    expect(result).toBeNull();
  });

  it('returns null when the JSON content cannot be parsed (malformed string)', async () => {
    mockedAxiosPost.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: '{ this is not valid json }',
            },
          },
        ],
      },
    });

    const result = await analyzeIncident('Random incident.');
    expect(result).toBeNull();
  });

  it('returns null when the response body is completely empty', async () => {
    mockedAxiosPost.mockResolvedValueOnce({ data: null });

    const result = await analyzeIncident('Empty response scenario.');
    expect(result).toBeNull();
  });

  it('returns null when AI_API_URL is not configured', async () => {
    delete process.env.AI_API_URL;

    // axios should NOT be called at all
    const result = await analyzeIncident('Some incident.');
    expect(result).toBeNull();
    expect(mockedAxiosPost).not.toHaveBeenCalled();
  });

  it('returns null when AI_API_KEY is not configured', async () => {
    delete process.env.AI_API_KEY;

    const result = await analyzeIncident('Some incident.');
    expect(result).toBeNull();
    expect(mockedAxiosPost).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Non-throw guarantee — analyzeIncident must NEVER propagate exceptions
  // -------------------------------------------------------------------------

  it('never throws even when axios throws a non-Error value', async () => {
    mockedAxiosPost.mockRejectedValueOnce('string rejection — not an Error instance');

    await expect(analyzeIncident('Weird rejection.')).resolves.toBeNull();
  });

  it('never throws even when axios throws null', async () => {
    mockedAxiosPost.mockRejectedValueOnce(null);

    await expect(analyzeIncident('Null rejection.')).resolves.toBeNull();
  });
});
