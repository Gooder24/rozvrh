// Rozhranie medzi zostavením webu (web/build.ts) a vzhľadom (web/ui/). Vzhľad dostane hotové údaje
// a hlavičku pre vyhľadávače a vráti celé HTML. Na stránke s údajmi nemení nič, len ich ukazuje.
import type { Skola, SkolaKratko } from "./data";

export const ADRESA = "https://rozvrh.dvoriste.xyz";

/** Pokrytie skupiny škôl: stav podľa kategórie a podiel škôl so skutočným zvonením. */
export type Pocty = { spolu: number; verejny_rozvrh: number; len_zvonenie: number; nenajdene: number;
  /** Pokrytie: školy so skutočným zvonením (verejný rozvrh s predvoleným zvonením EduPage sa neráta). */
  zvonenie: number };

/** Hlavička: title, description, canonical, Open Graph a JSON-LD. Layout ju vloží do <head> tak, ako je. */
export type Hlava = { title: string; description: string; cesta: string; html: string };

export type Omrvinka = { nazov: string; cesta: string };

export type Domov = {
  hlava: Hlava; vytvorene: string;
  celkom: Record<"SŠ" | "ZŠ" | "spolu", Pocty>;
  kraje: { nazov: string; cesta: string; pocty: Pocty }[];
  /** Najväčšie mestá (podľa počtu škôl), na rýchle preklikanie. */
  mesta: { nazov: string; cesta: string; pocet: number }[];
};
export type Kraj = {
  hlava: Hlava; omrvinky: Omrvinka[]; nazov: string; pocty: Pocty;
  mesta: { nazov: string; cesta: string; okres: string; pocty: Pocty }[];
};
export type Mesto = {
  hlava: Hlava; omrvinky: Omrvinka[]; nazov: string; kraj: string; okres: string; pocty: Pocty;
  /** Školy mesta so zvonením (kvôli časovej osi ako v náhľade) a bez neho. */
  skoly: (SkolaKratko & { cesta: string; hodiny: { n: string; od: string; do: string; pouzita: boolean }[] })[];
};
export type StrankaSkoly = {
  hlava: Hlava; omrvinky: Omrvinka[]; skola: Skola;
  /** Cesta k JSON so všetkými triedami (pre klienta): /data/skoly/<id>.json */
  dataCesta: string;
  /** Iné školy v tom istom meste. */
  susedia: (SkolaKratko & { cesta: string })[];
};
export type Api = { hlava: Hlava };

/** Vysoká škola (beta): študijný program z informačných listov predmetov fakulty, data/vs/<id>.json (prieskum/vs.ts). */
export type VsPredmet = { kod: string; nazov: string; skratka: string | null; typ: "povinný" | "povinne voliteľný" | "výberový";
  ukoncenie: string; kredity: number; rocnik: number; semester: "zimný" | "letný"; hodiny: { P: number; C: number; L: number } };
export type VsProgram = { id: string; skola: string; skratkaSkoly: string; fakulta: string; program: string; stupen: string;
  forma: string; roky: number; zdroj: string; stiahnute: string; predmety: VsPredmet[] };
export type VysokeSkoly = { hlava: Hlava; omrvinky: Omrvinka[]; programy: (VsProgram & { cesta: string })[] };
export type VsStranka = { hlava: Hlava; omrvinky: Omrvinka[]; program: VsProgram; dataCesta: string };
export type OProjekte = { hlava: Hlava; vytvorene: string; celkom: Domov["celkom"] };

/** Čo musí web/ui/render.ts exportovať. */
export type Render = {
  domov(d: Domov): string;
  kraj(d: Kraj): string;
  mesto(d: Mesto): string;
  skola(d: StrankaSkoly): string;
  api(d: Api): string;
  oProjekte(d: OProjekte): string;
  vysokeSkoly(d: VysokeSkoly): string;
  vsProgram(d: VsStranka): string;
  chyba404(d: { hlava: Hlava }): string;
};
