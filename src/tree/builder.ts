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
  PVCNode,
  VolumeNode,
  VolumeType,
} from './types.js';
import { parseCpuQuantity, parseMemQuantity } from '../k8s/metrics.js';

export interface FilterOptions {
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
      const nsPVCs = (raw.persistentVolumeClaims || []).filter(
        (p: { metadata?: { namespace?: string } }) => p.metadata?.namespace === nsName
      );
      const nsHPAs = (raw.hpas || []).filter(
        (h: { metadata?: { namespace?: string } }) => h.metadata?.namespace === nsName
      );

      // Build workload nodes from all resource types
      // Filter out jobs that are owned by CronJobs to avoid duplication
      const standaloneJobs = nsJobs.filter((job) => {
        const owners = job.metadata?.ownerReferences || [];
        return !owners.some((owner) => owner.kind === 'CronJob');
      });

      const workloads: WorkloadNode[] = [
        ...nsDeployments.map((d) =>
          buildWorkloadFromDeployment(
            d,
            nsReplicaSets,
            raw.pods,
            nsConfigMaps,
            nsSecrets,
            nsPVCs,
            nsHPAs
          )
        ),
        ...nsStatefulSets.map((s) =>
          buildWorkloadFromStatefulSet(s, raw.pods, nsConfigMaps, nsSecrets, nsPVCs)
        ),
        ...nsDaemonSets.map((d) =>
          buildWorkloadFromDaemonSet(d, raw.pods, nsConfigMaps, nsSecrets, nsPVCs)
        ),
        ...standaloneJobs.map((j) =>
          buildWorkloadFromJob(j, raw.pods, nsConfigMaps, nsSecrets, nsPVCs)
        ),
        ...nsCronJobs.map((c) =>
          buildWorkloadFromCronJob(c, raw.pods, nsConfigMaps, nsSecrets, nsPVCs)
        ),
      ];

      // Find orphan pods (pods not owned by any workload in this namespace)
      const nsPods = raw.pods.filter((p) => p.metadata?.namespace === nsName);
      const ownedPodNames = new Set<string>();

      // Collect all pod names that are owned by workloads
      workloads.forEach((wl) => {
        (wl.pods || []).forEach((pod) => ownedPodNames.add(pod.name));
        (wl.replicaSets || []).forEach((rs) => {
          (rs.pods || []).forEach((pod) => ownedPodNames.add(pod.name));
        });
      });

      // Orphan pods are those in the namespace but not owned by any workload
      const orphanPods = nsPods
        .filter((p) => !ownedPodNames.has(p.metadata?.name || ''))
        .map((p) => buildPodNode(p));

      // Build service nodes
      const services: ServiceNode[] = nsServices.map((s) => buildServiceNode(s));

      // Build ingress nodes
      const ingresses: IngressNode[] = nsIngresses.map((i) => buildIngressNode(i, nsSecrets));

      // Build configMap nodes
      const configMaps: ConfigMapNode[] = nsConfigMaps.map((c) => buildConfigMapNode(c));

      // Build PVC nodes
      const pvcs: PVCNode[] = nsPVCs.map((p) => buildPVCNode(p, nsPods));

