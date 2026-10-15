import sanitizeHtml from 'sanitize-html';

/**
 * Removes every HTML tag (and the contents of script/style) from user supplied text.
 * sanitize-html re-encodes `&`, `<` and `>`; only `&amp;` is decoded back so that
 * plain ampersands survive while anything tag-like stays encoded.
 */
export function stripHtml(value: string): string {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/g, '&')
    .trim();
}

/** Escapes LIKE/ILIKE wildcards so user input is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}
