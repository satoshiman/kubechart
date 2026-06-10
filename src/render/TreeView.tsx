import React from 'react';
import { Box, Text, Spacer } from 'ink';
import type {
  ClusterTree,
  NamespaceNode,
  WorkloadNode,
  PodNode,
  ServiceNode,
  VolumeNode,
} from '../tree/types.js';
import type { MetricsMode } from '../metrics/types.js';
import { getPodStatusColor, getColor, getVolumeTypeColor } from './colors.js';
import { isSystemNamespace } from '../k8s/types.js';
import { MetricsCell } from './MetricsCell.js';
import { formatCpu, formatMem, calcPercent } from '../metrics/formatter.js';
import { VOLUME_TYPE_CODES } from '../tree/builder.js';

interface TreeViewProps {
  tree: ClusterTree;
  flashing?: Set<string>;
  namespaces?: string[];
  currentNamespace?: string | string[];
  metricsMode?: MetricsMode;
  barMode?: boolean;
  displayMode?: 'general' | 'bar' | 'use' | 'use/lim' | 'use/req/lim';
  showMetrics?: boolean;
  timeUntilRefresh?: number;
  interval?: number;
  showSelectors?: boolean;
  showVolumes?: boolean;
}

export function TreeView({
  tree,
  flashing,
  namespaces = [],
  currentNamespace,
  metricsMode = 'use/lim',
  barMode = false,
  showMetrics = true,
  displayMode = 'general',
  timeUntilRefresh = 5,
  interval = 5,
  showSelectors = false,
  showVolumes = false,
}: TreeViewProps): React.ReactElement {
  const namespaceList = () => {
    if (namespaces.length === 0) return null;

    const nonSystemNs = namespaces.filter((ns) => !isSystemNamespace(ns));

    // Separate "default" namespace and move it to the end
    const defaultNs = nonSystemNs.filter((ns) => ns === 'default');
    const otherNs = nonSystemNs.filter((ns) => ns !== 'default');

    // Sort other namespaces alphabetically
    otherNs.sort();

    // Combine: other namespaces first, then default at the end
    const sortedNonSystemNs = [...otherNs, ...defaultNs];

    // Check if currentNamespace is an array (system namespaces) or matches a specific namespace
    const isShowingSystem = Array.isArray(currentNamespace);
    const isShowingSpecific = typeof currentNamespace === 'string';

    // Build non-system namespace items (numbered 1, 2, 3...)
    const nonSystemItems = sortedNonSystemNs.map((ns, index) => {
      const isCurrent = isShowingSpecific && ns === currentNamespace;
      const color = isCurrent ? 'cyan' : 'dimColor';
      const prefix = isCurrent ? '[●]' : `[${index + 1}]`;

      return (
        <Text key={ns} color={color}>
          {prefix} {ns}{' '}
        </Text>
      );
    });

    return (
      <Box marginBottom={1}>
        <Text color={isShowingSystem ? 'cyan' : 'dimColor'}>
          {isShowingSystem ? '[●]' : '[0]'} system ns
        </Text>
        <Text dimColor> </Text>
        {nonSystemItems}
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      {/* Cluster Header */}
      <ClusterHeader tree={tree} showMetrics={showMetrics} />

      {/* Controls */}
      <Text>
        [m]etric: <Text color={getColor('general')}>{displayMode}</Text> [s]elector:{' '}
        <Text color={showSelectors ? 'green' : 'red'}>{showSelectors ? 'ON' : 'OFF'}</Text>{' '}
        [v]olume: <Text color={showVolumes ? 'green' : 'red'}>{showVolumes ? 'ON' : 'OFF'}</Text> |
        ↺ {timeUntilRefresh}/{interval}s [-/+] [r]efresh [p]ause [q]uit [?]help
      </Text>

      {/* Namespace Selector */}
      {namespaceList()}

      {/* Namespaces */}
      {tree.namespaces.map((ns: NamespaceNode, nsIndex: number) => (
        <NamespaceRow
          key={ns.name}
          namespace={ns}
          isLast={nsIndex === tree.namespaces.length - 1}
          flashing={flashing}
          metricsMode={metricsMode}
          barMode={barMode}
          showMetrics={showMetrics}
          showSelectors={showSelectors}
          showVolumes={showVolumes}
        />
      ))}
    </Box>
  );
}

interface NamespaceRowProps {
  namespace: NamespaceNode;
  isLast: boolean;
  flashing?: Set<string>;
  metricsMode?: MetricsMode;
  barMode?: boolean;
  showMetrics?: boolean;
  showSelectors?: boolean;
  showVolumes?: boolean;
}

function NamespaceRow({
  namespace,
  isLast,
  flashing,
  metricsMode,
  barMode,
  showMetrics,
  showSelectors,
  showVolumes,
}: NamespaceRowProps): React.ReactElement {
  const prefix = isLast ? '└──' : '├──';
  const childPrefix = isLast ? '    ' : '│   ';

  const hasResources =
    namespace.workloads.length > 0 ||
    namespace.services.length > 0 ||
    namespace.ingresses.length > 0 ||
    namespace.configMaps.length > 0 ||
    (namespace.orphanPods && namespace.orphanPods.length > 0);
  const totalResources =
    namespace.workloads.length +
    namespace.services.length +
    namespace.ingresses.length +
    namespace.configMaps.length +
    (namespace.orphanPods?.length || 0);

  return (
    <Box flexDirection="column" marginBottom={hasResources ? 0 : 1}>
      <Box>
        <Text color={getColor('tree')}>{prefix} </Text>
        <Text color={getColor('namespace')}>
          NAMESPACE {namespace.name} [{namespace.status}]
        </Text>
      </Box>

      {namespace.workloads.map((workload, wlIndex) => (
        <WorkloadRow
          key={workload.name}
          workload={workload}
          prefix={childPrefix}
          isLast={
            wlIndex === totalResources - 1 &&
            namespace.services.length === 0 &&
            namespace.ingresses.length === 0 &&
            namespace.configMaps.length === 0 &&
            (!namespace.orphanPods || namespace.orphanPods.length === 0)
          }
          flashing={flashing}
          namespaceName={namespace.name}
          metricsMode={metricsMode}
          barMode={barMode}
          showMetrics={showMetrics}
          showSelectors={showSelectors}
          showVolumes={showVolumes}
        />
      ))}

      {namespace.services.map((service, svcIndex) => (
        <ServiceRow
          key={service.name}
          service={service}
          prefix={childPrefix}
          isLast={
            svcIndex === namespace.services.length - 1 &&
            namespace.ingresses.length === 0 &&
            namespace.configMaps.length === 0 &&
            (!namespace.orphanPods || namespace.orphanPods.length === 0)
          }
          showMetrics={showMetrics}
          showSelectors={showSelectors}
        />
      ))}

      {namespace.ingresses.map((ingress, ingIndex) => (
        <IngressRow
          key={ingress.name}
          ingress={ingress}
          prefix={childPrefix}
          isLast={
            ingIndex === namespace.ingresses.length - 1 &&
            namespace.configMaps.length === 0 &&
            (!namespace.orphanPods || namespace.orphanPods.length === 0)
          }
        />
      ))}

      {namespace.configMaps.map((configMap, cmIndex) => (
        <ConfigMapRow
          key={configMap.name}
          configMap={configMap}
          prefix={childPrefix}
          isLast={
            cmIndex === namespace.configMaps.length - 1 &&
            (!namespace.orphanPods || namespace.orphanPods.length === 0)
          }
        />
      ))}

      {namespace.orphanPods &&
        namespace.orphanPods.length > 0 &&
        namespace.orphanPods.map((pod, podIndex) => (
          <PodRow
            key={pod.name}
            pod={pod}
            prefix={childPrefix}
            isLast={podIndex === namespace.orphanPods!.length - 1}
            flashing={flashing}
            podKey={`${namespace.name}/orphan/${pod.name}`}
            metricsMode={metricsMode}
            barMode={barMode}
            showMetrics={showMetrics}
            showSelectors={showSelectors}
          />
        ))}

      {!hasResources && !isLast && (
        <Box>
          <Text color={getColor('tree')}>{childPrefix}</Text>
        </Box>
      )}
    </Box>
  );
}

interface WorkloadRowProps {
  workload: WorkloadNode;
  prefix: string;
  isLast: boolean;
  flashing?: Set<string>;
  namespaceName: string;
  metricsMode?: MetricsMode;
  barMode?: boolean;
  showMetrics?: boolean;
  showSelectors?: boolean;
  showVolumes?: boolean;
}

function WorkloadRow({
  workload,
  prefix,
  isLast,
  flashing,
  namespaceName,
  metricsMode,
  barMode,
  showMetrics,
  showSelectors,
  showVolumes,
}: WorkloadRowProps): React.ReactElement {
  const wlPrefix = isLast ? '└──' : '├──';
  const podPrefix = isLast ? '    ' : '│   ';
  const { icon, color } = getWorkloadIcon(workload.kind);

  // For Deployments with ReplicaSets, show the hierarchy
  if (workload.kind === 'Deployment' && workload.replicaSets && workload.replicaSets.length > 0) {
    // Sort replica sets: active (has pods) first, inactive (no pods) last
    const sortedReplicaSets = [...workload.replicaSets].sort((a, b) => {
      const hasPodsA = (a.pods || []).length > 0;
      const hasPodsB = (b.pods || []).length > 0;
      // Inactive (no pods) goes to the end
      if (!hasPodsA && hasPodsB) return 1;
      if (hasPodsA && !hasPodsB) return -1;
      return 0;
    });

    return (
      <Box flexDirection="column">
        <Box>
          <Text color={getColor('tree')}>{prefix}</Text>
          <Text color={getColor('tree')}>{wlPrefix} </Text>
          <Text color={color}>{icon}</Text>
          <Text color={getColor('deployment')}>
            {' '}
            {workload.kind} {workload.name} [{workload.ready}]
          </Text>
          {showMetrics && (
            <>
              <Spacer />
              <MetricsCell
                metrics={workload.aggregatedMetrics}
                mode={metricsMode!}
                barMode={barMode!}
              />
            </>
          )}
        </Box>

        {showSelectors && workload.selector && (
          <Box>
            <Text color={getColor('tree')}>{prefix}</Text>
            <Text color={getColor('tree')}>{podPrefix}</Text>
            <Text dimColor>│ </Text>
            <Text color="#E6B800">▶ {workload.selector}</Text>
          </Box>
        )}

        {sortedReplicaSets.map((rs, rsIndex) => {
          const rsPrefix = rsIndex === sortedReplicaSets.length - 1 ? '└──' : '├──';
          const rsChildPrefix = rsIndex === sortedReplicaSets.length - 1 ? '    ' : '│   ';
          const hasPods = (rs.pods || []).length > 0;
          const isInactive = !hasPods;
          const hasVolumes = showVolumes && rs.volumes && rs.volumes.length > 0;

          return (
            <Box key={rs.name} flexDirection="column">
              <Box>
                <Text color={getColor('tree')}>{prefix}</Text>
                <Text color={getColor('tree')}>{podPrefix}</Text>
                <Text color={getColor('tree')}>{rsPrefix} </Text>
                <Text color={getColor('statefulSet')}>◆</Text>
                <Text color={isInactive ? undefined : getColor('workload')} dimColor={isInactive}>
                  {' '}
                  ReplicaSet {rs.name} [{rs.ready}]{isInactive && ' (inactive)'}
                </Text>
              </Box>

              {showSelectors && rs.selector && (
                <Box>
                  <Text color={getColor('tree')}>{prefix}</Text>
                  <Text color={getColor('tree')}>{podPrefix}</Text>
                  <Text color={getColor('tree')}>{rsChildPrefix}</Text>
                  {(hasPods || hasVolumes) && <Text dimColor>│ </Text>}
                  {!hasPods && !hasVolumes && (
                    <Box marginLeft={2}>
                      <Text> </Text>
                    </Box>
                  )}
                  <Text color="#E6B800">▶ {rs.selector}</Text>
                </Box>
              )}

              {showVolumes && rs.volumes && rs.volumes.length > 0 && (
                <VolumeRow
                  volumes={rs.volumes}
                  prefix={prefix + podPrefix + rsChildPrefix}
                  isLast={!hasPods}
                />
              )}

              {rs.pods.map((pod, podIndex) => (
                <PodRow
                  key={pod.name}
                  pod={pod}
                  prefix={prefix + podPrefix + rsChildPrefix}
                  isLast={podIndex === rs.pods.length - 1}
                  flashing={flashing}
                  podKey={`${namespaceName}/${workload.name}/${rs.name}/${pod.name}`}
                  metricsMode={metricsMode}
                  barMode={barMode}
                  showMetrics={showMetrics}
                  showSelectors={showSelectors}
                />
              ))}
            </Box>
          );
        })}
      </Box>
    );
  }

  // For other workloads, show pods directly
  const hasVolumes = showVolumes && workload.volumes && workload.volumes.length > 0;
  const hasPods = (workload.pods || []).length > 0;

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={getColor('tree')}>{prefix}</Text>
        <Text color={getColor('tree')}>{wlPrefix} </Text>
        <Text color={color}>{icon}</Text>
        <Text color={getColor('deployment')}>
          {' '}
          {workload.kind} {workload.name} [{workload.ready}]
        </Text>
        {showMetrics && workload.kind !== 'Job' && workload.kind !== 'CronJob' && (
          <>
            <Spacer />
            <MetricsCell
              metrics={workload.aggregatedMetrics}
              mode={metricsMode!}
              barMode={barMode!}
            />
          </>
        )}
        {/* Show schedule info for CronJobs on same line */}
        {workload.kind === 'CronJob' &&
          (workload.lastScheduleTime || workload.nextScheduleTime) && (
            <Text color={getColor('tree')}>
              {' '}
              last: {workload.lastScheduleTime || 'never'}
              {workload.nextScheduleTime && ` + next: ${workload.nextScheduleTime}`}
            </Text>
          )}
        {/* Show duration for Jobs on same line */}
        {workload.kind === 'Job' && workload.duration && (
          <Text color={getColor('tree')}> duration: {workload.duration}</Text>
        )}
      </Box>

      {showSelectors && workload.selector && (
        <Box>
          <Text color={getColor('tree')}>{prefix}</Text>
          <Text color={getColor('tree')}>{podPrefix}</Text>
          {(hasPods || hasVolumes) && <Text dimColor>│ </Text>}
          {!hasPods && !hasVolumes && (
            <Box marginLeft={2}>
              <Text> </Text>
            </Box>
          )}
          <Text color="#E6B800">▶ {workload.selector}</Text>
        </Box>
      )}

      {showVolumes && workload.volumes && workload.volumes.length > 0 && (
        <VolumeRow volumes={workload.volumes} prefix={prefix + podPrefix} isLast={!hasPods} />
      )}

      {(workload.pods || []).map((pod, podIndex) => (
        <PodRow
          key={pod.name}
          pod={pod}
          prefix={prefix + podPrefix}
          isLast={podIndex === (workload.pods || []).length - 1 && !workload.replicaSets?.length}
          flashing={flashing}
          podKey={`${namespaceName}/${workload.name}/${pod.name}`}
          metricsMode={metricsMode}
          barMode={barMode}
          showMetrics={showMetrics}
          showSelectors={showSelectors}
        />
      ))}
      {(() => {
        const replicaSets = workload.replicaSets || [];
        const activeRs = replicaSets.filter((rs) => {
          const hasPods = (rs.pods || []).length > 0;
          return hasPods;
        });
        const inactiveRs = replicaSets.filter((rs) => {
          const hasPods = (rs.pods || []).length > 0;
          return !hasPods;
        });
        const allRs = [...activeRs, ...inactiveRs];

        return allRs.map((rs, rsIndex) => {
          const hasPods = (rs.pods || []).length > 0;
          const isInactive = !hasPods;
          const isLast = rsIndex === allRs.length - 1;
          return (
            <Box key={rs.name}>
              <Text color={isInactive ? undefined : getColor('tree')} dimColor={isInactive}>
                {prefix}
                {isLast ? '└──' : '├──'} RS {rs.name} [{rs.ready}]{isInactive && ' (inactive)'}
              </Text>
              {(rs.pods || []).map((pod, podIndex) => (
                <PodRow
                  key={pod.name}
                  pod={pod}
                  prefix={prefix + (isLast ? '    ' : '│   ')}
                  isLast={podIndex === (rs.pods || []).length - 1}
                  flashing={flashing}
                  podKey={`${namespaceName}/${workload.name}/${pod.name}`}
                  metricsMode={metricsMode}
                  barMode={barMode}
                  showMetrics={showMetrics}
                  showSelectors={showSelectors}
                />
              ))}
              {showSelectors && rs.selector && (
                <Box>
                  <Text color={getColor('tree')}>{prefix}</Text>
                  <Text color={getColor('tree')}>{isLast ? '    ' : '│   '}</Text>
                  {!hasPods && (
                    <Box marginLeft={2}>
                      <Text> </Text>
                    </Box>
                  )}
                  <Text color="#E6B800">▶ {rs.selector}</Text>
                </Box>
              )}
            </Box>
          );
        });
      })()}
    </Box>
  );
}

