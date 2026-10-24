// The feedback form's pure rules: what a valid submission is, and the record it
// becomes. Kept out of `worker.mjs` because a Worker's main module may export
// only handlers; Cloudflare refuses to start one that exports a constant.

import { SLUG_RE } from '../counter/core.mjs';

export const FEEDBACK_TYPES = Object.freeze(['problem', 'idea', 'other']);
export const MESSAGE_MIN = 5;
export const MESSAGE_MAX = 4000;
const PAGE_RE = /^\/[A-Za-z0-9._~/%-]{0,200}$/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Pure: turn a submitted form into the record to store, or say why not.
 * `{ drop: true }` is a silent refusal (the honeypot field was filled), so a
 * spam script gets the same answer as a person and nothing to tune against.
 */
export function feedbackRecord(input) {
  if (!input || typeof input !== 'object') return { error: 'body' };
  if (typeof input.website === 'string' && input.website.trim() !== '') return { drop: true };
  if (!FEEDBACK_TYPES.includes(input.type)) return { error: 'type' };
  const tool = typeof input.tool === 'string' ? input.tool.trim() : '';
  if (tool && (!SLUG_RE.test(tool) || tool.includes('..'))) return { error: 'tool' };
  const page = typeof input.page === 'string' && PAGE_RE.test(input.page) ? input.page : '';
  if (typeof input.message !== 'string') return { error: 'message' };
  // Email addresses come out before anything is stored: the record is
  // published in a public repository, and the form says so, but people paste
  // them anyway.
  const message = input.message.replace(/\r\n?/g, '\n').trim().replace(EMAIL_RE, '[email removed]');
  if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) return { error: 'message' };
  return { record: { type: input.type, tool, page, message } };
}
