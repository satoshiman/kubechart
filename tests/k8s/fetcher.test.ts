import { fetchClusterData } from '../../src/k8s/fetcher.js';
import type { K8sClient } from '../../src/k8s/client.js';

describe('fetchClusterData', () => {
  it('should handle connection errors gracefully', async () => {
    const mockClient = {
      core: {} as unknown,
      apps: {} as unknown,
      batch: {} as unknown,
      networking: {} as unknown,
      version: {} as unknown,
      contextName: 'test',
      currentNamespace: 'default',
    } as K8sClient;

    // Mock version.getCode to throw a connection error
    (mockClient.version as unknown as { getCode: jest.Mock }).getCode = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(fetchClusterData(mockClient, {})).rejects.toThrow(
      'Cannot connect to cluster. Is the cluster running?'
    );
  });

  it('should handle forbidden errors gracefully', async () => {
    const mockClient = {
      core: {} as unknown,
      apps: {} as unknown,
      batch: {} as unknown,
      networking: {} as unknown,
      version: {} as unknown,
      contextName: 'test',
      currentNamespace: 'default',
    } as K8sClient;

    (mockClient.version as unknown as { getCode: jest.Mock }).getCode = jest
      .fn()
      .mockRejectedValue(new Error('Forbidden - 403'));

    await expect(fetchClusterData(mockClient, {})).rejects.toThrow(
      'Forbidden — missing RBAC permissions to access cluster resources'
    );
  });

  it('should handle unauthorized errors gracefully', async () => {
    const mockClient = {
      core: {} as unknown,
      apps: {} as unknown,
      batch: {} as unknown,
      networking: {} as unknown,
      version: {} as unknown,
      contextName: 'test',
      currentNamespace: 'default',
    } as K8sClient;

    (mockClient.version as unknown as { getCode: jest.Mock }).getCode = jest
      .fn()
      .mockRejectedValue(new Error('Unauthorized - 401'));

    await expect(fetchClusterData(mockClient, {})).rejects.toThrow(
      'Unauthorized — invalid credentials or token expired'
    );
  });

  it('should handle not found errors gracefully', async () => {
    const mockClient = {
      core: {} as unknown,
      apps: {} as unknown,
      batch: {} as unknown,
      networking: {} as unknown,
      version: {} as unknown,
      contextName: 'test',
      currentNamespace: 'default',
    } as K8sClient;

    (mockClient.version as unknown as { getCode: jest.Mock }).getCode = jest
      .fn()
      .mockRejectedValue(new Error('Not Found - 404'));

    await expect(fetchClusterData(mockClient, {})).rejects.toThrow('Resource not found in cluster');
  });
});
