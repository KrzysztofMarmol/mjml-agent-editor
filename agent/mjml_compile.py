"""Walidacja/kompilacja MJML przez CLI mjml (node, instalowane w web/).

Używamy mjml v4 (ta sama linia co kompilator w grapesjs-mjml), żeby podgląd
w edytorze i wynik kompilacji się nie rozjeżdżały.
"""

from __future__ import annotations

import os
import pathlib
import subprocess
import tempfile

_REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
MJML_BIN = os.environ.get("MJML_BIN", str(_REPO_ROOT / "web" / "node_modules" / ".bin" / "mjml"))


def compile_mjml(mjml: str, strict: bool = True) -> tuple[bool, str]:
    """Zwraca (ok, html_lub_błędy)."""
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
        # mjml-cli wypisuje błędy walidacji na stderr, ale kończy się kodem 0 —
        # traktujemy niepusty stderr jako niepowodzenie.
        errors = (proc.stderr or "").strip()
        if proc.returncode != 0 or errors:
            return False, errors or proc.stdout.strip()
        html = pathlib.Path(out).read_text()
        return True, html
    finally:
        os.unlink(src)
        if os.path.exists(out):
            os.unlink(out)
