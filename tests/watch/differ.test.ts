import { diffTrees } from '../../src/watch/differ.js';
import type { ClusterTree } from '../../src/tree/types.js';

describe('diffTrees', () => {
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
              {
                name: 'app-def456',
                phase: 'Running',
                nodeName: 'node-2',
                ip: '10.0.0.2',
                restarts: 0,
                ready: '1/1',
              },
            ],
          },
        ],
        services: [],
        ingresses: [],
      },
    ],
    fetchedAt: new Date(),
    ...overrides,
  });

  it('detects new pod as added', () => {
    const prev = createMockTree();
    const next = createMockTree({
      namespaces: [
        {
          ...prev.namespaces[0],
          workloads: [
            {
              ...prev.namespaces[0].workloads[0],
              pods: [
                ...prev.namespaces[0].workloads[0].pods,
                {
                  name: 'app-ghi789',
                  phase: 'Running',
                  nodeName: 'node-3',
                  ip: '10.0.0.3',
                  restarts: 0,
                  ready: '1/1',
                },
              ],
            },
          ],
        },
      ],
    });

    const result = diffTrees(prev, next);
    expect(result.added).toContain('default/app/app-ghi789');
    expect(result.removed).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
  });

  it('detects removed pod as removed', () => {
    const prev = createMockTree();
    const next = createMockTree({
      namespaces: [
        {
          ...prev.namespaces[0],
          workloads: [
            {
              ...prev.namespaces[0].workloads[0],
              pods: [prev.namespaces[0].workloads[0].pods[0]],
            },
          ],
        },
      ],
    });

    const result = diffTrees(prev, next);
    expect(result.removed).toContain('default/app/app-def456');
    expect(result.added).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
  });

  it('detects phase change as changed', () => {
    const prev = createMockTree();
    const next = createMockTree({
      namespaces: [
        {
          ...prev.namespaces[0],
          workloads: [
            {
              ...prev.namespaces[0].workloads[0],
              pods: [
                {
                  ...prev.namespaces[0].workloads[0].pods[0],
                  phase: 'Failed',
                },
                prev.namespaces[0].workloads[0].pods[1],
              ],
            },
          ],
        },
      ],
    });

    const result = diffTrees(prev, next);
    expect(result.changed).toContain('default/app/app-abc123');
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it('detects workload ready count change', () => {
    const prev = createMockTree();
    const next = createMockTree({
      namespaces: [
        {
          ...prev.namespaces[0],
          workloads: [
            {
              ...prev.namespaces[0].workloads[0],
              ready: '2/3',
            },
          ],
        },
      ],
    });

    const result = diffTrees(prev, next);
    expect(result.changed).toContain('default/app');
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it('returns empty diff when trees are identical', () => {
    const prev = createMockTree();
    const next = createMockTree();

    const result = diffTrees(prev, next);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
  });

  it('handles namespace added', () => {
    const baseTree = createMockTree();
    const prev = createMockTree({
      namespaces: [baseTree.namespaces[0]],
    });
    const next = createMockTree({
      namespaces: [
        baseTree.namespaces[0],
        {
          name: 'staging',
          status: 'Active',
          workloads: [],
          services: [],
          ingresses: [],
        },
      ],
    });

    const result = diffTrees(prev, next);
    expect(result.added).toHaveLength(0); // No workloads in new namespace
    expect(result.removed).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
  });

  it('handles namespace removed', () => {
    const baseTree = createMockTree();
    const prev = createMockTree({
      namespaces: [
        baseTree.namespaces[0],
        {
          name: 'staging',
          status: 'Active',
          workloads: [],
          services: [],
          ingresses: [],
        },
      ],
    });
    const next = createMockTree({
      namespaces: [baseTree.namespaces[0]],
    });

    const result = diffTrees(prev, next);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
  });

  it('detects new workload as added', () => {
    const prev = createMockTree();
    const next = createMockTree({
      namespaces: [
        {
          ...prev.namespaces[0],
          workloads: [
            ...prev.namespaces[0].workloads,
            {
              name: 'worker',
              kind: 'Deployment',
              ready: '1/1',
              image: 'worker:v1',
              pods: [],
            },
          ],
        },
      ],
    });

    const result = diffTrees(prev, next);
    expect(result.added).toContain('default/worker');
    expect(result.removed).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
  });

  it('detects removed workload as removed', () => {
    const prev = createMockTree();
    const next = createMockTree({
      namespaces: [
        {
          ...prev.namespaces[0],
          workloads: [],
        },
      ],
    });

    const result = diffTrees(prev, next);
    expect(result.removed).toContain('default/app');
    expect(result.added).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
  });
});
