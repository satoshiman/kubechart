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
  tree?: ClusterTree;
  showLegend?: boolean;
  isPaused?: boolean;
  showHelp?: boolean;
  setShowHelp?: (show: boolean) => void;
}

export function StatusBar({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  status,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  diff,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interval,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  lastUpdated,
  tree,
  showLegend = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isPaused = false,
  showHelp = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setShowHelp,
}: StatusBarProps): React.ReactElement {
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
    const configMapsCount = tree.namespaces.reduce((sum, ns) => sum + ns.configMaps.length, 0);

    return (
      <Box>
        <Text color={getColor('tree')}>
          namespaces: {tree.namespaces.length} | workloads: {workloadsCount} | pods: {podsCount} |
          services: {servicesCount} | ingresses: {ingressesCount} | configmaps: {configMapsCount}
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

  const helpOverlay = () => {
    return (
      <Box flexDirection="column">
        <Text color={getColor('tree')}>Keyboard Controls:</Text>
        <Text color={getColor('tree')}> [r] Refresh immediately</Text>
        <Text color={getColor('tree')}> [p] Pause/resume countdown</Text>
        <Text color={getColor('tree')}> [+/-] Adjust refresh interval (1-60s)</Text>
        <Text color={getColor('tree')}> [h] Toggle pod status legend</Text>
        <Text color={getColor('tree')}> [g] Switch to general mode</Text>
        <Text color={getColor('tree')}>
          {' '}
          [m] Cycle display mode: general → bar → use → use/lim → use/req/lim
        </Text>
        <Text color={getColor('tree')}> [?] Show/hide this help</Text>
        <Text color={getColor('tree')}> [q] Quit</Text>
        <Text color={getColor('tree')}> [0-9] Switch namespace</Text>
        <Text color={getColor('tree')}>────────────────────────────────────────</Text>
        <Text color={getColor('tree')}>Pod Status:</Text>
        <Text color={getColor('tree')}>
          {' '}
          <Text color={getColor('running')}>●</Text> Running+Ready
        </Text>
        <Text color={getColor('tree')}>
          {' '}
          <Text color={getColor('pending')}>◑</Text> Running+NotReady
        </Text>
        <Text color={getColor('tree')}>
          {' '}
          <Text color={getColor('pending')}>◌</Text> Pending
        </Text>
        <Text color={getColor('tree')}>
          {' '}
          <Text color={getColor('failed')}>✖</Text> Failed
        </Text>
        <Text color={getColor('tree')}>
          {' '}
          <Text color={getColor('succeeded')}>○</Text> Succeeded
        </Text>
        <Text color={getColor('tree')}>────────────────────────────────────────</Text>
        <Text color={getColor('tree')}>Workload Icons:</Text>
        <Text color={getColor('deployment')}> ▲ Deployment</Text>
        <Text color={getColor('statefulSet')}> ◆ StatefulSet</Text>
        <Text color={getColor('daemonSet')}> ■ DaemonSet</Text>
        <Text color={getColor('job')}> ● Job</Text>
        <Text color={getColor('cronJob')}> ○ CronJob</Text>
        <Text color={getColor('workload')}> ◆ ReplicaSet</Text>
        <Text color={getColor('clusterIP')}> ● ClusterIP</Text>
        <Text color={getColor('loadBalancer')}> ▲ LoadBalancer</Text>
        <Text color={getColor('nodePort')}> ◆ NodePort</Text>
        <Text color={getColor('ingress')}> ◆ Ingress</Text>
        <Text color={getColor('configMap')}> ◉ ConfigMap</Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" gap={0}>
      <Text color={getColor('tree')}>────────────────────────────────────────</Text>
      {stats()}
      {showLegend && (
        <>
          <Text color={getColor('tree')}>────────────────────────────────────────</Text>
          {podStatusLegend()}
        </>
      )}
      {showHelp && (
        <>
          <Text color={getColor('tree')}>────────────────────────────────────────</Text>
          {helpOverlay()}
        </>
      )}
    </Box>
  );
}
