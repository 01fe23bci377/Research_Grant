require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const { createApp } = require('./src/api');
const { db, config } = require('./src/core');
const { connectDB } = require('./src/database');
const persistence = require('./src/persistence');

async function bootstrap() {
  // Always load the local file store first so the API can start even if Atlas
  // is unreachable; MongoDB then becomes the system of record when connected.
  db.load();

  const connected = await connectDB();
  if (connected) {
    const hydrated = await persistence.hydrate(db.state);
    console.log(`[store] MongoDB connected — hydrated ${db.state.runs.length} runs, ${db.state.versions.length} versions (${hydrated ? 'ok' : 'empty'}).`);
    db.persist();
  } else {
    console.log('[store] MongoDB unavailable — using backend/data/state.json as the fallback store.');
  }

  const app = createApp();

  // Serve the built console when it exists (single-process preview).
  const dist = path.resolve(__dirname, '..', 'frontend', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      return res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.listen(config.port, () => {
    console.log(`AURA grants API listening on http://localhost:${config.port}`);
    console.log(`[llm] Groq ${process.env.GROQ_MODEL || 'openai/gpt-oss-120b'} · drafting ${String(process.env.AURA_LLM || 'on')}`);
  });

  // Institutional portfolio is seeded on every boot (idempotent). No demo runs.
  setTimeout(async () => {
    try {
      const result = await require('./src/project-store').seedProjects();
      console.log('[projects]', JSON.stringify(result));
    } catch (err) {
      console.error('[projects] seed failed:', err.message);
    }
  }, 800);
}

bootstrap().catch((err) => {
  console.error('[boot] failed:', err);
  process.exit(1);
});
