import React from 'react';
import { Box, Text } from 'ink';
import type { DiffResult } from '../watch/differ.js';
import type { ClusterTree } from '../tree/types.js';
import { getColor } from './colors.js';

interface StatusBarProps {
  status: 'fetching' | 'idle' | 'error';
  diff: DiffResult;
  interval: number;
  lastUpdated?: Date;
  timeUntilRefresh: number;
  tree?: ClusterTree;
}

export function StatusBar({
  status,
  diff,
  interval,
  lastUpdated,
  timeUntilRefresh,
  tree,
}: StatusBarProps): React.ReactElement {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const diffSummary = () => {
    const parts: string[] = [];
    if (diff.added.length > 0) parts.push(`+${diff.added.length} added`);
    if (diff.removed.length > 0) parts.push(`-${diff.removed.length} removed`);
    if (diff.changed.length > 0) parts.push(`~${diff.changed.length} changed`);
    return parts.length > 0 ? parts.join(', ') : 'no changes';
  };

  const loadingIcon = () => {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const frameIndex = Math.floor(Date.now() / 100) % frames.length;
    return frames[frameIndex];
  };

  const statusIcon = status === 'fetching' ? loadingIcon() : ' ';

  const stats = () => {
    if (!tree) return null;

    const workloadsCount = tree.namespaces.reduce((sum, ns) => sum + ns.workloads.length, 0);
    const podsCount = tree.namespaces.reduce(
      (sum, ns) =>
        sum +
        ns.workloads.reduce((pSum, wl) => {
          const directPods = (wl.pods || []).length;
          const replicaSetPods = (wl.replicaSets || []).reduce(
            (rsSum, rs) => rsSum + rs.pods.length,
            0
          );
          return pSum + directPods + replicaSetPods;
        }, 0),
      0
    );
    const servicesCount = tree.namespaces.reduce((sum, ns) => sum + ns.services.length, 0);
    const ingressesCount = tree.namespaces.reduce((sum, ns) => sum + ns.ingresses.length, 0);

    return (
      <Box>
        <Text color={getColor('tree')}>
          namespaces: {tree.namespaces.length} | workloads: {workloadsCount} | pods: {podsCount} |
          services: {servicesCount} | ingresses: {ingressesCount}
        </Text>
      </Box>
    );
  };

  const podStatusLegend = () => {
    return (
      <Box>
        <Text color={getColor('tree')}>Pod Status: </Text>
        <Text color={getColor('running')}>● Running+Ready</Text>
        <Text color={getColor('tree')}> </Text>
        <Text color={getColor('pending')}>◑ Running+NotReady</Text>
        <Text color={getColor('tree')}> </Text>
        <Text color={getColor('pending')}>◌ Pending</Text>
        <Text color={getColor('tree')}> </Text>
        <Text color={getColor('failed')}>✖ Failed</Text>
        <Text color={getColor('tree')}> </Text>
        <Text color={getColor('succeeded')}>○ Succeeded</Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text color={getColor('tree')}>────────────────────────────────────────</Text>
      </Box>
      {stats()}
      <Box marginBottom={1} marginTop={1}>
        <Text color={getColor('tree')}>────────────────────────────────────────</Text>
      </Box>
      {podStatusLegend()}
      <Box marginTop={1}>
        <Text dimColor>
          Last updated: {lastUpdated ? formatTime(lastUpdated) : 'N/A'} ({diffSummary()}) |
          interval: {timeUntilRefresh}/{interval}s {statusIcon} | [r]efresh [q]uit
        </Text>
      </Box>
    </Box>
  );
}
