import type { ResourceUsage, MetricsMode } from './types.js';

// CPU: millicores → human readable
export function formatCpu(millicores: number): string {
  if (millicores < 1000) {
    return `${Math.round(millicores)}m`;
  }
  const cores = millicores / 1000;
  return cores.toFixed(1);
}

// Memory: bytes → human readable
export function formatMem(bytes: number): string {
  if (bytes < 1024) {
    return `${Math.round(bytes)}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024))}Mi`;
  }
  const gib = bytes / (1024 * 1024 * 1024);
  return `${gib.toFixed(1)}Gi`;
}

// Network throughput
export function formatNet(bytesPerSec: number): string {
  if (bytesPerSec < 1024) {
    return '0KB'; // < 1KB/s → display as 0KB
  }
  if (bytesPerSec < 1024 * 1024) {
    return `${Math.round(bytesPerSec / 1024)}KB`;
  }
  const mb = bytesPerSec / (1024 * 1024);
  return `${mb.toFixed(1)}MB`;
}

// Percentage (để color code)
export function calcPercent(usage: number, limit: number): number {
  if (limit === 0) return NaN;
  return (usage / limit) * 100;
}

// Format full metrics cell string theo mode
export function formatCpuCell(metrics: ResourceUsage | undefined, mode: MetricsMode): string {
  if (!metrics) return '—';

  const usage = formatCpu(metrics.cpuUsage);

  if (mode === 'use') {
    return usage;
  }

  const limit = metrics.cpuLimit !== undefined ? formatCpu(metrics.cpuLimit) : '∞';

  if (mode === 'use/lim') {
    return `${usage}/${limit}`;
  }

  const request = metrics.cpuRequest !== undefined ? formatCpu(metrics.cpuRequest) : '∞';
  return `${usage}/${request}/${limit}`;
}

export function formatMemCell(metrics: ResourceUsage | undefined, mode: MetricsMode): string {
  if (!metrics) return '—';

  const usage = formatMem(metrics.memUsage);

  if (mode === 'use') {
    return usage;
  }

  const limit = metrics.memLimit !== undefined ? formatMem(metrics.memLimit) : '∞';

  if (mode === 'use/lim') {
    return `${usage}/${limit}`;
  }

  const request = metrics.memRequest !== undefined ? formatMem(metrics.memRequest) : '∞';
  return `${usage}/${request}/${limit}`;
}

// Bar chart rendering
export function renderBar(percent: number, width = 10): string {
  if (isNaN(percent)) {
    return '░'.repeat(width); // empty, không mislead
  }

  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}
