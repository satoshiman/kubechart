import React from 'react';
import { Box, Text } from 'ink';
import type { ClusterTree, NamespaceNode } from '../tree/types.js';
import { getPodStatusColor, getColor } from './colors.js';
import { SYSTEM_NAMESPACES } from '../k8s/types.js';

interface TreeViewProps {
  tree: ClusterTree;
  flashing?: Set<string>;
  namespaces?: string[];
  currentNamespace?: string | string[];
}

export function TreeView({
  tree,
  flashing,
  namespaces = [],
  currentNamespace,
}: TreeViewProps): React.ReactElement {
  const namespaceList = () => {
    if (namespaces.length === 0) return null;

    const nonSystemNs = namespaces.filter((ns) => !SYSTEM_NAMESPACES.includes(ns));

    // Check if currentNamespace is an array (system namespaces) or matches a specific namespace
    const isShowingSystem = Array.isArray(currentNamespace);
    const isShowingSpecific = typeof currentNamespace === 'string';

    // Build non-system namespace items (numbered 1, 2, 3...)
    const nonSystemItems = nonSystemNs.map((ns, index) => {
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
        <Text dimColor>ns: </Text>
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
      <Box marginBottom={1}>
        <Text color={getColor('header')}>
          ◆ CLUSTER {tree.contextName} | k8s {tree.serverVersion} | {tree.nodeCount} nodes
        </Text>
      </Box>

      {/* Namespace Selector */}
      {namespaceList()}

      {/* Namespaces */}
      {tree.namespaces.map((ns: NamespaceNode, nsIndex: number) => (
        <NamespaceRow
          key={ns.name}
          namespace={ns}
          isLast={nsIndex === tree.namespaces.length - 1}
          flashing={flashing}
        />
      ))}
    </Box>
  );
}

interface NamespaceRowProps {
  namespace: {
    name: string;
    status: string;
    workloads: Array<{
      name: string;
      kind: string;
      ready: string;
      image: string;
      pods?: Array<{
        name: string;
        phase: string;
        nodeName: string;
        ip: string;
        restarts: number;
        reason?: string;
        ready: string;
        age: string;
      }>;
      lastScheduleTime?: string;
      nextScheduleTime?: string;
      duration?: string;
    }>;
    services: Array<{
      name: string;
      type: string;
      clusterIP: string;
      ports: string[];
      nodePort?: number;
      externalIp?: string;
      externalIpPending?: boolean;
    }>;
    ingresses: Array<{
      name: string;
      host: string;
      paths: string[];
      tls: boolean;
      backend?: string;
      tlsSecretMissing?: boolean;
    }>;
    configMaps: Array<{
      name: string;
      keys: number;
    }>;
  };
  isLast: boolean;
  flashing?: Set<string>;
}

function NamespaceRow({ namespace, isLast, flashing }: NamespaceRowProps): React.ReactElement {
  const prefix = isLast ? '└──' : '├──';
  const childPrefix = isLast ? '    ' : '│   ';

  const hasResources =
    namespace.workloads.length > 0 ||
    namespace.services.length > 0 ||
    namespace.ingresses.length > 0 ||
    namespace.configMaps.length > 0;
  const totalResources =
    namespace.workloads.length +
    namespace.services.length +
    namespace.ingresses.length +
    namespace.configMaps.length;

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
            namespace.configMaps.length === 0
          }
          flashing={flashing}
          namespaceName={namespace.name}
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
            namespace.configMaps.length === 0
          }
        />
      ))}

      {namespace.ingresses.map((ingress, ingIndex) => (
        <IngressRow
          key={ingress.name}
          ingress={ingress}
          prefix={childPrefix}
          isLast={ingIndex === namespace.ingresses.length - 1 && namespace.configMaps.length === 0}
        />
      ))}

      {namespace.configMaps.map((configMap, cmIndex) => (
        <ConfigMapRow
          key={configMap.name}
          configMap={configMap}
          prefix={childPrefix}
          isLast={cmIndex === namespace.configMaps.length - 1}
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
  workload: {
    name: string;
    kind: string;
    ready: string;
    image: string;
    replicaSets?: Array<{
      name: string;
      ready: string;
      pods: Array<{
        name: string;
        phase: string;
        nodeName: string;
        ip: string;
        restarts: number;
        reason?: string;
        ready: string;
        age: string;
      }>;
    }>;
    pods?: Array<{
      name: string;
      phase: string;
      nodeName: string;
      ip: string;
      restarts: number;
      reason?: string;
      ready: string;
      age: string;
    }>;
    lastScheduleTime?: string;
    nextScheduleTime?: string;
    duration?: string;
  };
  prefix: string;
  isLast: boolean;
  flashing?: Set<string>;
  namespaceName: string;
}

function WorkloadRow({
  workload,
  prefix,
  isLast,
  flashing,
  namespaceName,
}: WorkloadRowProps): React.ReactElement {
  const wlPrefix = isLast ? '└──' : '├──';
  const podPrefix = isLast ? '    ' : '│   ';
  const { icon, color } = getWorkloadIcon(workload.kind);

  // For Deployments with ReplicaSets, show the hierarchy
  if (workload.kind === 'Deployment' && workload.replicaSets && workload.replicaSets.length > 0) {
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
        </Box>

        {workload.replicaSets.map((rs, rsIndex) => {
          const rsPrefix = rsIndex === workload.replicaSets!.length - 1 ? '└──' : '├──';
          const rsChildPrefix = rsIndex === workload.replicaSets!.length - 1 ? '    ' : '│   ';

          return (
            <Box key={rs.name} flexDirection="column">
              <Box>
                <Text color={getColor('tree')}>{prefix}</Text>
                <Text color={getColor('tree')}>{podPrefix}</Text>
                <Text color={getColor('tree')}>{rsPrefix} </Text>
                <Text color={getColor('statefulSet')}>◆</Text>
                <Text color={getColor('workload')}>
                  {' '}
                  ReplicaSet {rs.name} [{rs.ready}]
                </Text>
              </Box>

              {rs.pods.map((pod, podIndex) => (
                <PodRow
                  key={pod.name}
                  pod={pod}
                  prefix={prefix + podPrefix + rsChildPrefix}
                  isLast={podIndex === rs.pods.length - 1}
                  flashing={flashing}
                  podKey={`${namespaceName}/${workload.name}/${rs.name}/${pod.name}`}
                />
              ))}
            </Box>
          );
        })}
      </Box>
    );
  }

  // For other workloads, show pods directly
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

      {(workload.pods || []).map((pod, podIndex) => (
        <PodRow
          key={pod.name}
          pod={pod}
          prefix={prefix + podPrefix}
          isLast={podIndex === (workload.pods || []).length - 1}
          flashing={flashing}
          podKey={`${namespaceName}/${workload.name}/${pod.name}`}
        />
      ))}
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
  pod: {
    name: string;
    phase: string;
    nodeName: string;
    ip: string;
    restarts: number;
    reason?: string;
    ready: string;
    age: string;
  };
  prefix: string;
  isLast: boolean;
  flashing?: Set<string>;
  podKey: string;
}

function PodRow({ pod, prefix, isLast, flashing, podKey }: PodRowProps): React.ReactElement {
  const podPrefix = isLast ? '└──' : '├──';
  const statusSymbol = getPodStatusSymbol(pod.phase, pod.ready);
  const statusColor = getPodStatusColor(pod.phase);
  const isFlashing = flashing?.has(podKey);

  return (
    <Box>
      <Text color={getColor('tree')}>{prefix}</Text>
      <Text color={getColor('tree')}>{podPrefix} POD </Text>
      <Text
        backgroundColor={isFlashing ? 'white' : undefined}
        color={isFlashing ? 'black' : statusColor}
      >
        {statusSymbol} {pod.name}
      </Text>
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
      <Text
        backgroundColor={isFlashing ? 'white' : undefined}
        color={isFlashing ? 'black' : getColor('tree')}
      >
        {' '}
        {pod.restarts}↺ {pod.age}
      </Text>
      {pod.reason && (
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
    default:
      return '?';
  }
}

interface ServiceRowProps {
  service: {
    name: string;
    type: string;
    clusterIP: string;
    ports: string[];
    nodePort?: number;
    externalIp?: string;
    externalIpPending?: boolean;
  };
  prefix: string;
  isLast: boolean;
}

function ServiceRow({ service, prefix, isLast }: ServiceRowProps): React.ReactElement {
  const svcPrefix = isLast ? '└──' : '├──';
  const { icon, color } = getServiceIcon(service.type);

  return (
    <Box>
      <Text color={getColor('tree')}>{prefix}</Text>
      <Text color={getColor('tree')}>{svcPrefix} SVC </Text>
      <Text color={color}>{icon} </Text>
      <Text color={color}>{service.type} </Text>
      <Text color={getColor('workload')}>{service.name} </Text>
      <Text color={getColor('ip')}>{service.clusterIP}</Text>
      <Text color={getColor('tree')}> {service.ports.join(', ')}</Text>
      {service.nodePort && <Text color={getColor('tree')}> :{service.nodePort}</Text>}
      {service.externalIp && <Text color={getColor('tree')}> EXTERNAL-IP: </Text>}
      {service.externalIp && <Text color={getColor('ip')}>{service.externalIp}</Text>}
      {service.externalIpPending && (
        <Text color={getColor('error')}> [EXTERNAL-IP: &lt;pending&gt;]</Text>
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
