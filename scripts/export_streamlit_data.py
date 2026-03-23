#!/usr/bin/env python3
from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path

import gspread
import pandas as pd
from google.oauth2.service_account import Credentials

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]

SERVICE_ACCOUNT_JSON = Path(
    "/home/goodnews/바탕화면/ZM_DX_PROJECTS/01_에어플로우/02_Airflow/secrets/service_account.json"
)
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "data"

INVENTORY_SHEET_ID = "1yE-tDHyJlpEjRV9iO_eiZkxpgVq-juptA8J0I-cZdl8"
INVENTORY_SHEET_GID = 1806249027
PRICE_SHEET_ID = "11DErb-0wa11mFL3JwVNcoLd_mrTrFkxCUGccEDSQS2k"
PRICE_SHEET_GID = 2125294533

SUMMARY_SHEET_ID = "13m-3z2LgX4BQ7JMT0dgOmKCHt_VXx71rFoSzBcMLFjE"
PORK_SHEET_NAME = "돈육_검역량_요약"
BEEF_SHEET_NAME = "우육_검역량_요약"

USDA_SHEET_ID = "1DSrroxiOCuMwXdxwjX3mOYX2_thrT-wZq0TlTcLf1oE"
USDA_TAB_NAME = "미국내수(일일)"

NUM_COLS = ["재고", "중량", "평균중량", "전일재고", "당일매출", "예약"]
DATE_COLS = ["입고일자", "유통기한"]
SEARCH_COLS = [
    "품명",
    "브랜드",
    "브랜드_한글",
    "원산지",
    "등급",
    "등급_한글",
    "EST",
    "B/L_NO",
    "식별번호",
    "상품코드",
    "관리 코드",
    "창고",
    "출처",
]
DISPLAY_COLS = ["관리 코드", "품명", "브랜드", "등급", "EST", "B/L_NO", "출처", "창고", "재고", "단가", "유통기한"]
DETAIL_GROUPS = [
    ("재고 현황", ["재고", "중량", "평균중량", "전일재고", "당일매출", "예약"]),
    ("상품 정보", ["관리 코드", "품명", "브랜드", "상품코드", "등급", "원산지", "EST", "규격"]),
    ("물류 / 입출고", ["창고", "출처", "입고일자", "유통기한", "B/L_NO", "식별번호", "LOT-NO", "매입처", "비고"]),
]

USDA_COLUMNS: list[tuple[int, str, str]] = [
    (1, "Cattle 도축두수", "도축두수"),
    (2, "Calves 도축두수", "도축두수"),
    (3, "Hogs 도축두수", "도축두수"),
    (4, "Sheep 도축두수", "도축두수"),
    (5, "돈육 carcass", "돈육 프라이멀"),
    (6, "돈육 loin", "돈육 프라이멀"),
    (7, "돈육 butt", "돈육 프라이멀"),
    (8, "돈육 picnic", "돈육 프라이멀"),
    (9, "돈육 rib", "돈육 프라이멀"),
    (10, "돈육 ham", "돈육 프라이멀"),
    (11, "돈육 belly", "돈육 프라이멀"),
    (12, "FRESH butt", "1/4 Trim Butt"),
    (13, "FROZEN butt", "1/4 Trim Butt"),
    (14, "O/D", "1/4 Trim Butt"),
    (15, "소 carcass", "소고기 Choice"),
    (16, "소 rib (65~75CL)", "소고기 Choice"),
    (17, "소 chuck (75~85CL)", "소고기 Choice"),
    (18, "소 round (90~95CL)", "소고기 Choice"),
    (19, "소 loin (85~90CL)", "소고기 Choice"),
    (20, "소 brisket (70~75CL)", "소고기 Choice"),
    (21, "소 short plate (60~65)", "소고기 Choice"),
    (22, "소 flank (70~75CL)", "소고기 Choice"),
    (23, "Chuck roll", "소고기 세부"),
    (24, "Shoulder clod", "소고기 세부"),
    (25, "Top blade", "소고기 세부"),
    (26, "Chuck flap", "소고기 세부"),
    (27, "Brisket deckle off", "소고기 세부"),
    (28, "Brisket point off bnls", "소고기 세부"),
    (29, "Short plate short rib", "소고기 세부"),
    (30, "Chuck short rib", "소고기 세부"),
    (31, "Ground Beef 93%", "소고기 세부"),
    (32, "Ground Beef 81%", "소고기 세부"),
    (33, "Trimming 50% Fresh", "소고기 세부"),
]

