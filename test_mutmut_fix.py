#!/usr/bin/env python
"""Test mutmut execution with the fix to verify it no longer crashes."""

import os
import sys
import tempfile
import json
from pathlib import Path

# Add backend to path so we can import executor
sys.path.insert(0, "agentqa/backend")

# Simple test repo structure
TEST_CODE = '''
def add(a, b):
    """Add two numbers."""
    return a + b

def subtract(a, b):
    """Subtract two numbers."""
    return a - b

def multiply(a, b):
    """Multiply two numbers."""
    return a * b
'''

TEST_PYTEST = '''
import pytest
from code import add, subtract, multiply

def test_add():
    assert add(2, 3) == 5
    assert add(0, 0) == 0
    assert add(-1, 1) == 0

def test_subtract():
    assert subtract(5, 3) == 2
    assert subtract(0, 0) == 0

def test_multiply():
    assert multiply(3, 4) == 12
    assert multiply(0, 5) == 0
'''

def setup_test_repo(tmpdir):
    """Create minimal test repository."""
    # Create main code file
    code_file = Path(tmpdir) / "code.py"
    code_file.write_text(TEST_CODE)
    
    # Create tests directory
    tests_dir = Path(tmpdir) / "_agentqa_tests"
    tests_dir.mkdir()
    
    # Create test file
    test_file = tests_dir / "test_code.py"
    test_file.write_text(TEST_PYTEST)
    
    # Create problematic "mutants" directory that used to cause crashes
    mutants_dir = Path(tmpdir) / "mutants"
    mutants_dir.mkdir()
    snippets_dir = mutants_dir / "snippets"
    snippets_dir.mkdir()
    
    # Write a problematic file that would trigger the error
    io_file = snippets_dir / "io.py"
    io_file.write_text("# Generated mutant file\ninvalid syntax here ))))")
    
    return tmpdir

def test_mutmut_execution():
    """Test that mutmut runs successfully with the fix."""
    with tempfile.TemporaryDirectory(prefix="mutmut_test_") as tmpdir:
        print(f"\n📁 Test repo created at: {tmpdir}")
        setup_test_repo(tmpdir)
        
        # Now test mutmut execution
        from agents.executor import _run_mutmut_score
        
        print("\n🔬 Running mutmut with the fix...")
        result = _run_mutmut_score(tmpdir, use_docker=False)
        
        print(f"\n✅ Mutation Score Result:")
        print(f"  - Score: {result['score_pct']}%")
        print(f"  - Killed: {result['killed']}/{result['total']}")
        print(f"  - Reason: {result['reason']}")
        
        # Check if it's working
        if result['score_pct'] > -1.0:
            print("\n🎉 SUCCESS: Mutation score calculated correctly!")
            print("   The InvalidGeneratedSyntaxException fix is working!")
            return True
        else:
            print("\n❌ FAILED: Mutation score is still -1.0")
            print(f"   Reason: {result['reason']}")
            if result.get('raw_output_excerpt'):
                print(f"   Output: {result['raw_output_excerpt'][:500]}")
            return False

if __name__ == "__main__":
    try:
        success = test_mutmut_execution()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