      return {
        name: nsName,
        status: nsStatus,
        workloads,
        services,
        ingresses,
        configMaps,
        pvcs,
        orphanPods,
      };
    }
  );

  // Apply filters
  let filteredNamespaces = namespaces;

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
  let phase = (pod.status?.phase as PodPhase) || 'Unknown';

  // If pod has deletionTimestamp, it's being terminated
  if (pod.metadata?.deletionTimestamp) {
    phase = 'Terminating';
  }

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

  // Extract labels
  const labels = pod.metadata?.labels
    ? Object.entries(pod.metadata.labels)
        .map(([k, v]) => `${k}=${v}`)
        .join(',')
    : undefined;

  // Extract container ports
  const ports = pod.spec?.containers
    ?.flatMap((c) => c.ports?.map((p) => `${p.containerPort}/${p.protocol || 'TCP'}`) || [])
    .filter(Boolean);

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
    labels,
    ports,
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
  allPods: import('@kubernetes/client-node').V1Pod[],
  configMaps: import('@kubernetes/client-node').V1ConfigMap[],
  secrets: import('@kubernetes/client-node').V1Secret[],
  pvcs: import('@kubernetes/client-node').V1PersistentVolumeClaim[],
  hpas: import('@kubernetes/client-node').V2HorizontalPodAutoscaler[]
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

    // Extract selector
    const selector = rs.spec?.selector?.matchLabels
      ? Object.entries(rs.spec.selector.matchLabels)
          .map(([k, v]) => `${k}=${v}`)
          .join(',')
      : undefined;

    // Extract volumes from ReplicaSet's pod template
    const volumes = buildVolumesFromPodSpec(rs.spec?.template?.spec, configMaps, secrets, pvcs);

    return {
      name: rsName,
      ready,
      pods: rsPods.map((p) => buildPodNode(p)),
      selector,
      volumes,
    };
  });

  const readyReplicas = deployment.status?.readyReplicas || 0;
  const desiredReplicas = deployment.spec?.replicas || 1;
  const ready = `${readyReplicas}/${desiredReplicas}`;
  const image = deployment.spec?.template?.spec?.containers?.[0]?.image || 'unknown';

  // Extract selector
  const selector = deployment.spec?.selector?.matchLabels
    ? Object.entries(deployment.spec.selector.matchLabels)
        .map(([k, v]) => `${k}=${v}`)
        .join(',')
    : undefined;

  // Find HPA for this deployment
  const hpa = findHPAForWorkload(deploymentName, 'Deployment', hpas);

  return {
    name: deploymentName,
    kind: 'Deployment',
    ready,
    image,
    replicaSets: replicaSetNodes,
    selector,
    hpa,
  };
}

function findHPAForWorkload(
  workloadName: string,
  workloadKind: string,
  hpas: import('@kubernetes/client-node').V2HorizontalPodAutoscaler[]
): import('./types.js').HPAInfo | undefined {
  // Find HPA that targets this workload
  const matchingHPA = hpas.find((hpa) => {
    const ref = hpa.spec?.scaleTargetRef;
    if (!ref) return false;
    return ref.name === workloadName && ref.kind === workloadKind;
  });

  if (!matchingHPA) return undefined;

  const minReplicas = matchingHPA.spec?.minReplicas ?? 1;
  const maxReplicas = matchingHPA.spec?.maxReplicas ?? 1;
  const currentReplicas = matchingHPA.status?.currentReplicas ?? 0;

  // Extract metrics info
  const metrics = matchingHPA.spec?.metrics;
  let metricStr = '';
  if (metrics && metrics.length > 0) {
    metricStr = metrics
      .map((m) => {
        if (m.resource) {
          const target = m.resource.target;
          if (target?.averageUtilization) {
            return `${m.resource.name}:${target.averageUtilization}%`;
          } else if (target?.averageValue) {
            return `${m.resource.name}:${target.averageValue}`;
          }
        } else if (m.pods) {
          return `${m.pods.metric?.name || 'pods'}`;
        } else if (m.object) {
          return `${m.object.metric?.name || 'object'}`;
        } else if (m.external) {
          return `${m.external.metric?.name || 'external'}`;
        }
        return '';
      })
      .filter(Boolean)
      .join(', ');
  }

  return {
    minReplicas,
    maxReplicas,
    currentReplicas,
    metrics: metricStr || undefined,
  };
}

function buildWorkloadFromStatefulSet(
  sts: import('@kubernetes/client-node').V1StatefulSet,
  allPods: import('@kubernetes/client-node').V1Pod[],
  configMaps: import('@kubernetes/client-node').V1ConfigMap[],
  secrets: import('@kubernetes/client-node').V1Secret[],
  pvcs: import('@kubernetes/client-node').V1PersistentVolumeClaim[]
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

  // Extract selector
  const selector = sts.spec?.selector?.matchLabels
    ? Object.entries(sts.spec.selector.matchLabels)
        .map(([k, v]) => `${k}=${v}`)
        .join(',')
    : undefined;

  // Extract volumes from StatefulSet's pod template
  const volumes = buildVolumesFromPodSpec(sts.spec?.template?.spec, configMaps, secrets, pvcs);

  return {
    name: stsName,
    kind: 'StatefulSet',
    ready,
    image,
    pods: stsPods.map((p) => buildPodNode(p)),
    selector,
    volumes,
  };
}

