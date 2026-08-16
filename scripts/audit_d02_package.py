#!/usr/bin/env python3
"""Audit the immutable D02 ZIP and report whether it is implementation-ready."""

import argparse
import hashlib
import json
import struct
import sys
import zipfile
from collections import Counter
from pathlib import Path

import yaml

DEFAULT_SHA256 = "b1f26bb0202f176c051ef778c2b61184eb66729fec90153d2a02b498da3d084e"


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_yaml(archive, name):
    return yaml.safe_load(archive.read(name).decode("utf-8"))


def png_size(data):
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError("not a PNG with IHDR")
    return struct.unpack(">II", data[16:24])


def flatten_tokens(value, prefix=""):
    result = set()
    if isinstance(value, dict):
        for key, item in value.items():
            next_prefix = f"{prefix}.{key}" if prefix else str(key)
            result.update(flatten_tokens(item, next_prefix))
    elif prefix:
        result.add(prefix)
    return result


def collect_spec_tokens(value):
    tokens = []
    if isinstance(value, dict):
        for item in value.values():
            tokens.extend(collect_spec_tokens(item))
    elif isinstance(value, list):
        for item in value:
            tokens.extend(collect_spec_tokens(item))
    elif isinstance(value, str) and value.startswith(("color.", "colors.", "typography.", "spacing.", "radius.")):
        tokens.append(value)
    return tokens


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("zip_path", type=Path)
    parser.add_argument("--derived-tokens", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--traceability-output", type=Path)
    parser.add_argument("--require-implementation-ready", action="store_true")
    args = parser.parse_args()

    report = {"source_file": args.zip_path.name, "errors": [], "warnings": []}
    report["source_sha256"] = sha256_file(args.zip_path)
    if report["source_sha256"] != DEFAULT_SHA256:
        report["errors"].append("source SHA-256 does not match the declared D02 package")

    with zipfile.ZipFile(args.zip_path) as archive:
        bad = archive.testzip()
        if bad:
            report["errors"].append(f"corrupt ZIP member: {bad}")
        names = set(archive.namelist())
        root = next(name.split("/")[0] for name in names if "/" in name)
        root += "/"
        manifest = json.loads(archive.read(root + "DELIVERY_MANIFEST.json"))
        tokens = json.loads(archive.read(root + "DESIGN_TOKENS.json"))
        page_index = load_yaml(archive, root + "PAGE_INDEX_D02.yaml")
        matrix = load_yaml(archive, root + "STATE_RENDER_MATRIX_D02.yaml")
        icon_registry = load_yaml(archive, root + "ICON_REGISTRY_D02.yaml")

        pages = page_index["pages"]
        items = matrix["items"]
        specs = [name for name in names if name.startswith(root + "page_specs/") and name.endswith(".yaml")]
        html = [name for name in names if name.startswith(root + "effects/") and name.endswith(".html")]
        png = [name for name in names if name.startswith(root + "effects/") and name.endswith(".png")]
        report["counts"] = {
            "manifest_pages": manifest["pages"], "page_index_pages": len(pages), "page_specs": len(specs),
            "manifest_states": manifest["states"], "state_matrix_items": len(items),
            "html": len(html), "png": len(png),
        }
        for key in ("page_index_pages", "page_specs"):
            if report["counts"][key] != manifest["pages"]:
                report["errors"].append(f"{key} count differs from manifest")
        for key in ("state_matrix_items", "html", "png"):
            if report["counts"][key] != manifest["states"]:
                report["errors"].append(f"{key} count differs from manifest")

        page_ids = {entry["page"]["id"] for entry in pages}
        spec_ids = {Path(name).stem for name in specs}
        if page_ids != spec_ids:
            report["errors"].append("Page Index and page-spec Page IDs differ")

        index_states = {
            (entry["page"]["id"], state["state_id"])
            for entry in pages
            for state in entry.get("states", [])
        }
        matrix_states = {(item["page_id"], item["state_id"]) for item in items}
        report["state_index_missing_from_matrix"] = sorted(index_states - matrix_states)
        report["state_matrix_missing_from_index"] = sorted(matrix_states - index_states)
        if report["state_index_missing_from_matrix"] or report["state_matrix_missing_from_index"]:
            report["errors"].append("Page Index and State Matrix state IDs differ")

        spec_state_mismatches = []
        for spec in specs:
            data = load_yaml(archive, spec)
            page_id = data["page"]["page_id"]
            actual = {state["state_id"] for state in data.get("states", [])}
            expected = {state_id for candidate_page, state_id in matrix_states if candidate_page == page_id}
            if actual != expected:
                spec_state_mismatches.append(page_id)
        report["page_spec_state_mismatches"] = sorted(spec_state_mismatches)
        if spec_state_mismatches:
            report["errors"].append("Page specs and State Matrix state IDs differ")

        hash_errors = []
        dimension_errors = []
        platform_count = Counter()
        for item in items:
            platform_count[item["platform"]] += 1
            html_name = root + item["html"]
            png_name = root + item["png"]
            if html_name not in names or png_name not in names:
                report["errors"].append(f"missing matrix artifact for {item['page_id']}:{item['state_id']}")
                continue
            if hashlib.sha256(archive.read(html_name)).hexdigest() != item["html_sha256"]:
                hash_errors.append(html_name)
            png_data = archive.read(png_name)
            if hashlib.sha256(png_data).hexdigest() != item["png_sha256"]:
                hash_errors.append(png_name)
            try:
                expected_size = (item["render_dimensions"]["width"], item["render_dimensions"]["height"])
                if expected_size != png_size(png_data):
                    dimension_errors.append(png_name)
            except ValueError:
                dimension_errors.append(png_name)
        report["platform_state_counts"] = dict(platform_count)
        report["matrix_hash_errors"] = hash_errors
        report["png_dimension_errors"] = dimension_errors
        if hash_errors or dimension_errors:
            report["errors"].append("State Matrix artifact hash or PNG dimension mismatch")

        manifest_hash_errors = []
        manifest_hash_entries = 0
        for line in archive.read(root + "SHA256_MANIFEST.txt").decode("utf-8").splitlines():
            if not line.strip():
                continue
            expected_hash, relative_name = line.split("  ", 1)
            manifest_hash_entries += 1
            member_name = root + relative_name
            if member_name not in names or hashlib.sha256(archive.read(member_name)).hexdigest() != expected_hash:
                manifest_hash_errors.append(relative_name)
        report["sha256_manifest_entries"] = manifest_hash_entries
        report["sha256_manifest_errors"] = manifest_hash_errors
        if manifest_hash_errors:
            report["errors"].append("SHA256 manifest mismatch")

        icons = icon_registry.get("icons", icon_registry.get("items", []))
        missing_icon_sources = []
        for icon in icons:
            source_name = icon.get("source_svg_file")
            if source_name and root + source_name not in names:
                missing_icon_sources.append(source_name)
        report["icon_registry_entries"] = len(icons)
        report["missing_icon_sources"] = missing_icon_sources
        if missing_icon_sources:
            report["errors"].append("Icon registry source file missing")

        declared_tokens = flatten_tokens(tokens)
        referenced = Counter()
        for spec in specs:
            referenced.update(collect_spec_tokens(load_yaml(archive, spec)))
        aliases = {}
        if args.derived_tokens:
            aliases = json.loads(args.derived_tokens.read_text(encoding="utf-8")).get("aliases", {})
        unresolved = sorted(token for token in referenced if token not in declared_tokens and token not in aliases)
        report["token_references"] = dict(sorted(referenced.items()))
        report["token_references_unresolved"] = unresolved
        if unresolved:
            report["errors"].append("Page-spec token references are unresolved")

        release_values = sorted({entry["page"].get("release", "") for entry in pages})
        report["release_values"] = release_values
        report["release_grammar_defined"] = False
        contract_roots = ("api/", "openapi/", "backend/", "database/", "migrations/", "schema/", "rbac/")
        report["authoritative_contract_files"] = [
            name for name in names if name[len(root):].startswith(contract_roots)
        ]

        traceability = {
            "schema_version": "1.0",
            "design_version": manifest["version"],
            "source_package_sha256": report["source_sha256"],
            "release_label_policy": "Raw D02 labels only; grammar remains unresolved.",
            "pages": [
                {
                    "page_id": entry["page"]["id"],
                    "name_cn": entry["page"]["name_cn"],
                    "platform": entry["page"]["platform"],
                    "module_id": entry["page"].get("module_id"),
                    "route": entry["page"].get("route"),
                    "release_label_raw": entry["page"].get("release"),
                    "default_state_id": entry["page"].get("default_state_id"),
                    "state_ids": [state["state_id"] for state in entry.get("states", [])],
                    "api_groups": entry.get("bindings", {}).get("api_groups", []),
                    "database_tables": entry.get("bindings", {}).get("database_tables", []),
                    "roles_raw": entry.get("access", {}).get("roles", []),
                    "visual_diff_percent_max": entry.get("testing", {}).get("target_diff_percent_max"),
                }
                for entry in sorted(pages, key=lambda candidate: candidate["page"]["id"])
            ],
        }

    report["visual_artifacts_valid"] = not report["errors"]
    report["implementation_ready"] = False
    report["implementation_blockers"] = [
        "No versioned API contract was supplied.",
        "No database schema or migrations were supplied.",
        "No canonical RBAC action and data-scope matrix was supplied.",
        "No provider callback, signing, reconciliation, or retention contract was supplied.",
        "Release field grammar and unique page-wave ownership are not defined.",
    ]
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(encoded, encoding="utf-8")
    else:
        print(encoded, end="")
    if args.traceability_output:
        args.traceability_output.write_text(
            json.dumps(traceability, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    if report["errors"]:
        return 2
    return 3 if args.require_implementation_ready else 0


if __name__ == "__main__":
    sys.exit(main())
