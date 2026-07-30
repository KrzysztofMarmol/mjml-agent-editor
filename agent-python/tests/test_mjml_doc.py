"""Addressing tests mirroring packages/agent-core/src/mjml-document.test.ts.

The two implementations must agree on these or the conformance suite proves nothing.
Cases marked below are the ones the original regex parser got wrong.
"""

from __future__ import annotations

import pytest

import mjml_doc

DOC = """<mjml>
  <mj-body>
    <mj-section css-class="sec-aaa" background-color="#ffffff">
      <mj-column><mj-text>Welcome aboard</mj-text></mj-column>
    </mj-section>
    <mj-section css-class='hero sec-bbb'>
      <mj-column><mj-button>Buy now</mj-button></mj-column>
    </mj-section>
  </mj-body>
</mjml>"""


def ids(mjml: str) -> list[str | None]:
    return [span.id for span in mjml_doc.scan_sections(mjml)]


class TestScanSections:
    def test_reads_ids_from_both_quote_styles(self) -> None:
        assert ids(DOC) == ["aaa", "bbb"]

    def test_reports_none_for_a_section_without_an_id(self) -> None:
        spans = mjml_doc.scan_sections(
            "<mjml><mj-body><mj-section><mj-column /></mj-section></mj-body></mjml>"
        )
        assert len(spans) == 1
        assert spans[0].id is None

    def test_does_not_end_the_tag_at_a_gt_inside_an_attribute(self) -> None:
        # Regression: `[^>]*>` ended the opening tag inside alt="Save > 50%".
        mjml = (
            '<mjml><mj-body><mj-section css-class="sec-aaa"><mj-column>'
            '<mj-image alt="Save > 50%" src="x.png" /></mj-column></mj-section></mj-body></mjml>'
        )
        spans = mjml_doc.scan_sections(mjml)
        assert len(spans) == 1
        assert mjml[spans[0].start : spans[0].end].endswith("</mj-section>")
        assert mjml_doc.list_sections(mjml)[0]["preview"] == ""

    def test_folds_a_nested_section_into_its_parent(self) -> None:
        # Regression: find("</mj-section>") took the inner close, producing overlap.
        mjml = (
            '<mjml><mj-body><mj-section css-class="sec-outer">'
            '<mj-section css-class="sec-inner"></mj-section>'
            "</mj-section></mj-body></mjml>"
        )
        spans = mjml_doc.scan_sections(mjml)
        assert len(spans) == 1
        assert spans[0].id == "outer"
        assert "sec-inner" in mjml_doc.get_section(mjml, "outer")

    def test_ignores_a_longer_tag_name(self) -> None:
        assert mjml_doc.scan_sections('<mj-sectionx css-class="sec-aaa"></mj-sectionx>') == []

    def test_ignores_an_unterminated_section(self) -> None:
        assert mjml_doc.scan_sections('<mjml><mj-body><mj-section css-class="sec-aaa">') == []


class TestListSections:
    def test_summarises_id_and_excerpt(self) -> None:
        assert mjml_doc.list_sections(DOC) == [
            {"section_id": "aaa", "preview": "Welcome aboard"},
            {"section_id": "bbb", "preview": "Buy now"},
        ]

    def test_truncates_the_preview(self) -> None:
        long = "x" * 500
        mjml = (
            '<mjml><mj-body><mj-section css-class="sec-aaa"><mj-column>'
            f"<mj-text>{long}</mj-text></mj-column></mj-section></mj-body></mjml>"
        )
        assert len(mjml_doc.list_sections(mjml)[0]["preview"]) == 120


class TestEnsureSectionIds:
    def test_only_touches_sections_without_ids(self) -> None:
        mjml = (
            '<mjml><mj-body><mj-section css-class="sec-keep"></mj-section>'
            "<mj-section></mj-section></mj-body></mjml>"
        )
        result = mjml_doc.ensure_section_ids(mjml)
        assert 'css-class="sec-keep"' in result
        assert ids(result)[0] == "keep"
        assert ids(result)[1] is not None

    def test_appends_to_an_existing_class_list(self) -> None:
        mjml = '<mjml><mj-body><mj-section css-class="hero dark"></mj-section></mj-body></mjml>'
        result = mjml_doc.ensure_section_ids(mjml)
        assert "hero dark sec-" in result

    def test_emits_no_leading_space_without_a_class_list(self) -> None:
        # Regression: the original .strip() applied to the f-string, not the class list.
        result = mjml_doc.ensure_section_ids(
            "<mjml><mj-body><mj-section></mj-section></mj-body></mjml>"
        )
        assert 'css-class=" sec-' not in result

    def test_preserves_other_attributes(self) -> None:
        mjml = (
            '<mjml><mj-body><mj-section background-color="#fff" padding="8px">'
            "</mj-section></mj-body></mjml>"
        )
        result = mjml_doc.ensure_section_ids(mjml)
        assert 'background-color="#fff"' in result
        assert 'padding="8px"' in result

    def test_is_a_noop_when_all_sections_are_identified(self) -> None:
        assert mjml_doc.ensure_section_ids(DOC) == DOC

    def test_generates_ids_in_the_shared_format(self) -> None:
        result = mjml_doc.ensure_section_ids(
            "<mjml><mj-body><mj-section></mj-section></mj-body></mjml>"
        )
        section_id = ids(result)[0]
        assert section_id is not None
        assert len(section_id) == 8
        assert all(c in "0123456789abcdef" for c in section_id)


