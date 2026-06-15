import * as k8s from '@kubernetes/client-node';
import type { K8sClient } from './client.js';
import type { FetchOptions, RawClusterData } from './types.js';

export async function fetchAllNamespaceNames(client: K8sClient): Promise<string[]> {
  try {
    const nsList = await client.core.listNamespace();
    return nsList.body.items.map((ns) => ns.metadata?.name || '').filter(Boolean);
  } catch (error) {
    // Permission denied or other error - return empty array
    // Caller should handle gracefully
    return [];
  }
}

export async function fetchClusterData(
  client: K8sClient,
  opts: FetchOptions
): Promise<RawClusterData> {
  try {
    // Fetch server version and node count
    const versionInfo = await client.version.getCode();
    const serverVersion = versionInfo.body.gitVersion || 'unknown';

    const nodeList = await client.core.listNode();
    const nodeCount = nodeList.body.items.length;

    // Fetch namespaces
    const namespaces = await fetchNamespaces(client.core, opts.namespace);

    // Fetch all resources for each namespace
    const deployments: k8s.V1Deployment[] = [];
    const replicaSets: k8s.V1ReplicaSet[] = [];
    const statefulSets: k8s.V1StatefulSet[] = [];
    const daemonSets: k8s.V1DaemonSet[] = [];
    const jobs: k8s.V1Job[] = [];
    const cronJobs: k8s.V1CronJob[] = [];
    const pods: k8s.V1Pod[] = [];
    const services: k8s.V1Service[] = [];
    const ingresses: k8s.V1Ingress[] = [];
    const configMaps: k8s.V1ConfigMap[] = [];
    const secrets: k8s.V1Secret[] = [];
    const persistentVolumeClaims: k8s.V1PersistentVolumeClaim[] = [];
    const hpas: k8s.V2HorizontalPodAutoscaler[] = [];

    for (const ns of namespaces) {
      const nsName = ns.metadata?.name;
      if (!nsName) continue;

      const [
        nsDeployments,
        nsReplicaSets,
        nsStatefulSets,
        nsDaemonSets,
        nsJobs,
        nsCronJobs,
        nsPods,
        nsServices,
        nsIngresses,
        nsConfigMaps,
        nsSecrets,
        nsPVCs,
        nsHPAs,
      ] = await Promise.all([
        fetchDeployments(client.apps, nsName),
        fetchReplicaSets(client.apps, nsName),
        fetchStatefulSets(client.apps, nsName),
        fetchDaemonSets(client.apps, nsName),
        fetchJobs(client.batch, nsName),
        fetchCronJobs(client.batch, nsName),
        fetchPods(client.core, nsName, opts.selector),
        fetchServices(client.core, nsName),
        fetchIngresses(client.networking, nsName),
        fetchConfigMaps(client.core, nsName),
        fetchSecrets(client.core, nsName),
        fetchPersistentVolumeClaims(client.core, nsName),
        fetchHPAs(client.autoscaling, nsName),
      ]);

      deployments.push(...nsDeployments);
      replicaSets.push(...nsReplicaSets);
      statefulSets.push(...nsStatefulSets);
      daemonSets.push(...nsDaemonSets);
      jobs.push(...nsJobs);
      cronJobs.push(...nsCronJobs);
      pods.push(...nsPods);
      services.push(...nsServices);
      ingresses.push(...nsIngresses);
      configMaps.push(...nsConfigMaps);
      secrets.push(...nsSecrets);
      persistentVolumeClaims.push(...nsPVCs);
      hpas.push(...nsHPAs);
    }

    return {
      namespaces,
      deployments,
      replicaSets,
      statefulSets,
      daemonSets,
      jobs,
      cronJobs,
      pods,
      services,
      ingresses,
      configMaps,
      secrets,
      persistentVolumeClaims,
      hpas,
      serverVersion,
      nodeCount,
    };
  } catch (error) {
    if (error instanceof Error) {
      // Handle specific K8s API errors
      const errorMessage = error.message.toLowerCase();

      if (
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('connect') ||
        errorMessage.includes('timeout')
      ) {
        throw new Error('Cannot connect to cluster. Is the cluster running?');
      }

      if (errorMessage.includes('forbidden') || errorMessage.includes('403')) {
        throw new Error('Forbidden — missing RBAC permissions to access cluster resources');
      }

      if (errorMessage.includes('unauthorized') || errorMessage.includes('401')) {
        throw new Error('Unauthorized — invalid credentials or token expired');
      }

      if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        throw new Error('Resource not found in cluster');
      }

      throw new Error(`Failed to fetch cluster data: ${error.message}`);
    }
    throw new Error('Failed to fetch cluster data: unknown error');
  }
}