function getWorkloadIcon(kind: string): { icon: string; color: string } {
  switch (kind) {
    case 'Deployment':
      return { icon: '▲', color: getColor('deployment') };
    case 'StatefulSet':
      return { icon: '◆', color: getColor('statefulSet') };
    case 'DaemonSet':
      return { icon: '■', color: getColor('daemonSet') };
    case 'Job':
      return { icon: '●', color: getColor('job') };
    case 'CronJob':
      return { icon: '○', color: getColor('cronJob') };
    default:
      return { icon: '▪', color: getColor('workload') };
  }
}

interface PodRowProps {
  pod: PodNode;
  prefix: string;
  isLast: boolean;
  flashing?: Set<string>;
  podKey: string;
  metricsMode?: MetricsMode;
  barMode?: boolean;
  showMetrics?: boolean;
  showSelectors?: boolean;
}

function PodRow({
  pod,
  prefix,
  isLast,
  flashing,
  podKey,
  metricsMode,
  barMode,
  showMetrics,
  showSelectors,
}: PodRowProps): React.ReactElement {
  const podPrefix = isLast ? '└──' : '├──';
  const statusSymbol = getPodStatusSymbol(pod.phase, pod.ready);
  const statusColor = getPodStatusColor(pod.phase, pod.ready);
  const isFlashing = flashing?.has(podKey);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={getColor('tree')}>{prefix}</Text>
        <Text color={getColor('tree')}>{podPrefix} POD </Text>
        <Text
          backgroundColor={isFlashing ? 'white' : undefined}
          color={isFlashing ? 'black' : statusColor}
        >
          {statusSymbol} {pod.name}
        </Text>
        {showMetrics ? (
          <>
            <Text
              backgroundColor={isFlashing ? 'white' : undefined}
              color={isFlashing ? 'black' : getColor('tree')}
            >
              {' '}
              {pod.phase}
            </Text>
            {pod.ports && pod.ports.length > 0 && (
              <Text
                backgroundColor={isFlashing ? 'white' : undefined}
                color={isFlashing ? 'black' : getColor('tree')}
              >
                {' '}
                {pod.ports.join(', ')}
              </Text>
            )}
            <Spacer />
            <MetricsCell
              metrics={pod.metrics?.resources}
              mode={metricsMode!}
              barMode={barMode!}
              compact
            />
            {pod.metrics?.network && (
              <Text dimColor>
                {' '}
                NET↑{formatNet(pod.metrics.network.txBytes)}↓
                {formatNet(pod.metrics.network.rxBytes)}
              </Text>
            )}
          </>
        ) : (
          <>
            <Text
              backgroundColor={isFlashing ? 'white' : undefined}
              color={isFlashing ? 'black' : getColor('tree')}
            >
              {' '}
              {pod.nodeName}{' '}
            </Text>
            <Text
              backgroundColor={isFlashing ? 'white' : undefined}
              color={isFlashing ? 'black' : getColor('ip')}
            >
              {pod.ip}
            </Text>
            {pod.ports && pod.ports.length > 0 && (
              <Text
                backgroundColor={isFlashing ? 'white' : undefined}
                color={isFlashing ? 'black' : getColor('tree')}
              >
                {' '}
                {pod.ports.join(', ')}
              </Text>
            )}
            <Text
              backgroundColor={isFlashing ? 'white' : undefined}
              color={isFlashing ? 'black' : getColor('tree')}
            >
              {' '}
              {pod.restarts}↺ {pod.age}
            </Text>
          </>
        )}
        {!showMetrics && pod.reason && (
          <Text
            backgroundColor={isFlashing ? 'white' : undefined}
            color={
              isFlashing
                ? 'black'
                : pod.reason === 'Completed'
                  ? getColor('completed')
                  : getColor('error')
            }
          >
            {' '}
            {pod.reason}
          </Text>
        )}
      </Box>

      {showSelectors && pod.labels && (
        <Box>
          <Text color={getColor('tree')}>{prefix}</Text>
          <Text color={getColor('tree')}>{isLast ? '    ' : '│   '}</Text>
          <Text color="#E6B800">▶ {pod.labels}</Text>
        </Box>
      )}
    </Box>
  );
}

