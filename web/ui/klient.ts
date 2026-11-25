// Správanie v prehliadači: hľadanie školy alebo obce, triedenie časovej osi obce, čiara „teraz“
// a týždenná mriežka triedy na stránke školy. Jeden súbor pre všetky stránky; každá časť sa zapne len tam,
// kde nájde svoje prvky. Bez tohto súboru stránky ukážu všetko okrem hľadania a mriežky triedy.
import type { Blok, Skola } from "../data";
import type { VsPredmet, VsProgram } from "../stranky";
import { druhObce } from "../obce";
import { FARBY, farbyPredmetov } from "./farby";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const bezDiakritiky = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** Rovnaké pravidlo ako slug() vo web/data.ts, aby cesta obce sedela so zostavenými stránkami. */
const slug = (s: string) => bezDiakritiky(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const sklonuj = (n: number, jeden: string, dva: string, pat: string) => `${n} ${n === 1 ? jeden : n >= 2 && n <= 4 ? dva : pat}`;
const cas = (t: string) => t.replace(/^0(\d)/, "$1");
/** Mapa sa načíta za behu, nie v klient.js (premenná: zostavovač adresu nerieši). */
const MAPA_JS = "/assets/mapa.js";

// Hľadanie -----------------------------------------------------------------------------------------------------
/** Riadok /data/hladanie.json. Piaty prvok (ulica) je nepovinný: použije sa, keď ho zostavenie pridá. */
type Riadok = [nazov: string, miesto: string, cesta: string, stav: 0 | 1 | 2, ulica?: string];
const STAV = [["c", "nenájdené"], ["b", "len zvonenie"], ["a", "verejný rozvrh"]] as const;

/** Skratky v názvoch škôl: „ZŠ“ nájde „Základná škola“, „svätého“ nájde „sv.“ a naopak. Kľúče sú bez diakritiky. */
const SKRATKY: Record<string, string[]> = {
  zs: ["zakladna skola"], zus: ["zakladna umelecka skola"], ss: ["stredna skola"], sos: ["stredna odborna skola"],
  sps: ["stredna priemyselna skola"], oa: ["obchodna akademia"], ha: ["hotelova akademia"], gym: ["gymnazium"],
  sv: ["svat"],
};
const moznosti = (slovo: string) => {
  const hole = slovo.replace(/\.$/, "");
  return [slovo, ...(SKRATKY[hole] ?? []), ...(hole.length > 3 && hole.startsWith("svat") ? ["sv."] : [])];
};
/** Text s podčiarknutým tým, čo človek napísal (bez ohľadu na diakritiku a veľké písmená). */
const zvyrazni = (text: string, hladane: string[]) => {
  const znaky = [...text];
  let norm = "";
  const odkial: number[] = []; // index v norm → index znaku v texte
  znaky.forEach((z, i) => { for (const n of bezDiakritiky(z)) { norm += n; odkial.push(i); } });
  const oznac = new Array<boolean>(znaky.length).fill(false);
  for (const h of hladane) {
    if (!h) continue;
    for (let i = norm.indexOf(h); i >= 0; i = norm.indexOf(h, i + 1)) for (let j = i; j < i + h.length; j++) oznac[odkial[j]!] = true;
  }
  let von = "", v = false;
  znaky.forEach((z, i) => {
    if (oznac[i] !== v) { von += v ? "</mark>" : "<mark>"; v = oznac[i]!; }
    von += esc(z);
  });
  return v ? `${von}</mark>` : von;
};

const pole = document.querySelector<HTMLInputElement>("#q");
document.addEventListener("keydown", (e) => {
  const kde = e.target instanceof HTMLElement ? e.target : null;
  if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || !pole || kde?.closest("input,textarea,select,[contenteditable]")) return;
  e.preventDefault();
  pole.focus();
  pole.select();
});

