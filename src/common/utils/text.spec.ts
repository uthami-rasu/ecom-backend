import { escapeLike, slugify, stripHtml } from './text.js';
import { toPaise, toRupees, toRupeesOrNull } from './money.js';

describe('text utils', () => {
  it.each([
    ['<script>alert(1)</script>Hello', 'Hello'],
    ['<b>Bold</b> & <i>italic</i>', 'Bold & italic'],
    ['<img src=x onerror=alert(1)>Pic', 'Pic'],
    ['Tom & Jerry say "hi"', 'Tom & Jerry say "hi"'],
    [
      '&lt;script&gt;alert(1)&lt;/script&gt;',
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    ],
    ['  padded  ', 'padded'],
  ])('stripHtml(%j) → %j', (input, expected) => {
    expect(stripHtml(input)).toBe(expected);
  });

  it('escapes LIKE wildcards', () => {
    expect(escapeLike('100%_off\\')).toBe('100\\%\\_off\\\\');
  });

  it.each([
    ['Melora Raw Forest Honey', 'melora-raw-forest-honey'],
    ['Crème Brûlée & Nuts!', 'creme-brulee-nuts'],
    ['  --Spaced--  ', 'spaced'],
    ['३ honey', 'honey'],
  ])('slugify(%j) → %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

describe('money utils', () => {
  it('converts between rupees and paise without float drift', () => {
    expect(toPaise(79.9)).toBe(7990);
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toRupees(76810)).toBe(768.1);
    expect(toRupeesOrNull(null)).toBeNull();
  });
});