class TestGetSection:
    def test_returns_the_whole_element(self) -> None:
        section = mjml_doc.get_section(DOC, "bbb")
        assert section.startswith("<mj-section")
        assert section.endswith("</mj-section>")
        assert "Buy now" in section

    def test_returns_none_for_an_unknown_id(self) -> None:
        assert mjml_doc.get_section(DOC, "nope") is None


class TestReplaceSection:
    def test_forces_the_target_id(self) -> None:
        result = mjml_doc.replace_section(
            DOC, "aaa", '<mj-section css-class="sec-wrong"><mj-column /></mj-section>'
        )
        assert 'css-class="sec-aaa"' in result
        assert "sec-wrong" not in result
        assert ids(result) == ["aaa", "bbb"]

    def test_adds_the_id_when_the_replacement_has_none(self) -> None:
        result = mjml_doc.replace_section(
            DOC, "aaa", '<mj-section background-color="#000"><mj-column /></mj-section>'
        )
        assert 'css-class="sec-aaa"' in result
        assert 'background-color="#000"' in result

    def test_preserves_unrelated_classes(self) -> None:
        result = mjml_doc.replace_section(
            DOC, "aaa", '<mj-section css-class="promo"><mj-column /></mj-section>'
        )
        assert 'css-class="promo sec-aaa"' in result

    def test_returns_none_for_an_unknown_id(self) -> None:
        assert (
            mjml_doc.replace_section(DOC, "nope", "<mj-section><mj-column /></mj-section>") is None
        )

    def test_rejects_a_fragment_that_is_not_a_section(self) -> None:
        with pytest.raises(mjml_doc.MjmlDocumentError):
            mjml_doc.replace_section(DOC, "aaa", "<mj-column />")

    def test_rejects_two_concatenated_sections(self) -> None:
        # Regression: the original startswith() check let these through, so both
        # sections ended up sharing one id.
        two = "<mj-section><mj-column /></mj-section><mj-section><mj-column /></mj-section>"
        with pytest.raises(mjml_doc.MjmlDocumentError):
            mjml_doc.replace_section(DOC, "aaa", two)


class TestInsertSection:
    NEW = '<mj-section css-class="promo"><mj-column /></mj-section>'

    def test_inserts_after_the_anchor(self) -> None:
        result, section_id = mjml_doc.insert_section(DOC, self.NEW, "aaa")
        assert ids(result) == ["aaa", section_id, "bbb"]

    def test_appends_when_no_anchor_is_given(self) -> None:
        result, section_id = mjml_doc.insert_section(DOC, self.NEW, None)
        assert ids(result) == ["aaa", "bbb", section_id]

    def test_falls_back_to_the_body_end_for_an_unknown_anchor(self) -> None:
        result, section_id = mjml_doc.insert_section(DOC, self.NEW, "nope")
        assert ids(result) == ["aaa", "bbb", section_id]

    def test_keeps_a_supplied_id(self) -> None:
        result, section_id = mjml_doc.insert_section(
            DOC, '<mj-section css-class="sec-mine"><mj-column /></mj-section>', None
        )
        assert section_id == "mine"
        assert ids(result) == ["aaa", "bbb", "mine"]

    def test_raises_without_a_body_close(self) -> None:
        with pytest.raises(mjml_doc.MjmlDocumentError):
            mjml_doc.insert_section("<mjml></mjml>", self.NEW, None)


class TestRemoveSection:
    def test_removes_only_the_addressed_section(self) -> None:
        result = mjml_doc.remove_section(DOC, "aaa")
        assert ids(result) == ["bbb"]
        assert "Welcome aboard" not in result

    def test_returns_none_for_an_unknown_id(self) -> None:
        assert mjml_doc.remove_section(DOC, "nope") is None


class TestClassListHelpers:
    def test_does_not_match_a_prefix_inside_a_longer_class(self) -> None:
        assert mjml_doc.read_id_from_class_list("mysec-abc", mjml_doc.SECTION_PREFIX) is None

    def test_rejects_a_bare_prefix(self) -> None:
        assert mjml_doc.read_id_from_class_list("sec-", mjml_doc.SECTION_PREFIX) is None

    def test_replaces_an_existing_id(self) -> None:
        assert (
            mjml_doc.set_id_in_class_list("hero sec-old dark", mjml_doc.SECTION_PREFIX, "new")
            == "hero dark sec-new"
        )

    def test_leaves_the_other_prefix_alone(self) -> None:
        assert (
            mjml_doc.set_id_in_class_list("obj-keep sec-old", mjml_doc.SECTION_PREFIX, "new")
            == "obj-keep sec-new"
        )
