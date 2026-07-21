#!/usr/bin/env python3
from pathlib import Path

path = Path("frontend/scripts/validate-sources.py")
text = path.read_text(encoding="utf-8")
replacements = {
    "if len(command_catalog) != 36:\n        errors.append(f\"expected 36 commands, found {len(command_catalog)}\")":
        "if len(command_catalog) != 39:\n        errors.append(f\"expected 39 commands, found {len(command_catalog)}\")",
    "if len(event_catalog) != 48:\n        errors.append(f\"expected 48 events, found {len(event_catalog)}\")":
        "if len(event_catalog) != 52:\n        errors.append(f\"expected 52 events, found {len(event_catalog)}\")",
}
for old, new in replacements.items():
    if text.count(old) != 1:
        raise SystemExit(f"expected one frontend validator match, found {text.count(old)}")
    text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")
