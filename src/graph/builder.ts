import type { NamespaceNode, PodPhase } from '../tree/types.js';

export interface GraphNode {
  id: string;
  kind: 'Internet' | 'Ingress' | 'Service' | 'Workload' | 'ReplicaSet' | 'Pod';
  label: string;
  meta: string[]; // additional lines to display in box
  status?: PodPhase;
}

export interface GraphEdge {
  from: string; // GraphNode.id
  to: string; // GraphNode.id
  label?: string; // e.g. "→ api-svc:80"
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function buildGraph(ns: NamespaceNode): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  // Helper to add node if not exists
  const addNode = (node: GraphNode) => {
    if (!nodeIds.has(node.id)) {
      nodes.push(node);
      nodeIds.add(node.id);
    }
  };

  // Helper to add edge
  const addEdge = (edge: GraphEdge) => {
    edges.push(edge);
  };

  // Start with Internet node
  addNode({
    id: 'internet',
    kind: 'Internet',
    label: 'Internet',
    meta: [],
  });

  // Process Ingresses
  for (const ingress of ns.ingresses) {
    const ingressId = `ingress-${ingress.name}`;
    addNode({
      id: ingressId,
      kind: 'Ingress',
      label: `Ingress`,
      meta: [ingress.host, ingress.tls ? 'TLS: ✓' : 'TLS: ✗'],
    });

    // Edge from Internet to Ingress
    addEdge({
      from: 'internet',
      to: ingressId,
      label: ingress.host,
    });

    // Find target service from ingress paths
    for (const path of ingress.paths) {
      // Extract service name from path (simplified - assumes format like /path -> service:port)
      const serviceName = path.split(':')[0] || path;
      const targetService = ns.services.find((s) => s.name === serviceName);

      if (targetService) {
        const serviceId = `service-${targetService.name}`;
        addNode({
          id: serviceId,
          kind: 'Service',
          label: `Service: ${targetService.name}`,
          meta: [
            `${targetService.type} ${targetService.clusterIP}`,
            `port: ${targetService.ports.join(', ')}`,
          ],
        });

        addEdge({
          from: ingressId,
          to: serviceId,
          label: `→ ${targetService.name}:${targetService.ports[0] || '80'}`,
        });
      }
    }
  }

  // Process Services (including those not linked to Ingress)
  for (const service of ns.services) {
    const serviceId = `service-${service.name}`;
    if (!nodeIds.has(serviceId)) {
      addNode({
        id: serviceId,
        kind: 'Service',
        label: `Service: ${service.name}`,
        meta: [`${service.type} ${service.clusterIP}`, `port: ${service.ports.join(', ')}`],
      });
    }

    // Find pods that match this service's selector
    // For simplicity, we'll link all pods in the namespace to all services
    // In a real implementation, this would use label selectors
    for (const workload of ns.workloads) {
      // For Deployments with ReplicaSets, link to ReplicaSets
      if (workload.kind === 'Deployment' && workload.replicaSets) {
        for (const rs of workload.replicaSets) {
          const rsId = `replicaset-${rs.name}`;
          addNode({
            id: rsId,
            kind: 'ReplicaSet',
            label: `ReplicaSet: ${rs.name}`,
            meta: [`ready: ${rs.ready}`],
          });

          addEdge({
            from: serviceId,
            to: rsId,
            label: `load balances to`,
          });
        }
      } else {
        // For other workloads, link directly to pods
        for (const pod of workload.pods || []) {
          const podId = `pod-${pod.name}`;
          addNode({
            id: podId,
            kind: 'Pod',
            label: pod.name,
            meta: [
              `${getPodStatusSymbol(pod.phase, pod.ready)} ${pod.phase}`,
              `node: ${pod.nodeName}`,
              pod.restarts > 0 ? `restarts: ${pod.restarts}` : '',
            ].filter(Boolean),
            status: pod.phase,
          });

          addEdge({
            from: serviceId,
            to: podId,
            label: `load balances to`,
          });
        }
      }
    }
  }

  // Process workloads (as grouping for pods/replicasets)
  for (const workload of ns.workloads) {
    const workloadId = `workload-${workload.name}`;
    addNode({
      id: workloadId,
      kind: 'Workload',
      label: `${workload.kind}: ${workload.name}`,
      meta: [`ready: ${workload.ready}`, `image: ${workload.image}`],
    });

    // For Deployments with ReplicaSets, link ReplicaSet → Pod and Deployment → ReplicaSet
    if (workload.kind === 'Deployment' && workload.replicaSets) {
      for (const rs of workload.replicaSets) {
        const rsId = `replicaset-${rs.name}`;

        // Link ReplicaSet to Deployment
        addEdge({
          from: rsId,
          to: workloadId,
        });

        // Link Pods to ReplicaSet
        for (const pod of rs.pods) {
          const podId = `pod-${pod.name}`;
          addEdge({
            from: podId,
            to: rsId,
          });
        }
      }
    } else {
      // For other workloads, link pods directly to workload
      for (const pod of workload.pods || []) {
        const podId = `pod-${pod.name}`;
        addEdge({
          from: podId,
          to: workloadId,
        });
      }
    }
  }

  return { nodes, edges };
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
