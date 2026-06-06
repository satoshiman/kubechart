import React from 'react';
import { Box, Text } from 'ink';
import type { ResourceUsage, AggregatedMetrics, MetricsMode } from '../metrics/types.js';
import { formatCpuCell, formatMemCell, calcPercent, renderBar } from '../metrics/formatter.js';
import { getColor } from './colors.js';

interface MetricsCellProps {
  metrics: ResourceUsage | AggregatedMetrics | undefined;
  mode: MetricsMode;
  barMode: boolean;
  compact?: boolean; // true = chỉ CPU+MEM không có label, dùng trong pod rows
}

export function MetricsCell({
  metrics,
  mode,
  barMode,
  compact,
}: MetricsCellProps): React.ReactElement {
  if (!metrics) {
    if (compact) {
      return <Text dimColor>CPU: — MEM: —</Text>;
    }
    return <Text dimColor>CPU: — MEM: —</Text>;
  }

  const cpuStr = formatCpuCell(metrics, mode);
  const memStr = formatMemCell(metrics, mode);
  const cpuPct = calcPercent(metrics.cpuUsage, metrics.cpuLimit ?? 0);
  const memPct = calcPercent(metrics.memUsage, metrics.memLimit ?? 0);

  if (barMode) {
    const hasCpuLimit = metrics.cpuLimit && metrics.cpuLimit > 0;
    const hasMemLimit = metrics.memLimit && metrics.memLimit > 0;

    return (
      <Box gap={2}>
        {hasCpuLimit ? (
          <Text>
            CPU <Text color={cpuColor(cpuPct)}>{renderBar(cpuPct)}</Text> {cpuPct.toFixed(0)}%
          </Text>
        ) : (
          <Text>CPU: {cpuStr}</Text>
        )}
        {hasMemLimit ? (
          <Text>
            MEM <Text color={memColor(memPct)}>{renderBar(memPct)}</Text> {memPct.toFixed(0)}%
          </Text>
        ) : (
          <Text>MEM: {memStr}</Text>
        )}
      </Box>
    );
  }

  if (compact) {
    return (
      <Box gap={2}>
        <Text color={cpuColor(cpuPct)}>{cpuStr}</Text>
        <Text color={memColor(memPct)}>{memStr}</Text>
      </Box>
    );
  }

  return (
    <Box gap={3}>
      <Text>
        CPU: <Text color={cpuColor(cpuPct)}>{cpuStr}</Text>
      </Text>
      <Text>
        MEM: <Text color={memColor(memPct)}>{memStr}</Text>
      </Text>
    </Box>
  );
}

// Color thresholds:
// CPU: < 70% → green, 70-90% → yellow, > 90% → red
// MEM: < 70% → green, 70-85% → yellow, > 85% → red
function cpuColor(pct: number): string {
  if (isNaN(pct)) return getColor('tree');
  if (pct < 70) return getColor('running');
  if (pct < 90) return getColor('pending');
  return getColor('failed');
}

function memColor(pct: number): string {
  if (isNaN(pct)) return getColor('tree');
  if (pct < 70) return getColor('running');
  if (pct < 85) return getColor('pending');
  return getColor('failed');
}