USDA_GROUPS = list(dict.fromkeys(group for _, _, group in USDA_COLUMNS))
USDA_GROUP_ITEMS = {group: [name for _, name, gg in USDA_COLUMNS if gg == group] for group in USDA_GROUPS}
USDA_GROUP_UNITS = {
    "도축두수": "두",
    "돈육 프라이멀": "달러/100파운드",
    "1/4 Trim Butt": "달러/100파운드",
    "소고기 Choice": "달러/100파운드",
    "소고기 세부": "달러/100파운드",
}

_LST_TAB_US_M = "미국_USDA_소_돼지_월간_도축_생산(천두／천톤)"
_LST_TAB_AU_Q = "호주_ABS_소_분기_도축_생산(천두／천톤)"
_LST_TAB_US_CSTK = "미국_USDA_소_사육두수(천두)"
_LST_TAB_US_HSTK = "미국_USDA_돼지_사육두수(천두)"
_LST_TAB_AU_STK = "호주_MLA_소_사육두수(천두_추정)"
_LST_TAB_KR_CSTK = "한국_MTRACE_소_품종별_사육두수(천두)"
_LST_TAB_KR_PSTK = "한국_MTRACE_돼지_월령별_사육두수(천두)"
_LST_TAB_KR_CPROD = "한국_MTRACE_소_품종별_생산량(천톤)"
_LST_TAB_KR_PPROD = "한국_MTRACE_돼지_생산량(천톤_추정)"

LST_METRICS = ["도축두수", "생산량", "도체중량", "사육두수"]
LST_SPECIES = ["소", "돼지"]
LST_UNITS = {"도축두수": "천두", "생산량": "천톤", "도체중량": "kg/두", "사육두수": "천두"}
LST_COUNTRIES = ["미국", "호주", "한국"]
LST_SUM_METRICS = {"도축두수", "생산량"}
LST_COUNTRY_MERGE_METRICS = LST_SUM_METRICS | {"사육두수"}

COUNTRY_ALIASES = {
    "네덜랜드": "네덜란드",
    "화란": "네덜란드",
    "포루투갈": "포르투갈",
    "포르투칼": "포르투갈",
    "포루투칼": "포르투갈",
    "카나다": "캐나다",
    "캐나나": "캐나다",
    "덴말크": "덴마크",
    "벨지움": "벨기에",
    "벨지에": "벨기에",
    "오지리": "오스트리아",
    "에스파냐": "스페인",
    "영국(UK)": "영국",
    "뉴질렌드": "뉴질랜드",
    "뉴질랜": "뉴질랜드",
    "아이랜드": "아일랜드",
    "아이얼랜드": "아일랜드",
    "오스트레일리아": "호주",
    "호주(AUS)": "호주",
    "미국(US)": "미국",
    "미국(USA)": "미국",
    "브라질(BRA)": "브라질",
    "헝가이": "헝가리",
    "핀란": "핀란드",
    "스웨": "스웨덴",
    "프랑": "프랑스",
}


