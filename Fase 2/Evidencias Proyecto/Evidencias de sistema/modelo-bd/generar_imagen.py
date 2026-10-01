"""Califica el SQL al schema erp y dibuja el modelo (SVG)."""
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SQL_PATH = ROOT / "esquema-erp.sql"
SVG_PATH = ROOT / "modelo-erp.svg"

GROUPS = [
    ("Organizacion y acceso", [
        "Empresa", "Sucursal", "Rol", "Usuario", "UsuarioEmpresa",
        "UiTablePreference", "RefreshToken", "PasswordResetToken", "Notificacion",
    ]),
    ("Catalogos", [
        "CatalogoImportacion", "CentroCosto", "AreaNegocio", "ConceptoFlujo",
        "CodigoFinanciero", "Moneda", "UnidadMedida", "TipoDocumento",
        "IndicadorBc", "SyncBcMeta",
    ]),
    ("Contratistas", [
        "Contratista", "ContratistaVigenciaHistorial", "TipoContratoContratista",
        "Labor", "Actividad", "LaborActividad", "TarifaContratista",
        "ProformaContratista", "FacturaContratista", "IngresoLaborDiario",
        "PeriodoCierreContratista", "PeriodoCierreContratistaEvento",
        "AuditoriaContratista",
    ]),
    ("Compras y proveedores", [
        "OrdenCompra", "AprobacionOc", "RecepcionOc", "RegistroCompra",
        "Proveedor", "ProveedorCuentaBancaria", "ProveedorContacto",
        "ProveedorDireccion", "ProveedorCambio",
    ]),
    ("Inventario", [
        "Insumo", "Bodega", "StockInsumoBodega", "ReservaStock", "MovimientoBodega",
    ]),
    ("Contabilidad", [
        "CuentaContable", "ElementoCosto", "FactorHonorario", "CuentaCentroCosto",
        "CuentaElementoCosto", "CuentaAreaNegocio", "PeriodoContable",
        "PeriodoContableEvento", "ConfigContableSii", "Asiento",
    ]),
    ("Tesoreria", [
        "MovimientoCaja", "AperturaCorreccion", "Pago", "PagoTcEvento",
        "CartolaBancaria", "MovimientoCartola", "Conciliacion",
        "MovimientoConciliacion", "AnticipoProductor", "DocumentoAging", "Presupuesto",
    ]),
    ("Comercial", [
        "Cliente", "ClienteCuentaBancaria", "ClienteContacto", "ClienteDireccion",
        "ClienteCambio", "Prospecto", "DocumentoComercial",
        "CuentaCorrienteMovimiento", "GuiaDespacho",
    ]),
    ("Aprobaciones", [
        "WorkflowConfig", "DelegacionAprobacion", "GrupoAprobacion",
        "UsuarioGrupoAprobacion", "NodoEscalaAprobacion", "NodoAprobador",
        "AdminConcepto", "PasoAprobacionDetalle",
    ]),
]


def qualify(sql: str) -> str:
    enums = re.findall(r'^CREATE TYPE "([^"]+)"', sql, re.M)
    tables = re.findall(r'^CREATE TABLE "([^"]+)"', sql, re.M)
    names = set(enums) | set(tables)
    cols = set(re.findall(r'^\s+"([^"]+)"\s+', sql, re.M))
    clash = sorted(names & cols)
    if clash:
        raise SystemExit("Nombre de columna igual a tabla o enum: " + ", ".join(clash))

    def repl(match: re.Match) -> str:
        name = match.group(1)
        if name in names:
            return f'"erp"."{name}"'
        return match.group(0)

    body = re.sub(r'"([^"]+)"', repl, sql)
    header = (
        "-- Modelo PostgreSQL del ERP Almahue.\n"
        "-- Schema erp. Salida de prisma migrate diff sobre prisma/schema.prisma.\n"
        f"-- {len(tables)} tablas y {len(enums)} enums.\n"
        "-- Tablas, indices y tipos quedan calificados en el schema erp.\n\n"
    )
    return header + body


def parse(sql: str):
    tables = {}
    order = []
    for match in re.finditer(r'CREATE TABLE "erp"\."([^"]+)" \((.*?)\);', sql, re.S):
        name = match.group(1)
        body = match.group(2)
        cols = []
        pks = []
        for line in body.splitlines():
            line = line.strip().rstrip(",")
            if not line or line.startswith("CONSTRAINT"):
                pk = re.search(r'PRIMARY KEY \((.+)\)', line)
                if pk:
                    pks = re.findall(r'"([^"]+)"', pk.group(1))
                continue
            col = re.match(r'"([^"]+)"\s+(.+)$', line)
            if col:
                cols.append((col.group(1), col.group(2)))
        tables[name] = {"cols": cols, "pk": set(pks), "fks": {}}
        order.append(name)
    for match in re.finditer(
        r'ALTER TABLE "erp"\."([^"]+)" ADD CONSTRAINT "[^"]+" '
        r'FOREIGN KEY \("([^"]+)"\) REFERENCES "erp"\."([^"]+)"',
        sql,
    ):
        src, col, dst = match.group(1), match.group(2), match.group(3)
        tables[src]["fks"][col] = dst
    enums = []
    for match in re.finditer(r'CREATE TYPE "erp"\."([^"]+)" AS ENUM \((.+)\);', sql):
        values = re.findall(r"'([^']+)'", match.group(2))
        enums.append((match.group(1), values))
    return tables, order, enums


