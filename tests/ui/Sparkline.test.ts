import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Sparkline } from '../../src/ui/Sparkline';
import type { SparklinePoint } from '../../src/lib/sparkline';

const series: SparklinePoint[] = [
  { t: 0, value: 0 },
  { t: 10, value: 10 },
];

function render(props: Parameters<typeof Sparkline>[0]): string {
  return renderToStaticMarkup(createElement(Sparkline, props));
}

describe('Sparkline', () => {
  it('renders an accessible svg with a polyline and an end marker', () => {
    const html = render({ series, ariaLabel: 'Height trend', stroke: '#3C7140' });
    expect(html).toContain('<svg');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Height trend"');
    expect(html).toContain('<polyline');
    expect(html).toMatch(/points="[\d., ]+"/);
    expect(html).toContain('stroke="#3C7140"');
    expect(html).toContain('<circle');
  });

  it('renders nothing when there is not enough data to draw a line', () => {
    expect(render({ series: [{ t: 0, value: 5 }], ariaLabel: 'Height trend' })).toBe('');
    expect(render({ series: [], ariaLabel: 'Height trend' })).toBe('');
  });
});
