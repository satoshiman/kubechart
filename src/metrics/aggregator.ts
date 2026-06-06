import type { PodNode } from '../tree/types.js';
import type { AggregatedMetrics, ClusterMetrics } from './types.js';

// Sum CPU và MEM từ tất cả pods con của một workload
export function aggregateWorkloadMetrics(pods: PodNode[]): AggregatedMetrics | undefined {
  // Chỉ aggregate pods đang Running (phase === 'Running')
  const runningPods = pods.filter((pod) => pod.phase === 'Running');

  // Nếu không có pod nào Running → return undefined (hiển thị "—")
  if (runningPods.length === 0) {
    return undefined;
  }

  let cpuUsage = 0;
  let cpuRequest = 0;
  let cpuLimit = 0;
  let memUsage = 0;
  let memRequest = 0;
  let memLimit = 0;

  for (const pod of runningPods) {
    if (pod.metrics?.resources) {
      const metrics = pod.metrics.resources;
      cpuUsage += metrics.cpuUsage;
      memUsage += metrics.memUsage;

      if (metrics.cpuRequest !== undefined) {
        cpuRequest += metrics.cpuRequest;
      }
      if (metrics.cpuLimit !== undefined) {
        cpuLimit += metrics.cpuLimit;
      }
      if (metrics.memRequest !== undefined) {
        memRequest += metrics.memRequest;
      }
      if (metrics.memLimit !== undefined) {
        memLimit += metrics.memLimit;
      }
    }
  }

  return {
    cpuUsage,
    cpuRequest: cpuRequest > 0 ? cpuRequest : undefined,
    cpuLimit: cpuLimit > 0 ? cpuLimit : undefined,
    memUsage,
    memRequest: memRequest > 0 ? memRequest : undefined,
    memLimit: memLimit > 0 ? memLimit : undefined,
    podCount: runningPods.length,
  };
}

export interface NodeCapacity {
  name: string;
  cpuCapacity: number; // millicores
  memCapacity: number; // bytes
}

export interface RawNodeMetrics {
  name: string;
  usage: {
    cpu: string; // e.g., "450m"
    memory: string; // e.g., "1.2Gi"
  };
}

// Sum usage và capacity của tất cả nodes
export function aggregateClusterMetrics(
  nodeMetrics: RawNodeMetrics[],
  nodeCapacity: NodeCapacity[]
): ClusterMetrics {
  let cpuUsage = 0;
  let cpuCapacity = 0;
  let memUsage = 0;
  let memCapacity = 0;

  // Parse and sum node metrics
  for (const node of nodeMetrics) {
    cpuUsage += parseCpuQuantity(node.usage.cpu);
    memUsage += parseMemQuantity(node.usage.memory);
  }

  // Sum node capacity
  for (const node of nodeCapacity) {
    cpuCapacity += node.cpuCapacity;
    memCapacity += node.memCapacity;
  }

  return {
    cpuUsage,
    cpuCapacity,
    memUsage,
    memCapacity,
  };
}

// Parse K8s quantity strings → numbers
// "12m" → 12 (millicores)
// "344291910n" → 344.29191 (millicores, from nanocores)
// "1.2" → 1200 (millicores, from cores)
function parseCpuQuantity(str: string): number {
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

// "45Mi" → 47185920 (bytes)
// "1.2Gi" → 1288490188 (bytes)
function parseMemQuantity(str: string): number {
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
