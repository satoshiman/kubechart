import { buildTree } from '../../src/tree/builder.js';
import type { RawClusterData } from '../../src/k8s/types.js';

// Helper to create partial K8s objects with type assertions
const asV1Namespace = (obj: unknown) => obj as import('@kubernetes/client-node').V1Namespace;
const asV1Deployment = (obj: unknown) => obj as import('@kubernetes/client-node').V1Deployment;
const asV1ReplicaSet = (obj: unknown) => obj as import('@kubernetes/client-node').V1ReplicaSet;
const asV1StatefulSet = (obj: unknown) => obj as import('@kubernetes/client-node').V1StatefulSet;
const asV1DaemonSet = (obj: unknown) => obj as import('@kubernetes/client-node').V1DaemonSet;
const asV1Job = (obj: unknown) => obj as import('@kubernetes/client-node').V1Job;
const asV1CronJob = (obj: unknown) => obj as import('@kubernetes/client-node').V1CronJob;
const asV1Pod = (obj: unknown) => obj as import('@kubernetes/client-node').V1Pod;
const asV1Service = (obj: unknown) => obj as import('@kubernetes/client-node').V1Service;
const asV1Ingress = (obj: unknown) => obj as import('@kubernetes/client-node').V1Ingress;

describe('buildTree', () => {
  it('should build a cluster tree from raw data', () => {
    const rawData: RawClusterData = {
      namespaces: [
        asV1Namespace({
          metadata: { name: 'default' },
          status: { phase: 'Active' },
        }),
      ],
      deployments: [],
      replicaSets: [],
      statefulSets: [],
      daemonSets: [],
      jobs: [],
      cronJobs: [],
      pods: [],
      services: [],
      ingresses: [],
      configMaps: [],
      secrets: [],
      serverVersion: 'v1.29.0',
      nodeCount: 3,
    };

    const tree = buildTree(rawData, 'test-context');

    expect(tree.contextName).toBe('test-context');
    expect(tree.serverVersion).toBe('v1.29.0');
    expect(tree.nodeCount).toBe(3);
    expect(tree.namespaces).toHaveLength(1);
    expect(tree.namespaces[0].name).toBe('default');
    expect(tree.namespaces[0].status).toBe('Active');
  });

  it('should group pods by ownerReference for deployments', () => {
    const rawData: RawClusterData = {
      namespaces: [
        asV1Namespace({
          metadata: { name: 'default' },
          status: { phase: 'Active' },
        }),
      ],
      deployments: [
        asV1Deployment({
          metadata: { name: 'api-server', namespace: 'default' },
          spec: {
            replicas: 2,
            template: {
              spec: {
                containers: [{ name: 'nginx', image: 'nginx:latest' }],
              },
            },
          },
          status: { readyReplicas: 2 },
        }),
      ],
      replicaSets: [
        asV1ReplicaSet({
          metadata: {
            name: 'api-server-7d9f',
            namespace: 'default',
            ownerReferences: [
              { apiVersion: 'apps/v1', kind: 'Deployment', name: 'api-server', uid: '456' },
            ],
          },
          spec: { replicas: 2 },
          status: { readyReplicas: 2 },
        }),
      ],
      statefulSets: [],
      daemonSets: [],
      jobs: [],
      cronJobs: [],
      pods: [
        asV1Pod({
          metadata: {
            name: 'api-server-7d9f-xk2p',
            namespace: 'default',
            ownerReferences: [
              { apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'api-server-7d9f', uid: '123' },
            ],
          },
          status: {
            phase: 'Running',
            podIP: '10.0.0.1',
            containerStatuses: [
              { name: 'nginx', image: 'nginx', imageID: 'id', ready: true, restartCount: 0 },
            ],
          },
          spec: { nodeName: 'node-01', containers: [] },
        }),
      ],
      services: [],
      ingresses: [],
      configMaps: [],
      secrets: [],
      serverVersion: 'v1.29.0',
      nodeCount: 3,
    };

    const tree = buildTree(rawData, 'test-context');

    expect(tree.namespaces[0].workloads).toHaveLength(1);
    expect(tree.namespaces[0].workloads[0].name).toBe('api-server');
    expect(tree.namespaces[0].workloads[0].kind).toBe('Deployment');
    expect(tree.namespaces[0].workloads[0].replicaSets || []).toHaveLength(1);
    expect(tree.namespaces[0].workloads[0].replicaSets?.[0].name).toBe('api-server-7d9f');
    expect(tree.namespaces[0].workloads[0].replicaSets?.[0].pods || []).toHaveLength(1);
    expect(tree.namespaces[0].workloads[0].replicaSets?.[0].pods?.[0].name).toBe(
      'api-server-7d9f-xk2p'
    );
  });

  it('should handle StatefulSet pods correctly', () => {
    const rawData: RawClusterData = {
      namespaces: [
        asV1Namespace({
          metadata: { name: 'default' },
          status: { phase: 'Active' },
        }),
      ],
      deployments: [],
      replicaSets: [],
      statefulSets: [
        asV1StatefulSet({
          metadata: { name: 'postgres', namespace: 'default' },
          spec: {
            replicas: 1,
            template: {
              spec: {
                containers: [{ name: 'postgres', image: 'postgres:14' }],
              },
            },
          },
          status: { replicas: 1, readyReplicas: 1 },
        }),
      ],
      daemonSets: [],
      jobs: [],
      cronJobs: [],
      pods: [
        asV1Pod({
          metadata: {
            name: 'postgres-0',
            namespace: 'default',
            ownerReferences: [
              { apiVersion: 'apps/v1', kind: 'StatefulSet', name: 'postgres', uid: '123' },
            ],
          },
          status: {
            phase: 'Running',
            podIP: '10.0.0.2',
            containerStatuses: [
              { name: 'postgres', image: 'postgres', imageID: 'id', ready: true, restartCount: 0 },
            ],
          },
          spec: { nodeName: 'node-02', containers: [] },
        }),
      ],
      services: [],
      ingresses: [],
      configMaps: [],
      secrets: [],
      serverVersion: 'v1.29.0',
      nodeCount: 3,
    };

    const tree = buildTree(rawData, 'test-context');

    expect(tree.namespaces[0].workloads).toHaveLength(1);
    expect(tree.namespaces[0].workloads[0].name).toBe('postgres');
    expect(tree.namespaces[0].workloads[0].kind).toBe('StatefulSet');
  });

  it('should handle DaemonSet pods correctly', () => {
    const rawData: RawClusterData = {
      namespaces: [
        asV1Namespace({
          metadata: { name: 'kube-system' },
          status: { phase: 'Active' },
        }),
      ],
      deployments: [],
      replicaSets: [],
      statefulSets: [],
      daemonSets: [
        asV1DaemonSet({
          metadata: { name: 'fluentd', namespace: 'kube-system' },
          spec: {
            template: {
              spec: {
                containers: [{ name: 'fluentd', image: 'fluentd:latest' }],
              },
            },
          },
          status: {
            currentNumberScheduled: 3,
            desiredNumberScheduled: 3,
            numberReady: 3,
            numberMisscheduled: 0,
          },
        }),
      ],
      jobs: [],
      cronJobs: [],
      pods: [
        asV1Pod({
          metadata: {
            name: 'fluentd-abc',
            namespace: 'kube-system',
            ownerReferences: [
              { apiVersion: 'apps/v1', kind: 'DaemonSet', name: 'fluentd', uid: '123' },
            ],
          },
          status: {
            phase: 'Running',
            podIP: '10.0.0.3',
            containerStatuses: [
              { name: 'fluentd', image: 'fluentd', imageID: 'id', ready: true, restartCount: 0 },
            ],
          },
          spec: { nodeName: 'node-01', containers: [] },
        }),
      ],
      services: [],
      ingresses: [],
      configMaps: [],
      secrets: [],
      serverVersion: 'v1.29.0',
      nodeCount: 3,
    };

    const tree = buildTree(rawData, 'test-context');

    expect(tree.namespaces[0].workloads).toHaveLength(1);
    expect(tree.namespaces[0].workloads[0].name).toBe('fluentd');
    expect(tree.namespaces[0].workloads[0].kind).toBe('DaemonSet');
  });

  it('should handle Job pods correctly', () => {
    const rawData: RawClusterData = {
      namespaces: [
        asV1Namespace({
          metadata: { name: 'default' },
          status: { phase: 'Active' },
        }),
      ],
      deployments: [],
      replicaSets: [],
      statefulSets: [],
      daemonSets: [],
      jobs: [
        asV1Job({
          metadata: { name: 'batch-job', namespace: 'default' },
          spec: {
            template: {
              spec: {
                containers: [{ name: 'busybox', image: 'busybox:latest' }],
              },
            },
          },
          status: {
            active: 0,
            succeeded: 1,
            failed: 0,
          },
        }),
      ],
      cronJobs: [],
      pods: [
        asV1Pod({
          metadata: {
            name: 'batch-job-abc',
            namespace: 'default',
            ownerReferences: [
              { apiVersion: 'batch/v1', kind: 'Job', name: 'batch-job', uid: '123' },
            ],
          },
          status: {
            phase: 'Succeeded',
            podIP: '10.0.0.4',
            containerStatuses: [
              { name: 'busybox', image: 'busybox', imageID: 'id', ready: true, restartCount: 0 },
            ],
          },
          spec: { nodeName: 'node-01', containers: [] },
        }),
      ],
      services: [],
      ingresses: [],
      configMaps: [],
      secrets: [],
      serverVersion: 'v1.29.0',
      nodeCount: 3,
    };

    const tree = buildTree(rawData, 'test-context');

    expect(tree.namespaces[0].workloads).toHaveLength(1);
    expect(tree.namespaces[0].workloads[0].name).toBe('batch-job');
    expect(tree.namespaces[0].workloads[0].kind).toBe('Job');
  });

  it('should handle CronJob pods correctly', () => {
    const rawData: RawClusterData = {
      namespaces: [
        asV1Namespace({
          metadata: { name: 'default' },
          status: { phase: 'Active' },
        }),
      ],
      deployments: [],
      replicaSets: [],
      statefulSets: [],
      daemonSets: [],
      jobs: [],
      cronJobs: [
        asV1CronJob({
          metadata: { name: 'daily-backup', namespace: 'default' },
          spec: {
            jobTemplate: {
              spec: {
                template: {
                  spec: {
                    containers: [{ name: 'backup', image: 'backup:latest' }],
                  },
                },
              },
            },
          },
          status: {
            active: [{ name: 'daily-backup-12345', uid: '123' }],
          },
        }),
      ],
      pods: [
        asV1Pod({
          metadata: {
            name: 'daily-backup-12345-abc',
            namespace: 'default',
            ownerReferences: [
              { apiVersion: 'batch/v1', kind: 'Job', name: 'daily-backup-12345', uid: '123' },
            ],
          },
          status: {
            phase: 'Succeeded',
            podIP: '10.0.0.5',
            containerStatuses: [
              { name: 'backup', image: 'backup', imageID: 'id', ready: true, restartCount: 0 },
            ],
          },
          spec: { nodeName: 'node-01', containers: [] },
        }),
      ],
      services: [],
      ingresses: [],
      configMaps: [],
      secrets: [],
      serverVersion: 'v1.29.0',
      nodeCount: 3,
    };

    const tree = buildTree(rawData, 'test-context');

    expect(tree.namespaces[0].workloads).toHaveLength(1);
    expect(tree.namespaces[0].workloads[0].name).toBe('daily-backup');
    expect(tree.namespaces[0].workloads[0].kind).toBe('CronJob');
  });

  it('should build service nodes correctly', () => {
    const rawData: RawClusterData = {
      namespaces: [
        asV1Namespace({
          metadata: { name: 'default' },
          status: { phase: 'Active' },
        }),
      ],
      deployments: [],
      replicaSets: [],
      statefulSets: [],
      daemonSets: [],
      jobs: [],
      cronJobs: [],
      pods: [],
      services: [
        asV1Service({
          metadata: { name: 'api-svc', namespace: 'default' },
          spec: {
            type: 'ClusterIP',
            clusterIP: '10.96.0.50',
            ports: [{ port: 80, protocol: 'TCP' }],
          },
        }),
      ],
      ingresses: [],
      configMaps: [],
      secrets: [],
      serverVersion: 'v1.29.0',
      nodeCount: 3,
    };

    const tree = buildTree(rawData, 'test-context');

    expect(tree.namespaces[0].services).toHaveLength(1);
    expect(tree.namespaces[0].services[0].name).toBe('api-svc');
    expect(tree.namespaces[0].services[0].type).toBe('ClusterIP');
    expect(tree.namespaces[0].services[0].clusterIP).toBe('10.96.0.50');
    expect(tree.namespaces[0].services[0].ports).toEqual(['80/TCP']);
  });

  it('should build ingress nodes correctly', () => {
    const rawData: RawClusterData = {
      namespaces: [
        asV1Namespace({
          metadata: { name: 'default' },
          status: { phase: 'Active' },
        }),
      ],
      deployments: [],
      replicaSets: [],
      statefulSets: [],
      daemonSets: [],
      jobs: [],
      cronJobs: [],
      pods: [],
      services: [],
      ingresses: [
        asV1Ingress({
          metadata: { name: 'api-ingress', namespace: 'default' },
          spec: {
            tls: [{ hosts: ['api.example.com'] }],
            rules: [
              {
                host: 'api.example.com',
                http: {
                  paths: [
                    {
                      path: '/',
                      pathType: 'Prefix',
                      backend: { service: { name: 'svc', port: { number: 80 } } },
                    },
                  ],
                },
              },
            ],
          },
        }),
      ],
      configMaps: [],
      secrets: [],
      serverVersion: 'v1.29.0',
      nodeCount: 3,
    };

    const tree = buildTree(rawData, 'test-context');

    expect(tree.namespaces[0].ingresses).toHaveLength(1);
    expect(tree.namespaces[0].ingresses[0].name).toBe('api-ingress');
    expect(tree.namespaces[0].ingresses[0].host).toBe('api.example.com');
    expect(tree.namespaces[0].ingresses[0].tls).toBe(true);
    expect(tree.namespaces[0].ingresses[0].paths).toEqual(['/']);
  });

  it('should filter namespaces by --show-errors flag', () => {
    const rawData: RawClusterData = {
      namespaces: [
        asV1Namespace({
          metadata: { name: 'healthy' },
          status: { phase: 'Active' },
        }),
        asV1Namespace({
          metadata: { name: 'unhealthy' },
          status: { phase: 'Active' },
        }),
      ],
      deployments: [
        asV1Deployment({
          metadata: { name: 'healthy-dep', namespace: 'healthy' },
          spec: {
            replicas: 1,
            template: {
              spec: {
                containers: [{ name: 'nginx', image: 'nginx' }],
              },
            },
          },
          status: { readyReplicas: 1 },
        }),
        asV1Deployment({
          metadata: { name: 'unhealthy-dep', namespace: 'unhealthy' },
          spec: {
            replicas: 1,
            template: {
              spec: {
                containers: [{ name: 'nginx', image: 'nginx' }],
              },
            },
          },
          status: { readyReplicas: 0 },
        }),
      ],
      replicaSets: [
        asV1ReplicaSet({
          metadata: {
            name: 'healthy-dep-abc',
            namespace: 'healthy',
            ownerReferences: [
              { apiVersion: 'apps/v1', kind: 'Deployment', name: 'healthy-dep', uid: '123' },
            ],
          },
          spec: { replicas: 1 },
          status: { readyReplicas: 1 },
        }),
        asV1ReplicaSet({
          metadata: {
            name: 'unhealthy-dep-xyz',
            namespace: 'unhealthy',
            ownerReferences: [
              { apiVersion: 'apps/v1', kind: 'Deployment', name: 'unhealthy-dep', uid: '456' },
            ],
          },
          spec: { replicas: 1 },
          status: { readyReplicas: 0 },
        }),
      ],
      statefulSets: [],
      daemonSets: [],
      jobs: [],
      cronJobs: [],
      pods: [
        asV1Pod({
          metadata: {
            name: 'healthy-pod',
            namespace: 'healthy',
            ownerReferences: [
              { apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'healthy-dep-abc', uid: '123' },
            ],
          },
          status: {
            phase: 'Running',
            podIP: '10.0.0.1',
            containerStatuses: [
              { name: 'nginx', image: 'nginx', imageID: 'id', ready: true, restartCount: 0 },
            ],
          },
          spec: { nodeName: 'node-01', containers: [] },
        }),
        asV1Pod({
          metadata: {
            name: 'unhealthy-pod',
            namespace: 'unhealthy',
            ownerReferences: [
              { apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'unhealthy-dep-xyz', uid: '123' },
            ],
          },
          status: {
            phase: 'Failed',
            podIP: '10.0.0.2',
            containerStatuses: [
              { name: 'nginx', image: 'nginx', imageID: 'id', ready: false, restartCount: 5 },
            ],
          },
          spec: { nodeName: 'node-02', containers: [] },
        }),
      ],
      services: [],
      ingresses: [],
      configMaps: [],
      secrets: [],
      serverVersion: 'v1.29.0',
      nodeCount: 3,
    };

    const tree = buildTree(rawData, 'test-context', { showErrors: true });

    expect(tree.namespaces).toHaveLength(1);
    expect(tree.namespaces[0].name).toBe('unhealthy');
  });

  it('should handle empty namespace', () => {
    const rawData: RawClusterData = {
      namespaces: [
        asV1Namespace({
          metadata: { name: 'empty' },
          status: { phase: 'Active' },
        }),
      ],
      deployments: [],
      replicaSets: [],
      statefulSets: [],
      daemonSets: [],
      jobs: [],
      cronJobs: [],
      pods: [],
      services: [],
      ingresses: [],
      configMaps: [],
      secrets: [],
      serverVersion: 'v1.29.0',
      nodeCount: 3,
    };

    const tree = buildTree(rawData, 'test-context');

    expect(tree.namespaces).toHaveLength(1);
    expect(tree.namespaces[0].name).toBe('empty');
    expect(tree.namespaces[0].workloads).toHaveLength(0);
    expect(tree.namespaces[0].services).toHaveLength(0);
    expect(tree.namespaces[0].ingresses).toHaveLength(0);
  });

  it('should calculate pod restarts correctly', () => {
    const rawData: RawClusterData = {
      namespaces: [
        asV1Namespace({
          metadata: { name: 'default' },
          status: { phase: 'Active' },
        }),
      ],
      deployments: [
        asV1Deployment({
          metadata: { name: 'api', namespace: 'default' },
          spec: {
            replicas: 1,
            template: {
              spec: {
                containers: [{ name: 'nginx', image: 'nginx' }],
              },
            },
          },
          status: { readyReplicas: 1 },
        }),
      ],
      replicaSets: [
        asV1ReplicaSet({
          metadata: {
            name: 'api-abc',
            namespace: 'default',
            ownerReferences: [
              { apiVersion: 'apps/v1', kind: 'Deployment', name: 'api', uid: '123' },
            ],
          },
          spec: { replicas: 1 },
          status: { readyReplicas: 1 },
        }),
      ],
      statefulSets: [],
      daemonSets: [],
      jobs: [],
      cronJobs: [],
      pods: [
        asV1Pod({
          metadata: {
            name: 'api-pod',
            namespace: 'default',
            ownerReferences: [
              { apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'api-abc', uid: '123' },
            ],
          },
          status: {
            phase: 'Running',
            podIP: '10.0.0.1',
            containerStatuses: [
              { name: 'c1', image: 'nginx', imageID: 'id', ready: true, restartCount: 3 },
              { name: 'c2', image: 'nginx', imageID: 'id', ready: true, restartCount: 2 },
            ],
          },
          spec: { nodeName: 'node-01', containers: [] },
        }),
      ],
      services: [],
      ingresses: [],
      configMaps: [],
      secrets: [],
      serverVersion: 'v1.29.0',
      nodeCount: 3,
    };

    const tree = buildTree(rawData, 'test-context');

    expect(tree.namespaces[0].workloads[0].replicaSets?.[0].pods?.[0].restarts).toBe(5);
  });

  it('should extract pod reason from container state', () => {
    const rawData: RawClusterData = {
      namespaces: [
        asV1Namespace({
          metadata: { name: 'default' },
          status: { phase: 'Active' },
        }),
      ],
      deployments: [
        asV1Deployment({
          metadata: { name: 'api', namespace: 'default' },
          spec: {
            replicas: 1,
            template: {
              spec: {
                containers: [{ name: 'nginx', image: 'nginx' }],
              },
            },
          },
          status: { readyReplicas: 0 },
        }),
      ],
      replicaSets: [
        asV1ReplicaSet({
          metadata: {
            name: 'api-xyz',
            namespace: 'default',
            ownerReferences: [
              { apiVersion: 'apps/v1', kind: 'Deployment', name: 'api', uid: '123' },
            ],
          },
          spec: { replicas: 1 },
          status: { readyReplicas: 0 },
        }),
      ],
      statefulSets: [],
      daemonSets: [],
      jobs: [],
      cronJobs: [],
      pods: [
        asV1Pod({
          metadata: {
            name: 'api-pod',
            namespace: 'default',
            ownerReferences: [
              { apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'api-xyz', uid: '123' },
            ],
          },
          status: {
            phase: 'Pending',
            podIP: '10.0.0.1',
            containerStatuses: [
              {
                name: 'nginx',
                image: 'nginx',
                imageID: 'id',
                ready: false,
                restartCount: 0,
                state: {
                  waiting: {
                    reason: 'CrashLoopBackOff',
                  },
                },
              },
            ],
          },
          spec: { nodeName: 'node-01', containers: [] },
        }),
      ],
      services: [],
      ingresses: [],
      configMaps: [],
      secrets: [],
      serverVersion: 'v1.29.0',
      nodeCount: 3,
    };

    const tree = buildTree(rawData, 'test-context');

    expect(tree.namespaces[0].workloads[0].replicaSets?.[0].pods?.[0].reason).toBe(
      'CrashLoopBackOff'
    );
  });

  it('should handle multiple namespaces', () => {
    const rawData: RawClusterData = {
      namespaces: [
        asV1Namespace({
          metadata: { name: 'default' },
          status: { phase: 'Active' },
        }),
        asV1Namespace({
          metadata: { name: 'kube-system' },
          status: { phase: 'Active' },
        }),
      ],
      deployments: [
        asV1Deployment({
          metadata: { name: 'app', namespace: 'default' },
          spec: {
            replicas: 1,
            template: {
              spec: {
                containers: [{ name: 'nginx', image: 'nginx' }],
              },
            },
          },
          status: { readyReplicas: 1 },
        }),
      ],
      replicaSets: [
        asV1ReplicaSet({
          metadata: {
            name: 'app-rs',
            namespace: 'default',
            ownerReferences: [
              { apiVersion: 'apps/v1', kind: 'Deployment', name: 'app', uid: '123' },
            ],
          },
          spec: { replicas: 1 },
          status: { readyReplicas: 1 },
        }),
      ],
      statefulSets: [],
      daemonSets: [],
      jobs: [],
      cronJobs: [],
      pods: [],
      services: [],
      ingresses: [],
      configMaps: [],
      secrets: [],
      serverVersion: 'v1.29.0',
      nodeCount: 3,
    };

    const tree = buildTree(rawData, 'test-context');

    expect(tree.namespaces).toHaveLength(2);
    expect(tree.namespaces[0].name).toBe('default');
    expect(tree.namespaces[1].name).toBe('kube-system');
  });

  it('should handle missing metadata gracefully', () => {
    const rawData: RawClusterData = {
      namespaces: [asV1Namespace({})],
      deployments: [asV1Deployment({})],
      replicaSets: [],
      statefulSets: [],
      daemonSets: [],
      jobs: [],
      cronJobs: [],
      pods: [asV1Pod({})],
      services: [asV1Service({})],
      ingresses: [asV1Ingress({})],
      configMaps: [],
      secrets: [],
      serverVersion: 'v1.29.0',
      nodeCount: 3,
    };

    const tree = buildTree(rawData, 'test-context');

    expect(tree.namespaces[0].name).toBe('unknown');
    expect(tree.namespaces[0].status).toBe('Active');
  });
});