def unique_headers(headers: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    result: list[str] = []
    for idx, header in enumerate(headers):
        key = str(header or "").strip() or f"unnamed_{idx + 1}"
        seq = seen.get(key, 0) + 1
        seen[key] = seq
        result.append(key if seq == 1 else f"{key}_{seq}")
    return result


def get_client() -> gspread.Client:
    if not SERVICE_ACCOUNT_JSON.exists():
        raise FileNotFoundError(f"service account not found: {SERVICE_ACCOUNT_JSON}")
    creds = Credentials.from_service_account_file(str(SERVICE_ACCOUNT_JSON), scopes=SCOPES)
    return gspread.authorize(creds)


def worksheet_df(gc: gspread.Client, sheet_id: str, *, gid: int | None = None, name: str | None = None) -> pd.DataFrame:
    sh = gc.open_by_key(sheet_id)
    if gid is not None:
        ws = sh.get_worksheet_by_id(gid)
    elif name is not None:
        ws = sh.worksheet(name)
    else:
        raise ValueError("either gid or name is required")
    rows = ws.get_all_values()
    if len(rows) < 2:
        return pd.DataFrame()
    headers = unique_headers(rows[0])
    return pd.DataFrame(rows[1:], columns=headers)


def parse_date_series(series: pd.Series) -> pd.Series:
    raw = series.fillna("").astype(str).str.strip()
    normalized = (
        raw.str.replace(".", "-", regex=False)
        .str.replace("/", "-", regex=False)
        .str.replace("년", "-", regex=False)
        .str.replace("월", "-", regex=False)
        .str.replace("일", "", regex=False)
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
    )
    parsed = pd.Series(pd.NaT, index=series.index, dtype="datetime64[ns]")

    ymd8_mask = normalized.str.fullmatch(r"\d{8}")
    if ymd8_mask.any():
        parsed.loc[ymd8_mask] = pd.to_datetime(normalized.loc[ymd8_mask], format="%Y%m%d", errors="coerce")

    ymd6_mask = normalized.str.fullmatch(r"\d{6}")
    if ymd6_mask.any():
        parsed.loc[ymd6_mask] = pd.to_datetime(normalized.loc[ymd6_mask], format="%y%m%d", errors="coerce")

    remaining = parsed.isna()
    if remaining.any():
        try:
            parsed.loc[remaining] = pd.to_datetime(normalized.loc[remaining], errors="coerce", format="mixed")
        except TypeError:
            parsed.loc[remaining] = pd.to_datetime(normalized.loc[remaining], errors="coerce")

    remaining = parsed.isna()
    if remaining.any():
        ymd8 = normalized.where(remaining).str.extract(r"(?P<v>\d{8})")["v"]
        parsed = parsed.fillna(pd.to_datetime(ymd8, format="%Y%m%d", errors="coerce"))

    remaining = parsed.isna()
    if remaining.any():
        ymd6 = normalized.where(remaining).str.extract(r"(?P<v>\d{6})")["v"]
        parsed = parsed.fillna(pd.to_datetime(ymd6, format="%y%m%d", errors="coerce"))

    return parsed


def normalize_country(name: str) -> str:
    cleaned = str(name or "").strip()
    return COUNTRY_ALIASES.get(cleaned, cleaned)


def clean_value(value):
    if pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        return value.date().isoformat()
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, (int, float)):
        as_float = float(value)
        return int(as_float) if as_float.is_integer() else round(as_float, 4)
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return value


def build_price_map(gc: gspread.Client) -> pd.Series:
    df = worksheet_df(gc, PRICE_SHEET_ID, gid=PRICE_SHEET_GID)
    if df.empty:
        return pd.Series(dtype=object)

    price_col = next((col for col in ["단가", "가격", "판매가"] if col in df.columns), None)
    if not price_col:
        return pd.Series(dtype=object)

    if "복합키" in df.columns:
        price_df = df[df["복합키"].notna() & df["복합키"].ne("")].copy()
        price_df["_key"] = price_df["복합키"].str.split("|", n=1).str[1].fillna(price_df["복합키"])
    else:
        key_cols = ["원산지", "브랜드", "품명", "EST"]
        price_df = df.copy()

        def build_key(row) -> str:
            parts = [str(row.get(col, "") or "").strip() for col in key_cols]
            grade = str(row.get("등급", "") or "").strip()
            return "|".join(parts + [grade]) if grade else "|".join(parts)

        price_df["_key"] = price_df.apply(build_key, axis=1)

    price_df = price_df[price_df["_key"].ne("")].drop_duplicates(subset=["_key"], keep="last")
    return price_df.set_index("_key")[price_col]