const formular = document.querySelector<HTMLFormElement>("#hladanie");
const vysledky = document.querySelector<HTMLElement>("#vysledky");
const stavHladania = document.querySelector<HTMLElement>("#hladanie-stav");
if (pole && formular && vysledky && stavHladania) {
  type Zaznam = { r: Riadok; kluc: string; miesto: string; i: number };
  let index: Promise<Zaznam[]> | null = null;
  const nacitaj = () => index ??= fetch("/data/hladanie.json").then(async (o) => {
    if (!o.ok) throw new Error(String(o.status));
    return ((await o.json()) as Riadok[]).map((r, i) => ({ r, i, kluc: bezDiakritiky(`${r[0]} ${r[1]} ${r[4] ?? ""}`), miesto: bezDiakritiky(r[1]) }));
  });
  const odkazy = () => [...vysledky.querySelectorAll<HTMLAnchorElement>("a")];

  // Zoznam alebo mapa (mapa je ukážka: prepínač je na stránke len pri MAPA=1). Mapa ukazuje všetky nájdené školy,
  // zoznam prvých 40; bez hľadania ukáže mapa všetky školy.
  const mapaEl = document.querySelector<HTMLElement>("#mapa");
  const prepinace = [...document.querySelectorAll<HTMLButtonElement>("[data-zobraz]")];
  let vybrane: number[] | null = null;
  let ukazNaMape: ((v: number[] | null) => void) | null = null;
  let mapaSa: Promise<void> | null = null;
  // Údaje aj kód mapy naraz; začne sa už pri prejdení myšou alebo dotyku tlačidla „Mapa“.
  type Body = ([number, number] | null)[];
  let pripravene: Promise<[Zaznam[], Body, typeof import("./mapa")]> | null = null;
  const priprav = () => pripravene ??= Promise.all([nacitaj(), fetch("/data/mapa.json").then((o) => o.json() as Promise<Body>), import(MAPA_JS) as Promise<typeof import("./mapa")>])
    .catch((e: unknown) => { pripravene = null; throw e; });
  const PAMAT_ZOBRAZENIA = "rozvrh-zobrazenie";
  const naMape = () => prepinace.some((b) => b.dataset.zobraz === "mapa" && b.getAttribute("aria-pressed") === "true");
  const zobraz = async (ako: string) => {
    if (!mapaEl) return;
    for (const b of prepinace) b.setAttribute("aria-pressed", String(b.dataset.zobraz === ako));
    try { localStorage.setItem(PAMAT_ZOBRAZENIA, ako); } catch { /* bez pamäte */ }
    mapaEl.hidden = ako !== "mapa";
    vysledky.hidden = ako === "mapa";
    if (pole.value.trim().length >= 2) void hladaj(); // veta o počte sa líši pre zoznam a mapu
    if (ako !== "mapa") return;
    mapaSa ??= (async () => {
      const [riadky, body, m] = await priprav();
      ukazNaMape = await m.vytvor(mapaEl, riadky.map((z) => z.r), body);
    })().catch(() => { mapaSa = null; stavHladania.textContent = "Mapu sa nepodarilo načítať. Skúste to znova alebo zostaňte pri zozname."; });
    await mapaSa;
    ukazNaMape?.(vybrane);
  };
  for (const b of prepinace) {
    b.addEventListener("click", () => void zobraz(b.dataset.zobraz ?? "zoznam"));
    if (b.dataset.zobraz === "mapa") for (const u of ["pointerenter", "focus", "touchstart"]) b.addEventListener(u, () => void priprav().catch(() => {}), { once: true, passive: true });
  }

  let poradie = 0;
  const hladaj = async () => {
    const q = pole.value.trim();
    const moje = ++poradie;
    history.replaceState(null, "", q ? `/?q=${encodeURIComponent(q)}` : "/");
    if (q.length < 2) { vysledky.innerHTML = ""; stavHladania.textContent = q ? "Napíšte aspoň dve písmená." : ""; vybrane = null; if (naMape()) ukazNaMape?.(null); return; }
    let zaznamy: Zaznam[];
    try { zaznamy = await nacitaj(); } catch {
      index = null;
      stavHladania.textContent = "Zoznam škôl sa nepodarilo načítať. Skontrolujte pripojenie a skúste to znova.";
      return;
    }
    if (moje !== poradie) return;
    const slova = bezDiakritiky(q).split(/\s+/).filter(Boolean);
    const cele = slova.join(" ");
    const varianty = slova.map(moznosti);
    const sedi = (text: string) => varianty.every((v) => v.some((x) => text.includes(x)));
    const zhoda = zaznamy.filter((z) => sedi(z.kluc));
    const obce = new Map<string, number>();
    for (const z of zaznamy) if (sedi(z.miesto)) obce.set(z.r[1], (obce.get(z.r[1]) ?? 0) + 1);
    const zv = (t: string) => zvyrazni(t, varianty.flat());
    const vaha = (z: Zaznam) => (z.miesto === cele ? 0 : z.miesto.startsWith(cele) ? 1 : z.kluc.startsWith(cele) ? 2 : 3);
    zhoda.sort((a, b) => vaha(a) - vaha(b) || b.r[3] - a.r[3] || a.r[0].localeCompare(b.r[0], "sk") || a.r[1].localeCompare(b.r[1], "sk"));
    const zoradeneObce = [...obce].sort((a, b) => Number(bezDiakritiky(b[0]).startsWith(cele)) - Number(bezDiakritiky(a[0]).startsWith(cele)) || b[1] - a[1]).slice(0, 5);
    const ukazane = zhoda.slice(0, 40);
    vybrane = zhoda.map((z) => z.i);
    if (naMape()) ukazNaMape?.(vybrane);
    stavHladania.textContent = zhoda.length || zoradeneObce.length
      ? `${sklonuj(zhoda.length, "škola", "školy", "škôl")}${zhoda.length > ukazane.length && !naMape() ? `, ukazujeme prvých ${ukazane.length}` : ""}${obce.size ? ` a ${sklonuj(obce.size, "obec", "obce", "obcí")}` : ""}. Klávesom Enter otvoríte prvý výsledok.`
      : `Pre „${q}“ sme nenašli školu ani obec. Skúste len časť názvu alebo názov obce.`;
    vysledky.innerHTML = zhoda.length || zoradeneObce.length ? `<ul class="najdene">${zoradeneObce.map(([m, n]) =>
      `<li><a href="/mesto/${slug(m)}/"><b>${zv(m)}</b><small>${druhObce(m)}, ${sklonuj(n, "škola", "školy", "škôl")}</small></a></li>`).join("")}${ukazane.map(({ r }) =>
      `<li><a href="${esc(r[2])}"><b>${zv(r[0])}</b><small><i class="st ${STAV[r[3]][0]}"></i> ${STAV[r[3]][1]}</small><span class="kde">${zv(r[4] ? `${r[4]}, ${r[1]}` : r[1])}</span></a></li>`).join("")}</ul>` : "";
  };

  pole.addEventListener("focus", () => void nacitaj().catch(() => { index = null; }), { once: true });
  pole.addEventListener("input", () => void hladaj());
  formular.addEventListener("submit", (e) => {
    e.preventDefault();
    void hladaj().then(() => odkazy()[0]?.click());
  });
  // Šípky prechádzajú medzi poľom a výsledkami.
  const posun = (e: KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const o = odkazy();
    const i = o.indexOf(document.activeElement as HTMLAnchorElement) + (e.key === "ArrowDown" ? 1 : -1);
    if (!o.length || i >= o.length) return;
    e.preventDefault();
    (i < 0 ? pole : o[i])?.focus();
  };
  pole.addEventListener("keydown", posun);
  vysledky.addEventListener("keydown", posun);

  const zAdresy = new URLSearchParams(location.search).get("q");
  if (zAdresy) { pole.value = zAdresy; void hladaj(); }
  let ulozene = "";
  try { ulozene = localStorage.getItem(PAMAT_ZOBRAZENIA) ?? ""; } catch { /* bez pamäte */ }
  if (mapaEl && ulozene === "mapa") void zobraz("mapa");
}

