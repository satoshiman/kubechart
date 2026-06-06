# Testing Guide for kubechart Phase 2

## Apply Test Resources

Apply all test resources to your cluster:

```bash
kubectl apply -f test-resources.yaml
```

## Test kubechart with different flags

### View test namespace only
```bash
npm start -- -n kubechart-test
```

### View all namespaces (including test)
```bash
npm start -- -A
```

### View with error filter (if you have failing pods)
```bash
npm start -- -n kubechart-test --show-errors
```

### View with label selector
```bash
npm start -- -n kubechart-test -l app=test-app
```

## Expected Resources in test namespace

After applying the test resources, you should see:

**Workloads:**
- Deployment: test-deployment (2 replicas)
- StatefulSet: test-statefulset (2 replicas)
- DaemonSet: test-daemonset (1 pod per node)
- Job: test-job (runs once)
- CronJob: test-cronjob (scheduled every 5 minutes)

**Services:**
- test-clusterip-svc (ClusterIP)
- test-nodeport-svc (NodePort on 30080)
- test-loadbalancer-svc (LoadBalancer - may show pending in minikube)

**Ingresses:**
- test-ingress (test.local, no TLS)
- test-ingress-tls (secure.local, with TLS indicator 🔒)

## Clean up test resources

```bash
kubectl delete namespace kubechart-test
```

## Test with different pod states

To test the pod status symbols (● ◌ ✖ ◑ ○):

1. **Running + Ready (●)**: Normal pods from deployments
2. **Running but not Ready (◑)**: Scale a deployment and watch pods starting
   ```bash
   kubectl scale deployment test-deployment -n kubechart-test --replicas=3
   ```
3. **Pending (◌)**: Create a pod with invalid image
   ```bash
   kubectl run pending-pod -n kubechart-test --image=invalid:latest
   ```
4. **Failed (✖)**: Create a pod that crashes
   ```bash
   kubectl run failed-pod -n kubechart-test --image=busybox --command -- sh -c "exit 1"
   ```
5. **Succeeded (○)**: Job pods after completion
   ```bash
   kubectl create job test-one-time -n kubechart-test --image=busybox -- sh -c "echo done"
   ```
