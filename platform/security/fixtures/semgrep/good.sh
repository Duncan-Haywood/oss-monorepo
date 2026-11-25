#!/bin/sh
curl -fsSL -o install.sh https://example.com/install.sh
echo "abc  install.sh" | sha256sum -c -
