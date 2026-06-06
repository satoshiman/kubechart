import type { RawClusterData } from '../k8s/types.js';
import type {
  ClusterTree,
  NamespaceNode,
  WorkloadNode,
  PodNode,
  PodPhase,
  ServiceNode,
  IngressNode,
  ReplicaSetNode,
} from './types.js';

export interface FilterOptions {
  showErrors?: boolean;
  selector?: string;
}

export function buildTree(
  raw: RawClusterData,
  contextName: string,
  opts: FilterOptions = {}
): ClusterTree {
  const namespaces: NamespaceNode[] = raw.namespaces.map(
    (ns: { metadata?: { name?: string }; status?: { phase?: string } }) => {
      const nsName = ns.metadata?.name || 'unknown';
      const nsStatus = (ns.status?.phase as 'Active' | 'Terminating') || 'Active';

      // Get all resources for this namespace
      const nsDeployments = raw.deployments.filter(
        (d: { metadata?: { namespace?: string } }) => d.metadata?.namespace === nsName
      );
      const nsReplicaSets = raw.replicaSets.filter(
        (r: { metadata?: { namespace?: string } }) => r.metadata?.namespace === nsName
      );
      const nsStatefulSets = raw.statefulSets.filter(
        (s: { metadata?: { namespace?: string } }) => s.metadata?.namespace === nsName
      );
      const nsDaemonSets = raw.daemonSets.filter(
        (d: { metadata?: { namespace?: string } }) => d.metadata?.namespace === nsName
      );
      const nsJobs = raw.jobs.filter(
        (j: { metadata?: { namespace?: string } }) => j.metadata?.namespace === nsName
      );
      const nsCronJobs = raw.cronJobs.filter(
        (c: { metadata?: { namespace?: string } }) => c.metadata?.namespace === nsName
      );
      const nsServices = raw.services.filter(
        (s: { metadata?: { namespace?: string } }) => s.metadata?.namespace === nsName
      );
      const nsIngresses = raw.ingresses.filter(
        (i: { metadata?: { namespace?: string } }) => i.metadata?.namespace === nsName
      );

      // Build workload nodes from all resource types
      const workloads: WorkloadNode[] = [
        ...nsDeployments.map((d) => buildWorkloadFromDeployment(d, nsReplicaSets, raw.pods)),
        ...nsStatefulSets.map((s) => buildWorkloadFromStatefulSet(s, raw.pods)),
        ...nsDaemonSets.map((d) => buildWorkloadFromDaemonSet(d, raw.pods)),
        ...nsJobs.map((j) => buildWorkloadFromJob(j, raw.pods)),
        ...nsCronJobs.map((c) => buildWorkloadFromCronJob(c, raw.pods)),
      ];

      // Build service nodes
      const services: ServiceNode[] = nsServices.map((s) => buildServiceNode(s));

      // Build ingress nodes
      const ingresses: IngressNode[] = nsIngresses.map((i) => buildIngressNode(i));

      return {
        name: nsName,
        status: nsStatus,
        workloads,
        services,
        ingresses,
      };
    }
  );

  // Apply filters
  let filteredNamespaces = namespaces;

  if (opts.showErrors) {
    filteredNamespaces = namespaces.filter((ns: NamespaceNode) => {
      return ns.workloads.some((wl: WorkloadNode) => {
        const allPods = [...(wl.pods || []), ...(wl.replicaSets?.flatMap((rs) => rs.pods) || [])];
        return allPods.some((pod: PodNode) => pod.phase !== 'Running');
      });
    });
  }

  if (opts.selector) {
    // Parse label selector (simple implementation for app=env format)
    const [key, value] = opts.selector.split('=');
    if (key && value) {
      filteredNamespaces = namespaces.map((ns) => ({
        ...ns,
        workloads: ns.workloads.map((wl: WorkloadNode) => ({
          ...wl,
          pods: (wl.pods || []).filter((_pod: PodNode) => {
            // This would need actual pod labels from raw data
            // For now, we'll skip this filter in phase 1
            return true;
          }),
        })),
      }));
    }
  }

  return {
    contextName,
    serverVersion: raw.serverVersion || 'unknown',
    nodeCount: raw.nodeCount || 0,
    namespaces: filteredNamespaces,
    fetchedAt: new Date(),
  };
}

