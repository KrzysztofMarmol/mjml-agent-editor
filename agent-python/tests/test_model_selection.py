"""Backend selection in `email_agent.get_model()`.

The demo needs a cheap or free model, so this resolution is the difference between a
showcase that costs nothing and one that bills per visitor. Every branch is exercised
here because a misresolved backend fails at the provider with an opaque 404 rather than
anywhere near the code that chose it.
"""

from __future__ import annotations

import ai
import pytest

import email_agent

_ENV = (
    "AGENT_PROVIDER",
    "AGENT_MODEL",
    "AGENT_BASE_URL",
    "AGENT_API_KEY",
    "DEEPSEEK_API_KEY",
    "GEMINI_API_KEY",
)


@pytest.fixture(autouse=True)
def clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """The developer's own .env is loaded by `main`, so start from a known state."""
    for name in _ENV:
        monkeypatch.delenv(name, raising=False)


def test_defaults_to_anthropic(monkeypatch: pytest.MonkeyPatch) -> None:
    assert email_agent.get_model().id == email_agent.DEFAULT_MODEL.split(":", 1)[1]


def test_anthropic_honours_agent_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENT_MODEL", "anthropic:claude-sonnet-5")
    assert email_agent.get_model().id == "claude-sonnet-5"


def test_deepseek_preset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENT_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")

    model = email_agent.get_model()

    assert model.id == "deepseek-chat"
    assert model.provider.base_url == "https://api.deepseek.com"


def test_gemini_preset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENT_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    assert email_agent.get_model().id == "gemini-2.5-flash"


def test_leftover_provider_prefix_falls_back_to_the_preset_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Switching AGENT_PROVIDER without clearing AGENT_MODEL must not send
    "anthropic:claude-haiku-4-5" to DeepSeek."""
    monkeypatch.setenv("AGENT_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setenv("AGENT_MODEL", "anthropic:claude-haiku-4-5")

    assert email_agent.get_model().id == "deepseek-chat"


def test_a_colon_inside_a_namespaced_id_is_not_a_provider_prefix(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """OpenRouter's free tier is spelled "vendor/model:free". Stripping every id with a
    colon would silently swap it for the preset default."""
    monkeypatch.setenv("AGENT_PROVIDER", "openrouter")
    monkeypatch.setenv("AGENT_BASE_URL", "https://openrouter.ai/api/v1")
    monkeypatch.setenv("AGENT_MODEL", "deepseek/deepseek-r1:free")
    monkeypatch.setenv("AGENT_API_KEY", "test-key")

    assert email_agent.get_model().id == "deepseek/deepseek-r1:free"


def test_custom_backend_needs_full_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENT_PROVIDER", "custom")

    with pytest.raises(ai.ConfigurationError) as excinfo:
        email_agent.get_model()

    message = str(excinfo.value)
    assert "AGENT_BASE_URL" in message
    assert "AGENT_MODEL" in message
    assert "an API key" in message


def test_custom_backend_resolves_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENT_PROVIDER", "openrouter")
    monkeypatch.setenv("AGENT_BASE_URL", "https://openrouter.ai/api/v1")
    monkeypatch.setenv("AGENT_MODEL", "qwen/qwen3-coder")
    monkeypatch.setenv("AGENT_API_KEY", "test-key")

    model = email_agent.get_model()

    assert model.id == "qwen/qwen3-coder"
    assert model.provider.base_url == "https://openrouter.ai/api/v1"