def layout(tables):
    col_w = 292
    gap_x = 28
    gap_y = 22
    row_h = 15
    head_h = 28
    pad = 8
    per_row = 5
    margin = 36
    title_h = 78
    cards = {}
    y = margin + title_h
    width = margin * 2 + per_row * col_w + (per_row - 1) * gap_x
    for title, names in GROUPS:
        y += 8
        group_top = y
        y += 34
        row_heights = []
        rows = [names[i:i + per_row] for i in range(0, len(names), per_row)]
        for row in rows:
            heights = []
            for name in row:
                heights.append(head_h + pad + len(tables[name]["cols"]) * row_h + 8)
            row_heights.append(max(heights))
        x0 = margin
        for r, row in enumerate(rows):
            x = x0
            h = row_heights[r]
            for name in row:
                ch = head_h + pad + len(tables[name]["cols"]) * row_h + 8
                cards[name] = {"x": x, "y": y, "w": col_w, "h": ch}
                x += col_w + gap_x
            y += h + gap_y
        cards[f"__group__{title}"] = {"x": margin, "y": group_top, "w": width - margin * 2, "h": 28, "title": title}
        y += 18
    enum_top = y
    y += 36
    enum_cols = 3
    enum_w = (width - margin * 2 - (enum_cols - 1) * gap_x) / enum_cols
    enum_boxes = []
    for i, (name, values) in enumerate(parse.enums if False else []):
        pass
    return {
        "cards": cards,
        "width": width,
        "col_w": col_w,
        "row_h": row_h,
        "head_h": head_h,
        "pad": pad,
        "margin": margin,
        "y": y,
        "enum_top": enum_top,
        "enum_cols": enum_cols,
        "enum_w": enum_w,
        "gap_x": gap_x,
    }