def export_inventory(gc: gspread.Client) -> dict:
    df = worksheet_df(gc, INVENTORY_SHEET_ID, gid=INVENTORY_SHEET_GID)
    if df.empty:
        return {"updatedAt": None, "rows": [], "counts": {}}

    key_cols = [col for col in ["품명", "브랜드", "원산지", "등급", "EST", "규격", "창고"] if col in df.columns]
    mask = (
        df[key_cols].apply(lambda row: row.astype(str).str.strip().ne("").any(), axis=1)
        if key_cols
        else df.apply(lambda row: row.astype(str).str.strip().ne("").any(), axis=1)
    )
    df = df[mask].copy()

    for col in NUM_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col].astype(str).str.replace(",", "", regex=False), errors="coerce").fillna(0)

    for col in DATE_COLS:
        if col in df.columns:
            df[f"{col}_dt"] = parse_date_series(df[col])

    updated_at = None
    if "업데이트시간" in df.columns:
        vals = df["업데이트시간"].dropna().astype(str).str.strip()
        if not vals.empty:
            updated_at = vals.iloc[-1]

    price_map = build_price_map(gc)

    def build_inventory_key(row) -> str:
        parts = [str(row.get(col, "") or "").strip() for col in ["원산지", "브랜드", "품명", "EST"]]
        grade = str(row.get("등급", "") or "").strip()
        return "|".join(parts + [grade]) if grade else "|".join(parts)

    df["단가"] = df.apply(build_inventory_key, axis=1).map(price_map).fillna("")

    export_columns = list(
        dict.fromkeys(
            SEARCH_COLS
            + DISPLAY_COLS
            + [field for _, fields in DETAIL_GROUPS for field in fields]
            + ["브랜드_한글", "등급_한글", "업데이트시간"]
        )
    )
    export_columns = [col for col in export_columns if col in df.columns]

    rows = []
    for idx, row in enumerate(df.to_dict("records")):
        record = {"id": idx}
        for col in export_columns:
            record[col] = clean_value(row.get(col))

        for col in DATE_COLS:
            dt = row.get(f"{col}_dt")
            record[f"{col}_iso"] = clean_value(dt)

        record["searchText"] = " ".join(str(row.get(col, "") or "").strip().lower() for col in SEARCH_COLS if col in row)
        rows.append(record)

    warehouses = sorted({row.get("창고") for row in rows if row.get("창고")})
    brand_records = [
        {
            "value": brand,
            "label": f"{brand} · {brand_kr}" if brand_kr else brand,
            "brandKr": brand_kr or None,
        }
        for brand, brand_kr in sorted(
            {(row.get("브랜드"), row.get("브랜드_한글")) for row in rows if row.get("브랜드")},
            key=lambda item: item[0],
        )
    ]

    return {
        "updatedAt": updated_at,
        "rows": rows,
        "detailGroups": DETAIL_GROUPS,
        "displayColumns": DISPLAY_COLS,
        "counts": {
            "rows": len(rows),
            "warehouses": len(warehouses),
            "brands": len(brand_records),
        },
        "filters": {
            "warehouses": warehouses,
            "brands": brand_records,
        },
    }


