"""Exports: GeoTIFF zip, CSV summary and PDF report."""

import csv
import io
import zipfile
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.i18n.messages import t
from app.i18n.messages import t as _t


def _fmt(v: float | None, digits: int = 2) -> str:
    return "—" if v is None else f"{v:,.{digits}f}"


def zip_layers(run_dir: Path) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(run_dir.glob("*.tif")) + [run_dir / "result.json"]:
            if f.exists():
                z.write(f, f.name)
    return buf.getvalue()


def summary_rows(result: dict, lang: str) -> list[tuple[str, str]]:
    return [
        (t(lang, "absorbed_co2"), f"{_fmt(result['absorbed_co2_t'])} t CO₂"),
        (t(lang, "absorbed_c"), f"{_fmt(result['absorbed_c_t'])} t C"),
        (t(lang, "emissions"), f"{_fmt(result['emissions_co2_t'])} t CO₂"),
        (t(lang, "offset"), f"{_fmt(result['offset_pct'])} %"),
        (t(lang, "area"), f"{_fmt(result['area_ha'])} ha"),
        (t(lang, "vegetated_area"), f"{_fmt(result['vegetated_area_ha'])} ha"),
        (t(lang, "mean_npp"), f"{_fmt(result['mean_npp_co2_kg_ha'])} kg CO₂/ha"),
    ]


def to_csv(region_name: str, result: dict, lang: str) -> str:
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow([t(lang, "region"), region_name])
    w.writerow([t(lang, "period"), f"{result['year']}-{result['month']:02d}"])
    w.writerow([t(lang, "method"), t(lang, f"method_{result['method']}")])
    w.writerow([])
    w.writerow(["metric", "value"])
    for k in ("absorbed_co2_t", "absorbed_c_t", "emissions_co2_t", "offset_pct", "area_ha",
              "vegetated_area_ha", "mean_npp_c_kg_ha", "mean_npp_co2_kg_ha"):
        w.writerow([k, result.get(k)])
    for k, v in result.get("parameters", {}).items():
        w.writerow([k, v])
    w.writerow([])
    w.writerow(["landcover_code", "landcover", "area_ha", "c_t", "co2_t"])
    for row in result.get("by_landcover", []):
        w.writerow([row["code"], t(lang, row["name"]), row["area_ha"], row["c_t"], row["co2_t"]])
    return out.getvalue()


def _ascii_sub(obj):
    """Built-in PDF fonts lack the subscript-two glyph."""
    if isinstance(obj, str):
        return obj.replace("₂", "2")
    if isinstance(obj, list | tuple):
        return [_ascii_sub(o) for o in obj]
    return obj


def to_pdf(region_name: str, result: dict, run_dir: Path, lang: str) -> bytes:
    def t(lng: str, key: str) -> str:  # noqa: F811 - local override for PDF-safe text
        return _ascii_sub(_t(lng, key))

    def summary(res: dict, lng: str):
        return _ascii_sub(summary_rows(res, lng))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=16 * mm, bottomMargin=16 * mm,
                            title=t(lang, "title"))
    st = getSampleStyleSheet()
    green = colors.HexColor("#1f6f43")
    table_style = TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#d0d7d2")),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ])
    story = [
        Paragraph(t(lang, "title"), st["Title"]),
        Paragraph(f"<b>{t(lang, 'region')}:</b> {region_name} &nbsp;&nbsp; "
                  f"<b>{t(lang, 'period')}:</b> {result['year']}-{result['month']:02d}",
                  st["Normal"]),
        Paragraph(f"<b>{t(lang, 'method')}:</b> {t(lang, 'method_' + result['method'])}",
                  st["Normal"]),
        Spacer(1, 6 * mm),
        Paragraph(t(lang, "summary"), st["Heading2"]),
        Table(summary(result, lang), colWidths=[95 * mm, 70 * mm], style=table_style),
    ]

    png = run_dir / "co2.png"
    if png.exists():
        from PIL import Image as PILImage

        w, h = PILImage.open(png).size
        width = 120 * mm
        story += [Spacer(1, 5 * mm), Image(str(png), width=width, height=width * h / w)]

    p = result.get("parameters", {})
    params = [(t(lang, "t_mean"), f"{_fmt(p.get('t_mean'), 1)} °C"),
              (t(lang, "t_opt"), f"{_fmt(p.get('t_opt'), 1)} °C"),
              ("T1", _fmt(p.get("t1"), 4)), ("T2", _fmt(p.get("t2"), 4)),
              (t(lang, "sol"), f"{_fmt(p.get('sol'), 1)} MJ/m²")]
    if p.get("s2_coverage") is not None:
        params.append((t(lang, "s2_coverage"), f"{p['s2_coverage'] * 100:.0f} %"))
    story += [Paragraph(t(lang, "parameters"), st["Heading2"]),
              Table(params, colWidths=[95 * mm, 70 * mm], style=table_style)]

    rows = [[t(lang, "class"), "ha", "t C", "t CO2"]] + [
        [t(lang, r["name"]), _fmt(r["area_ha"], 1), _fmt(r["c_t"]), _fmt(r["co2_t"])]
        for r in result.get("by_landcover", [])
    ]
    lc_style = TableStyle(table_style.getCommands() + [
        ("TEXTCOLOR", (0, 0), (-1, 0), green), ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
    ])
    story += [Paragraph(t(lang, "landcover"), st["Heading2"]),
              Table(rows, colWidths=[65 * mm, 33 * mm, 33 * mm, 34 * mm], style=lc_style)]

    if result.get("notes"):
        story += [Paragraph(t(lang, "notes"), st["Heading2"])] + [
            Paragraph("• " + t(lang, f"note_{n}"), st["Normal"]) for n in result["notes"]
        ]
    story += [Spacer(1, 8 * mm), Paragraph(f"<i>{t(lang, 'generated')}</i>", st["Normal"])]
    doc.build(story)
    return buf.getvalue()
