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
    ├── argocd-apps/             # ArgoCD GitOps Application manifests
    │   ├── root-app-of-apps.yaml # Root GitOps App-of-Apps controller
    │   ├── marisstella-homepage.yaml
    │   ├── quick-pick-survey.yaml
    │   ├── ai-first-markets.yaml
    │   ├── ai-engineering-academy.yaml
    │   ├── local-site-studio.yaml
    │   ├── real-estate-photo-app.yaml
    │   ├── retail-pilot-intel.yaml
    │   └── print-atelier.yaml
    └── apps/                     # Declarative Kustomize manifests for business sites
        ├── marisstella-homepage/
        ├── quick-pick-survey/
        ├── ai-first-markets/
        ├── ai-engineering-academy/
        ├── local-site-studio/
        ├── real-estate-photo-app/
        ├── retail-pilot-intel/
        ├── print-atelier/
        └── service-template/
```

## ArgoCD GitOps Architecture & Security

Applications are deployed continuously via **ArgoCD GitOps** using the App-of-Apps pattern (`platform/k8s/argocd-apps/root-app-of-apps.yaml`).

### Security Controls & Exposure Management
1. **Control Plane Isolation**: ArgoCD (`argocd.marisstella.dev`) is protected via Traefik `monitoring-admin-auth` middleware and TLS. Public unauthenticated access is strictly blocked.
2. **Internal Service Protection**: Internal services such as `pairwise-db` run on private `ClusterIP` networks with no public Ingress endpoint exposed.
3. **Secrets Injection**: Application credentials and connection strings are injected via Kubernetes `Secret` resources (`secretKeyRef`) rather than committed plain text.
4. **Ingress Security**: All public venture Ingresses enforce `kube-system-security-headers` middleware (HSTS, frame-deny, content type nosniff, XSS protection) and Let's Encrypt production SSL certificates.

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
