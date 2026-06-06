import * as k8s from '@kubernetes/client-node';
import type { PodMetrics } from '../metrics/types.js';
import {
  aggregateWorkloadMetrics,
  aggregateClusterMetrics,
  type NodeCapacity,
  type RawNodeMetrics,
} from '../metrics/aggregator.js';
import type { ClusterTree, PodNode, WorkloadNode } from '../tree/types.js';

interface RawPodMetrics {
  metadata: { name: string; namespace: string };
  containers: Array<{
    name: string;
    usage: { cpu: string; memory: string };
  }>;
}

// Parse K8s quantity strings → numbers
// "12m" → 12 (millicores)
// "344291910n" → 344.29191 (millicores, from nanocores)
// "1.2" → 1200 (millicores, from cores)
export function parseCpuQuantity(str: string): number {
  if (str.endsWith('n')) {
    // Nanocores to millicores
    return parseInt(str.slice(0, -1), 10) / 1000000;
  }
  if (str.endsWith('m')) {
    return parseInt(str.slice(0, -1), 10);
  }
  // Cores to millicores
  return Math.round(parseFloat(str) * 1000);
}

export function parseMemQuantity(str: string): number {
  const units: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 * 1024,
    Gi: 1024 * 1024 * 1024,
    Ti: 1024 * 1024 * 1024 * 1024,
    K: 1000,
    M: 1000 * 1000,
    G: 1000 * 1000 * 1000,
    T: 1000 * 1000 * 1000 * 1000,
  };

  for (const [unit, multiplier] of Object.entries(units)) {
    if (str.endsWith(unit)) {
      return Math.round(parseFloat(str.slice(0, -unit.length)) * multiplier);
    }
  }

  // Assume bytes if no unit
  return parseInt(str, 10);
}

// metrics-server expose API tại /apis/metrics.k8s.io/v1beta1
export async function fetchPodMetrics(
  kc: k8s.KubeConfig,
  namespace?: string
): Promise<Map<string, PodMetrics> | null> {
  try {
    const customApi = kc.makeApiClient(k8s.CustomObjectsApi);
    const ns = namespace ?? '';
    const result = ns
      ? await customApi.listNamespacedCustomObject('metrics.k8s.io', 'v1beta1', ns, 'pods')
      : await customApi.listClusterCustomObject('metrics.k8s.io', 'v1beta1', 'pods');

    const items = (result.body as unknown as { items: RawPodMetrics[] }).items;
    const map = new Map<string, PodMetrics>();

    for (const item of items) {
      let cpuUsage = 0;
      let memUsage = 0;

      for (const container of item.containers) {
        cpuUsage += parseCpuQuantity(container.usage.cpu);
        memUsage += parseMemQuantity(container.usage.memory);
      }

      const key = item.metadata.namespace
        ? `${item.metadata.namespace}/${item.metadata.name}`
        : item.metadata.name;
      map.set(key, {
        resources: {
          cpuUsage,
          memUsage,
        },
      });
    }

    return map;
  } catch {
    // metrics-server không khả dụng → graceful degradation
    return null;
  }
}

export async function fetchNodeMetrics(kc: k8s.KubeConfig): Promise<RawNodeMetrics[] | null> {
  try {
    const customApi = kc.makeApiClient(k8s.CustomObjectsApi);
    const result = await customApi.listClusterCustomObject('metrics.k8s.io', 'v1beta1', 'nodes');
    return (result.body as unknown as { items: RawNodeMetrics[] }).items;
  } catch {
    return null;
  }
}

// Fetch node capacity for cluster metrics aggregation
export async function fetchNodeCapacity(coreApi: k8s.CoreV1Api): Promise<NodeCapacity[]> {
  try {
    const { body } = await coreApi.listNode();
    return body.items.map((node) => ({
      name: node.metadata?.name || '',
      cpuCapacity: parseCpuQuantity(node.status?.capacity?.cpu || '0'),
      memCapacity: parseMemQuantity(node.status?.capacity?.memory || '0'),
    }));
  } catch {
    return [];
  }
}

// Attach metrics vào tree nodes
export function attachMetrics(
  tree: ClusterTree,
  podMetrics: Map<string, PodMetrics> | null,
  nodeMetrics: RawNodeMetrics[] | null,
  nodeCapacity: NodeCapacity[]
): ClusterTree {
  // Deep clone tree to avoid mutation
  const newTree: ClusterTree = {
    ...tree,
    namespaces: tree.namespaces.map((ns) => ({
      ...ns,
      workloads: ns.workloads.map((wl) => attachWorkloadMetrics(wl, podMetrics, ns.name)),
      services: ns.services.map((svc) => ({ ...svc })), // Service traffic not implemented yet
    })),
  };

  // Attach cluster metrics
  if (nodeMetrics && nodeCapacity.length > 0) {
    newTree.clusterMetrics = aggregateClusterMetrics(nodeMetrics, nodeCapacity);
  }

  return newTree;
}

function attachWorkloadMetrics(
  workload: WorkloadNode,
  podMetrics: Map<string, PodMetrics> | null,
  namespace: string
): WorkloadNode {
  // Collect all pods (direct + from replicaSets)
  const allPods: PodNode[] = [];

  if (workload.pods) {
    for (const pod of workload.pods) {
      allPods.push(attachPodMetrics(pod, podMetrics, namespace));
    }
  }

  if (workload.replicaSets) {
    for (const rs of workload.replicaSets) {
      for (const pod of rs.pods) {
        allPods.push(attachPodMetrics(pod, podMetrics, namespace));
      }
    }
  }

  // Aggregate metrics for workload
  const aggregatedMetrics = podMetrics ? aggregateWorkloadMetrics(allPods) : undefined;

  return {
    ...workload,
    pods: workload.pods?.map((pod) => attachPodMetrics(pod, podMetrics, namespace)),
    replicaSets: workload.replicaSets?.map((rs) => ({
      ...rs,
      pods: rs.pods.map((pod) => attachPodMetrics(pod, podMetrics, namespace)),
    })),
    aggregatedMetrics,
  };
}

function attachPodMetrics(
  pod: PodNode,
  podMetrics: Map<string, PodMetrics> | null,
  namespace: string
): PodNode {
  if (!podMetrics) return pod;

  const key = `${namespace}/${pod.name}`;
  const metrics = podMetrics.get(key);

  // Merge usage from metrics-server with request/limit from pod spec
  return {
    ...pod,
    metrics: {
      resources: {
        cpuUsage: metrics?.resources.cpuUsage || 0,
        cpuRequest: pod.metrics?.resources.cpuRequest,
        cpuLimit: pod.metrics?.resources.cpuLimit,
        memUsage: metrics?.resources.memUsage || 0,
        memRequest: pod.metrics?.resources.memRequest,
        memLimit: pod.metrics?.resources.memLimit,
      },
    },
  };
}
