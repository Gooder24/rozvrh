import * as XLSX from "xlsx";
for (const f of process.argv.slice(2)) {
  const wb = XLSX.read(await Bun.file(f).arrayBuffer());
  for (const n of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n]!, { header: 1 });
    console.log(f, n, rows.length); for (const r of rows.slice(0, 6)) console.log(JSON.stringify(r));
  }
}
