import base64
import requests
import sys
from dotenv import load_dotenv
from utils.config import get_github_token
from utils.helpers import parse_github_url

load_dotenv()

_TOKEN = get_github_token()
_HEADERS = {"Authorization": f"token {_TOKEN}"} if _TOKEN else {}

# Paths to skip when collecting Python files
_SKIP_PREFIXES = ("test_", "tests/", "test/", ".tox/", ".venv/", "venv/", "docs/")
_SKIP_CONTAINS = ("__pycache__", "/.git/", "site-packages", "conftest.py")


def fetch_repo_structure(github_url: str) -> dict:
    """Fetch Python file structure and content from a GitHub repository."""
    repo_info = parse_github_url(github_url)
    if not repo_info:
        return {
            "error": "Invalid GitHub URL",
            "files": [],
            "owner": None,
            "repo":  None,
        }

    owner, repo = repo_info
    base = f"https://api.github.com/repos/{owner}/{repo}"

    repo_meta = _get(base)
    if not isinstance(repo_meta, dict) or repo_meta.get("message"):
        return {
            "error": repo_meta.get("message", "Unable to fetch repository metadata"),
            "files": [],
            "owner": owner,
            "repo":  repo,
        }

    default_branch = repo_meta.get("default_branch", "main")
    print(f"[GITHUB] Repo: {owner}/{repo}, branch: {default_branch}", file=sys.stderr)

    tree_resp = _get(f"{base}/git/trees/{default_branch}?recursive=1")
    if not isinstance(tree_resp, dict) or "tree" not in tree_resp:
        return {
            "error": "Could not fetch repository tree",
            "files": [],
            "owner": owner,
            "repo":  repo,
        }

    all_py = [
        item for item in tree_resp["tree"]
        if (
            item.get("type") == "blob"
            and item.get("path", "").endswith(".py")
            and item.get("size", 0) < 50_000           # skip files > 50 KB
            and not _should_skip(item.get("path", ""))
        )
    ]

    print(f"[GITHUB] Eligible .py files: {len(all_py)} (capped to 30)", file=sys.stderr)
    selected = all_py[:30]

    files_data = []
    for file_info in selected:
        content = _fetch_file_content(base, file_info["path"])
        if content:
            files_data.append({
                "path":    file_info["path"],
                "content": content,
            })

    print(f"[GITHUB] Successfully fetched {len(files_data)} files", file=sys.stderr)

    return {
        "owner":          owner,
        "repo":           repo,
        "default_branch": default_branch,
        "total_py_files": len(all_py),
        "files":          files_data,
    }


def _should_skip(path: str) -> bool:
    """Return True if the file path should be excluded from analysis."""
    lower = path.lower()
    filename = path.split("/")[-1]

    # Skip test files by filename prefix
    if filename.startswith("test_") or filename.startswith("tests"):
        return True

    # Skip paths containing skip marker substrings
    for marker in _SKIP_CONTAINS:
        if marker in lower:
            return True

    # Skip paths starting with skip prefixes
    for prefix in _SKIP_PREFIXES:
        if lower.startswith(prefix) or f"/{prefix}" in lower:
            return True

    return False


def _get(url: str) -> dict:
    """Make an HTTP GET request to GitHub API and parse JSON response."""
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=15)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return {"error": str(e)}


def _fetch_file_content(base_url: str, path: str) -> str:
    """Fetch and decode the content of a single file from the repository."""
    data = _get(f"{base_url}/contents/{path}")
    if isinstance(data, dict) and data.get("encoding") == "base64":
        try:
            return base64.b64decode(data["content"]).decode("utf-8", errors="replace")
        except Exception:
            return ""
    return ""