def load_summary_sheet(gc: gspread.Client, sheet_name: str, species: str) -> pd.DataFrame:
    df = worksheet_df(gc, SUMMARY_SHEET_ID, name=sheet_name)
    if df.empty:
        return pd.DataFrame()

    required = ["연도", "품명", "country"]
    if any(col not in df.columns for col in required):
        return pd.DataFrame()

    month_cols = [f"{month}월" for month in range(1, 13) if f"{month}월" in df.columns]
    if not month_cols:
        return pd.DataFrame()

    df["연도"] = pd.to_numeric(df["연도"].astype(str).str.replace("년", "", regex=False).str.strip(), errors="coerce")
    df = df[df["연도"].notna()].copy()
    df["연도"] = df["연도"].astype(int)
    df["품명"] = df["품명"].astype(str).str.strip()
    df["country"] = df["country"].astype(str).map(normalize_country)
    df = df[df["country"].ne("소계")].copy()

    for col in month_cols:
        df[col] = pd.to_numeric(df[col].astype(str).str.replace(",", "", regex=False).str.strip(), errors="coerce")

    df_long = df.melt(
        id_vars=["연도", "품명", "country"],
        value_vars=month_cols,
        var_name="monthLabel",
        value_name="ton",
    )
    df_long["month"] = df_long["monthLabel"].str.replace("월", "", regex=False).astype(int)
    df_long["year"] = df_long["연도"]
    df_long["species"] = species
    df_long["period"] = pd.to_datetime(df_long["year"].astype(str) + "-" + df_long["month"].astype(str).str.zfill(2) + "-01")
    return df_long[["species", "year", "month", "period", "품명", "country", "ton"]].copy()


def export_quarantine(gc: gspread.Client) -> dict:
    pork = load_summary_sheet(gc, PORK_SHEET_NAME, "돈육")
    beef = load_summary_sheet(gc, BEEF_SHEET_NAME, "우육")
    df = pd.concat([pork, beef], ignore_index=True)
    if df.empty:
        return {"rows": [], "counts": {}}

    df.loc[df["ton"] == 0, "ton"] = pd.NA
    df = df[df["ton"].notna()].copy()
    df["period"] = df["period"].dt.date.astype(str)
    rows = [
        {
            "species": row["species"],
            "year": int(row["year"]),
            "month": int(row["month"]),
            "period": row["period"],
            "item": row["품명"],
            "country": row["country"],
            "ton": float(row["ton"]),
        }
        for _, row in df.iterrows()
    ]

    species = sorted({row["species"] for row in rows})
    countries = sorted({row["country"] for row in rows})
    items_by_species = {
        sp: sorted({row["item"] for row in rows if row["species"] == sp})
        for sp in species
    }

    return {
        "rows": rows,
        "counts": {
            "rows": len(rows),
            "species": len(species),
            "countries": len(countries),
        },
        "species": species,
        "countries": countries,
        "itemsBySpecies": items_by_species,
    }


def export_usda_daily(gc: gspread.Client) -> dict:
    sh = gc.open_by_key(USDA_SHEET_ID)
    ws = sh.worksheet(USDA_TAB_NAME)
    rows = ws.get_all_values()
    if len(rows) < 3:
        return {"rows": [], "columns": [], "groups": USDA_GROUP_ITEMS}

    records = []
    for row in rows[2:]:
        if not row or not str(row[0]).strip():
            continue
        record = {"date": str(row[0]).strip()}
        for idx, name, _group in USDA_COLUMNS:
            value = row[idx].strip().replace(",", "") if idx < len(row) else ""
            record[name] = pd.to_numeric(value, errors="coerce")
        records.append(record)

    df = pd.DataFrame(records)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df[df["date"].notna()].copy().sort_values("date").reset_index(drop=True)
    for _, name, _group in USDA_COLUMNS:
        df[name] = pd.to_numeric(df[name], errors="coerce")

    exported = []
    for _, row in df.iterrows():
        item = {"date": row["date"].date().isoformat()}
        for _, name, _group in USDA_COLUMNS:
            value = row[name]
            item[name] = None if pd.isna(value) else float(value)
        exported.append(item)

    return {
        "rows": exported,
        "columns": [{"name": name, "group": group} for _, name, group in USDA_COLUMNS],
        "groups": USDA_GROUP_ITEMS,
        "groupUnits": USDA_GROUP_UNITS,
        "mergeableGroups": ["도축두수"],
        "counts": {"rows": len(exported), "groups": len(USDA_GROUPS)},
    }


