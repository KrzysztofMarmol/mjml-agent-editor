"""MJML validation/compilation via the mjml CLI (node, installed in web/).

We use mjml v4 (the same line as the compiler in grapesjs-mjml) so the editor
preview and the compilation output don't drift apart.
"""

from __future__ import annotations

import os
import pathlib
import subprocess
import tempfile

_REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
MJML_BIN = os.environ.get("MJML_BIN", str(_REPO_ROOT / "web" / "node_modules" / ".bin" / "mjml"))


def compile_mjml(mjml: str, strict: bool = True) -> tuple[bool, str]:
    """Returns (ok, html_or_errors)."""
    with tempfile.NamedTemporaryFile("w", suffix=".mjml", delete=False) as f:
        f.write(mjml)
        src = f.name
    out = src + ".html"
    try:
        proc = subprocess.run(
            [MJML_BIN, src, "-o", out, "-l", "strict" if strict else "soft"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        # mjml-cli prints validation errors to stderr but exits with code 0 —
        # treat non-empty stderr as failure.
        errors = (proc.stderr or "").strip()
        if proc.returncode != 0 or errors:
            return False, errors or proc.stdout.strip()
        html = pathlib.Path(out).read_text()
        return True, html
    finally:
        os.unlink(src)
        if os.path.exists(out):
            os.unlink(out)
