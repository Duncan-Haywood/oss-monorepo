.PHONY: init fmt validate plan apply discover import-servers check

init:
	tofu init

fmt:
	tofu fmt -recursive

validate: init
	tofu validate

plan: validate
	tofu plan

apply:
	@echo "Refusing to apply from make without an explicit laptop confirmation."
	@echo "Write HCLOUD_TOKEN stays on the laptop. Hetzner has no euro spend cap."
	@echo "From a machine you control:"
	@echo "  tofu plan    # must not replace 163417666 or 163580094"
	@echo "  tofu apply"

discover:
	./scripts/discover.sh

import-servers:
	tofu import hcloud_server.control_plane 163417666
	tofu import hcloud_server.agent 163580094

check:
	python3 tests/test_infra_layout.py
	python3 -m unittest tests.test_hcloud_scope
