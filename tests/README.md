# Test Suite

The `tests/` directory verifies Engine rules, JSON Schema contracts, append-only event replay, offline command boundaries, Stage card bundles, Captain permissions and Expedition completion.

Run locally:

    python -m pip install -r requirements-dev.txt
    python scripts/validate_repository.py .
    pytest -q

A failing test indicates drift between ADR, schema, Engine YAML, Stage/Card configuration, examples or generated interface contracts.