// Časová os obce: triedenie a výber stupňa ---------------------------------------------------------------------
const os = document.querySelector<HTMLElement>("#os");
if (os) {
  const rady = os.querySelector<HTMLOListElement>(".os-rady");
  const oznam = os.querySelector<HTMLElement>("#os-stav");
  const stlac = (skupina: string, stlacene: HTMLElement) => {
    for (const b of os.querySelectorAll<HTMLElement>(`[${skupina}]`)) b.setAttribute("aria-pressed", String(b === stlacene));
  };
  // Na tlačidlách, nie na celej tabuli: inak čítačka hlási pri každom texte v nej „klikateľné“.
  for (const b of os.querySelectorAll<HTMLElement>("button.volba")) b.addEventListener("click", () => {
    if (!rady) return;
    const riadky = [...rady.children] as HTMLElement[];
    const podla = b.dataset.zorad;
    if (podla) {
      const cislo = (li: HTMLElement, k: "o" | "k") => Number(li.dataset[k]);
      const nazov = (li: HTMLElement) => li.querySelector("a")?.textContent ?? "";
      const poNazve = (x: HTMLElement, y: HTMLElement) => nazov(x).localeCompare(nazov(y), "sk");
      riadky.sort(podla === "nazov" ? poNazve : (x, y) => cislo(x, podla === "do" ? "k" : "o") - cislo(y, podla === "do" ? "k" : "o") || poNazve(x, y));
      rady.append(...riadky);
      stlac("data-zorad", b);
      if (oznam) oznam.textContent = `Školy sú zoradené ${b.textContent}.`;
    } else if (b.dataset.stupen !== undefined) {
      const stupen = b.dataset.stupen;
      for (const li of riadky) li.hidden = stupen !== "" && li.dataset.st !== stupen;
      stlac("data-stupen", b);
      if (oznam) oznam.textContent = `Ukazujeme ${sklonuj(riadky.filter((li) => !li.hidden).length, "školu", "školy", "škôl")}.`;
    }
  });
}