function getPodStatusSymbol(phase: string, ready: string): string {
  if (phase === 'Running') {
    // Check if pod is running but not ready (e.g., 0/1, 1/2)
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
    case 'Terminating':
      return '◍';
    default:
      return '?';
  }
}

interface ServiceRowProps {
  service: ServiceNode;
  prefix: string;
  isLast: boolean;
  showMetrics?: boolean;
  showSelectors?: boolean;
}

function ServiceRow({
  service,
  prefix,
  isLast,
  showMetrics,
  showSelectors,
}: ServiceRowProps): React.ReactElement {
  const svcPrefix = isLast ? '└──' : '├──';
  const { icon, color } = getServiceIcon(service.type);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={getColor('tree')}>{prefix}</Text>
        <Text color={getColor('tree')}>{svcPrefix} SVC </Text>
        <Text color={color}>{icon} </Text>
        <Text color={color}>{service.type} </Text>
        <Text color={getColor('workload')}>{service.name} </Text>
        {showMetrics ? (
          <>
            <Spacer />
            <Text color={getColor('tree')}>{service.type.padEnd(12)} </Text>
            <Text color={getColor('tree')}>CONN: {service.traffic?.activeConnections ?? '—'} </Text>
            <Text color={getColor('tree')}>
              RPS:{' '}
              {service.traffic?.requestsPerSec !== undefined
                ? `${service.traffic.requestsPerSec.toFixed(1)}/s`
                : '—'}
            </Text>
          </>
        ) : (
          <>
            <Text color={getColor('ip')}>{service.clusterIP}</Text>
            {service.nodePort && <Text color={getColor('tree')}> :{service.nodePort}</Text>}
            <Text color={getColor('tree')}> {service.ports.join(', ')}</Text>
            {service.targetPort && <Text color={getColor('tree')}> →{service.targetPort}</Text>}
            {service.externalIp && <Text color={getColor('tree')}> EXTERNAL-IP: </Text>}
            {service.externalIp && <Text color={getColor('ip')}>{service.externalIp}</Text>}
            {service.externalIpPending && (
              <Text color={getColor('error')}> [EXTERNAL-IP: &lt;pending&gt;]</Text>
            )}
          </>
        )}
      </Box>

      {showSelectors && service.selector && (
        <Box>
          <Text color={getColor('tree')}>{prefix}</Text>
          <Text color={getColor('tree')}>{isLast ? '    ' : '│   '}</Text>
          <Box marginLeft={2}>
            <Text> </Text>
          </Box>
          <Text color="#E6B800">▶ {service.selector}</Text>
        </Box>
      )}
    </Box>
  );
}

