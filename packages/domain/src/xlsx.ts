import { zip } from "./zip.js";
type Cell = string | number | null | boolean;
export type Sheet = { name: string; rows: Cell[][] };
const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
  rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  pkg = "http://schemas.openxmlformats.org/package/2006/relationships";
const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    );
function col(index: number) {
  let s = "";
  for (index++; index; index = Math.floor((index - 1) / 26))
    s = String.fromCharCode(65 + ((index - 1) % 26)) + s;
  return s;
}
export function workbook(
  sheets: Sheet[],
  chart?: {
    sheetIndex: number;
    xColumn: number;
    yColumn: number;
    title: string;
  },
) {
  if (
    !sheets.length ||
    sheets.length > 20 ||
    sheets.some(
      (s) => s.rows.length > 50001 || s.rows.some((r) => r.length > 100),
    )
  )
    throw Error("workbook_limit");
  const names = sheets.map(
    (s, i) => s.name.replace(/[\\/?*\[\]:]/g, " ").slice(0, 26) + " " + (i + 1),
  );
  const files: Record<string, string> = {};
  files["[Content_Types].xml"] =
    xml +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}${chart ? '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ""}</Types>`;
  files["_rels/.rels"] =
    xml +
    `<Relationships xmlns="${pkg}"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  files["xl/workbook.xml"] =
    xml +
    `<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`;
  files["xl/_rels/workbook.xml.rels"] =
    xml +
    `<Relationships xmlns="${pkg}">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`;
  for (const [index, s] of sheets.entries())
    files[`xl/worksheets/sheet${index + 1}.xml`] =
      xml +
      `<worksheet xmlns="${ns}" xmlns:r="${rel}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><sheetData>${s.rows.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => (v == null ? `<c r="${col(j)}${i + 1}"/>` : typeof v === "number" && Number.isFinite(v) ? `<c r="${col(j)}${i + 1}"><v>${v}</v></c>` : `<c r="${col(j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`)).join("")}</row>`).join("")}</sheetData>${chart?.sheetIndex === index ? '<drawing r:id="rIdChart"/>' : ""}</worksheet>`;
  if (chart) {
    const index = chart.sheetIndex,
      s = sheets[index];
    if (!s) throw Error("invalid_chart");
    const name = names[index].replaceAll("'", "''"),
      range = (c: number) =>
        `'${name}'!$${col(c)}$2:$${col(c)}$${Math.max(2, s.rows.length)}`;
    files[`xl/worksheets/_rels/sheet${index + 1}.xml.rels`] =
      xml +
      `<Relationships xmlns="${pkg}"><Relationship Id="rIdChart" Type="${rel}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`;
    files["xl/drawings/_rels/drawing1.xml.rels"] =
      xml +
      `<Relationships xmlns="${pkg}"><Relationship Id="rId1" Type="${rel}/chart" Target="../charts/chart1.xml"/></Relationships>`;
    files["xl/drawings/drawing1.xml"] =
      xml +
      `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>8</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>19</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>20</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="${esc(chart.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="${rel}" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
    files["xl/charts/chart1.xml"] =
      xml +
      `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${esc(chart.title)}</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:layout/><c:lineChart><c:grouping val="standard"/><c:ser><c:idx val="0"/><c:order val="0"/><c:cat><c:strRef><c:f>${esc(range(chart.xColumn))}</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>${esc(range(chart.yColumn))}</c:f></c:numRef></c:val></c:ser><c:axId val="100"/><c:axId val="200"/></c:lineChart><c:catAx><c:axId val="100"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:crossAx val="200"/></c:catAx><c:valAx><c:axId val="200"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:crossAx val="100"/></c:valAx></c:plotArea><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
  }
  return zip(files, new Date());
}