def _lst_date(value):
    try:
        return pd.Timestamp(str(value).strip())
    except Exception:
        return None


def _lst_num(row, col):
    try:
        value = row[col].strip().replace(",", "") if col < len(row) else ""
        return float(value) if value else None
    except (ValueError, AttributeError):
        return None


def export_livestock_monthly(gc: gspread.Client) -> dict:
    sh = gc.open_by_key(USDA_SHEET_ID)
    records = []
    carcass_acc: dict[tuple[pd.Timestamp, str, str], dict[str, float]] = {}

    def tab_rows(name: str) -> list[list[str]]:
        try:
            return sh.worksheet(name).get_all_values()
        except Exception:
            return []

    def acc_carcass(date_value, country: str, species: str, heads, prod):
        if heads is None or prod is None or heads == 0:
            return
        key = (date_value, country, species)
        bucket = carcass_acc.setdefault(key, {"heads": 0.0, "prod": 0.0})
        bucket["heads"] += float(heads)
        bucket["prod"] += float(prod)

    for row in tab_rows(_LST_TAB_US_M)[1:]:
        date_value = _lst_date(row[0]) if row and row[0].strip() else None
        if date_value is None:
            continue
        us_cattle_heads = _lst_num(row, 1)
        us_cattle_prod = _lst_num(row, 2)
        us_hog_heads = _lst_num(row, 3)
        us_hog_prod = _lst_num(row, 4)
        if us_cattle_heads is not None:
            records.append((date_value, "미국", "소", "도축두수", us_cattle_heads))
        if us_cattle_prod is not None:
            records.append((date_value, "미국", "소", "생산량", us_cattle_prod))
        if us_hog_heads is not None:
            records.append((date_value, "미국", "돼지", "도축두수", us_hog_heads))
        if us_hog_prod is not None:
            records.append((date_value, "미국", "돼지", "생산량", us_hog_prod))
        acc_carcass(date_value, "미국", "소", us_cattle_heads, us_cattle_prod)
        acc_carcass(date_value, "미국", "돼지", us_hog_heads, us_hog_prod)

    for row in tab_rows(_LST_TAB_AU_Q)[1:]:
        date_value = _lst_date(row[0]) if row and row[0].strip() else None
        if date_value is None:
            continue
        heads = _lst_num(row, 1)
        prod = _lst_num(row, 2)
        if heads is not None:
            records.append((date_value, "호주", "소", "도축두수", heads))
        if prod is not None:
            records.append((date_value, "호주", "소", "생산량", prod))
        acc_carcass(date_value, "호주", "소", heads, prod)

    for tab, species in [(_LST_TAB_US_CSTK, "소"), (_LST_TAB_US_HSTK, "돼지")]:
        for row in tab_rows(tab)[1:]:
            date_value = _lst_date(row[0]) if row and row[0].strip() else None
            value = _lst_num(row, 1)
            if date_value is not None and value is not None:
                records.append((date_value, "미국", species, "사육두수", value))

    for row in tab_rows(_LST_TAB_AU_STK)[1:]:
        date_value = _lst_date(row[0]) if row and row[0].strip() else None
        value = _lst_num(row, 1)
        if date_value is not None and value is not None:
            records.append((date_value, "호주", "소", "사육두수", value))

    for row in tab_rows(_LST_TAB_KR_CSTK)[1:]:
        date_value = _lst_date(row[0]) if row and row[0].strip() else None
        value = _lst_num(row, 2)
        if date_value is not None and value is not None:
            records.append((date_value, "한국", "소", "사육두수", value))

    for row in tab_rows(_LST_TAB_KR_PSTK)[1:]:
        date_value = _lst_date(row[0]) if row and row[0].strip() else None
        value = _lst_num(row, 2)
        if date_value is not None and value is not None:
            records.append((date_value, "한국", "돼지", "사육두수", value))

    for row in tab_rows(_LST_TAB_KR_CPROD)[1:]:
        date_value = _lst_date(row[0]) if row and row[0].strip() else None
        heads = _lst_num(row, 2)
        weight = _lst_num(row, 3)
        if date_value is not None and heads is not None:
            records.append((date_value, "한국", "소", "도축두수", heads))
            if weight is not None:
                prod = heads * weight / 1000
                records.append((date_value, "한국", "소", "생산량", prod))
                acc_carcass(date_value, "한국", "소", heads, prod)

    for row in tab_rows(_LST_TAB_KR_PPROD)[1:]:
        date_value = _lst_date(row[0]) if row and row[0].strip() else None
        heads = _lst_num(row, 1)
        weight = _lst_num(row, 2)
        if date_value is not None and heads is not None:
            records.append((date_value, "한국", "돼지", "도축두수", heads))
            if weight is not None:
                prod = heads * weight / 1000
                records.append((date_value, "한국", "돼지", "생산량", prod))
                acc_carcass(date_value, "한국", "돼지", heads, prod)

    for (date_value, country, species), values in carcass_acc.items():
        if values["heads"] > 0:
            records.append((date_value, country, species, "도체중량", values["prod"] * 1000 / values["heads"]))

    if not records:
        return {"rows": [], "counts": {}}

    df = pd.DataFrame(records, columns=["date", "country", "species", "metric", "value"])
    df = df.groupby(["date", "country", "species", "metric"], as_index=False)["value"].sum()
    df = df.sort_values("date").reset_index(drop=True)

    rows = [
        {
            "date": row["date"].date().isoformat(),
            "country": row["country"],
            "species": row["species"],
            "metric": row["metric"],
            "value": round(float(row["value"]), 4),
        }
        for _, row in df.iterrows()
    ]

    return {
        "rows": rows,
        "metrics": LST_METRICS,
        "species": LST_SPECIES,
        "countries": LST_COUNTRIES,
        "units": LST_UNITS,
        "sumMetrics": sorted(LST_SUM_METRICS),
        "mergeableMetrics": sorted(LST_COUNTRY_MERGE_METRICS),
        "counts": {
            "rows": len(rows),
            "metrics": len(LST_METRICS),
            "countries": len(LST_COUNTRIES),
        },
    }


