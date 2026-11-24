// Typy údajov webu, API a MCP (bez kódu, aby ich mohol použiť aj Worker).
export type Hodina = { n: string; od: string; do: string; pouzita?: boolean };
export type Stav = "verejny_rozvrh" | "len_zvonenie" | "nenajdene";
export type Stupen = "SŠ" | "ZŠ";

/** Jedna hodina v rozvrhu triedy. den: 0 = pondelok. */
export type Blok = {
  den: number; hodina: string; trvanie: number; predmet: string; skratka: string;
  ucebna: string | null; skupina: string | null; tyzden: string | null;
};
export type Trieda = { nazov: string; bloky: Blok[] };

/** Riadok indexu: všetko, čo treba na zoznamy, hľadanie a mapu. */
export type SkolaKratko = {
  id: string; slug: string; nazov: string; stupen: Stupen; typ: string; druh: string;
  kraj: string; okres: string; miesto: string; ulica: string; mestoSlug: string; zriadovatel: string; ziaci: number;
  stav: Stav; edupage: string | null;
  /** Prvá a posledná použitá hodina (HH:MM), keď poznáme skutočné zvonenie. */
  zaciatok: string | null; koniec: string | null; pocetHodin: number | null;
};
/** Celý záznam školy (stránka školy a /api/v1/schools/{id}). */
export type Skola = SkolaKratko & {
  psc: string; web: string | null;
  zvonenie: { hodiny: Hodina[]; zdroj: string; url: string; predvolene: boolean } | null;
  rozvrh: {
    nazov: string | null; od: string | null; dni: string[]; triedy: number; ucebne: number;
    lekcie: number; karty: number; dvojhodiny: number;
  } | null;
  triedy: Trieda[];
  skontrolovane: string;
};
