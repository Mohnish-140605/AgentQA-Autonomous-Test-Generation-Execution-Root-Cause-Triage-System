# Code Analyst Agent: Extract functions and classes from Python files

from utils.helpers import extract_functions, extract_classes


def run_code_analyst(state: dict) -> dict:
    # Parse repository files and extract code structures
    repo_data = state.get("repo_data", {})
    files = repo_data.get("files", [])

    analysis = {
        "repo": f"{repo_data.get('owner', '?')}/{repo_data.get('repo', '?')}",
        "python_files_analyzed": len(files),
        "total_py_files": repo_data.get("total_py_files", len(files)),
        "modules": [],
    }

    for f in files:
        path = f.get("path", "")
        content = f.get("content", "")
        
        if not content.strip():
            continue

        funcs = extract_functions(content)
        classes = extract_classes(content)
        
        analysis["modules"].append({
            "path": path,
            "functions": funcs,
            "classes": classes,
            "loc": len(content.splitlines()),
        })

    return {**state, "analysis": analysis}
