'use strict';
/* Wires the optional AI services (Gemini answers, Groq director, analytics) from environment variables. */
const path = require('path');
const llmLib = require('./llm');
const { createAnswerProvider } = require('./ai-chat');
const { createDirector } = require('./director');

function createServices(AS, root, log) {
  const analytics = require('./analytics').create(path.resolve(root, process.env.LOG_DIR || 'logs'));
  const gemini = llmLib.makeGemini(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite');
  const groq = llmLib.makeGroq(process.env.GROQ_API_KEY, process.env.GROQ_MODEL || 'openai/gpt-oss-20b');
  return {
    analytics,
    answerProvider: gemini ? createAnswerProvider({ AS, generate: gemini, log }) : null,
    director: groq
      ? createDirector({ AS, groq, budget: new llmLib.Budget(+process.env.GROQ_RPM || 24, +process.env.GROQ_TPM || 7000), log, debug: process.env.DIRECTOR_DEBUG === '1' })
      : null,
    geminiModel: gemini ? process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite' : null,
    groqModel: groq ? process.env.GROQ_MODEL || 'openai/gpt-oss-20b' : null,
  };
}

module.exports = { createServices };
