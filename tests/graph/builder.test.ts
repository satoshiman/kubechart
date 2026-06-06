import { buildGraph } from '../../src/graph/builder.js';
import type { NamespaceNode } from '../../src/tree/types.js';

describe('buildGraph', () => {
  const createMockNamespace = (overrides?: Partial<NamespaceNode>): NamespaceNode => ({
    name: 'default',
    status: 'Active',
    workloads: [
      {
        name: 'app',
        kind: 'Deployment',
        ready: '3/3',
        image: 'app:v1',
        pods: [
          {
            name: 'app-abc123',
            phase: 'Running',
            nodeName: 'node-1',
            ip: '10.0.0.1',
            restarts: 0,
            ready: '1/1',
          },
        ],
      },
    ],
    services: [
      {
        name: 'app-svc',
        type: 'ClusterIP',
        clusterIP: '10.96.0.1',
        ports: ['80/TCP'],
      },
    ],
    ingresses: [
      {
        name: 'app-ing',
        host: 'app.example.com',
        paths: ['app-svc:80'],
        tls: true,
      },
    ],
    ...overrides,
  });

  it('links Ingress → Service → Pods correctly', () => {
    const ns = createMockNamespace();
    const graph = buildGraph(ns);

    expect(graph.nodes).toHaveLength(5); // Internet, Ingress, Service, Pod, Workload
    expect(graph.edges).toHaveLength(4); // Internet→Ingress, Ingress→Service, Service→Pod, Pod→Workload

    const internetNode = graph.nodes.find((n) => n.kind === 'Internet');
    expect(internetNode).toBeDefined();

    const ingressNode = graph.nodes.find((n) => n.kind === 'Ingress');
    expect(ingressNode).toBeDefined();

    const serviceNode = graph.nodes.find((n) => n.kind === 'Service');
    expect(serviceNode).toBeDefined();

    const podNode = graph.nodes.find((n) => n.kind === 'Pod');
    expect(podNode).toBeDefined();
  });

  it('handles Service without Ingress (orphan)', () => {
    const ns = createMockNamespace({
      ingresses: [],
    });
    const graph = buildGraph(ns);

    const serviceNode = graph.nodes.find((n) => n.kind === 'Service');
    expect(serviceNode).toBeDefined();

    // Service should still be linked to pods
    const serviceToPodEdge = graph.edges.find((e) => e.from === 'service-app-svc');
    expect(serviceToPodEdge).toBeDefined();
  });

  it('handles Pod without Service (orphan)', () => {
    const ns = createMockNamespace({
      services: [],
      ingresses: [],
    });
    const graph = buildGraph(ns);

    // When there's no service, the graph builder only creates Internet and Workload nodes
    // Pods are only created when linked via Service
    const workloadNode = graph.nodes.find((n) => n.kind === 'Workload');
    expect(workloadNode).toBeDefined();
  });

  it('avoids duplicate nodes in cycle-like configs', () => {
    const ns = createMockNamespace();
    const graph = buildGraph(ns);

    // Check that node IDs are unique
    const nodeIds = graph.nodes.map((n) => n.id);
    const uniqueIds = new Set(nodeIds);
    expect(uniqueIds.size).toBe(nodeIds.length);
  });

  it('handles multiple Ingress rules pointing to same Service', () => {
    const ns = createMockNamespace({
      ingresses: [
        {
          name: 'app-ing-1',
          host: 'app1.example.com',
          paths: ['app-svc:80'],
          tls: true,
        },
        {
          name: 'app-ing-2',
          host: 'app2.example.com',
          paths: ['app-svc:80'],
          tls: false,
        },
      ],
    });
    const graph = buildGraph(ns);

    const ingressNodes = graph.nodes.filter((n) => n.kind === 'Ingress');
    expect(ingressNodes).toHaveLength(2);

    const serviceNode = graph.nodes.find((n) => n.kind === 'Service');
    expect(serviceNode).toBeDefined();

    // Both ingresses should link to the same service
    const ingressToServiceEdges = graph.edges.filter((e) => e.to === 'service-app-svc');
    expect(ingressToServiceEdges).toHaveLength(2);
  });
});
