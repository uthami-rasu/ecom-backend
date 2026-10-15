/**
 * Email templates: small branded HTML plus a plain-text alternative. Every value that
 * may come from a user (names, addresses, admin notes, tracking details) goes through
 * `escapeHtml` before it is placed in markup.
 */

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

export type OtpMailPurpose = 'verify_email' | 'reset_password' | 'change_email';

const BRAND = {
  green: '#173f32',
  gold: '#D9B27C',
  cream: '#FBF8F5',
  text: '#2b2b2b',
  muted: '#6b6b6b',
};

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

const formatMoney = (amount: number, currency: string): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(
    amount,
  );

const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeZone: 'Asia/Kolkata',
  }).format(date);

/** Only http(s) links are rendered as anchors; anything else is shown as text. */
const isSafeUrl = (url: string): boolean => /^https?:\/\//i.test(url);

interface LayoutInput {
  preheader: string;
  heading: string;
  /** Already-escaped HTML fragments. */
  body: string;
  action?: { label: string; url: string };
}

function layout({ preheader, heading, body, action }: LayoutInput): string {
  const button = action
    ? `<p style="margin:28px 0 8px"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:${BRAND.green};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">${escapeHtml(action.label)}</a></p>`
    : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.cream};font-family:Helvetica,Arial,sans-serif;color:${BRAND.text}">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #eee6dc">
<tr><td style="background:${BRAND.green};padding:20px 28px;border-bottom:4px solid ${BRAND.gold}">
<span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#ffffff;letter-spacing:.5px">Bossco Naturals</span>
</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:24px;color:${BRAND.green}">${escapeHtml(heading)}</h1>
${body}
${button}
</td></tr>
<tr><td style="padding:16px 28px;background:${BRAND.cream};font-size:12px;color:${BRAND.muted}">
You are receiving this email because of activity on your Bossco Naturals account.
</td></tr>
</table></td></tr></table></body></html>`;
}

const paragraph = (html: string) =>
  `<p style="margin:0 0 14px;line-height:1.55">${html}</p>`;

// ── Account emails ───────────────────────────────────────

const OTP_COPY: Record<
  OtpMailPurpose,
  { subject: string; heading: string; intro: string }
> = {
  verify_email: {
    subject: 'Verify your email',
    heading: 'Confirm your email address',
    intro:
      'Use this code to verify your email and finish creating your account.',
  },
  reset_password: {
    subject: 'Reset your password',
    heading: 'Reset your password',
    intro: 'Use this code to choose a new password for your account.',
  },
  change_email: {
    subject: 'Confirm your new email address',
    heading: 'Confirm your new email',
    intro:
      'Use this code to confirm this address as the new email on your account.',
  },
};

export function otpMail(input: {
  purpose: OtpMailPurpose;
  code: string;
  firstName: string;
  ttlMinutes: number;
}): RenderedMail {
  const copy = OTP_COPY[input.purpose];
  const subject = `${input.code} is your Bossco Naturals code — ${copy.subject}`;
  const html = layout({
    preheader: `${copy.intro} It expires in ${input.ttlMinutes} minutes.`,
    heading: copy.heading,
    body: [
      paragraph(`Hi ${escapeHtml(input.firstName)},`),
      paragraph(escapeHtml(copy.intro)),
      `<p style="margin:20px 0;font-size:32px;letter-spacing:8px;font-weight:700;color:${BRAND.green};font-family:'Courier New',monospace">${escapeHtml(input.code)}</p>`,
      paragraph(
        `This code expires in ${input.ttlMinutes} minutes. If you did not request it, you can safely ignore this email.`,
      ),
    ].join('\n'),
  });
  const text = [
    `Hi ${input.firstName},`,
    '',
    copy.intro,
    '',
    `Your code: ${input.code}`,
    '',
    `This code expires in ${input.ttlMinutes} minutes. If you did not request it, you can safely ignore this email.`,
  ].join('\n');
  return { subject, html, text };
}

export function emailChangedNoticeMail(input: {
  firstName: string;
  newEmail: string;
}): RenderedMail {
  const intro = `The email address on your Bossco Naturals account was changed to ${input.newEmail}.`;
  const warning =
    'If you did not make this change, please contact our support team immediately.';
  return {
    subject: 'Your email address was changed',
    html: layout({
      preheader: intro,
      heading: 'Your email address was changed',
      body: [
        paragraph(`Hi ${escapeHtml(input.firstName)},`),
        paragraph(escapeHtml(intro)),
        paragraph(escapeHtml(warning)),
      ].join('\n'),
    }),
    text: [`Hi ${input.firstName},`, '', intro, '', warning].join('\n'),
  };
}

// ── Order emails ─────────────────────────────────────────

export type OrderMailKind =
  | 'paid'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'update';

export interface OrderMailInput {
  kind: OrderMailKind;
  orderNumber: string;
  firstName: string;
  currency: string;
  /** Rupees. */
  total: number;
  items: Array<{
    name: string;
    variant: string;
    quantity: number;
    /** Rupees. */
    lineTotal: number;
  }>;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  estimatedDeliveryAt: Date | null;
  /** Event title and note (used by "update" mails and admin notes). */
  title?: string | null;
  note?: string | null;
  orderUrl: string;
}

const ORDER_COPY: Record<
  OrderMailKind,
  (orderNumber: string) => { subject: string; heading: string; intro: string }
> = {
  paid: (n) => ({
    subject: `Order confirmed #${n}`,
    heading: 'Thank you for your order',
    intro: `We have received your payment and your order ${n} is confirmed. We will let you know when it ships.`,
  }),
  shipped: (n) => ({
    subject: `Your order #${n} has shipped`,
    heading: 'Your order is on its way',
    intro: `Good news — your order ${n} has been shipped.`,
  }),
  out_for_delivery: (n) => ({
    subject: `Your order #${n} is out for delivery`,
    heading: 'Out for delivery',
    intro: `Your order ${n} is out for delivery and should reach you today.`,
  }),
  delivered: (n) => ({
    subject: `Your order #${n} has been delivered`,
    heading: 'Delivered',
    intro: `Your order ${n} has been delivered. We hope you enjoy it!`,
  }),
  cancelled: (n) => ({
    subject: `Your order #${n} has been cancelled`,
    heading: 'Order cancelled',
    intro: `Your order ${n} has been cancelled. If you already paid, the refund will be issued to your original payment method.`,
  }),
  update: (n) => ({
    subject: `Update on your order #${n}`,
    heading: 'Order update',
    intro: `There is an update on your order ${n}.`,
  }),
};