// Čiara „teraz“ na osiach obce; na stránke školy veta a zvýraznená práve prebiehajúca hodina či prestávka ------
const osi = [...document.querySelectorAll<HTMLElement>(".os")];
const zvon = [...document.querySelectorAll<HTMLElement>(".zvon li")];
if (osi.length || zvon.length) {
  const hodiny = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Bratislava", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const veta = document.querySelector<HTMLElement>("#teraz");
  const cislo = (n: string) => (n.length <= 2 ? n.replace(/\.$/, "") : "");
  const bloky = veta ? zvon.filter((li) => li.matches(".hod:not(.n)")).map((li) => ({
    n: cislo(li.dataset.n ?? ""), od: Number(li.dataset.od), do: Number(li.dataset.do),
  })) : [];
  const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  const obnov = () => {
    const casti = Object.fromEntries(hodiny.formatToParts(new Date()).map((p) => [p.type, p.value]));
    const teraz = Number(casti.hour) * 60 + Number(casti.minute);
    const pracovnyDen = casti.weekday !== "Sat" && casti.weekday !== "Sun";
    for (const o of osi) {
      const t0 = Number(o.style.getPropertyValue("--t0"));
      const t1 = t0 + Number(o.style.getPropertyValue("--tr"));
      const cisla = o.querySelector<HTMLElement>(".os-cisla");
      if (pracovnyDen && teraz >= t0 && teraz <= t1) {
        o.style.setProperty("--teraz", String(teraz));
        o.dataset.teraz = "1";
        cisla?.setAttribute("data-teraz", hm(teraz));
      } else {
        delete o.dataset.teraz;
        cisla?.removeAttribute("data-teraz");
      }
    }
    // Zvýrazní sa len čas medzi začiatkom prvej a koncom poslednej hodiny, ktorú rozvrh používa.
    const vRozsahu = pracovnyDen && bloky.length > 0 && teraz >= bloky[0]!.od && teraz < bloky.at(-1)!.do;
    for (const li of zvon) {
      const je = vRozsahu && !li.matches(".n") && teraz >= Number(li.dataset.od) && teraz < Number(li.dataset.do);
      if (je) li.setAttribute("aria-current", "time"); else li.removeAttribute("aria-current");
    }
    if (!veta) return;
    const prva = bloky[0];
    const posledna = bloky.at(-1);
    let text = "";
    if (pracovnyDen && prva && posledna && teraz >= prva.od - 60 && teraz < posledna.do) {
      const bezi = bloky.find((b) => teraz >= b.od && teraz < b.do);
      const dalsia = bloky.find((b) => b.od > teraz);
      const oznac = (b: { n: string }) => (b.n ? `${b.n}. hodina` : "hodina");
      const predosla = bloky.findLast((b) => b.do <= teraz);
      const pauza = !!(dalsia && predosla && dalsia.od - predosla.do >= 60); // rovnako ako „pauza“ v zozname zvonenia
      if (bezi) text = `Podľa zvonenia je teraz ${oznac(bezi)}. Zvoní o ${hm(bezi.do)}, teda o ${bezi.do - teraz} min.`;
      else if (dalsia) text = `${teraz < prva.od ? "Vyučovanie sa ešte nezačalo" : `Podľa zvonenia je teraz ${pauza ? "pauza" : "prestávka"}`}. ${oznac(dalsia)[0]?.toUpperCase()}${oznac(dalsia).slice(1)} sa začína o ${hm(dalsia.od)}, teda o ${dalsia.od - teraz} min.`;
    }
    if (veta.textContent !== text) veta.textContent = text;
  };
  obnov();
  setInterval(obnov, 30_000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) obnov(); });
}