async function fetchNamespaces(
  core: k8s.CoreV1Api,
  namespace?: string | string[]
): Promise<k8s.V1Namespace[]> {
  try {
    if (namespace) {
      if (Array.isArray(namespace)) {
        // Fetch multiple specific namespaces
        const promises = namespace.map((ns) => core.readNamespace(ns));
        const results = await Promise.allSettled(promises);
        return results
          .filter((r) => r.status === 'fulfilled')
          .map((r) => (r as PromiseFulfilledResult<{ body: k8s.V1Namespace }>).value.body);
      } else {
        // Fetch single namespace
        const res = await core.readNamespace(namespace);
        return [res.body];
      }
    }
    const res = await core.listNamespace();
    return res.body.items;
  } catch (error) {
    // Permission denied or other error - return empty array
    // The caller (fetchClusterData) will handle showing appropriate message
    return [];
  }
}

async function fetchDeployments(apps: k8s.AppsV1Api, ns: string): Promise<k8s.V1Deployment[]> {
  try {
    const res = await apps.listNamespacedDeployment(ns);
    return res.body.items;
  } catch (error) {
    // Namespace might not have deployments
    return [];
  }
}

async function fetchReplicaSets(apps: k8s.AppsV1Api, ns: string): Promise<k8s.V1ReplicaSet[]> {
  try {
    const res = await apps.listNamespacedReplicaSet(ns);
    return res.body.items;
  } catch (error) {
    // Namespace might not have replicaSets
    return [];
  }
}

async function fetchPods(core: k8s.CoreV1Api, ns: string, selector?: string): Promise<k8s.V1Pod[]> {
  try {
    const res = await core.listNamespacedPod(
      ns,
      undefined,
      undefined,
      undefined,
      undefined,
      selector
    );
    return res.body.items;
  } catch (error) {
    // Namespace might not have pods
    return [];
  }
}

async function fetchStatefulSets(apps: k8s.AppsV1Api, ns: string): Promise<k8s.V1StatefulSet[]> {
  try {
    const res = await apps.listNamespacedStatefulSet(ns);
    return res.body.items;
  } catch (error) {
    return [];
  }
}

async function fetchDaemonSets(apps: k8s.AppsV1Api, ns: string): Promise<k8s.V1DaemonSet[]> {
  try {
    const res = await apps.listNamespacedDaemonSet(ns);
    return res.body.items;
  } catch (error) {
    return [];
  }
}

async function fetchJobs(batch: k8s.BatchV1Api, ns: string): Promise<k8s.V1Job[]> {
  try {
    const res = await batch.listNamespacedJob(ns);
    return res.body.items;
  } catch (error) {
    return [];
  }
}

async function fetchCronJobs(batch: k8s.BatchV1Api, ns: string): Promise<k8s.V1CronJob[]> {
  try {
    const res = await batch.listNamespacedCronJob(ns);
    return res.body.items;
  } catch (error) {
    return [];
  }
}

async function fetchServices(core: k8s.CoreV1Api, ns: string): Promise<k8s.V1Service[]> {
  try {
    const res = await core.listNamespacedService(ns);
    return res.body.items;
  } catch (error) {
    return [];
  }
}

async function fetchIngresses(net: k8s.NetworkingV1Api, ns: string): Promise<k8s.V1Ingress[]> {
  try {
    const res = await net.listNamespacedIngress(ns);
    return res.body.items;
  } catch (error) {
    return [];
  }
}

async function fetchConfigMaps(core: k8s.CoreV1Api, ns: string): Promise<k8s.V1ConfigMap[]> {
  try {
    const res = await core.listNamespacedConfigMap(ns);
    return res.body.items;
  } catch (error) {
    return [];
  }
}

async function fetchSecrets(core: k8s.CoreV1Api, ns: string): Promise<k8s.V1Secret[]> {
  try {
    const res = await core.listNamespacedSecret(ns);
    return res.body.items;
  } catch (error) {
    return [];
  }
}

async function fetchPersistentVolumeClaims(
  core: k8s.CoreV1Api,
  ns: string
): Promise<k8s.V1PersistentVolumeClaim[]> {
  try {
    const res = await core.listNamespacedPersistentVolumeClaim(ns);
    return res.body.items;
  } catch (error) {
    return [];
  }
}

async function fetchHPAs(
  autoscaling: k8s.AutoscalingV2Api,
  ns: string
): Promise<k8s.V2HorizontalPodAutoscaler[]> {
  try {
    const res = await autoscaling.listNamespacedHorizontalPodAutoscaler(ns);
    return res.body.items;
  } catch (error) {
    return [];
  }
}
