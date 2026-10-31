"""The same cases as agent-core's links.test.ts, so the two backends refuse the same links."""

from links import added_unsafe_links, is_safe_link, unsafe_links

SCHEMES = ("http", "https", "mailto", "tel", "sms")


def email(column: str) -> str:
    return (
        "<mjml><mj-body><mj-section css-class='sec-a'><mj-column>"
        f"{column}</mj-column></mj-section></mj-body></mjml>"
    )


def test_safe_links() -> None:
    for link in ["https://a.com", "mailto:a@b.c", "tel:+48123", "/x", "{{url}}", "#top", ""]:
        assert is_safe_link(link, SCHEMES), link


def test_scripts_however_a_browser_reads_them() -> None:
    for link in ["javascript:alert(1)", " java\tscript:x", "&#106;avascript:x", "vbscript:x"]:
        assert not is_safe_link(link, SCHEMES), link


def test_found_on_elements_and_inside_a_texts_html() -> None:
    mjml = email(
        "<mj-button href='javascript:a()'>Go</mj-button>"
        '<mj-text><a href="data:text/html,x">x</a><a/href=vbscript:y>y</a></mj-text>'
        '<mj-image src="https://a.com/i.png" href="https://a.com"></mj-image>'
    )
    assert unsafe_links(mjml, SCHEMES) == ["javascript:a()", "data:text/html,x", "vbscript:y"]


def test_navbar_base_url_joined_to_each_link() -> None:
    mjml = email(
        '<mj-navbar base-url="javascript">'
        '<mj-navbar-link href=":alert(1)">A</mj-navbar-link></mj-navbar>'
    )
    assert unsafe_links(mjml, SCHEMES) == ["javascript:alert(1)"]


def test_comments_and_prose_are_not_links() -> None:
    mjml = email('<!-- <a href="javascript:x"> --><mj-text>Never write href=javascript:x</mj-text>')
    assert unsafe_links(mjml, SCHEMES) == []


def test_only_added_links_are_refused() -> None:
    before = email('<mj-button href="javascript:old()">Old</mj-button>')
    assert added_unsafe_links(before, before.replace("Old", "Older"), SCHEMES) == []
    after = before.replace(
        "</mj-column>", '<mj-button href="javascript:old()">Two</mj-button></mj-column>'
    )
    assert added_unsafe_links(before, after, SCHEMES) == ["javascript:old()"]
