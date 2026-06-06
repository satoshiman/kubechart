import { serializeCluster } from '../../src/output/serializer.js';
import type { ClusterTree } from '../../src/tree/types.js';

describe('serializeCluster', () => {
  const createMockTree = (overrides?: Partial<ClusterTree>): ClusterTree => ({
    contextName: 'test-cluster',
    serverVersion: 'v1.29.2',
    nodeCount: 3,
    namespaces: [
      {
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
      },
    ],
    fetchedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  });

  it('serializes cluster metadata', () => {
    const tree = createMockTree();
    const snapshot = serializeCluster(tree);

    expect(snapshot.cluster.contextName).toBe('test-cluster');
    expect(snapshot.cluster.serverVersion).toBe('v1.29.2');
    expect(snapshot.cluster.nodeCount).toBe(3);
    expect(snapshot.cluster.fetchedAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('serializes namespaces', () => {
    const tree = createMockTree();
    const snapshot = serializeCluster(tree);

    expect(snapshot.namespaces).toHaveLength(1);
    expect(snapshot.namespaces[0].name).toBe('default');
    expect(snapshot.namespaces[0].status).toBe('Active');
  });

  it('serializes workloads and pods', () => {
    const tree = createMockTree();
    const snapshot = serializeCluster(tree);

    const ns = snapshot.namespaces[0];
    expect(ns.workloads).toHaveLength(1);
    expect(ns.workloads[0].name).toBe('app');
    expect(ns.workloads[0].kind).toBe('Deployment');
    expect(ns.workloads[0].ready).toBe('3/3');
    expect(ns.workloads[0].image).toBe('app:v1');
    expect(ns.workloads[0].pods).toHaveLength(1);
    expect(ns.workloads[0].pods[0].name).toBe('app-abc123');
    expect(ns.workloads[0].pods[0].phase).toBe('Running');
  });

  it('serializes services', () => {
    const tree = createMockTree();
    const snapshot = serializeCluster(tree);

    const ns = snapshot.namespaces[0];
    expect(ns.services).toHaveLength(1);
    expect(ns.services[0].name).toBe('app-svc');
    expect(ns.services[0].type).toBe('ClusterIP');
    expect(ns.services[0].clusterIP).toBe('10.96.0.1');
    expect(ns.services[0].ports).toEqual(['80/TCP']);
  });

  it('serializes ingresses', () => {
    const tree = createMockTree();
    const snapshot = serializeCluster(tree);

    const ns = snapshot.namespaces[0];
    expect(ns.ingresses).toHaveLength(1);
    expect(ns.ingresses[0].name).toBe('app-ing');
    expect(ns.ingresses[0].host).toBe('app.example.com');
    expect(ns.ingresses[0].paths).toEqual(['app-svc:80']);
    expect(ns.ingresses[0].tls).toBe(true);
  });

  it('handles empty cluster', () => {
    const tree = createMockTree({
      namespaces: [],
    });
    const snapshot = serializeCluster(tree);

    expect(snapshot.namespaces).toHaveLength(0);
  });

  it('handles pod with reason field', () => {
    const tree = createMockTree({
      namespaces: [
        {
          name: 'default',
          status: 'Active',
          workloads: [
            {
              name: 'app',
              kind: 'Deployment',
              ready: '0/1',
              image: 'app:v1',
              pods: [
                {
                  name: 'app-abc123',
                  phase: 'Failed',
                  nodeName: 'node-1',
                  ip: '10.0.0.1',
                  restarts: 5,
                  reason: 'CrashLoopBackOff',
                  ready: '0/1',
                },
              ],
            },
          ],
          services: [],
          ingresses: [],
        },
      ],
    });
    const snapshot = serializeCluster(tree);

    const pod = snapshot.namespaces[0].workloads[0].pods[0];
    expect(pod.reason).toBe('CrashLoopBackOff');
    expect(pod.restarts).toBe(5);
  });
});
