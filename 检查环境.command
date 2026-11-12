#!/bin/bash
source "$(dirname "$0")/scripts/mac-common.sh"
require_python
"$PYTHON_EXE" server/launcher.py check
"$PYTHON_EXE" server/launcher.py status || true
finish
