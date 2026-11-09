import { ScoutEmailTemplates } from '@repo/adapters/notifications';
import type { OpportunityView } from '@repo/core/scouting';

const templates = new ScoutEmailTemplates('https://app.scoutalert.dev');
const opportunity: OpportunityView = {
  id: 'synthetic-project',
  kind: 'client_request',
  title: 'Remote design project',
  company: 'Example Studio',
  location: 'Remote worldwide',
  url: 'https://example.com/project?source=email&role=design',
  checkedAt: '2026-11-09T09:30:00Z',
  scouts: ['My design scout'],
  reasons: ['Remote delivery is explicitly supported.'],
  uncertainties: ['Confirm the budget with the client.'],
};

describe('ScoutAlert email presentation', () => {
  it('keeps the sign-in code selectable and out of the subject and preheader, with expiry, browser binding and separate consent', () => {
    const message = templates.signInCode({
      code: '123456',
      expiresInMinutes: 10,
    });
    expect(message.subject).not.toContain('123456');
    expect(
      message.html.match(/<div aria-hidden="true"[^>]*>([\s\S]*?)<\/div>/)?.[1],
    ).not.toContain('123456');
    expect(message.text).toContain('code is 123456');
    expect(message.html).toContain('>123456</p>');
    for (const body of [message.html, message.text]) {
      expect(body).toContain('10 minutes');
      expect(body).toContain('browser');
      expect(body).toContain('latest code');
      expect(body).toContain('does not subscribe you to opportunity alerts');
      expect(body).toContain('If you did not request it');
    }
    expect(message.html).not.toContain('<a ');
  });

  it.each(['digest', 'prompt'] as const)(
    'preserves reasons, uncertainties and source links in both %s alternatives',
    (kind) => {
      const message = templates.opportunities({
        kind,
        opportunities: [opportunity],
      });
      for (const body of [message.html, message.text]) {
        expect(body).toContain(opportunity.title);
        expect(body).toContain(opportunity.reasons[0]);
        expect(body).toContain(opportunity.uncertainties[0]);
        expect(body).toContain('Current availability needs confirmation');
        expect(body).toContain('do not independently verify employer claims');
        expect(body).toContain('https://app.scoutalert.dev/dashboard/scouts');
      }
      expect(message.html).toContain(
        'href="https://example.com/project?source=email&amp;role=design"',
      );
      expect(message.text).toContain(opportunity.url);
      expect(message.subject).toContain(
        kind === 'prompt' ? 'a strong match' : '1 opportunity',
      );
      expect(message.subject).not.toContain('1 opportunities');
    },
  );

  it('escapes untrusted titles, scout names, locations and evidence instead of interpreting HTML', () => {
    const hostile = '<img src=x onerror="alert(1)"> & \'quoted\'';
    const message = templates.opportunities({
      kind: 'digest',
      opportunities: [
        {
          ...opportunity,
          title: hostile,
          company: hostile,
          location: hostile,
          scouts: [hostile],
          reasons: [hostile],
          uncertainties: [hostile],
        },
      ],
    });
    expect(message.html).not.toContain(hostile);
    expect(message.html).not.toContain('<img');
    expect(message.html).toContain(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;quoted&#39;',
    );
    expect(message.text).toContain(hostile);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,unsafe',
    'file:///tmp/unsafe',
    '//example.com/relative',
    'https://user:password@example.com/private',
    'https://example.com/\nunsafe',
  ])('omits unsafe source links from both alternatives: %s', (url) => {
    const message = templates.opportunities({
      kind: 'digest',
      opportunities: [{ ...opportunity, url }],
    });
    expect(message.html).not.toContain(url);
    expect(message.text).not.toContain(url);
    expect(message.html).toContain('Source link unavailable');
    expect(message.text).toContain('Source link unavailable');
  });

  it('does not invent reasons, pay, organization, availability or check dates when evidence is missing', () => {
    const message = templates.opportunities({
      kind: 'digest',
      opportunities: [
        {
          ...opportunity,
          company: null,
          location: null,
          checkedAt: 'invalid',
          reasons: [],
          uncertainties: [],
        },
      ],
    });
    for (const body of [message.html, message.text]) {
      expect(body).toContain('Organization not stated');
      expect(body).toContain('Location not stated');
      expect(body).toContain('Date not available');
      expect(body).not.toContain('Why it was found');
      expect(body).not.toContain('Still to confirm');
      expect(body).not.toContain('Invalid Date');
    }
  });

  it('preserves dated employer research while leaving private brief quotes out of emails', () => {
    const message = templates.opportunities({
      kind: 'digest',
      opportunities: [
        {
          ...opportunity,
          detail: {
            assessedBy: 'ai',
            criteria: [
              {
                criterion: 'authorization',
                status: 'unknown',
                explanation: 'Review',
                quotes: [],
                briefQuotes: ['private-declaration-canary'],
              },
            ],
            research: [],
            employerResearch: {
              checkedAt: opportunity.checkedAt,
              expiresAt: '2026-11-10T09:30:00Z',
              documents: [],
              findings: [
                {
                  fact: 'authorization',
                  status: 'unresolved',
                  applicability: 'unclear',
                  value: '',
                  explanation: 'Confirm authorization with the employer.',
                  sourceUrl: 'https://example.com/policy',
                  quotes: [],
                },
              ],
            },
          },
        },
      ],
    });
    for (const body of [message.html, message.text]) {
      expect(body).toContain('Confirm authorization with the employer.');
      expect(body).toContain('https://example.com/policy');
      expect(body).toContain('9 Nov 2026');
      expect(body).toContain('UTC');
      expect(body).toContain('Still unclear');
      expect(body).not.toContain('private-declaration-canary');
    }
  });

  it('keeps all twenty reserved listings and preferences visible in a compact large digest, with full evidence in plain text', () => {
    const longReason =
      'Public source evidence, with detail to read carefully. '.repeat(150);
    const opportunities = Array.from({ length: 20 }, (_, index) => ({
      ...opportunity,
      id: String(index),
      title: `Listing ${index + 1}`,
      reasons: [longReason],
    }));
    const message = templates.opportunities({ kind: 'digest', opportunities });
    expect(Buffer.byteLength(message.html)).toBeLessThan(90_000);
    expect(message.html).toContain('All 20 opportunities are listed below');
    expect(message.html).toContain('1 detail still to confirm');
    expect(message.html).toContain('Manage alerts');
    expect(message.text).toContain(longReason);
    for (const item of opportunities) {
      expect(message.html).toContain(item.title);
      expect(message.text).toContain(item.title);
    }
  });

  it('renders a clearly identified connection test without a verification code or subscription promise', () => {
    const message = templates.connectionCheck();
    expect(message.subject).toContain('connection check');
    expect(message.html).toContain('A good connection.');
    expect(message.text).toContain('This is a delivery test');
    expect(message.html).toContain('does not contain a sign-in code');
    expect(message.html).toContain(
      'href="https://app.scoutalert.dev/dashboard"',
    );
  });
});