function getServiceIcon(type: string): { icon: string; color: string } {
  switch (type) {
    case 'ClusterIP':
      return { icon: '●', color: getColor('clusterIP') };
    case 'NodePort':
      return { icon: '◆', color: getColor('nodePort') };
    case 'LoadBalancer':
      return { icon: '▲', color: getColor('loadBalancer') };
    case 'ExternalName':
      return { icon: '○', color: getColor('externalName') };
    default:
      return { icon: '●', color: getColor('clusterIP') };
  }
}

interface IngressRowProps {
  ingress: {
    name: string;
    host: string;
    paths: string[];
    tls: boolean;
    backend?: string;
    tlsSecretMissing?: boolean;
  };
  prefix: string;
  isLast: boolean;
}

function IngressRow({ ingress, prefix, isLast }: IngressRowProps): React.ReactElement {
  const ingPrefix = isLast ? '└──' : '├──';

  return (
    <Box>
      <Text color={getColor('tree')}>{prefix}</Text>
      <Text color={getColor('tree')}>{ingPrefix} ING </Text>
      <Text color={getColor('ingress')}>◆</Text>
      <Text color={getColor('workload')}>
        {' '}
        {ingress.host} {ingress.tls ? '🔒' : ''}
      </Text>
      <Text color={getColor('tree')}> {ingress.paths.join(', ')}</Text>
      {ingress.backend && <Text color={getColor('tree')}> → {ingress.backend}</Text>}
      {ingress.tlsSecretMissing && <Text color={getColor('error')}> [TLS secret missing]</Text>}
    </Box>
  );
}

