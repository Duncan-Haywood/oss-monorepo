#!/usr/bin/env bash
set -euo pipefail

echo "===> Installing cert-manager in K3s..."
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.15.1/cert-manager.yaml

echo "===> Waiting for cert-manager pods to be ready..."
kubectl rollout status deployment/cert-manager -n cert-manager --timeout=90s
kubectl rollout status deployment/cert-manager-webhook -n cert-manager --timeout=90s

echo "===> Applying Let's Encrypt ClusterIssuers..."
kubectl apply -f platform/k8s/cluster-system/cert-manager.yaml

if kubectl get secret cluster-autoscaler-hetzner -n kube-system >/dev/null 2>&1; then
  echo "===> Installing Hetzner worker-node autoscaler (1-3 workers)..."
  kubectl apply -f platform/k8s/cluster-system/cluster-autoscaler.yaml
  kubectl rollout status deployment/cluster-autoscaler -n kube-system --timeout=120s
else
  echo "===> Skipping node autoscaler: kube-system/cluster-autoscaler-hetzner is not configured."
fi

echo "===> System components successfully installed!"