def write_json(path: Path, data, *, pretty: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fp:
        if pretty:
            json.dump(data, fp, ensure_ascii=False, indent=2)
        else:
            json.dump(data, fp, ensure_ascii=False, separators=(",", ":"))
            fp.write("\n")


def main() -> None:
    gc = get_client()
    inventory = export_inventory(gc)
    quarantine = export_quarantine(gc)
    usda = export_usda_daily(gc)
    livestock = export_livestock_monthly(gc)

    generated_at = datetime.now(timezone.utc).isoformat()
    metadata = {
        "generatedAt": generated_at,
        "defaults": {
            "inventory": {"onlyInStock": False},
            "monthlyComparison": {"species": "우육", "country": "미국", "item": "갈비"},
            "trend": {"species": "우육", "country": "미국", "item": "갈비"},
        },
        "inventory": {
            "updatedAt": inventory["updatedAt"],
            "counts": inventory["counts"],
        },
        "analytics": {
            "quarantine": quarantine["counts"],
            "usda": usda["counts"],
            "livestock": livestock["counts"],
        },
    }

    write_json(OUTPUT_DIR / "inventory.json", inventory)
    write_json(
        OUTPUT_DIR / "analytics.json",
        {
            "generatedAt": generated_at,
            "quarantine": quarantine,
            "usda": usda,
            "livestock": livestock,
        },
    )
    write_json(OUTPUT_DIR / "metadata.json", metadata, pretty=True)

    print(
        json.dumps(
            {
                "generatedAt": generated_at,
                "inventoryRows": inventory["counts"].get("rows", 0),
                "quarantineRows": quarantine["counts"].get("rows", 0),
                "usdaRows": usda["counts"].get("rows", 0),
                "livestockRows": livestock["counts"].get("rows", 0),
                "outputDir": str(OUTPUT_DIR),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
