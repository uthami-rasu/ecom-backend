import { Transform } from 'class-transformer';
import { stripHtml } from './text.js';

export const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export const ToLowerCase = () =>
  Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

export const ToUpperCase = () =>
  Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  );

/** Strips HTML from free-text input (XSS hardening; output encoding still applies on clients). */
export const SanitizeText = () =>
  Transform(({ value }) =>
    typeof value === 'string' ? stripHtml(value) : value,
  );

/** Parses query-string booleans strictly: only "true"/"false" (anything else fails validation). */
export const ToBoolean = () =>
  Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  });

/** Accepts `?sizes=a,b` as well as repeated `?sizes=a&sizes=b`. */
export const ToStringArray = () =>
  Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const list = Array.isArray(value) ? value : String(value).split(',');
    return list.map((item) => String(item).trim()).filter(Boolean);
  });