def build_svg(sql: str) -> str:
    tables, _order, enums = parse(sql)
    expected = [n for _t, names in GROUPS for n in names]
    missing = [n for n in tables if n not in expected]
    extra = [n for n in expected if n not in tables]
    if missing or extra:
        raise SystemExit(f"Grupos incompletos. faltan={missing} sobran={extra}")

    col_w = 300
    gap_x = 26
    gap_y = 18
    row_h = 14
    head_h = 26
    pad_x = 8
    per_row = 5
    margin = 32
    title_h = 72
    width = margin * 2 + per_row * col_w + (per_row - 1) * gap_x
    y = margin + title_h
    cards = {}
    bands = []
    for title, names in GROUPS:
        band_top = y
        y += 32
        rows = [names[i:i + per_row] for i in range(0, len(names), per_row)]
        for row in rows:
            heights = [head_h + 6 + len(tables[n]["cols"]) * row_h + 8 for n in row]
            h = max(heights)
            x = margin
            for name in row:
                ch = head_h + 6 + len(tables[name]["cols"]) * row_h + 8
                cards[name] = {"x": x, "y": y, "w": col_w, "h": ch}
                x += col_w + gap_x
            y += h + gap_y
        bands.append((title, band_top, y - gap_y + 8))
        y += 16

    enum_top = y
    y += 36
    enum_cols = 3
    enum_gap = 18
    enum_w = (width - margin * 2 - (enum_cols - 1) * enum_gap) / enum_cols
    enum_boxes = []
    col_y = [y] * enum_cols
    for i, (name, values) in enumerate(enums):
        c = i % enum_cols
        eh = 24 + len(values) * 13 + 8
        enum_boxes.append((name, values, margin + c * (enum_w + enum_gap), col_y[c], enum_w, eh))
        col_y[c] += eh + 12
    height = max(col_y) + margin

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        "<style>",
        "text { font-family: 'Segoe UI', Calibri, sans-serif; }",
        ".title { font-size: 28px; font-weight: 650; fill: #2c2416; }",
        ".sub { font-size: 14px; fill: #6d4c32; }",
        ".band { font-size: 16px; font-weight: 650; fill: #24532c; }",
        ".th { font-size: 13px; font-weight: 650; fill: #fffaf3; }",
        ".col { font-size: 11px; fill: #2c2416; }",
        ".pk { font-size: 11px; font-weight: 650; fill: #24532c; }",
        ".fk { font-size: 11px; fill: #6d4c32; }",
        ".etype { font-size: 12px; font-weight: 650; fill: #fffaf3; }",
        ".eval { font-size: 11px; fill: #2c2416; }",
        "</style>",
        f'<rect width="100%" height="100%" fill="#f4ecdc"/>',
        f'<text class="title" x="{margin}" y="{margin + 28}">Modelo de datos ERP Almahue</text>',
        f'<text class="sub" x="{margin}" y="{margin + 52}">PostgreSQL, schema erp. {len(tables)} tablas, {len(enums)} enums. PK en verde, FK con la tabla referenciada.</text>',
    ]

    # lineas de FK detras de las tarjetas
    for src, info in tables.items():
        for col, dst in info["fks"].items():
            a = cards[src]
            b = cards[dst]
            x1 = a["x"] + a["w"] / 2
            y1 = a["y"] + 12
            x2 = b["x"] + b["w"] / 2
            y2 = b["y"] + 12
            parts.append(
                f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                f'stroke="#b9a48a" stroke-width="1" opacity="0.55"/>'
            )

    for title, top, bottom in bands:
        parts.append(
            f'<text class="band" x="{margin}" y="{top + 20}">{html.escape(title)}</text>'
        )
        parts.append(
            f'<line x1="{margin + 220}" y1="{top + 16}" x2="{width - margin}" y2="{top + 16}" '
            f'stroke="#d7cbb8" stroke-width="1"/>'
        )

    for name, card in cards.items():
        x, y0, w, h = card["x"], card["y"], card["w"], card["h"]
        parts.append(f'<rect x="{x}" y="{y0}" width="{w}" height="{h}" rx="8" fill="#fffaf3" stroke="#d7cbb8"/>')
        parts.append(f'<rect x="{x}" y="{y0}" width="{w}" height="{head_h}" rx="8" fill="#24532c"/>')
        parts.append(f'<rect x="{x}" y="{y0 + head_h - 8}" width="{w}" height="8" fill="#24532c"/>')
        parts.append(f'<text class="th" x="{x + pad_x}" y="{y0 + 17}">{html.escape(name)}</text>')
        cy = y0 + head_h + 16
        info = tables[name]
        for col, typ in info["cols"]:
            is_pk = col in info["pk"]
            dst = info["fks"].get(col)
            short = typ.split(" NOT NULL")[0].split(" DEFAULT")[0]
            short = short.replace('"erp".', "")
            if len(short) > 28:
                short = short[:26] + ".."
            label = col
            css = "col"
            if is_pk:
                css = "pk"
                label = "PK " + col
            elif dst:
                css = "fk"
                label = f"{col} > {dst}"
            if len(label) > 38:
                label = label[:36] + ".."
            parts.append(
                f'<text class="{css}" x="{x + pad_x}" y="{cy}">{html.escape(label)}</text>'
            )
            parts.append(
                f'<text class="col" x="{x + w - pad_x}" y="{cy}" text-anchor="end" fill="#8a7968">{html.escape(short)}</text>'
            )
            cy += row_h

    parts.append(f'<text class="band" x="{margin}" y="{enum_top + 22}">Enums</text>')
    for name, values, ex, ey, ew, eh in enum_boxes:
        parts.append(f'<rect x="{ex}" y="{ey}" width="{ew}" height="{eh}" rx="8" fill="#fffaf3" stroke="#d7cbb8"/>')
        parts.append(f'<rect x="{ex}" y="{ey}" width="{ew}" height="22" rx="8" fill="#6d4c32"/>')
        parts.append(f'<rect x="{ex}" y="{ey + 14}" width="{ew}" height="8" fill="#6d4c32"/>')
        parts.append(f'<text class="etype" x="{ex + 8}" y="{ey + 15}">{html.escape(name)}</text>')
        vy = ey + 36
        for value in values:
            parts.append(f'<text class="eval" x="{ex + 8}" y="{vy}">{html.escape(value)}</text>')
            vy += 13

    parts.append("</svg>")
    return "\n".join(parts), width, height


def main():
    raw = SQL_PATH.read_text(encoding="utf-8")
    if not raw.startswith("-- Modelo PostgreSQL"):
        qualified = qualify(raw)
        SQL_PATH.write_text(qualified, encoding="utf-8", newline="\n")
    else:
        qualified = raw
    svg, width, height = build_svg(qualified)
    SVG_PATH.write_text(svg, encoding="utf-8", newline="\n")
    print(f"svg {width} x {height} bytes {SVG_PATH.stat().st_size}")


if __name__ == "__main__":
    main()
