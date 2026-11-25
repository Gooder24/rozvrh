// Vysoké školy (beta): študijný program z informačných listov predmetov (PDF fakulty) do data/vs/<id>.json.
//   bun prieskum/vs.ts data/vs/zdroj/uniza-sjf-avs-ing.pdf
// PDF stiahni ručne cez deň (1 súbor, robots fakulty to dovoľuje) do data/vs/zdroj/ (nie je v gite).
// Do JSON ide len predmet, kód, povinnosť, kredity, semester a rozsah; garant ani vyučujúci nie.
import { basename } from "node:path";

type Predmet = { kod: string; nazov: string; skratka: string | null; typ: "povinný" | "povinne voliteľný" | "výberový";
  ukoncenie: string; kredity: number; rocnik: number; semester: "zimný" | "letný"; hodiny: { P: number; C: number; L: number } };

/** Známe programy: kde je zdroj a ako sa volá. Nový program = nový riadok tu a PDF v data/vs/zdroj/. */
const PROGRAMY: Record<string, { skola: string; skratkaSkoly: string; fakulta: string; program: string; stupen: string; forma: string; roky: number; zdroj: string }> = {
  "uniza-sjf-avs-ing": {
    skola: "Žilinská univerzita v Žiline", skratkaSkoly: "UNIZA", fakulta: "Strojnícka fakulta",
    program: "Automatizované výrobné systémy", stupen: "Ing. (2. stupeň)", forma: "denná", roky: 2,
    zdroj: "https://www.fstroj.uniza.sk/images/pdf/akreditacia/AVS-II__D_Informacne-listy-predmetov.pdf",
  },
};

const subor = process.argv[2];
const id = subor ? basename(subor, ".pdf") : "";
const program = PROGRAMY[id];
if (!subor || !program) throw new Error(`Použitie: bun prieskum/vs.ts data/vs/zdroj/<id>.pdf (známe: ${Object.keys(PROGRAMY).join(", ")})`);

const p = Bun.spawnSync(["pdftotext", "-layout", subor, "-"], { stdout: "pipe", stderr: "pipe" });
if (p.exitCode !== 0) throw new Error(`pdftotext: ${p.stderr.toString()}`);
const text = p.stdout.toString();

const cislo = (s: string | undefined) => Number((s ?? "0").replace(",", "."));
const predmety: Predmet[] = [];
for (const list of text.split(/(?=Kód predmetu:)/).slice(1)) {
  const kod = list.match(/Kód predmetu:\s*(\S+)/)?.[1];
  // Dlhý názov pokračuje na ďalšom riadku („…systémoch“ / „(AVMS)“), až po „Povinnosť predmetu“.
  const nazovCely = list.match(/Názov predmetu:\s*([\s\S]*?)\n\s*Povinnosť predmetu:/)?.[1]?.replace(/\s+/g, " ").trim();
  const typ = list.match(/Povinnosť predmetu:\s*(povinne voliteľný|povinný|výberový)/)?.[1] as Predmet["typ"] | undefined;
  const sem = list.match(/Odporúčaný semester\/trimester štúdia:\s*(zimný|letný),\s*(\d)\.\s*ročník/);
  if (!kod || !nazovCely || !typ || !sem) throw new Error(`Neúplný list predmetu ${kod ?? "?"}`);
  const [, nazov, skratka] = nazovCely.match(/^(.*?)\s*(?:\(([^()]+)\))?$/)!;
  predmety.push({
    kod, nazov: nazov!, skratka: skratka ?? null, typ,
    ukoncenie: list.match(/Ukončenie:\s*([^\n;]+)/)?.[1]?.trim() ?? "",
    kredity: cislo(list.match(/Počet kreditov:\s*([\d.,]+)/)?.[1]),
    rocnik: Number(sem[2]), semester: sem[1] as Predmet["semester"],
    hodiny: { P: cislo(list.match(/Prednášky:\s*([\d.,]+)/)?.[1]), C: cislo(list.match(/Cvičenia:\s*([\d.,]+)/)?.[1]), L: cislo(list.match(/Lab\.\s*cvičenia:?\s*([\d.,]+)/)?.[1]) },
  });
}
if (predmety.length < 10) throw new Error(`Len ${predmety.length} predmetov, formát PDF sa asi zmenil.`);
await Bun.write(`data/vs/${id}.json`, JSON.stringify({ id, ...program, stiahnute: new Date().toISOString().slice(0, 10), predmety }, null, 1) + "\n");
console.log(`data/vs/${id}.json: ${predmety.length} predmetov`);