function buildWorkloadFromDaemonSet(
  ds: import('@kubernetes/client-node').V1DaemonSet,
  allPods: import('@kubernetes/client-node').V1Pod[],
  configMaps: import('@kubernetes/client-node').V1ConfigMap[],
  secrets: import('@kubernetes/client-node').V1Secret[],
  pvcs: import('@kubernetes/client-node').V1PersistentVolumeClaim[]
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

  // Extract selector
  const selector = ds.spec?.selector?.matchLabels
    ? Object.entries(ds.spec.selector.matchLabels)
        .map(([k, v]) => `${k}=${v}`)
        .join(',')
    : undefined;

  // Extract volumes from DaemonSet's pod template
  const volumes = buildVolumesFromPodSpec(ds.spec?.template?.spec, configMaps, secrets, pvcs);

  return {
    name: dsName,
    kind: 'DaemonSet',
    ready,
    image,
    pods: dsPods.map((p) => buildPodNode(p)),
    selector,
    volumes,
  };
}

function buildWorkloadFromJob(
  job: import('@kubernetes/client-node').V1Job,
  allPods: import('@kubernetes/client-node').V1Pod[],
  configMaps: import('@kubernetes/client-node').V1ConfigMap[],
  secrets: import('@kubernetes/client-node').V1Secret[],
  pvcs: import('@kubernetes/client-node').V1PersistentVolumeClaim[]
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

  // Extract selector
  const selector = job.spec?.selector?.matchLabels
    ? Object.entries(job.spec.selector.matchLabels)
        .map(([k, v]) => `${k}=${v}`)
        .join(',')
    : undefined;

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

  // Extract volumes from Job's pod template
  const volumes = buildVolumesFromPodSpec(job.spec?.template?.spec, configMaps, secrets, pvcs);

  return {
    name: jobName,
    kind: 'Job',
    ready,
    image,
    pods: jobPods.map((p) => buildPodNode(p)),
    duration,
    selector,
    volumes,
  };
}

