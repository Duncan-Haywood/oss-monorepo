#!/usr/bin/env bash
# One-time Argo CD install on the k3s server, then the root Application.
# After this script, cluster desired state comes from gitops/ via Argo.
set -euo pipefail

ARGOCD_VERSION="${ARGOCD_VERSION:-v3.5.1}"
KUBECONFIG="${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}"
export KUBECONFIG

ROOT_APP="$(dirname "$(readlink -f "$0")")/root-application.yaml"

# Guards on $KUBECONFIG, not on the literal k3s path it defaults to. The two
# were inconsistent: the script would honour a KUBECONFIG pointing anywhere
# else and then still refuse unless /etc/rancher/k3s/k3s.yaml happened to
# exist, which also made this script impossible to exercise off a k3s node.
if [[ ! -f "$KUBECONFIG" ]]; then
  echo "kubeconfig missing at ${KUBECONFIG} — run install-k3s-server.sh first" >&2
  exit 1
fi

kubectl get ns argocd >/dev/null 2>&1 || kubectl create namespace argocd

kubectl apply -n argocd --server-side --force-conflicts \
  -f "https://raw.githubusercontent.com/argoproj/argo-cd/${ARGOCD_VERSION}/manifests/install.yaml"

kubectl -n argocd rollout status deploy/argocd-server --timeout=300s

# The repository this cluster's entire desired state comes from is PRIVATE, and
# Argo CD cannot clone it anonymously. Until 2026-09-05 that fact lived in one
# advisory line at the end of this script ("If the GitOps repo is private,
# create a read-only repo Secret in argocd now"), which is not a thing that
# runs. The failure it invites is the quiet kind: Argo installs, the root
# Application applies, every sync fails on repository authentication, and the
# operator sees a clean bootstrap with a site that serves nothing. Nothing
# downstream would have said why -- the child Applications in gitops/apps all
# source from the same private URL, so none of them syncs either.
#
# It cannot come from GitOps itself: sealed-secrets is deployed *by* Argo from
# gitops/apps, so a sealed credential could not be decrypted until after the
# sync it is required to perform. This is the second snowflake, for the same
# reason root-application.yaml is the first.
ARGOCD_REPO_URL="${ARGOCD_REPO_URL:-$(
  grep -m1 'repoURL:' "$ROOT_APP" | sed 's/.*repoURL:[[:space:]]*//'
)}"
# GitHub ignores the username on a PAT; any non-empty value authenticates.
ARGOCD_REPO_USERNAME="${ARGOCD_REPO_USERNAME:-x-access-token}"

# restore-cluster.sh hands the token over as a mode-600 file rather than an
# environment assignment in the remote command string, which would be readable
# in the control-plane's process list for the length of the install.
if [[ -n "${ARGOCD_REPO_TOKEN_FILE:-}" && -r "${ARGOCD_REPO_TOKEN_FILE}" ]]; then
  ARGOCD_REPO_TOKEN="$(cat "${ARGOCD_REPO_TOKEN_FILE}")"
fi

if [[ -n "${ARGOCD_REPO_TOKEN:-}" ]]; then
  echo "configuring the Argo CD repository credential for ${ARGOCD_REPO_URL}"
  # Piped rather than `--from-literal`, which would put the token in argv where
  # any local user could read it with ps.
  kubectl apply -f - <<YAML
apiVersion: v1
kind: Secret
metadata:
  name: repo-gitops
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
stringData:
  type: git
  url: ${ARGOCD_REPO_URL}
  username: ${ARGOCD_REPO_USERNAME}
  password: ${ARGOCD_REPO_TOKEN}
YAML
elif kubectl -n argocd get secret \
  -l argocd.argoproj.io/secret-type=repository -o name 2>/dev/null | grep -q .; then
  echo "an Argo CD repository credential already exists; leaving it alone."
else
  echo
  echo "WARNING: no Argo CD repository credential, and ${ARGOCD_REPO_URL} is private." >&2
  echo "Argo will apply the root Application and then fail every sync on" >&2
  echo "repository authentication. Nothing will be deployed and the site will" >&2
  echo "stay dark, with no error anywhere except Argo's own Application status." >&2
  echo >&2
  echo "Re-run with ARGOCD_REPO_TOKEN set to a token with Contents: Read, or" >&2
  echo "add the credential now:" >&2
  echo "  kubectl -n argocd create secret generic repo-gitops \\" >&2
  echo "    --from-literal=type=git --from-literal=url=${ARGOCD_REPO_URL} \\" >&2
  echo "    --from-literal=username=x-access-token --from-literal=password=<token>" >&2
  echo "  kubectl -n argocd label secret repo-gitops argocd.argoproj.io/secret-type=repository" >&2
  echo >&2
fi

kubectl apply -f "$ROOT_APP"

echo
echo "Argo CD is installed and the root Application is applied."

# Printing the initial admin password unconditionally was safe while this
# script only ever ran from a laptop over an interactive SSH session, which is
# what its header still assumes. `restore-cluster.sh` can now run it from a
# GitHub Actions runner, and there the same `echo` writes a live cluster-admin
# credential into a workflow log that every repository collaborator can read
# and that outlives the session. Retrieval is one kubectl away for anyone who
# genuinely has the cluster, so the default is now to say where it lives rather
# than to print it.
if [[ "${PRINT_ADMIN_PASSWORD:-0}" == "1" ]]; then
  echo "Initial admin password:"
  kubectl -n argocd get secret argocd-initial-admin-secret \
    -o jsonpath='{.data.password}' | base64 -d
  echo
else
  echo "Initial admin password (not printed — read it on the box with):"
  echo "  kubectl -n argocd get secret argocd-initial-admin-secret \\"
  echo "    -o jsonpath='{.data.password}' | base64 -d"
fi
echo
echo "Do not expose this UI on :80/:443. Use: kubectl -n argocd port-forward svc/argocd-server 8080:443"
echo "Then merge GitOps PRs. Do not kubectl apply platform/prod/agents by hand."
