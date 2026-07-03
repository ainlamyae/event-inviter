"""Generate the example event-inviter workbook.

Produces event-inviter-template.xlsx next to this script, with two tabs:
  - Locations: Label | Address | Map URL
  - Event:     Date | Title | Outline | Notes | Background | Links | Receivers

Run: python generate_template.py
"""

from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

OUTPUT_PATH = Path(__file__).parent / "event-inviter-template.xlsx"

HEADER_FILL = PatternFill(start_color="1F4E78", end_color="1F4E78", fill_type="solid")
HEADER_FONT = Font(color="FFFFFF", bold=True)
WRAP_TOP_LEFT = Alignment(horizontal="left", vertical="top", wrap_text=True)
WRAP_TOP_RIGHT = Alignment(horizontal="right", vertical="top", wrap_text=True)


def write_sheet(ws, headers, rows, col_widths, rtl_columns=()):
    ws.append(headers)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    for row in rows:
        ws.append(row)

    for row_idx in range(2, len(rows) + 2):
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.alignment = WRAP_TOP_RIGHT if col_idx in rtl_columns else WRAP_TOP_LEFT

    for col_idx, width in enumerate(col_widths, start=1):
        ws.column_dimensions[get_column_letter(col_idx)].width = width

    ws.freeze_panes = "A2"


def build_workbook():
    wb = Workbook()

    locations_ws = wb.active
    locations_ws.title = "Locations"
    write_sheet(
        locations_ws,
        headers=["Label", "Address", "Google Map URL"],
        rows=[
            [
                "MC 2017",
                "Mathematics and Computer Building, University Ave W, Waterloo, ON N2L 3L3",
                "https://maps.app.goo.gl/VNh5R6kFM1NbFKyY9",
            ],
            [
                "MC 2018",
                "Mathematics and Computer Building, University Ave W, Waterloo, ON N2L 3L3",
                "https://maps.app.goo.gl/VNh5R6kFM1NbFKyY9",
            ],
            [
                "DC 1350",
                "Davis Centre, University Ave W, Waterloo, ON N2L 3G1",
                "https://maps.app.goo.gl/2yV8ZbQGqQqQqQqQ7",
            ],
        ],
        col_widths=[14, 55, 42],
    )

    event_ws = wb.create_sheet("Event")
    outline_text = (
        "۱۹:۴۵ تا ۲۰:۳۰ - "
        "قرائت قرآن و تفسیر "
        "آیات ۲۱ تا ۲۶ سوره توبه\n"
        "۲۰:۳۰ تا ۲۰:۵۰ - پذیرایی\n"
        "۲۰:۵۰ تا ۲۱:۳۰ - ادامه ی تفسیر\n"
        "۲۱:۳۰ تا ۲۱:۴۵ - نماز جماعت (MC 2018)"
    )
    notes_text = (
        "[جدول جلسات هفتگی "
        "قرآن: <insert your schedule link here>]\n\n"
        "ایمیل ارتباطی: uwq.mo...@gmail.com"
    )
    background_text = (
        "رَبِّ اجْعَلْنِی "
        "مُقیمَ الصَّلاةِ "
        "وَمِن ذُرِّيَتِی "
        "ـ رَبَّنَا وَتَقَبَّل "
        "دُعَاءِ ﴾ابراهیم-۴۰﴿\n"
        "پروردگارا، مرا برپادارنده "
        "نماز قرار ده، و از فرزندان "
        "من نیز. پروردگارا، و دعای "
        "مرا بپذیر."
    )
    links_text = "جدول جلسات هفتگی: <insert your schedule link here>"

    write_sheet(
        event_ws,
        headers=["Date", "Title", "Outline", "Notes", "Background", "Links", "Receivers"],
        rows=[
            [
                "2026-07-03",
                "جلسه هفتگی قرآن",
                outline_text,
                notes_text,
                background_text,
                links_text,
                "uw_q...@googlegroups.com",
            ],
        ],
        col_widths=[12, 22, 46, 34, 46, 34, 26],
        rtl_columns=(2, 3, 4, 5),
    )

    return wb


if __name__ == "__main__":
    wb = build_workbook()
    wb.save(OUTPUT_PATH)
    print(f"Wrote {OUTPUT_PATH}")
