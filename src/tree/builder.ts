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
  ConfigMapNode,
} from './types.js';
import { parseCpuQuantity, parseMemQuantity } from '../k8s/metrics.js';

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
      const nsConfigMaps = raw.configMaps.filter(
        (c: { metadata?: { namespace?: string } }) => c.metadata?.namespace === nsName
      );
      const nsSecrets = (raw.secrets || []).filter(
        (s: { metadata?: { namespace?: string } }) => s.metadata?.namespace === nsName
      );

      // Build workload nodes from all resource types
      // Filter out jobs that are owned by CronJobs to avoid duplication
      const standaloneJobs = nsJobs.filter((job) => {
        const owners = job.metadata?.ownerReferences || [];
        return !owners.some((owner) => owner.kind === 'CronJob');
      });

      const workloads: WorkloadNode[] = [
        ...nsDeployments.map((d) => buildWorkloadFromDeployment(d, nsReplicaSets, raw.pods)),
        ...nsStatefulSets.map((s) => buildWorkloadFromStatefulSet(s, raw.pods)),
        ...nsDaemonSets.map((d) => buildWorkloadFromDaemonSet(d, raw.pods)),
        ...standaloneJobs.map((j) => buildWorkloadFromJob(j, raw.pods)),
        ...nsCronJobs.map((c) => buildWorkloadFromCronJob(c, raw.pods)),
      ];

      // Build service nodes
      const services: ServiceNode[] = nsServices.map((s) => buildServiceNode(s));

      // Build ingress nodes
      const ingresses: IngressNode[] = nsIngresses.map((i) => buildIngressNode(i, nsSecrets));

      // Build configMap nodes
      const configMaps: ConfigMapNode[] = nsConfigMaps.map((c) => buildConfigMapNode(c));

      return {
        name: nsName,
        status: nsStatus,
        workloads,
        services,
        ingresses,
        configMaps,
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

function formatAge(creationTimestamp: Date | string | undefined): string {
  if (!creationTimestamp) return 'unknown';

  const created =
    typeof creationTimestamp === 'string' ? new Date(creationTimestamp) : creationTimestamp;
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}

function calculateNextSchedule(schedule: string, lastScheduleTime?: Date | string): string {
  // Parse cron schedule to estimate next run time
  // This is a simplified implementation for common patterns
  const parts = schedule.split(' ');
  if (parts.length < 5) return 'unknown';

  const minute = parts[0];
  const hour = parts[1];

  const now = new Date();
  const last = lastScheduleTime
    ? typeof lastScheduleTime === 'string'
      ? new Date(lastScheduleTime)
      : lastScheduleTime
    : now;

  // Handle */N pattern for minutes (e.g., */5 * * * *)
  const minuteMatch = minute.match(/\*\/(\d+)/);
  if (minuteMatch) {
    const interval = parseInt(minuteMatch[1], 10);
    const nextRun = new Date(last.getTime() + interval * 60 * 1000);
    const diffMs = nextRun.getTime() - now.getTime();
    const diffMin = Math.ceil(diffMs / (60 * 1000));
    if (diffMin <= 0) return '~0m';
    if (diffMin < 60) return `~${diffMin}m`;
    const diffHour = Math.ceil(diffMin / 60);
    return `~${diffHour}h`;
  }

  // Handle hourly (0 * * * *)
  if (minute === '0' && hour === '*') {
    const nextHour = new Date(now);
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    const diffMs = nextHour.getTime() - now.getTime();
    const diffMin = Math.ceil(diffMs / (60 * 1000));
    return `~${diffMin}m`;
  }

  // Handle daily (0 0 * * *)
  if (minute === '0' && hour === '0') {
    const nextDay = new Date(now);
    nextDay.setHours(0, 0, 0, 0);
    nextDay.setDate(nextDay.getDate() + 1);
    const diffMs = nextDay.getTime() - now.getTime();
    const diffHour = Math.ceil(diffMs / (60 * 60 * 1000));
    return `~${diffHour}h`;
  }

  // Default: return the schedule expression
  return schedule;
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

  // Calculate age
  const age = formatAge(pod.metadata?.creationTimestamp);

  // Extract CPU/memory requests and limits from pod spec
  let cpuRequest: number | undefined;
  let cpuLimit: number | undefined;
  let memRequest: number | undefined;
  let memLimit: number | undefined;

  for (const container of pod.spec?.containers || []) {
    const containerCpuRequest = container.resources?.requests?.cpu;
    const containerCpuLimit = container.resources?.limits?.cpu;
    const containerMemRequest = container.resources?.requests?.memory;
    const containerMemLimit = container.resources?.limits?.memory;

    if (containerCpuRequest) {
      cpuRequest = (cpuRequest || 0) + parseCpuQuantity(containerCpuRequest);
    }
    if (containerCpuLimit) {
      cpuLimit = (cpuLimit || 0) + parseCpuQuantity(containerCpuLimit);
    }
    if (containerMemRequest) {
      memRequest = (memRequest || 0) + parseMemQuantity(containerMemRequest);
    }
    if (containerMemLimit) {
      memLimit = (memLimit || 0) + parseMemQuantity(containerMemLimit);
    }
  }

  return {
    name,
    phase,
    nodeName,
    ip,
    restarts,
    reason,
    ready,
    age,
    metrics: {
      resources: {
        cpuUsage: 0, // Will be updated by attachMetrics
        cpuRequest,
        cpuLimit,
        memUsage: 0, // Will be updated by attachMetrics
        memRequest,
        memLimit,
      },
    },
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

  // Calculate job duration
  let duration: string | undefined;
  const startTime = job.status?.startTime;
  const completionTime = job.status?.completionTime;
  if (startTime) {
    const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
    const end = completionTime
      ? typeof completionTime === 'string'
        ? new Date(completionTime)
        : completionTime
      : new Date();
    const diffMs = end.getTime() - start.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) {
      duration = `${diffSec}s`;
    } else if (diffSec < 3600) {
      const diffMin = Math.floor(diffSec / 60);
      duration = `${diffMin}m`;
    } else {
      const diffHour = Math.floor(diffSec / 3600);
      duration = `${diffHour}h`;
    }
  }

  return {
    name: jobName,
    kind: 'Job',
    ready,
    image,
    pods: jobPods.map((p) => buildPodNode(p)),
    duration,
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

  // Format last schedule time
  const lastScheduleTime = cj.status?.lastScheduleTime
    ? formatAge(cj.status.lastScheduleTime)
    : 'never';

  // Calculate next schedule time from cron schedule
  const nextScheduleTime = cj.spec?.schedule
    ? calculateNextSchedule(cj.spec.schedule, cj.status?.lastScheduleTime)
    : undefined;

  return {
    name: cjName,
    kind: 'CronJob',
    ready,
    image,
    pods: cjPods.map((p) => buildPodNode(p)),
    lastScheduleTime,
    nextScheduleTime,
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

  // Extract nodePort from the first port if type is NodePort
  const nodePort = type === 'NodePort' ? service.spec?.ports?.[0]?.nodePort : undefined;

  // Check if external IP is pending for LoadBalancer
  let externalIpPending = false;
  let externalIp: string | undefined;
  if (type === 'LoadBalancer') {
    const ingress = service.status?.loadBalancer?.ingress;
    if (
      !ingress ||
      ingress.length === 0 ||
      (ingress[0].ip === '<pending>' && ingress[0].hostname === undefined)
    ) {
      externalIpPending = true;
    } else {
      const firstIngress = ingress[0];
      if (firstIngress.ip && firstIngress.ip !== '<pending>') {
        externalIp = firstIngress.ip;
      } else if (firstIngress.hostname) {
        externalIp = firstIngress.hostname;
      }
    }
  }

  return {
    name,
    type,
    clusterIP,
    ports,
    nodePort,
    externalIp,
    externalIpPending,
  };
}

function buildIngressNode(
  ingress: import('@kubernetes/client-node').V1Ingress,
  secrets: import('@kubernetes/client-node').V1Secret[] = []
): IngressNode {
  const name = ingress.metadata?.name || 'unknown';
  const tls = !!ingress.spec?.tls && ingress.spec.tls.length > 0;

  const rules = ingress.spec?.rules || [];
  const host = rules[0]?.host || 'unknown';

  const paths = rules.flatMap((rule) => {
    return rule.http?.paths?.map((p) => p.path || '/') || [];
  });

  // Extract backend service from the first path
  const firstPath = rules[0]?.http?.paths?.[0];
  let backend: string | undefined;
  if (firstPath?.backend?.service) {
    const serviceName = firstPath.backend.service.name;
    const servicePort =
      firstPath.backend.service.port?.number || firstPath.backend.service.port?.name;
    backend = servicePort ? `${serviceName}:${servicePort}` : serviceName;
  }

  // Check if TLS secret exists
  let tlsSecretMissing = false;
  if (tls && ingress.spec?.tls?.[0]?.secretName) {
    const secretName = ingress.spec.tls[0].secretName;
    const secretExists = secrets.some(
      (s: { metadata?: { name?: string } }) => s.metadata?.name === secretName
    );
    tlsSecretMissing = !secretExists;
  }

  return {
    name,
    host,
    paths,
    tls,
    backend,
    tlsSecretMissing,
  };
}

function buildConfigMapNode(
  configMap: import('@kubernetes/client-node').V1ConfigMap
): ConfigMapNode {
  const name = configMap.metadata?.name || 'unknown';
  const keys = Object.keys(configMap.data || {}).length;

  return {
    name,
    keys,
  };
}
