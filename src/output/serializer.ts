import type { ClusterTree } from '../tree/types.js';

export interface ClusterSnapshot {
  cluster: {
    contextName: string;
    serverVersion: string;
    nodeCount: number;
    fetchedAt: string;
  };
  namespaces: Array<{
    name: string;
    status: string;
    workloads: Array<{
      name: string;
      kind: string;
      ready: string;
      image: string;
      pods: Array<{
        name: string;
        phase: string;
        nodeName: string;
        ip: string;
        restarts: number;
        reason?: string;
        ready: string;
      }>;
    }>;
    services: Array<{
      name: string;
      type: string;
      clusterIP: string;
      ports: string[];
    }>;
    ingresses: Array<{
      name: string;
      host: string;
      paths: string[];
      tls: boolean;
    }>;
  }>;
}

export function serializeCluster(tree: ClusterTree): ClusterSnapshot {
  return {
    cluster: {
      contextName: tree.contextName,
      serverVersion: tree.serverVersion,
      nodeCount: tree.nodeCount,
      fetchedAt: tree.fetchedAt.toISOString(),
    },
    namespaces: tree.namespaces.map((ns) => ({
      name: ns.name,
      status: ns.status,
      workloads: ns.workloads.map((wl) => ({
        name: wl.name,
        kind: wl.kind,
        ready: wl.ready,
        image: wl.image,
        pods: (wl.pods || []).map((pod) => ({
          name: pod.name,
          phase: pod.phase,
          nodeName: pod.nodeName,
          ip: pod.ip,
          restarts: pod.restarts,
          reason: pod.reason,
          ready: pod.ready,
        })),
      })),
      services: ns.services.map((svc) => ({
        name: svc.name,
        type: svc.type,
        clusterIP: svc.clusterIP,
        ports: svc.ports,
      })),
      ingresses: ns.ingresses.map((ing) => ({
        name: ing.name,
        host: ing.host,
        paths: ing.paths,
        tls: ing.tls,
      })),
      orphanPods: ns.orphanPods?.map((pod) => ({
        name: pod.name,
        phase: pod.phase,
        nodeName: pod.nodeName,
        ip: pod.ip,
        restarts: pod.restarts,
        reason: pod.reason,
        ready: pod.ready,
      })),
    })),
  };
}
