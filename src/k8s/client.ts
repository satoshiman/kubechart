import * as k8s from '@kubernetes/client-node';

export interface K8sClient {
  core: k8s.CoreV1Api;
  apps: k8s.AppsV1Api;
  batch: k8s.BatchV1Api;
  networking: k8s.NetworkingV1Api;
  autoscaling: k8s.AutoscalingV2Api;
  version: k8s.VersionApi;
  kc: k8s.KubeConfig; // v2: expose raw KubeConfig để metrics.ts dùng custom HTTP requests
  contextName: string;
  currentNamespace: string;
}

export function createClient(context?: string): K8sClient {
  const kc = new k8s.KubeConfig();

  try {
    kc.loadFromDefault();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Cannot load kubeconfig: ${error.message}`);
    }
    throw new Error('Cannot load kubeconfig: unknown error');
  }

  if (context) {
    const contexts = kc.getContexts();
    const contextExists = contexts.some((ctx: { name: string }) => ctx.name === context);
    if (!contextExists) {
      throw new Error(`Context '${context}' not found in kubeconfig`);
    }
    kc.setCurrentContext(context);
  }

  // Get current namespace from context
  const currentContext = kc
    .getContexts()
    .find((ctx: { name: string }) => ctx.name === kc.getCurrentContext());
  const currentNamespace = currentContext?.namespace || 'default';

  return {
    core: kc.makeApiClient(k8s.CoreV1Api),
    apps: kc.makeApiClient(k8s.AppsV1Api),
    batch: kc.makeApiClient(k8s.BatchV1Api),
    networking: kc.makeApiClient(k8s.NetworkingV1Api),
    autoscaling: kc.makeApiClient(k8s.AutoscalingV2Api),
    version: kc.makeApiClient(k8s.VersionApi),
    kc,
    contextName: kc.getCurrentContext(),
    currentNamespace,
  };
}
