# Hetzner Kubernetes Cluster (IaC)

This directory contains the Infrastructure-as-Code (IaC) configuration and declarative Kubernetes manifests for hosting 8+ web applications on the Hetzner K3s cluster (`89.167.29.39`).

## Directory Structure

```text
platform/
├── infrastructure/
│   ├── cluster-config.yaml       # Cluster spec & Hetzner server configuration
│   └── setup-cluster.sh          # Cluster installation and kubeconfig bootstrap script
└── k8s/
    ├── cluster-system/
    │   ├── cluster-autoscaler.yaml # Hetzner worker pool autoscaler (1-3 nodes)
    │   ├── cert-manager.yaml     # Let's Encrypt SSL/TLS ClusterIssuers
    │   └── install-system.sh     # System dependencies installer
    └── apps/
        └── service-template/     # Kustomize blueprint for deploying web services
            ├── deployment.yaml
            ├── service.yaml
            ├── ingress.yaml
            └── kustomization.yaml
```

## Quick Start: Deploying a New Service

To deploy one of your 8+ web services to the Hetzner cluster:

1. Copy the blueprint template:
   ```bash
   cp -r platform/k8s/apps/service-template platform/k8s/apps/my-new-service
   ```
2. Edit `deployment.yaml` (set docker image and resources) and `ingress.yaml` (set domain name).
3. Apply declaratively using `kubectl`:
   ```bash
   kubectl apply -k platform/k8s/apps/my-new-service
   ```
4. Verify deployment:
   ```bash
   kubectl get pods -l app=my-new-service
   ```

## Worker-node horizontal scaling

The cluster system includes Kubernetes Cluster Autoscaler using the Hetzner
provider. It maintains at least one `CPX22` worker in Helsinki and can grow the
pool to three workers when pods cannot be scheduled from their declared
resource requests. Scale-down waits 20 minutes to avoid node churn.

The autoscaler is installed only after the `cluster-autoscaler-hetzner` Secret
exists in `kube-system`. The Secret must contain:

- `HCLOUD_TOKEN`: a Hetzner project token
- `HCLOUD_CLOUD_INIT`: base64-encoded cloud-init that joins a K3s agent
- `HCLOUD_FIREWALL`: the cluster firewall name
- `HCLOUD_NETWORK`: the private cluster network name (recommended)

Start from
`cluster-system/cluster-autoscaler-cloud-init.example.yaml`, substitute
`K3S_URL` and `K3S_TOKEN` locally, and do not commit the rendered file. Apply
the Secret out of band, then run `cluster-system/install-system.sh`.

New workers need private node-to-node connectivity for the K3s overlay network.
Do not expose Flannel's VXLAN port 8472 publicly. Confirm the private network
and firewall routing before enabling the autoscaler.

This scales worker capacity only. The K3s control plane and the current
node-local PostgreSQL volume are still single-node failure domains.
