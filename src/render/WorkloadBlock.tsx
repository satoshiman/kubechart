import React from 'react';
import { Box, Text } from 'ink';
import { drawBox } from './ascii/box.js';
import type { WorkloadNode } from '../tree/types.js';

interface WorkloadBlockProps {
  workload: WorkloadNode;
  width: number;
}

export function WorkloadBlock({ workload, width }: WorkloadBlockProps): React.ReactElement {
  const lines: string[] = [];

  // Ready count
  lines.push(`ready: ${workload.ready}`);

  // Image
  lines.push(`image: ${workload.image}`);

  // Pods
  for (const pod of workload.pods || []) {
    const statusSymbol = getPodStatusSymbol(pod.phase, pod.ready);
    const restartInfo = pod.restarts > 0 ? `  ${pod.restarts}↺` : '  0↺';
    const reasonInfo = pod.reason ? `  ${pod.reason}` : '';
    lines.push(`${statusSymbol} ${pod.name}  ${pod.nodeName}${restartInfo}${reasonInfo}`);
  }

  // Check if degraded
  const [ready, desired] = workload.ready.split('/').map(Number);
  const isDegraded = ready < desired;

  const boxLines = drawBox({
    title: `${workload.kind}: ${workload.name}`,
    lines,
    width,
    warning: isDegraded,
  });

  return (
    <Box flexDirection="column">
      {boxLines.map((line, index) => (
        <Text key={index}>{line}</Text>
      ))}
    </Box>
  );
}

function getPodStatusSymbol(phase: string, ready: string): string {
  if (phase === 'Running') {
    const [readyContainers, totalContainers] = ready.split('/').map(Number);
    if (readyContainers < totalContainers) {
      return '◑';
    }
    return '●';
  }
  switch (phase) {
    case 'Pending':
      return '◌';
    case 'Failed':
      return '✖';
    case 'Succeeded':
      return '○';
    default:
      return '?';
  }
}