// Týždenná mriežka triedy -------------------------------------------------------------------------------------
const sekcia = document.querySelector<HTMLElement>("#rozvrh");
const zoznamTried = sekcia?.querySelector<HTMLUListElement>(".triedy");
const mriezka = sekcia?.querySelector<HTMLElement>("#mriezka");
if (sekcia && zoznamTried && mriezka) {
  const zdroj = sekcia.dataset.src ?? "";
  const pamat = `trieda:${zdroj}`;
  const nazvy = [...zoznamTried.children].map((li) => li.textContent ?? "");
  zoznamTried.innerHTML = nazvy.map((n) => `<li><button class="volba" aria-pressed="false">${esc(n)}</button></li>`).join("");
  zoznamTried.insertAdjacentHTML("beforebegin", `<p id="vyber-triedy">Vyberte triedu a ukáže sa jej týždenný rozvrh.</p>`);
  const tlacidla = [...zoznamTried.querySelectorAll<HTMLButtonElement>("button")];
  mriezka.setAttribute("aria-live", "polite");

  let udaje: Promise<Skola> | null = null;
  const nacitaj = () => udaje ??= fetch(zdroj).then(async (o) => {
    if (!o.ok) throw new Error(String(o.status));
    return (await o.json()) as Skola;
  });
  const kluc = (n: string) => n.trim().replace(/\.$/, "");

  const farbaStyl = (s: Skola, skratka: string) => {
    const c = FARBY[farbyPredmetov(s.triedy).get(skratka) ?? -1];
    return c ? ` style="--bg:${c.bg};--fg:${c.fg}"` : "";
  };
  const vykresli = (s: Skola, nazov: string) => {
    const trieda = s.triedy.find((t) => t.nazov === nazov);
    if (!trieda) return `<p class="stav-nacitania">Trieda ${esc(nazov)} v rozvrhu nie je.</p>`;
    // Stĺpce sú hodiny školy v rozsahu, ktorý používa aspoň jedna trieda, aby mriežka pri prepnutí triedy neskákala.
    const stlpce: { n: string; od: string | null; do: string | null }[] = (s.zvonenie?.hodiny ?? []).map((h) => ({ n: kluc(h.n), od: h.od, do: h.do }));
    const vsetky = s.triedy.flatMap((t) => t.bloky);
    const chybaju = [...new Set(vsetky.map((b) => kluc(b.hodina)))].filter((n) => !stlpce.some((h) => h.n === n));
    stlpce.push(...chybaju.map((n) => ({ n, od: null, do: null })));
    if (!s.zvonenie) stlpce.sort((a, b) => Number(a.n) - Number(b.n) || a.n.localeCompare(b.n, "sk"));
    const kde = new Map(stlpce.map((h, i) => [h.n, i]));
    const miesto = (b: Blok) => kde.get(kluc(b.hodina)) ?? 0;
    const prvy = Math.min(...vsetky.map(miesto));
    const posledny = Math.min(Math.max(...vsetky.map((b) => miesto(b) + Math.max(b.trvanie, 1) - 1)), stlpce.length - 1);
    const vidno = stlpce.slice(prvy, posledny + 1);
    const cisloHodiny = (n: string) => (/^\d+$/.test(n) ? `${n}.` : n);
    const kedy = (b: Blok) => {
      const a = stlpce[miesto(b)];
      const z = stlpce[Math.min(miesto(b) + Math.max(b.trvanie, 1) - 1, stlpce.length - 1)];
      const hodina = a === z || !z ? cisloHodiny(a?.n ?? b.hodina) : `${cisloHodiny(a?.n ?? b.hodina)}–${cisloHodiny(z.n)}`;
      return `<span class="kedy"><b>${esc(hodina)}</b><span class="vh"> hodina</span>${a?.od && z?.do ? ` <span class="t">${esc(cas(a.od))}–${esc(cas(z.do))}</span>` : ""}</span>`;
    };
    const dni = s.rozvrh?.dni.length ? s.rozvrh.dni : ["Pondelok", "Utorok", "Streda", "Štvrtok", "Piatok"];
    const pocetDni = Math.max(dni.length, ...trieda.bloky.map((b) => b.den + 1));
    const odhad = (b: Blok) => s.predmety?.[b.predmet];
    const nazovP = (b: Blok) => odhad(b)?.nazov ?? b.predmet;
    const ODHAD = `<abbr class="odhad" title="Názov doplnený podľa iných škôl (beta)">≈</abbr>`;
    const bezNazvu = (b: Blok) => !odhad(b) && b.predmet.trim().toUpperCase() === b.skratka.trim().toUpperCase();
    // Skupiny píšu školy rôzne („TSVch“, „1.sk“); ukážeme ich jednotne. Samotné „D“ či „CH“ môže byť aj skupina D, ostane.
    const skupina = (x: string) => {
      const t = x.trim();
      if (/^(?:(?:tsv|tv)\s*(?:ch|chl|chlapci)|chl|chlapci)$/i.test(t)) return "chlapci";
      if (/^(?:(?:tsv|tv)\s*(?:d|dv|dievčatá)|dv|dievčatá)$/i.test(t)) return "dievčatá";
      return t.replace(/^(\d+)\s*\.?\s*sk(upina)?\.?$/i, "$1. skupina");
    };
    const blok = (b: Blok) => {
      const dalsie = [b.skupina ? skupina(b.skupina) : null, b.tyzden ? `týždeň ${b.tyzden}` : null].filter(Boolean).join(", ");
      return `<li class="f"${farbaStyl(s, b.skratka)}><span class="sk" aria-hidden="true" title="${esc(nazovP(b))}${odhad(b) ? " (odhad podľa iných škôl)" : ""}">${esc(b.skratka)}</span> <span class="pr">${esc(nazovP(b))}${odhad(b) ? ` ${ODHAD}` : ""}</span>${b.ucebna ? ` <span class="uc"><span class="vh">učebňa </span>${esc(b.ucebna)}</span>` : ""}${dalsie ? ` <span class="dalsie">${esc(dalsie)}</span>` : ""}</li>`;
    };
    // Bloky, ktoré sa začínajú v tú istú hodinu a trvajú rovnako (skupiny, semináre), sú jedna bunka:
    // vedľa seba (na počítači po dvoch v rade, na mobile v jednom riadku).
    const bunky = (bloky: Blok[]) => {
      const m = new Map<string, Blok[]>();
      for (const b of bloky) { const k = `${miesto(b)}|${Math.max(b.trvanie, 1)}`; (m.get(k) ?? m.set(k, []).get(k)!).push(b); }
      return [...m.values()].sort((x, y) => miesto(x[0]!) - miesto(y[0]!));
    };
    const predmety = new Map(trieda.bloky.map((b) => [b.skratka, b]));
    const odhady = [...predmety.values()].some((b) => odhad(b));
    const vlastne = [...predmety.values()].some((b) => !odhad(b) && !bezNazvu(b));
    const pozn = odhady
      ? `<p class="odhad-pozn"><span class="beta-znak">beta</span> Názvy so znakom ≈ škola v rozvrhu neuvádza, píše len skratku. Doplnili sme ich podľa toho, ako tú skratku píše väčšina ostatných škôl, a môžu sa mýliť.${vlastne ? " Ostatné názvy uvádza škola." : ""}</p>`
      : vlastne ? `<p class="odhad-pozn">Názvy predmetov uvádza škola v rozvrhu.</p>` : "";
    return `<div class="mr-obal"><div class="mr" style="--n:${vidno.length}"><h3 class="vh">Rozvrh triedy ${esc(nazov)}</h3>
<div class="mr-hlava" aria-hidden="true"><span></span><ol>${vidno.map((h) => `<li><b>${esc(h.n)}</b>${h.od && h.do ? `${esc(cas(h.od))}–${esc(cas(h.do))}` : ""}</li>`).join("")}</ol></div>
${Array.from({ length: pocetDni }, (_, den) => {
      const bloky = trieda.bloky.filter((b) => b.den === den);
      return `<section class="mr-den"><h3>${esc(dni[den] ?? `Deň ${den + 1}`)}</h3><ul>${bloky.length ? bunky(bloky).map((g) =>
        `<li class="g${g.length > 2 ? " vela" : ""}" style="--c:${miesto(g[0]!) - prvy + 1};--w:${Math.max(g[0]!.trvanie, 1)}">${kedy(g[0]!)}<ul>${g.map(blok).join("")}</ul></li>`).join("")
        : `<li class="volno">bez vyučovania</li>`}</ul></section>`;
    }).join("")}</div></div>
<ul class="predmety" aria-label="Skratky predmetov">${[...predmety].sort((a, b) => a[0].localeCompare(b[0], "sk")).map(([sk, b]) =>
      `<li><i class="fz"${farbaStyl(s, sk)} aria-hidden="true"></i><b>${esc(sk)}</b>${bezNazvu(b) ? `<span class="bez">škola názov neuvádza</span>` : `${esc(nazovP(b))}${odhad(b) ? ` ${ODHAD}` : ""}`}</li>`).join("")}</ul>${pozn}`;
  };

  let vybrana = "";
  const ukaz = async (nazov: string) => {
    vybrana = nazov;
    for (const b of tlacidla) b.setAttribute("aria-pressed", String(b.textContent === nazov));
    document.querySelector("#vyber-triedy")?.remove();
    if (!udaje) mriezka.innerHTML = `<p class="stav-nacitania">Načítavam rozvrh triedy ${esc(nazov)}.</p>`;
    try {
      const s = await nacitaj();
      if (vybrana !== nazov) return;
      mriezka.innerHTML = vykresli(s, nazov);
      history.replaceState(null, "", `#trieda=${encodeURIComponent(nazov)}`);
      try { localStorage.setItem(pamat, nazov); } catch { /* súkromné okno: výber sa len nezapamätá */ }
    } catch {
      udaje = null;
      mriezka.innerHTML = `<p class="stav-nacitania">Rozvrh sa nepodarilo načítať. <button class="volba" id="znova">Skúsiť znova</button></p>`;
      mriezka.querySelector("#znova")?.addEventListener("click", () => void ukaz(nazov));
    }
  };
  zoznamTried.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (b?.textContent) void ukaz(b.textContent);
  });
  // Trieda z adresy (#trieda=IV.A) alebo naposledy otvorená v tomto prehliadači sa ukáže hneď.
  const zAdresy = (() => { try { return decodeURIComponent(location.hash.match(/^#trieda=(.+)$/)?.[1] ?? ""); } catch { return ""; } })();
  let zPamate = "";
  try { zPamate = localStorage.getItem(pamat) ?? ""; } catch { /* bez pamäte */ }
  const prva = [zAdresy, zPamate].find((n) => nazvy.includes(n));
  if (prva) void ukaz(prva);
}

// Vysoké školy (beta): skúšobný rozvrh zo zvolených predmetov --------------------------------------------------
// Predmet dá bloky (prednáška, cvičenie, laboratórne cvičenie) s dĺžkou podľa informačného listu. Čas bloku volí
// človek (alebo „Rozložiť za mňa“); výber sa pamätá v tomto prehliadači pre každý program zvlášť.
const planovac = document.querySelector<HTMLElement>("#planovac");
if (planovac?.dataset.src) {
  const zdroj = planovac.dataset.src;
  const DNI = ["Pondelok", "Utorok", "Streda", "Štvrtok", "Piatok"];
  const OD = 7, DO = 20; // hodiny v mriežke 7:00–20:00
  const DRUHY = [["P", "prednáška"], ["C", "cvičenie"], ["L", "laboratórne cvičenie"]] as const;
  type Druh = (typeof DRUHY)[number][0];
  type BlokVs = { id: string; predmet: VsPredmet; druh: Druh; dlzka: number };
  type Stav = { sem: string; vybrane: string[]; casy: Record<string, { den: number; od: number }> };
  const pamat = `vs:${zdroj}`;
  const kredity = (n: number) => sklonuj(n, "kredit", "kredity", "kreditov");
  const hodiny = (n: number) => sklonuj(n, "hodina", "hodiny", "hodín");

  const zobraz = (p: VsProgram) => {
    const semestre = [...new Set(p.predmety.map((x) => `${x.rocnik}|${x.semester}`))]
      .sort((a, b) => Number(a[0]) - Number(b[0]) || Number(a.endsWith("letný")) - Number(b.endsWith("letný")));
    let stav: Stav = { sem: semestre[0]!, vybrane: [], casy: {} };
    try { stav = { ...stav, ...(JSON.parse(localStorage.getItem(pamat) ?? "{}") as Partial<Stav>) }; } catch { /* nový výber */ }
    if (!semestre.includes(stav.sem)) stav.sem = semestre[0]!;
    const uloz = () => { try { localStorage.setItem(pamat, JSON.stringify(stav)); } catch { /* súkromné okno */ } };

    const vSemestri = () => p.predmety.filter((x) => `${x.rocnik}|${x.semester}` === stav.sem);
    const zvolene = () => vSemestri().filter((x) => x.typ === "povinný" || stav.vybrane.includes(x.kod));
    const bloky = (): BlokVs[] => zvolene().flatMap((x) => DRUHY.filter(([k]) => x.hodiny[k] > 0)
      .map(([k]) => ({ id: `${x.kod}:${k}`, predmet: x, druh: k, dlzka: Math.max(1, Math.round(x.hodiny[k])) })));
    const kolizie = (b: BlokVs[]) => {
      const zle = new Set<string>();
      for (const x of b) for (const y of b) {
        const a = stav.casy[x.id], c = stav.casy[y.id];
        if (x !== y && a && c && a.den === c.den && a.od < c.od + y.dlzka && c.od < a.od + x.dlzka) zle.add(x.id);
      }
      return zle;
    };
    // Za mňa: najdlhšie bloky prvé, do dňa s najmenej hodinami, prednášky skôr ako cvičenia, bez prekryvov.
    const rozloz = () => {
      const b = bloky();
      for (const x of b) if (stav.casy[x.id] && (stav.casy[x.id]!.od + x.dlzka > DO)) delete stav.casy[x.id];
      // Prekryté bloky: prvý ostane, kde je, ďalšie stratia čas a rozložia sa nižšie.
      const drzane: BlokVs[] = [];
      for (const x of b) {
        if (!stav.casy[x.id]) continue;
        if (kolizie([...drzane, x]).has(x.id)) delete stav.casy[x.id];
        else drzane.push(x);
      }
      const volne = b.filter((x) => !stav.casy[x.id]).sort((a, c) => c.dlzka - a.dlzka || a.druh.localeCompare(c.druh));
      for (const x of volne) {
        const zataz = DNI.map((_, d) => b.filter((y) => stav.casy[y.id]?.den === d).reduce((s, y) => s + y.dlzka, 0));
        const dni = DNI.map((_, d) => d).sort((a, c) => zataz[a]! - zataz[c]!);
        najdi: for (const d of dni) for (let h = x.druh === "P" ? 8 : 9; h + x.dlzka <= DO; h++) {
          stav.casy[x.id] = { den: d, od: h };
          if (!kolizie(b).has(x.id)) break najdi;
          delete stav.casy[x.id];
        }
      }
    };

    const vykresli = () => {
      const v = vSemestri(), z = zvolene(), b = bloky(), zle = kolizie(b);
      const sucet = z.reduce((s, x) => s + x.kredity, 0);
      const tyzdenne = b.reduce((s, x) => s + x.dlzka, 0);
      const bezCasu = b.filter((x) => !stav.casy[x.id]).length;
      const nazovSem = (k: string) => { const [r, s] = k.split("|"); return `${r}. ročník, ${s}`; };
      const meno = (x: VsPredmet) => x.skratka ?? x.nazov;
      const druh = (k: Druh) => DRUHY.find(([d]) => d === k)![1];
      const casText = (h: number) => `${h}:00`;
      planovac.querySelector(".pl")?.remove();
      planovac.insertAdjacentHTML("beforeend", `<div class="pl">
<div class="volby" role="group" aria-label="Semester"><span aria-hidden="true">Semester</span>${semestre.map((k) => `<button class="volba" data-sem="${esc(k)}" aria-pressed="${k === stav.sem}">${esc(nazovSem(k))}</button>`).join("")}</div>
<div class="pl-dvoje">
<div class="pl-predmety">
<p class="pl-sucet" role="status"><b>${sucet}</b> z odporúčaných 30 kreditov · ${hodiny(tyzdenne)} týždenne${sucet < 30 ? ` · chýba ${kredity(30 - sucet)}` : ""}</p>
<div class="pl-meter" aria-hidden="true"><i style="--p:${Math.min(sucet / 30, 1.2)}"></i></div>
${([["povinný", "Povinné"], ["povinne voliteľný", "Povinne voliteľné"], ["výberový", "Výberové"]] as const).map(([typ, nadpis]) => {
        const z2 = v.filter((x) => x.typ === typ);
        return z2.length ? `<h3>${nadpis}</h3><ul class="pl-zoznam">${z2.map((x) => `<li><label><input type="checkbox" data-kod="${esc(x.kod)}"${typ === "povinný" || stav.vybrane.includes(x.kod) ? " checked" : ""}${typ === "povinný" ? " disabled" : ""}> <span>${esc(x.nazov)}<small>${x.kredity} kr · ${DRUHY.filter(([k]) => x.hodiny[k] > 0).map(([k]) => `${k}${x.hodiny[k]}`).join(" ") || "bez výučby"} · ${esc(x.ukoncenie.toLowerCase())}</small></span></label></li>`).join("")}</ul>` : "";
      }).join("")}
</div>
<div class="pl-casy"><h3>Časy blokov</h3>
<p><button class="tlacidlo" data-akcia="rozloz">Rozložiť za mňa</button> <button class="volba" data-akcia="vymaz">Vymazať časy</button></p>
${bezCasu ? `<p class="pl-pozor">${sklonuj(bezCasu, "blok je", "bloky sú", "blokov je")} ešte bez času.</p>` : ""}
${zle.size ? `<p class="pl-pozor">Niektoré bloky sa prekrývajú (červený okraj).</p>` : ""}
<ul class="pl-bloky">${b.map((x) => {
        const c = stav.casy[x.id];
        return `<li${zle.has(x.id) ? ` class="kolizia"` : ""}><span><b>${esc(meno(x.predmet))}</b> ${druh(x.druh)}, ${x.dlzka} h</span>
<label class="vh" for="d-${esc(x.id)}">Deň pre ${esc(meno(x.predmet))}, ${druh(x.druh)}</label><select class="pole" id="d-${esc(x.id)}" data-den="${esc(x.id)}"><option value="">deň</option>${DNI.map((n, i) => `<option value="${i}"${c?.den === i ? " selected" : ""}>${n.slice(0, 2)}</option>`).join("")}</select>
<label class="vh" for="h-${esc(x.id)}">Začiatok pre ${esc(meno(x.predmet))}, ${druh(x.druh)}</label><select class="pole" id="h-${esc(x.id)}" data-od="${esc(x.id)}"><option value="">od</option>${Array.from({ length: DO - OD - x.dlzka + 1 }, (_, i) => OD + i).map((h) => `<option value="${h}"${c?.od === h ? " selected" : ""}>${casText(h)}</option>`).join("")}</select></li>`;
      }).join("")}</ul></div></div>
<div class="mr-obal"><div class="mr" style="--n:${DO - OD}"><h3 class="vh">Skúšobný týždeň</h3>
<div class="mr-hlava" aria-hidden="true"><span></span><ol>${Array.from({ length: DO - OD }, (_, i) => `<li><b>${OD + i}:00</b></li>`).join("")}</ol></div>
${DNI.map((n, d) => {
        const den = b.filter((x) => stav.casy[x.id]?.den === d).sort((a, c) => stav.casy[a.id]!.od - stav.casy[c.id]!.od);
        return `<section class="mr-den"><h3>${n}</h3><ul>${den.length ? den.map((x) => {
          const c = stav.casy[x.id]!;
          return `<li class="pl-${x.druh}${zle.has(x.id) ? " kolizia" : ""}" style="--c:${c.od - OD + 1};--w:${x.dlzka}"><span class="kedy"><b>${c.od}–${c.od + x.dlzka} h</b></span> <span class="sk" title="${esc(x.predmet.nazov)}">${esc(meno(x.predmet))}</span> <span class="pr">${esc(x.predmet.nazov)}</span> <span class="dalsie">${druh(x.druh)}</span></li>`;
        }).join("") : `<li class="volno">voľno</li>`}</ul></section>`;
      }).join("")}</div></div>
<p class="legenda"><span><i class="st pl-p"></i>prednáška</span><span><i class="st pl-c"></i>cvičenie</span><span><i class="st pl-l"></i>laboratórne cvičenie</span><span>Výber sa pamätá len v tomto prehliadači.</span></p>
</div>`);
    };

    planovac.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-sem],[data-akcia]");
      if (!t) return;
      if (t.dataset.sem) stav.sem = t.dataset.sem;
      else if (t.dataset.akcia === "rozloz") rozloz();
      else if (t.dataset.akcia === "vymaz") for (const x of bloky()) delete stav.casy[x.id];
      uloz(); vykresli();
      planovac.querySelector<HTMLElement>(t.dataset.sem ? `[data-sem="${CSS.escape(stav.sem)}"]` : `[data-akcia="${t.dataset.akcia}"]`)?.focus();
    });
    planovac.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement | HTMLSelectElement;
      if (t instanceof HTMLInputElement && t.dataset.kod) {
        stav.vybrane = t.checked ? [...new Set([...stav.vybrane, t.dataset.kod])] : stav.vybrane.filter((k) => k !== t.dataset.kod);
      } else if (t.dataset.den !== undefined || t.dataset.od !== undefined) {
        const id = t.dataset.den ?? t.dataset.od!;
        const c = stav.casy[id] ?? { den: 0, od: 8 };
        if (t.value === "") delete stav.casy[id];
        else stav.casy[id] = t.dataset.den !== undefined ? { ...c, den: Number(t.value) } : { ...c, od: Number(t.value) };
      } else return;
      const kde = t.id || (t instanceof HTMLInputElement ? `[data-kod="${t.dataset.kod}"]` : "");
      uloz(); vykresli();
      (t.id ? document.getElementById(kde) : planovac.querySelector<HTMLElement>(kde))?.focus();
    });
    vykresli();
  };

  fetch(zdroj).then(async (o) => {
    if (!o.ok) throw new Error(String(o.status));
    zobraz((await o.json()) as VsProgram);
  }).catch(() => planovac.insertAdjacentHTML("beforeend", `<p class="stav-nacitania">Predmety sa nepodarilo načítať. Sú v tabuľkách nižšie.</p>`));
}