export function orderMail(input: OrderMailInput): RenderedMail {
  const copy = ORDER_COPY[input.kind](input.orderNumber);
  const html: string[] = [
    paragraph(`Hi ${escapeHtml(input.firstName)},`),
    paragraph(escapeHtml(copy.intro)),
  ];
  const text: string[] = [`Hi ${input.firstName},`, '', copy.intro];

  if (input.kind === 'update' && input.title) {
    html.push(paragraph(`<strong>${escapeHtml(input.title)}</strong>`));
    text.push('', input.title);
  }
  if (input.note) {
    html.push(paragraph(escapeHtml(input.note)));
    text.push('', input.note);
  }

  const tracking: Array<[string, string, string?]> = [];
  if (input.carrier) tracking.push(['Carrier', input.carrier]);
  if (input.trackingNumber)
    tracking.push([
      'Tracking number',
      input.trackingNumber,
      input.trackingUrl && isSafeUrl(input.trackingUrl)
        ? input.trackingUrl
        : undefined,
    ]);
  else if (input.trackingUrl && isSafeUrl(input.trackingUrl))
    tracking.push(['Track your parcel', input.trackingUrl, input.trackingUrl]);
  if (input.estimatedDeliveryAt && input.kind !== 'delivered')
    tracking.push([
      'Estimated delivery',
      formatDate(input.estimatedDeliveryAt),
    ]);
  const showTracking = ['shipped', 'out_for_delivery', 'update'].includes(
    input.kind,
  );
  if (showTracking && tracking.length) {
    html.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;font-size:14px">${tracking
        .map(
          ([label, value, link]) =>
            `<tr><td style="padding:4px 16px 4px 0;color:${BRAND.muted}">${escapeHtml(label)}</td><td style="padding:4px 0">${
              link
                ? `<a href="${escapeHtml(link)}" style="color:${BRAND.green}">${escapeHtml(value)}</a>`
                : escapeHtml(value)
            }</td></tr>`,
        )
        .join('')}</table>`,
    );
    text.push(
      '',
      ...tracking.map(
        ([label, value, link]) =>
          `${label}: ${value}${link && link !== value ? ` (${link})` : ''}`,
      ),
    );
  }

  if (input.kind === 'paid' && input.items.length) {
    const rows = input.items
      .map(
        (item) =>
          `<tr><td style="padding:6px 0;border-bottom:1px solid #eee6dc">${escapeHtml(item.name)} <span style="color:${BRAND.muted}">(${escapeHtml(item.variant)}) × ${item.quantity}</span></td><td align="right" style="padding:6px 0;border-bottom:1px solid #eee6dc">${escapeHtml(formatMoney(item.lineTotal, input.currency))}</td></tr>`,
      )
      .join('');
    html.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;font-size:14px">${rows}<tr><td style="padding:10px 0;font-weight:700">Total</td><td align="right" style="padding:10px 0;font-weight:700">${escapeHtml(formatMoney(input.total, input.currency))}</td></tr></table>`,
    );
    text.push(
      '',
      ...input.items.map(
        (item) =>
          `- ${item.name} (${item.variant}) x ${item.quantity}: ${formatMoney(item.lineTotal, input.currency)}`,
      ),
      `Total: ${formatMoney(input.total, input.currency)}`,
    );
  }

  text.push('', `View your order: ${input.orderUrl}`);
  return {
    subject: copy.subject,
    html: layout({
      preheader: copy.intro,
      heading: copy.heading,
      body: html.join('\n'),
      action: { label: 'View your order', url: input.orderUrl },
    }),
    text: text.join('\n'),
  };
}
