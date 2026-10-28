'use strict';

require('dotenv').config();

const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROQ_KEY || process.env.GROQ_LLM_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const stats = {
  calls: 0,
  errors: 0,
  promptTokens: 0,
  completionTokens: 0,
  lastLatencyMs: 0,
  lastError: null,
  lastCallAt: null,
};

function isGroqConfigured() {
  return Boolean(GROQ_API_KEY && GROQ_API_KEY.trim().length > 0 && !GROQ_API_KEY.includes('your_groq_api_key'));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call Groq's OpenAI-compatible chat completions endpoint.
 * Retries once on rate limit / server error, and can request JSON mode.
 */
async function callGroq({
  messages,
  prompt,
  systemPrompt = 'You are an expert academic research grant advisor and agent in the apniLeap AURA system. Adhere strictly to institutional guardrails, cite all claims, and never fabricate sources.',
  model = GROQ_MODEL,
  temperature = 0.3,
  maxTokens = 2048,
  json = false,
  reasoningEffort = null,
  timeoutMs = 45000,
  retries = 2,
} = {}) {
  if (!isGroqConfigured()) {
    return { success: false, error: 'GROQ_API_KEY is not configured in .env', content: null, configured: false };
  }

  const payloadMessages = messages || [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt || '' },
  ];

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const started = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const body = {
        model,
        messages: payloadMessages,
        temperature,
        max_tokens: maxTokens,
      };
      if (json) body.response_format = { type: 'json_object' };
      if (reasoningEffort) body.reasoning_effort = reasoningEffort;

      const res = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY.trim()}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const errText = await res.text();
        lastError = `HTTP ${res.status}: ${errText.slice(0, 300)}`;
        // JSON mode may be unsupported: retry once without it.
        if (json && res.status === 400) {
          json = false;
          continue;
        }
        if (res.status === 429) {
          // Groq returns the reset window in the message ("try again in 5.2s").
          const match = errText.match(/try again in ([\d.]+)\s*(ms|s)/i);
          const hinted = match ? Number(match[1]) * (match[2].toLowerCase() === 'ms' ? 1 : 1000) : 6000;
          const waitMs = Math.min(30000, Math.max(1200, hinted + 800));
          if (attempt < retries) {
            await sleep(waitMs);
            continue;
          }
          stats.errors += 1;
          stats.lastError = lastError;
          return { success: false, error: lastError, content: null, configured: true, retryAfterMs: waitMs };
        }
        if (res.status >= 500 && attempt < retries) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        stats.errors += 1;
        stats.lastError = lastError;
        return { success: false, error: lastError, content: null, configured: true };
      }

      const data = await res.json();
      const choice = data.choices?.[0] || {};
      const message = choice.message || {};
      const reply = message.content || '';
      const usage = data.usage || {};
      stats.calls += 1;
      stats.promptTokens += usage.prompt_tokens || 0;
      stats.completionTokens += usage.completion_tokens || 0;
      stats.lastLatencyMs = Date.now() - started;
      stats.lastCallAt = new Date().toISOString();
      stats.lastError = null;

      return {
        success: true,
        content: reply,
        reasoning: message.reasoning || null,
        finishReason: choice.finish_reason || null,
        model: data.model || model,
        usage: {
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          reasoningTokens: usage.completion_tokens_details?.reasoning_tokens || 0,
          totalTokens: usage.total_tokens || 0,
        },
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      lastError = err.name === 'AbortError' ? `Groq request timed out (${timeoutMs}ms)` : err.message;
      if (attempt < retries) {
        await sleep(900 * (attempt + 1));
        continue;
      }
      stats.errors += 1;
      stats.lastError = lastError;
      return { success: false, error: lastError, content: null, configured: true };
    }
  }

  return { success: false, error: lastError || 'Groq call failed', content: null, configured: true };
}

function getStats() {
  return { ...stats, model: GROQ_MODEL, configured: isGroqConfigured(), provider: 'Groq Cloud' };
}

module.exports = {
  callGroq,
  isGroqConfigured,
  getStats,
  GROQ_MODEL,
};
