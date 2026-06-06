import { drawBox } from '../../src/render/ascii/box.js';

describe('drawBox', () => {
  it('renders box with correct width', () => {
    const result = drawBox({
      title: 'Test',
      lines: ['line 1', 'line 2'],
      width: 30,
    });

    expect(result).toHaveLength(4); // top border + 2 lines + bottom border
    expect(result[0]).toHaveLength(30);
    expect(result[1]).toHaveLength(30);
    expect(result[2]).toHaveLength(30);
    expect(result[3]).toHaveLength(30);
  });

  it('truncates long lines with ellipsis', () => {
    const result = drawBox({
      title: 'Test',
      lines: ['this is a very long line that should be truncated'],
      width: 30,
    });

    expect(result[1]).toContain('...');
    expect(result[1]).toHaveLength(30);
  });

  it('adds warning indicator when warning=true', () => {
    const result = drawBox({
      title: 'Test',
      lines: ['line 1'],
      width: 30,
      warning: true,
    });

    expect(result[0]).toContain('⚠');
  });

  it('does not add warning indicator when warning=false', () => {
    const result = drawBox({
      title: 'Test',
      lines: ['line 1'],
      width: 30,
      warning: false,
    });

    expect(result[0]).not.toContain('⚠');
  });

  it('handles empty lines array', () => {
    const result = drawBox({
      title: 'Test',
      lines: [],
      width: 30,
    });

    expect(result).toHaveLength(2); // top border + bottom border
  });

  it('throws error when width < 10', () => {
    expect(() => {
      drawBox({
        title: 'Test',
        lines: ['line 1'],
        width: 5,
      });
    }).toThrow('Box width must be at least 10');
  });

  it('pads short lines to match width', () => {
    const result = drawBox({
      title: 'Test',
      lines: ['short'],
      width: 30,
    });

    expect(result[1]).toMatch(/^│ .* │$/);
    expect(result[1]).toHaveLength(30);
  });
});