function buildPodNode(pod: import('@kubernetes/client-node').V1Pod): PodNode {
  const name = pod.metadata?.name || 'unknown';
  const phase = (pod.status?.phase as PodPhase) || 'Unknown';
  const nodeName = pod.spec?.nodeName || 'unknown';
  const ip = pod.status?.podIP || 'none';

  // Calculate restarts
  const restarts =
    pod.status?.containerStatuses?.reduce(
      (sum: number, cs: { restartCount?: number }) => sum + (cs.restartCount || 0),
      0
    ) || 0;

  // Get container state reason
  const waitingState = pod.status?.containerStatuses?.[0]?.state?.waiting;
  const terminatedState = pod.status?.containerStatuses?.[0]?.state?.terminated;
  const reason = waitingState?.reason || terminatedState?.reason || undefined;

  // Calculate ready containers
  const readyContainers =
    pod.status?.containerStatuses?.filter((cs: { ready?: boolean }) => cs.ready).length || 0;
  const totalContainers = pod.status?.containerStatuses?.length || 1;
  const ready = `${readyContainers}/${totalContainers}`;

  return {
    name,
    phase,
    nodeName,
    ip,
    restarts,
    reason,
    ready,
  };
}

function buildWorkloadFromDeployment(
  deployment: import('@kubernetes/client-node').V1Deployment,
  replicaSets: import('@kubernetes/client-node').V1ReplicaSet[],
  allPods: import('@kubernetes/client-node').V1Pod[]
): WorkloadNode {
  const deploymentName = deployment.metadata?.name || 'unknown';

  // Find ReplicaSets owned by this Deployment
  const deploymentReplicaSets = replicaSets.filter((rs) => {
    const owners = rs.metadata?.ownerReferences || [];
    const deploymentOwner = owners.find((owner) => owner.kind === 'Deployment');
    if (!deploymentOwner) return false;
    return deploymentOwner.name === deploymentName;
  });

  // Build ReplicaSet nodes with their pods
  const replicaSetNodes: ReplicaSetNode[] = deploymentReplicaSets.map((rs) => {
    const rsName = rs.metadata?.name || 'unknown';

    // Find pods owned by this ReplicaSet
    const rsPods = allPods.filter((pod) => {
      const owners = pod.metadata?.ownerReferences || [];
      const rsOwner = owners.find((owner) => owner.kind === 'ReplicaSet');
      if (!rsOwner) return false;
      return rsOwner.name === rsName;
    });

    const readyReplicas = rs.status?.readyReplicas || 0;
    const desiredReplicas = rs.spec?.replicas || 1;
    const ready = `${readyReplicas}/${desiredReplicas}`;

    return {
      name: rsName,
      ready,
      pods: rsPods.map((p) => buildPodNode(p)),
    };
  });

  const readyReplicas = deployment.status?.readyReplicas || 0;
  const desiredReplicas = deployment.spec?.replicas || 1;
  const ready = `${readyReplicas}/${desiredReplicas}`;
  const image = deployment.spec?.template?.spec?.containers?.[0]?.image || 'unknown';

  return {
    name: deploymentName,
    kind: 'Deployment',
    ready,
    image,
    replicaSets: replicaSetNodes,
  };
}

function buildWorkloadFromStatefulSet(
  sts: import('@kubernetes/client-node').V1StatefulSet,
  allPods: import('@kubernetes/client-node').V1Pod[]
): WorkloadNode {
  const stsName = sts.metadata?.name || 'unknown';

  const stsPods = allPods.filter((pod) => {
    const owners = pod.metadata?.ownerReferences || [];
    const stsOwner = owners.find((owner) => owner.kind === 'StatefulSet');
    if (!stsOwner) return false;
    return stsOwner.name === stsName;
  });

  const readyReplicas = sts.status?.readyReplicas || 0;
  const desiredReplicas = sts.spec?.replicas || 1;
  const ready = `${readyReplicas}/${desiredReplicas}`;
  const image = sts.spec?.template?.spec?.containers?.[0]?.image || 'unknown';

  return {
    name: stsName,
    kind: 'StatefulSet',
    ready,
    image,
    pods: stsPods.map((p) => buildPodNode(p)),
  };
}

