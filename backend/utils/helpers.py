# Utility helper functions for code analysis and parsing
import ast
import json
import re
import uuid
from typing import Any


def extract_functions(source_code: str) -> list[dict]:
    # Parses Python source code and extracts all function definitions
    results = []
    
    try:
        # Parse source code into AST (Abstract Syntax Tree)
        tree = ast.parse(source_code)
    except SyntaxError:
        # If code has syntax errors, can't parse - return empty list
        return results

    # Walk through all nodes in the AST
    for node in ast.walk(tree):
        # Check for function/async function definitions
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            # Extract parameter names
            args = [a.arg for a in node.args.args]
            
            # Extract docstring (if present)
            docstring = ast.get_docstring(node) or ""
            
            # Store function metadata
            results.append({
                "name": node.name,
                "args": args,
                "lineno": node.lineno,
                "docstring": docstring[:120],  # Truncate long docstrings
            })
    
    return results


def extract_classes(source_code: str) -> list[dict]:
    # Parses Python source code and extracts all class definitions
    results = []
    
    try:
        tree = ast.parse(source_code)
    except SyntaxError:
        # If code has syntax errors, can't parse - return empty list
        return results

    # Walk through all nodes in the AST
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            # Find all methods in the class
            # Walk through the class node's children to find function definitions
            methods = [
                n.name for n in ast.walk(node)
                if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
            ]
            
            # Store class metadata
            results.append({
                "name": node.name,
                "methods": methods,
                "lineno": node.lineno,
            })
    
    return results



def parse_github_url(url: str) -> tuple[str, str] | None:
    # Extracts GitHub owner and repository name from a GitHub URL
    pattern = r"github\.com[/:]([^/]+)/([^/.\s]+)"
    
    match = re.search(pattern, url)
    if match:
        owner = match.group(1)
        repo = match.group(2).removesuffix(".git")
        return owner, repo
    
    return None

def emit_pipeline_log(state: dict, message: str, level: str = "system", step: str | None = None, depth: int = 0) -> None:
    """Send a log entry to the shared pipeline event queue."""
    q = state.get("_event_queue")
    if not q or not hasattr(q, "put"):
        return

    q.put({
        "type": "log",
        "data": {
            "id": str(uuid.uuid4()),
            "type": level,
            "msg": message,
            "step": step,
            "depth": depth,
        },
    })

def safe_json(obj) -> str:
    # Converts any object to JSON with fallback for non-serializable types
    return json.dumps(obj, indent=2, default=str)