interface ConfigMapRowProps {
  configMap: {
    name: string;
    keys: number;
  };
  prefix: string;
  isLast: boolean;
}

function ConfigMapRow({ configMap, prefix, isLast }: ConfigMapRowProps): React.ReactElement {
  const cmPrefix = isLast ? '└──' : '├──';

  return (
    <Box>
      <Text color={getColor('tree')}>{prefix}</Text>
      <Text color={getColor('tree')}>{cmPrefix} CM </Text>
      <Text color={getColor('configMap')}>◉</Text>
      <Text color={getColor('workload')}>
        {' '}
        {configMap.name} {configMap.keys} keys
      </Text>
    </Box>
  );
}

interface VolumeRowProps {
  volumes: VolumeNode[];
  prefix: string;
  isLast: boolean;
}

function VolumeRow({ volumes, prefix, isLast }: VolumeRowProps): React.ReactElement {
  const vPrefix = isLast ? '└──' : '├──';
  const vChildPrefix = isLast ? '    ' : '│   ';

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={getColor('tree')}>{prefix}</Text>
        <Text color={getColor('tree')}>{vPrefix} </Text>
        <Text color={getColor('volume')}>Volumes</Text>
        <Text color={getColor('workload')}> [{volumes.length}]</Text>
      </Box>
      {volumes.map((volume, volIndex) => {
        const volPrefix = volIndex === volumes.length - 1 ? '└──' : '├──';
        const typeCode = VOLUME_TYPE_CODES[volume.type] || 'UNK';
        const typeColor = getVolumeTypeColor(volume.type);

        // Build PVC metadata string
        let pvcMeta = '';
        if (volume.pvcInfo) {
          const parts: string[] = [];
          if (volume.pvcInfo.status) parts.push(volume.pvcInfo.status);
          if (volume.pvcInfo.capacity) parts.push(volume.pvcInfo.capacity);
          if (volume.pvcInfo.storageClass) parts.push(volume.pvcInfo.storageClass);
          if (parts.length > 0) pvcMeta = ` (${parts.join(', ')})`;
        }

        return (
          <Box key={volume.name}>
            <Text color={getColor('tree')}>{prefix}</Text>
            <Text color={getColor('tree')}>{vChildPrefix}</Text>
            <Text color={getColor('tree')}>{volPrefix} </Text>
            <Text color={typeColor}>{typeCode}</Text>
            <Text color={getColor('workload')}> {volume.name}</Text>
            {volume.info && <Text dimColor> {volume.info}</Text>}
            {pvcMeta && <Text dimColor>{pvcMeta}</Text>}
            {volume.mountPath && <Text dimColor> @ {volume.mountPath}</Text>}
          </Box>
        );
      })}
    </Box>
  );
}

