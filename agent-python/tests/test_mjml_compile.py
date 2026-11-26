"""compile_mjml refuses <mj-include>, which mjml would resolve by reading the server's disk."""

from __future__ import annotations

import stat
import tempfile

import pytest

import mjml_compile

BODY = "<mjml><mj-body><mj-section><mj-column>{}</mj-column></mj-section></mj-body></mjml>"


def test_refuses_include_without_writing_or_running_anything(monkeypatch) -> None:
    def no_disk(*args, **kwargs):
        raise AssertionError("touched the disk")

    monkeypatch.setattr(tempfile, "NamedTemporaryFile", no_disk)
    monkeypatch.setattr(mjml_compile.subprocess, "run", no_disk)

    for tag in ('<mj-include path="/etc/passwd" />', '<MJ-Include path="/etc/passwd" />'):
        ok, errors = mjml_compile.compile_mjml(BODY.format(tag), binary="/nonexistent/mjml")
        assert not ok
        assert "cannot be used" in errors


@pytest.fixture
def echo_binary(tmp_path) -> str:
    """Stands in for the mjml CLI (`mjml <source> -o <output> ...`) by copying the source."""
    script = tmp_path / "mjml"
    script.write_text('#!/bin/sh\ncp "$1" "$3"\n')
    script.chmod(script.stat().st_mode | stat.S_IXUSR)
    return str(script)


def test_compiles_a_mention_in_an_html_comment(echo_binary) -> None:
    source = BODY.format("<!-- TODO: Replace <mj-include> in docs --><mj-text>Hi</mj-text>")
    ok, html = mjml_compile.compile_mjml(source, binary=echo_binary)
    assert ok
    assert html == source


def test_tells_mjml_to_ignore_includes_the_pattern_misses(monkeypatch, echo_binary) -> None:
    calls = []
    real_run = mjml_compile.subprocess.run

    def recording_run(args, **kwargs):
        calls.append(args)
        return real_run(args, **kwargs)

    monkeypatch.setattr(mjml_compile.subprocess, "run", recording_run)
    mjml_compile.compile_mjml(BODY.format("<mj-text>Hi</mj-text>"), binary=echo_binary)
    assert "--config.ignoreIncludes=true" in calls[0]


def test_compiles_escaped_mention_of_the_tag(echo_binary) -> None:
    source = BODY.format("<mj-text>&lt;mj-include path=&quot;x&quot;</mj-text>")
    ok, html = mjml_compile.compile_mjml(source, binary=echo_binary)
    assert ok
    assert html == source
