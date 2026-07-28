.PHONY: collections check lint test bootstrap provision

collections:
	ansible-galaxy collection install -r requirements.yml

check: collections
	ansible-playbook playbook.yml --syntax-check

lint: collections
	ansible-lint

# Unit tests for agent_runner.py's pure logic (model-tier selection,
# self-directed cooldown, docker command construction, etc) — see
# tests/. Needs: pip install -r tests/requirements.txt
test:
	pytest tests/ -v

# First run against a freshly installed box, reachable only over LAN.
# Usage: make bootstrap IP=192.168.1.42 [AUTHKEY=tskey-auth-xxxx]
bootstrap: collections
	./bootstrap.sh "$(IP)" "$(AUTHKEY)"

# Subsequent runs, once inventory.ini points at the box's Tailscale address.
provision: collections
	ansible-playbook playbook.yml --ask-become-pass