function ClusterHeader({
  tree,
  showMetrics,
}: {
  tree: ClusterTree;
  showMetrics?: boolean;
}): React.ReactElement {
  if (!showMetrics || !tree.clusterMetrics) {
    return (
      <Box marginBottom={1}>
        <Text color={getColor('header')}>
          ◆ CLUSTER {tree.contextName} | k8s {tree.serverVersion} | {tree.nodeCount} nodes
        </Text>
      </Box>
    );
  }

  const cpuStr = `CPU: ${formatCpu(tree.clusterMetrics.cpuUsage)}/${formatCpu(tree.clusterMetrics.cpuCapacity)} ${calcPercent(tree.clusterMetrics.cpuUsage, tree.clusterMetrics.cpuCapacity).toFixed(0)}%`;
  const memStr = `MEM: ${formatMem(tree.clusterMetrics.memUsage)}/${formatMem(tree.clusterMetrics.memCapacity)} ${calcPercent(tree.clusterMetrics.memUsage, tree.clusterMetrics.memCapacity).toFixed(0)}%`;

  return (
    <Box marginBottom={1} justifyContent="space-between">
      <Text color={getColor('header')}>
        ◆ CLUSTER {tree.contextName} | k8s {tree.serverVersion} | {tree.nodeCount} nodes
      </Text>
      <Text dimColor>
        {cpuStr} {memStr}
      </Text>
    </Box>
  );
}

function formatNet(bytesPerSec: number): string {
  if (bytesPerSec < 1024) {
    return '0KB';
  }
  if (bytesPerSec < 1024 * 1024) {
    return `${Math.round(bytesPerSec / 1024)}KB`;
  }
  const mb = bytesPerSec / (1024 * 1024);
  return `${mb.toFixed(1)}MB`;
}