function buildWorkloadFromCronJob(
  cj: import('@kubernetes/client-node').V1CronJob,
  allPods: import('@kubernetes/client-node').V1Pod[],
  configMaps: import('@kubernetes/client-node').V1ConfigMap[],
  secrets: import('@kubernetes/client-node').V1Secret[],
  pvcs: import('@kubernetes/client-node').V1PersistentVolumeClaim[]
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

  // Extract selector
  const selector = cj.spec?.jobTemplate?.spec?.selector?.matchLabels
    ? Object.entries(cj.spec.jobTemplate.spec.selector.matchLabels)
        .map(([k, v]) => `${k}=${v}`)
        .join(',')
    : undefined;

  // Format last schedule time
  const lastScheduleTime = cj.status?.lastScheduleTime
    ? formatAge(cj.status.lastScheduleTime)
    : 'never';

  // Calculate next schedule time from cron schedule
  const nextScheduleTime = cj.spec?.schedule
    ? calculateNextSchedule(cj.spec.schedule, cj.status?.lastScheduleTime)
    : undefined;

  // Extract volumes from CronJob's job template
  const volumes = buildVolumesFromPodSpec(
    cj.spec?.jobTemplate?.spec?.template?.spec,
    configMaps,
    secrets,
    pvcs
  );

  return {
    name: cjName,
    kind: 'CronJob',
    ready,
    image,
    pods: cjPods.map((p) => buildPodNode(p)),
    lastScheduleTime,
    nextScheduleTime,
    selector,
    volumes,
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

  // Extract targetPort from the first port
  const firstPort = service.spec?.ports?.[0];
  let targetPort: string | undefined;
  if (firstPort?.targetPort) {
    if (typeof firstPort.targetPort === 'number') {
      targetPort = firstPort.targetPort.toString();
    } else {
      targetPort = firstPort.targetPort;
    }
  }

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

  // Extract selector
  const selector = service.spec?.selector
    ? Object.entries(service.spec.selector)
        .map(([k, v]) => `${k}=${v}`)
        .join(',')
    : undefined;

  return {
    name,
    type,
    clusterIP,
    ports,
    nodePort,
    targetPort,
    externalIp,
    externalIpPending,
    selector,
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

function buildPVCNode(
  pvc: import('@kubernetes/client-node').V1PersistentVolumeClaim,
  nsPods: import('@kubernetes/client-node').V1Pod[]
): PVCNode {
  const name = pvc.metadata?.name || 'unknown';
  const status = pvc.status?.phase || 'Unknown';
  const capacity = pvc.status?.capacity?.storage || '';
  const accessModes = pvc.spec?.accessModes?.join(',') || '';
  const storageClass = pvc.spec?.storageClassName;

  // Count pods using this PVC
  const podCount = nsPods.filter((pod) => {
    const volumes = pod.spec?.volumes || [];
    return volumes.some((vol) => vol.persistentVolumeClaim?.claimName === name);
  }).length;

  return {
    name,
    status,
    capacity,
    accessModes,
    storageClass,
    podCount,
  };
}

// Volume type icon mapping (exported for TreeView)
export const VOLUME_ICONS: Record<VolumeType, string> = {
  PersistentVolumeClaim: '📀',
  hostPath: '📁',
  emptyDir: '📦',
  ConfigMap: '⚙️',
  Secret: '🔑',
  NFS: '🌐',
  CSI: '💿',
  local: '📂',
  projected: '🧩',
  downwardAPI: '📉',
  serviceAccountToken: '🎫',
  ephemeral: '🗃️',
  image: '🖼',
  gitRepo: '📜',
};

// Volume type short codes (exported for TreeView)
export const VOLUME_TYPE_CODES: Record<VolumeType, string> = {
  PersistentVolumeClaim: 'PVC',
  hostPath: 'HP',
  emptyDir: 'ED',
  ConfigMap: 'CM',
  Secret: 'SEC',
  NFS: 'NFS',
  CSI: 'CSI',
  local: 'LOC',
  projected: 'PROJ',
  downwardAPI: 'DAPI',
  serviceAccountToken: 'SAT',
  ephemeral: 'EPH',
  image: 'IMG',
  gitRepo: 'GIT',
};

// Volume ordering according to vol.md
const VOLUME_ORDER: VolumeType[] = [
  'PersistentVolumeClaim',
  'hostPath',
  'emptyDir',
  'ConfigMap',
  'Secret',
  'projected',
  'NFS',
  'CSI',
  'local',
  'downwardAPI',
  'serviceAccountToken',
  'ephemeral',
  'image',
  'gitRepo',
];

function buildVolumeNode(
  volume: import('@kubernetes/client-node').V1Volume,
  configMaps: import('@kubernetes/client-node').V1ConfigMap[],
  secrets: import('@kubernetes/client-node').V1Secret[],
  pvcs: import('@kubernetes/client-node').V1PersistentVolumeClaim[]
): VolumeNode | null {
  const name = volume.name || 'unknown';
  let type: VolumeType | null = null;
  let info = '';

  if (volume.persistentVolumeClaim) {
    type = 'PersistentVolumeClaim';
    const claimName = volume.persistentVolumeClaim.claimName || '';
    info = `→ ${claimName}`;
    // Extract PVC metadata
    const pvc = pvcs.find((p) => p.metadata?.name === claimName);
    if (pvc) {
      const status = pvc.status?.phase || '';
      const capacity = pvc.status?.capacity?.storage || '';
      const accessModes = pvc.spec?.accessModes?.join(',') || '';
      const storageClass = pvc.spec?.storageClassName || '';
      return {
        name,
        type,
        info,
        pvcInfo: {
          status,
          capacity,
          accessModes,
          storageClass,
        },
      };
    }
  } else if (volume.hostPath) {
    type = 'hostPath';
    const path = volume.hostPath.path || '';
    const hostPathType = volume.hostPath.type;
    info = `→ ${path}`;
    if (hostPathType) {
      info += ` (${hostPathType})`;
    }
  } else if (volume.emptyDir) {
    type = 'emptyDir';
    const medium = volume.emptyDir.medium;
    const sizeLimit = volume.emptyDir.sizeLimit;
    if (medium === 'Memory') {
      info = '→ Memory';
    } else if (sizeLimit) {
      info = `→ tmpfs (${sizeLimit})`;
    } else {
      info = '→ tmpfs';
    }
  } else if (volume.configMap) {
    type = 'ConfigMap';
    const cmName = volume.configMap.name || '';
    const cm = configMaps.find((c) => c.metadata?.name === cmName);
    const keys = cm ? Object.keys(cm.data || {}).length : 0;
    info = `→ ${cmName} (${keys} keys)`;
  } else if (volume.secret) {
    type = 'Secret';
    const secretName = volume.secret.secretName || '';
    const secret = secrets.find((s) => s.metadata?.name === secretName);
    const keys = secret ? Object.keys(secret.data || {}).length : 0;
    info = `→ ${secretName} (${keys} keys)`;
  } else if (volume.nfs) {
    type = 'NFS';
    const server = volume.nfs.server || '';
    const path = volume.nfs.path || '';
    info = `→ ${server}:${path}`;
  } else if (volume.csi) {
    type = 'CSI';
    const driver = volume.csi.driver || '';
    info = `→ ${driver}`;
  } else if (volume.projected) {
    type = 'projected';
    const sources = volume.projected.sources || [];
    info = `→ ${sources.length} sources`;
  } else if (volume.downwardAPI) {
    type = 'downwardAPI';
    const items = volume.downwardAPI.items || [];
    const fields = items.map((item) => item.path).join(', ');
    info = fields ? `→ ${fields}` : '';
  } else if (volume.ephemeral) {
    type = 'ephemeral';
    const volumeClaimTemplate = volume.ephemeral.volumeClaimTemplate;
    if (volumeClaimTemplate?.spec?.resources?.requests?.storage) {
      info = `→ ${volumeClaimTemplate.spec.resources.requests.storage}`;
    } else {
      info = '→ ephemeral';
    }
  } else {
    // Handle volume types not in standard V1Volume type
    const vol = volume as unknown as Record<string, unknown>;
    if (vol.local) {
      type = 'local';
      const path = (vol.local as { path?: string })?.path || '';
      info = `→ ${path}`;
    } else if (vol.serviceAccountToken) {
      type = 'serviceAccountToken';
      const expirationSeconds = (vol.serviceAccountToken as { expirationSeconds?: number })
        ?.expirationSeconds;
      info = expirationSeconds ? `→ ${expirationSeconds}s` : '→ token';
    } else if (vol.image) {
      type = 'image';
      info = '→ image';
    } else if (vol.gitRepo) {
      type = 'gitRepo';
      const repository = (vol.gitRepo as { repository?: string })?.repository || '';
      info = `→ ${repository}`;
    }
  }

  if (!type) {
    return null; // Skip unsupported volume types
  }

  return {
    name,
    type,
    info,
  };
}

function buildVolumesFromPodSpec(
  podSpec: import('@kubernetes/client-node').V1PodSpec | undefined,
  configMaps: import('@kubernetes/client-node').V1ConfigMap[],
  secrets: import('@kubernetes/client-node').V1Secret[],
  pvcs: import('@kubernetes/client-node').V1PersistentVolumeClaim[]
): VolumeNode[] {
  if (!podSpec?.volumes || podSpec.volumes.length === 0) {
    return [];
  }

  // Build a map of volume name to mount paths from all containers
  const volumeMountPaths = new Map<string, string>();
  for (const container of podSpec.containers || []) {
    const mounts = container.volumeMounts || [];
    for (const mount of mounts) {
      if (mount.name && mount.mountPath) {
        volumeMountPaths.set(mount.name, mount.mountPath);
      }
    }
  }

  const volumes: VolumeNode[] = [];
  for (const volume of podSpec.volumes) {
    const volumeNode = buildVolumeNode(volume, configMaps, secrets, pvcs);
    if (volumeNode) {
      // Add mount path if available
      volumeNode.mountPath = volumeMountPaths.get(volume.name);
      volumes.push(volumeNode);
    }
  }

  // Sort volumes according to vol.md ordering
  volumes.sort((a, b) => {
    const orderA = VOLUME_ORDER.indexOf(a.type);
    const orderB = VOLUME_ORDER.indexOf(b.type);
    return orderA - orderB;
  });

  return volumes;
}
