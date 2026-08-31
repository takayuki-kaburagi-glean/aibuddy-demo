import express from 'express';
import { db } from '../db.js';

export const settingsRouter = express.Router();

/**
 * Resolve the configured email recipient.
 * Source of truth is the Settings UI value (stored in db). There is no
 * hardcoded default and no env fallback; if unset, email actions are not
 * redirected (see forceEmailRecipient in buddy.js).
 */
export function getEmailRecipient() {
  const s = db.getSettings();
  return (s.emailRecipient || '').trim();
}

// GET /api/settings -> current app settings
settingsRouter.get('/', (req, res) => {
  res.json({ emailRecipient: getEmailRecipient() });
});

// POST /api/settings -> update settings (currently: emailRecipient)
settingsRouter.post('/', express.json(), (req, res) => {
  const patch = {};
  if (typeof req.body?.emailRecipient === 'string') {
    patch.emailRecipient = req.body.emailRecipient.trim();
  }
  const saved = db.setSettings(patch);
  res.json({ ok: true, emailRecipient: saved.emailRecipient ?? '' });
});
