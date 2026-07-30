"""MJML validation and compilation via the mjml v4 CLI.

Why a Node binary and not a Python library
------------------------------------------
The obvious simplification is `mjml-python` (bindings to MRML, a Rust port of MJML),
which would drop the Node requirement entirely. It cannot be used here: MRML performs
no validation at all. Measured against 1.4.1, it accepts an unknown element
(`<mj-bogus/>`) and an illegal attribute (`text-align` on `mj-text`) — both of which
mjml v4 rejects in strict mode — and its API exposes no validation level to turn on.

That matters because the contract's first behavioural rule is that a document which
does not compile is never persisted. With MRML the guard would pass everything
silently and the agent would save markup that renders wrong. mjml v4 is also what
`grapesjs-mjml` runs in the browser, so using it keeps the editor's preview and the
backend's verdict aligned.

The spike's real bug was not the CLI, it was hardcoding
`<repo>/web/node_modules/.bin/mjml` — a path from this service into the frontend's
install tree, which is why the agent only ran on a machine that also had the web app
installed. Resolution is now explicit.
"""

from __future__ import annotations

import os
import pathlib
import shutil
import subprocess
import tempfile

_TIMEOUT_SECONDS = 30


class MjmlBinaryNotFound(RuntimeError):
    """Raised at startup rather than on the first agent turn."""


def resolve_mjml_binary() -> str:
    """Locates the mjml CLI: MJML_BIN if set, otherwise the first one on PATH."""
    configured = os.environ.get("MJML_BIN")
    if configured:
        if not pathlib.Path(configured).exists():
            raise MjmlBinaryNotFound(f"MJML_BIN points at {configured!r}, which does not exist")
        return configured

    found = shutil.which("mjml")
    if found:
        return found

    raise MjmlBinaryNotFound(
        "the mjml CLI was not found. Install it (`npm install -g mjml`) or set MJML_BIN "
        "to its path. This backend needs mjml v4 because it is the only implementation "
        "that validates, and it is what the editor renders with."
    )


def _without_host_paths(message: str, *paths: str) -> str:
    """Strips filesystem paths the CLI echoes back.

    mjml reports errors as "Line 1 of <path> (mj-text) — ...". The path is a temp file
    here, but the message reaches the model's context and the chat panel, so neither the
    temp directory nor the working directory should travel with it.
    """
    cleaned = message
    for path in (*paths, os.getcwd()):
        if path:
            cleaned = cleaned.replace(path, "document")
    return cleaned


def compile_mjml(mjml: str, strict: bool = True, binary: str | None = None) -> tuple[bool, str]:
    """Returns (True, html) on success or (False, errors) on failure."""
    mjml_bin = binary or resolve_mjml_binary()

    with tempfile.NamedTemporaryFile("w", suffix=".mjml", delete=False) as handle:
        handle.write(mjml)
        source = handle.name
    output = source + ".html"

    try:
        result = subprocess.run(
            [mjml_bin, source, "-o", output, "-l", "strict" if strict else "soft"],
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_SECONDS,
        )
        # mjml-cli writes validation errors to stderr but still exits 0, so a non-empty
        # stderr is the only reliable failure signal.
        errors = (result.stderr or "").strip()
        if result.returncode != 0 or errors:
            detail = errors or (result.stdout or "").strip()
            return False, _without_host_paths(detail, source, output)
        return True, pathlib.Path(output).read_text()
    except subprocess.TimeoutExpired:
        return False, f"ERROR: mjml did not finish within {_TIMEOUT_SECONDS}s"
    finally:
        pathlib.Path(source).unlink(missing_ok=True)
        pathlib.Path(output).unlink(missing_ok=True)
