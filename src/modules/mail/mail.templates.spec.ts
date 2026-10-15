import { escapeHtml, orderMail, otpMail } from './mail.templates.js';

describe('mail templates', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe(
      '&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;',
    );
  });

  it('renders OTP mails with the code in both HTML and text', () => {
    const mail = otpMail({
      purpose: 'verify_email',
      code: '042917',
      firstName: '<script>alert(1)</script>',
      ttlMinutes: 10,
    });
    expect(mail.subject).toContain('042917');
    expect(mail.text).toContain('Your code: 042917');
    expect(mail.html).toContain('042917');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('escapes user-provided order details and drops non-http tracking links', () => {
    const mail = orderMail({
      kind: 'shipped',
      orderNumber: 'BSC-ABCD2345',
      firstName: 'Sofia',
      currency: 'INR',
      total: 480,
      items: [],
      carrier: 'Blue<Dart>',
      trackingNumber: 'X1',
      trackingUrl: 'javascript:alert(1)',
      estimatedDeliveryAt: new Date('2026-10-20T00:00:00Z'),
      note: '<img src=x onerror=alert(1)>',
      orderUrl: 'http://localhost:5173/#orders/BSC-ABCD2345',
    });
    expect(mail.subject).toBe('Your order #BSC-ABCD2345 has shipped');
    expect(mail.html).toContain('Blue&lt;Dart&gt;');
    expect(mail.html).not.toContain('<img');
    expect(mail.html).not.toContain('javascript:');
    expect(mail.html).toContain('http://localhost:5173/#orders/BSC-ABCD2345');
    expect(mail.text).toContain('Carrier: Blue<Dart>');
    expect(mail.text).toContain('Estimated delivery');
  });

  it('lists items and the total on the order confirmation', () => {
    const mail = orderMail({
      kind: 'paid',
      orderNumber: 'BSC-ABCD2345',
      firstName: 'Sofia',
      currency: 'INR',
      total: 529,
      items: [
        { name: 'Wild Honey', variant: '250g', quantity: 2, lineTotal: 480 },
      ],
      carrier: null,
      trackingNumber: null,
      trackingUrl: null,
      estimatedDeliveryAt: null,
      orderUrl: 'http://localhost:5173/#orders/BSC-ABCD2345',
    });
    expect(mail.subject).toBe('Order confirmed #BSC-ABCD2345');
    expect(mail.text).toContain('Wild Honey (250g) x 2');
    expect(mail.text).toContain('Total: ₹529.00');
  });
});
