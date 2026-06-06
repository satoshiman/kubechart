export interface BoxOptions {
  title: string;
  lines: string[];
  width: number;
  warning?: boolean; // add ⚠ to title
}

export function drawBox(opts: BoxOptions): string[] {
  const { title, lines, width, warning = false } = opts;

  if (width < 10) {
    throw new Error('Box width must be at least 10');
  }

  const result: string[] = [];

  // Top border with title
  const titleText = warning ? `⚠ ${title}` : title;
  const titleLength = titleText.length;
  const padding = Math.max(2, width - titleLength - 4);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;

  const topBorder = `┌─${' '.repeat(leftPad)}${titleText}${' '.repeat(rightPad)}─┐`;
  result.push(topBorder.slice(0, width)); // Ensure exact width

  // Content lines
  for (const line of lines) {
    const truncated = line.length > width - 4 ? line.slice(0, width - 7) + '...' : line;
    const padded = truncated.padEnd(width - 4, ' ');
    result.push(`│ ${padded} │`);
  }

  // Bottom border
  result.push(`└${'─'.repeat(width - 2)}┘`);

  return result;
}
