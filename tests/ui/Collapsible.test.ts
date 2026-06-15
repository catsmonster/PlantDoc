import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Collapsible } from '../../src/ui/Collapsible';

const render = (isDark: boolean, defaultOpen: boolean) =>
  renderToStaticMarkup(
    createElement(Collapsible, {
      title: 'Species care guide',
      isDark,
      defaultOpen,
      children: createElement('p', null, 'CARD BODY CONTENT'),
    }),
  );

describe('Collapsible', () => {
  it.each([true, false])('renders the header title and keeps the body mounted (isDark=%s)', (isDark) => {
    const html = render(isDark, false);
    expect(html).toContain('Species care guide');
    // Body stays in the DOM even when collapsed — it is hidden via CSS, so the
    // grid-rows animation has something to reveal and SSR/SEO see the content.
    expect(html).toContain('CARD BODY CONTENT');
  });

  it('reflects the collapsed state in aria-expanded', () => {
    expect(render(true, false)).toContain('aria-expanded="false"');
    expect(render(false, false)).toContain('aria-expanded="false"');
  });

  it('reflects the open state in aria-expanded when defaultOpen', () => {
    expect(render(true, true)).toContain('aria-expanded="true"');
    expect(render(false, true)).toContain('aria-expanded="true"');
  });

  it('renders an optional badge beside the title', () => {
    const html = renderToStaticMarkup(
      createElement(Collapsible, {
        title: 'Care insights',
        isDark: true,
        badge: createElement('span', null, 'EXPERIMENTAL'),
        children: createElement('p', null, 'body'),
      }),
    );
    expect(html).toContain('EXPERIMENTAL');
  });
});
