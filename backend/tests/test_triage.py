from agents.triage import run_triage


def test_run_triage_passed():
    state = {
        "results": [
            {"function": "sum_values", "passed": True, "failed": False, "output": ""}
        ]
    }

    result = run_triage(state)

    assert len(result["results"]) == 1
    assert result["results"][0]["triage"].startswith("All tests for `sum_values` passed")
    assert result["results"][0]["triage_meta"]["code"] == "passed"


def test_run_triage_import_error():
    state = {
        "results": [
            {
                "function": "load_config",
                "passed": False,
                "failed": True,
                "errors": 1,
                "output": "ModuleNotFoundError: No module named 'config'"
            }
        ]
    }

    result = run_triage(state)

    assert result["results"][0]["triage_meta"]["code"] == "import_error"
    triage_text = result["results"][0]["triage"].lower()
    assert "import" in triage_text
    assert "module" in triage_text
