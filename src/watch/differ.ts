import type { ClusterTree, WorkloadNode, PodNode } from '../tree/types.js';

// Generate unique key for a pod: namespace/workload/pod
function podKey(ns: string, workload: string, pod: string): string {
  return `${ns}/${workload}/${pod}`;
}

// Generate unique key for a workload: namespace/workload
function workloadKey(ns: string, workload: string): string {
  return `${ns}/${workload}`;
}

export interface DiffResult {
  added: string[]; // pod/workload keys that appeared
  removed: string[]; // pod/workload keys that disappeared
  changed: string[]; // pod/workload keys that changed status
}

export function diffTrees(prev: ClusterTree, next: ClusterTree): DiffResult {
  const result: DiffResult = {
    added: [],
    removed: [],
    changed: [],
  };

  const prevPods = new Set<string>();
  const nextPods = new Set<string>();
  const prevWorkloads = new Set<string>();
  const nextWorkloads = new Set<string>();

  // Collect all pods and workloads from previous tree
  for (const ns of prev.namespaces) {
    for (const wl of ns.workloads) {
      const wlKey = workloadKey(ns.name, wl.name);
      prevWorkloads.add(wlKey);

      for (const pod of wl.pods || []) {
        const key = podKey(ns.name, wl.name, pod.name);
        prevPods.add(key);
      }
    }
  }

  // Collect all pods and workloads from next tree
  for (const ns of next.namespaces) {
    for (const wl of ns.workloads) {
      const wlKey = workloadKey(ns.name, wl.name);
      nextWorkloads.add(wlKey);

      for (const pod of wl.pods || []) {
        const key = podKey(ns.name, wl.name, pod.name);
        nextPods.add(key);
      }
    }
  }

  // Detect added pods
  for (const pod of nextPods) {
    if (!prevPods.has(pod)) {
      result.added.push(pod);
    }
  }

  // Detect removed pods
  for (const pod of prevPods) {
    if (!nextPods.has(pod)) {
      result.removed.push(pod);
    }
  }

  // Detect added workloads
  for (const wl of nextWorkloads) {
    if (!prevWorkloads.has(wl)) {
      result.added.push(wl);
    }
  }

  // Detect removed workloads
  for (const wl of prevWorkloads) {
    if (!nextWorkloads.has(wl)) {
      result.removed.push(wl);
    }
  }

  // Detect changed pods (phase change)
  const prevPodMap = new Map<string, PodNode>();
  const nextPodMap = new Map<string, PodNode>();

  for (const ns of prev.namespaces) {
    for (const wl of ns.workloads) {
      for (const pod of wl.pods || []) {
        const key = podKey(ns.name, wl.name, pod.name);
        prevPodMap.set(key, pod);
      }
    }
  }

  for (const ns of next.namespaces) {
    for (const wl of ns.workloads) {
      for (const pod of wl.pods || []) {
        const key = podKey(ns.name, wl.name, pod.name);
        nextPodMap.set(key, pod);
      }
    }
  }

  for (const [key, nextPod] of nextPodMap) {
    const prevPod = prevPodMap.get(key);
    if (prevPod && prevPod.phase !== nextPod.phase) {
      result.changed.push(key);
    }
  }

  // Detect changed workloads (ready count change)
  const prevWlMap = new Map<string, WorkloadNode>();
  const nextWlMap = new Map<string, WorkloadNode>();

  for (const ns of prev.namespaces) {
    for (const wl of ns.workloads) {
      const key = workloadKey(ns.name, wl.name);
      prevWlMap.set(key, wl);
    }
  }

  for (const ns of next.namespaces) {
    for (const wl of ns.workloads) {
      const key = workloadKey(ns.name, wl.name);
      nextWlMap.set(key, wl);
    }
  }

  for (const [key, nextWl] of nextWlMap) {
    const prevWl = prevWlMap.get(key);
    if (prevWl && prevWl.ready !== nextWl.ready) {
      result.changed.push(key);
    }
  }

  return result;
}