function buildWorkloadFromDaemonSet(
  ds: import('@kubernetes/client-node').V1DaemonSet,
  allPods: import('@kubernetes/client-node').V1Pod[]
): WorkloadNode {
  const dsName = ds.metadata?.name || 'unknown';

  const dsPods = allPods.filter((pod) => {
    const owners = pod.metadata?.ownerReferences || [];
    const dsOwner = owners.find((owner) => owner.kind === 'DaemonSet');
    if (!dsOwner) return false;
    return dsOwner.name === dsName;
  });

  const currentNumberScheduled = ds.status?.currentNumberScheduled || 0;
  const desiredNumberScheduled = ds.status?.desiredNumberScheduled || 0;
  const ready = `${currentNumberScheduled}/${desiredNumberScheduled}`;
  const image = ds.spec?.template?.spec?.containers?.[0]?.image || 'unknown';

  return {
    name: dsName,
    kind: 'DaemonSet',
    ready,
    image,
    pods: dsPods.map((p) => buildPodNode(p)),
  };
}

function buildWorkloadFromJob(
  job: import('@kubernetes/client-node').V1Job,
  allPods: import('@kubernetes/client-node').V1Pod[]
): WorkloadNode {
  const jobName = job.metadata?.name || 'unknown';

  const jobPods = allPods.filter((pod) => {
    const owners = pod.metadata?.ownerReferences || [];
    const jobOwner = owners.find((owner) => owner.kind === 'Job');
    if (!jobOwner) return false;
    return jobOwner.name === jobName;
  });

  const active = job.status?.active || 0;
  const succeeded = job.status?.succeeded || 0;
  const failed = job.status?.failed || 0;
  const total = active + succeeded + failed;
  const ready = `${succeeded}/${total}`;
  const image = job.spec?.template?.spec?.containers?.[0]?.image || 'unknown';

  return {
    name: jobName,
    kind: 'Job',
    ready,
    image,
    pods: jobPods.map((p) => buildPodNode(p)),
  };
}

function buildWorkloadFromCronJob(
  cj: import('@kubernetes/client-node').V1CronJob,
  allPods: import('@kubernetes/client-node').V1Pod[]
): WorkloadNode {
  const cjName = cj.metadata?.name || 'unknown';

  // CronJobs don't directly own pods - they create Jobs which own pods
  // For simplicity, we'll show pods owned by Jobs that match the CronJob name
  const cjPods = allPods.filter((pod) => {
    const owners = pod.metadata?.ownerReferences || [];
    const jobOwner = owners.find((owner) => owner.kind === 'Job');
    if (!jobOwner) return false;
    // Job names are typically: <cronjob-name>-<timestamp>
    return jobOwner.name?.startsWith(cjName + '-');
  });

  const active = cj.status?.active?.length || 0;
  const ready = `${active} jobs`;
  const image = cj.spec?.jobTemplate?.spec?.template?.spec?.containers?.[0]?.image || 'unknown';

  return {
    name: cjName,
    kind: 'CronJob',
    ready,
    image,
    pods: cjPods.map((p) => buildPodNode(p)),
  };
}

function buildServiceNode(service: import('@kubernetes/client-node').V1Service): ServiceNode {
  const name = service.metadata?.name || 'unknown';
  const type =
    (service.spec?.type as 'ClusterIP' | 'NodePort' | 'LoadBalancer' | 'ExternalName') ||
    'ClusterIP';
  const clusterIP = service.spec?.clusterIP || 'none';

  const ports =
    service.spec?.ports?.map((p) => {
      const port = p.port;
      const protocol = p.protocol || 'TCP';
      return `${port}/${protocol}`;
    }) || [];

  return {
    name,
    type,
    clusterIP,
    ports,
  };
}

function buildIngressNode(ingress: import('@kubernetes/client-node').V1Ingress): IngressNode {
  const name = ingress.metadata?.name || 'unknown';
  const tls = !!ingress.spec?.tls && ingress.spec.tls.length > 0;

  const rules = ingress.spec?.rules || [];
  const host = rules[0]?.host || 'unknown';

  const paths = rules.flatMap((rule) => {
    return rule.http?.paths?.map((p) => p.path || '/') || [];
  });

  return {
    name,
    host,
    paths,
    tls,
  };
}
