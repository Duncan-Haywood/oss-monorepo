"""
Tests for mat-470-real-analysis structure and course materials.
"""

from pathlib import Path

VENTURE_DIR = Path(__file__).resolve().parent.parent

def test_venture_structure():
    assert (VENTURE_DIR / "VENTURE.yaml").exists()
    assert (VENTURE_DIR / "README.md").exists()
    assert (VENTURE_DIR / "textbooks").is_dir()

def test_readme_references_textbook():
    readme_content = (VENTURE_DIR / "README.md").read_text(encoding="utf-8")
    assert "Understanding Analysis" in readme_content
