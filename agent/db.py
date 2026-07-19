"""Supabase client (service role) + operations on documents and comments."""

from __future__ import annotations

import datetime
import os

import supabase

_client: supabase.Client | None = None


def client() -> supabase.Client:
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        _client = supabase.create_client(url, key)
    return _client


def _now() -> str:
    return datetime.datetime.now(datetime.UTC).isoformat()


def get_document_mjml(doc_id: str) -> str:
    res = client().table("documents").select("mjml").eq("id", doc_id).single().execute()
    return res.data["mjml"]


def set_document_mjml(doc_id: str, mjml: str) -> None:
    client().table("documents").update({"mjml": mjml, "updated_at": _now()}).eq("id", doc_id).execute()


def list_open_comments(doc_id: str) -> list[dict]:
    res = (
        client()
        .table("comments")
        .select("id, section_id, object_id, object_label, body, created_at")
        .eq("document_id", doc_id)
        .eq("status", "open")
        .order("created_at")
        .execute()
    )
    return res.data


def resolve_comment(comment_id: str) -> None:
    client().table("comments").update({"status": "resolved", "resolved_at": _now()}).eq("id", comment_id).execute()


def upload_image(name: str, data: bytes, content_type: str = "image/png") -> str:
    storage = client().storage.from_("email-images")
    storage.upload(name, data, {"content-type": content_type})
    return storage.get_public_url(name)
