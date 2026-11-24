// Správanie v prehliadači: hľadanie školy alebo obce, triedenie časovej osi obce, čiara „teraz“
// a týždenná mriežka triedy na stránke školy. Jeden súbor pre všetky stránky; každá časť sa zapne len tam,
// kde nájde svoje prvky. Bez tohto súboru stránky ukážu všetko okrem hľadania a mriežky triedy.
import type { Blok, Skola } from "../data";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const bezDiakritiky = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** Rovnaké pravidlo ako slug() vo web/data.ts, aby cesta obce sedela so zostavenými stránkami. */
const slug = (s: string) => bezDiakritiky(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const sklonuj = (n: number, jeden: string, dva: string, pat: string) => `${n} ${n === 1 ? jeden : n >= 2 && n <= 4 ? dva : pat}`;
const cas = (t: string) => t.replace(/^0(\d)/, "$1");

// Hľadanie -----------------------------------------------------------------------------------------------------
/** Riadok /data/hladanie.json. Piaty prvok (ulica) je nepovinný: použije sa, keď ho zostavenie pridá. */
type Riadok = [nazov: string, miesto: string, cesta: string, stav: 0 | 1 | 2, ulica?: string];
const STAV = [["c", "nenájdené"], ["b", "len zvonenie"], ["a", "verejný rozvrh"]] as const;

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
  type Zaznam = { r: Riadok; kluc: string; miesto: string };
  let index: Promise<Zaznam[]> | null = null;
  const nacitaj = () => index ??= fetch("/data/hladanie.json").then(async (o) => {
    if (!o.ok) throw new Error(String(o.status));
    return ((await o.json()) as Riadok[]).map((r) => ({ r, kluc: bezDiakritiky(`${r[0]} ${r[1]} ${r[4] ?? ""}`), miesto: bezDiakritiky(r[1]) }));
  });
  const odkazy = () => [...vysledky.querySelectorAll<HTMLAnchorElement>("a")];

  let poradie = 0;
  const hladaj = async () => {
    const q = pole.value.trim();
    const moje = ++poradie;
    history.replaceState(null, "", q ? `/?q=${encodeURIComponent(q)}` : "/");
    if (q.length < 2) { vysledky.innerHTML = ""; stavHladania.textContent = q ? "Napíšte aspoň dve písmená." : ""; return; }
    let zaznamy: Zaznam[];
    try { zaznamy = await nacitaj(); } catch {
      index = null;
      stavHladania.textContent = "Zoznam škôl sa nepodarilo načítať. Skontrolujte pripojenie a skúste to znova.";
      return;
    }
    if (moje !== poradie) return;
    const slova = bezDiakritiky(q).split(/\s+/).filter(Boolean);
    const cele = slova.join(" ");
    const zhoda = zaznamy.filter((z) => slova.every((s) => z.kluc.includes(s)));
    const obce = new Map<string, number>();
    for (const z of zaznamy) if (slova.every((s) => z.miesto.includes(s))) obce.set(z.r[1], (obce.get(z.r[1]) ?? 0) + 1);
    const vaha = (z: Zaznam) => (z.miesto === cele ? 0 : z.miesto.startsWith(cele) ? 1 : z.kluc.startsWith(cele) ? 2 : 3);
    zhoda.sort((a, b) => vaha(a) - vaha(b) || b.r[3] - a.r[3] || a.r[0].localeCompare(b.r[0], "sk") || a.r[1].localeCompare(b.r[1], "sk"));
    const zoradeneObce = [...obce].sort((a, b) => Number(bezDiakritiky(b[0]).startsWith(cele)) - Number(bezDiakritiky(a[0]).startsWith(cele)) || b[1] - a[1]).slice(0, 5);
    const ukazane = zhoda.slice(0, 40);
    stavHladania.textContent = zhoda.length || zoradeneObce.length
      ? `${sklonuj(zhoda.length, "škola", "školy", "škôl")}${zhoda.length > ukazane.length ? `, ukazujeme prvých ${ukazane.length}` : ""}${obce.size ? ` a ${sklonuj(obce.size, "obec", "obce", "obcí")}` : ""}. Klávesom Enter otvoríte prvý výsledok.`
      : `Pre „${q}“ sme nenašli školu ani obec. Skúste len časť názvu alebo názov obce.`;
    vysledky.innerHTML = zhoda.length || zoradeneObce.length ? `<ul class="najdene">${zoradeneObce.map(([m, n]) =>
      `<li><a href="/mesto/${slug(m)}/"><b>${esc(m)}</b><small>obec, ${sklonuj(n, "škola", "školy", "škôl")}</small></a></li>`).join("")}${ukazane.map(({ r }) =>
      `<li><a href="${esc(r[2])}"><b>${esc(r[0])}</b><small><i class="st ${STAV[r[3]][0]}"></i> ${STAV[r[3]][1]}</small><span class="kde">${esc(r[4] ? `${r[4]}, ${r[1]}` : r[1])}</span></a></li>`).join("")}</ul>` : "";
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

// Čiara „teraz“ na osiach a veta o práve prebiehajúcej hodine -------------------------------------------------
const osi = [...document.querySelectorAll<HTMLElement>(".os")];
if (osi.length) {
  const hodiny = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Bratislava", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const veta = document.querySelector<HTMLElement>("#teraz");
  const bloky = veta ? [...document.querySelectorAll<HTMLElement>(".os-jedna .trat i:not(.n)")].map((i) => ({
    n: i.textContent ?? "", od: Number(i.style.getPropertyValue("--s")), do: Number(i.style.getPropertyValue("--e")),
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
    if (!veta) return;
    const prva = bloky[0];
    const posledna = bloky.at(-1);
    let text = "";
    if (pracovnyDen && prva && posledna && teraz >= prva.od - 60 && teraz < posledna.do) {
      const bezi = bloky.find((b) => teraz >= b.od && teraz < b.do);
      const dalsia = bloky.find((b) => b.od > teraz);
      const oznac = (b: { n: string }) => (b.n ? `${b.n}. hodina` : "hodina");
      if (bezi) text = `Podľa zvonenia je teraz ${oznac(bezi)}. Zvoní o ${hm(bezi.do)}, teda o ${bezi.do - teraz} min.`;
      else if (dalsia) text = `${teraz < prva.od ? "Vyučovanie sa ešte nezačalo" : "Podľa zvonenia je teraz prestávka"}. ${oznac(dalsia)[0]?.toUpperCase()}${oznac(dalsia).slice(1)} sa začína o ${hm(dalsia.od)}, teda o ${dalsia.od - teraz} min.`;
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
      return `<span class="kedy"><b>${esc(hodina)}</b><span class="vh"> hodina</span>${a?.od && z?.do ? ` ${esc(cas(a.od))}–${esc(cas(z.do))}` : ""}</span>`;
    };
    const dni = s.rozvrh?.dni.length ? s.rozvrh.dni : ["Pondelok", "Utorok", "Streda", "Štvrtok", "Piatok"];
    const pocetDni = Math.max(dni.length, ...trieda.bloky.map((b) => b.den + 1));
    const predmety = new Map(trieda.bloky.map((b) => [b.skratka, b.predmet]));
    return `<div class="mr-obal"><div class="mr" style="--n:${vidno.length}"><h3 class="vh">Rozvrh triedy ${esc(nazov)}</h3>
<div class="mr-hlava" aria-hidden="true"><span></span><ol>${vidno.map((h) => `<li><b>${esc(h.n)}</b>${h.od && h.do ? `${esc(cas(h.od))}–${esc(cas(h.do))}` : ""}</li>`).join("")}</ol></div>
${Array.from({ length: pocetDni }, (_, den) => {
      const bloky = trieda.bloky.filter((b) => b.den === den);
      return `<section class="mr-den"><h3>${esc(dni[den] ?? `Deň ${den + 1}`)}</h3><ul>${bloky.length ? bloky.map((b) => {
        const dalsie = [b.skupina, b.tyzden ? `týždeň ${b.tyzden}` : null].filter(Boolean).join(", ");
        return `<li style="--c:${miesto(b) - prvy + 1};--w:${Math.max(b.trvanie, 1)}">${kedy(b)} <span class="sk" aria-hidden="true" title="${esc(b.predmet)}">${esc(b.skratka)}</span> <span class="pr">${esc(b.predmet)}</span>${b.ucebna ? ` <span class="uc"><span class="vh">učebňa </span>${esc(b.ucebna)}</span>` : ""}${dalsie ? ` <span class="dalsie">${esc(dalsie)}</span>` : ""}</li>`;
      }).join("") : `<li class="volno">bez vyučovania</li>`}</ul></section>`;
    }).join("")}</div></div>
<ul class="predmety" aria-label="Skratky predmetov">${[...predmety].sort((a, b) => a[0].localeCompare(b[0], "sk")).map(([sk, p]) => `<li><b>${esc(sk)}</b>${esc(p)}</li>`).join("")}</ul>`;
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
