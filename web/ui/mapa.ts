// Mapa škôl pri hľadaní na domovskej stránke.
// klient.ts ju načíta až po prepnutí na „Mapa“: MapLibre (/assets/maplibre-gl.mjs) má vyše 1 MB a zoznamu netreba.
// Dlaždice: OpenFreeMap (rovnaká adresa je v CSP vo web/build.ts).
import type * as ML from "maplibre-gl";

type Riadok = [nazov: string, miesto: string, cesta: string, stav: 0 | 1 | 2, ulica?: string];
const STAV = ["nenájdené", "len zvonenie", "verejný rozvrh"] as const;
const LIB = "/assets/maplibre-gl.mjs";
const STYL = (tmavy: boolean) => `https://tiles.openfreemap.org/styles/${tmavy ? "dark" : "positron"}`;
const SLOVENSKO: [[number, number], [number, number]] = [[16.83, 47.73], [22.57, 49.62]];

// Hneď po načítaní tohto súboru: knižnica, jej štýly a spojenie na dlaždice naraz, nie jedno po druhom.
const kniznica = import(LIB) as Promise<typeof ML>;
const tmavy = matchMedia("(prefers-color-scheme: dark)").matches;
// Štýl sa sťahuje popri knižnici; keď zlyhá, MapLibre si ho stiahne sám z adresy.
const styl = (async (): Promise<ML.StyleSpecification | string> => {
  try { const o = await fetch(STYL(tmavy)); return o.ok ? await o.json() as ML.StyleSpecification : STYL(tmavy); } catch { return STYL(tmavy); }
})();
document.head.append(
  Object.assign(document.createElement("link"), { rel: "stylesheet", href: "/assets/maplibre-gl.css" }),
  Object.assign(document.createElement("link"), { rel: "preconnect", href: "https://tiles.openfreemap.org", crossOrigin: "anonymous" }),
);

/** Vytvorí mapu v prvku; vrátená funkcia ukáže len zadané školy (indexy do hladanie.json) alebo všetky (null). */
export const vytvor = async (el: HTMLElement, riadky: Riadok[], body: ([number, number] | null)[]) => {
  const [ml, s] = await Promise.all([kniznica, styl]);
  const farba = getComputedStyle(document.documentElement).getPropertyValue("--hodina").trim() || "#2f5bd3";
  const mapa = new ml.Map({ container: el, style: s, bounds: SLOVENSKO, fitBoundsOptions: { padding: 20 }, attributionControl: { compact: true }, cooperativeGestures: matchMedia("(pointer: coarse)").matches });
  mapa.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
  const data = {
    type: "FeatureCollection" as const,
    features: body.flatMap((b, i) => (b ? [{ type: "Feature" as const, id: i, geometry: { type: "Point" as const, coordinates: b }, properties: { i } }] : [])),
  };
  // Body pribudnú, len čo je štýl mapy načítaný; dlaždice sa môžu ešte dokresľovať.
  await new Promise<void>((hotovo) => (mapa.isStyleLoaded() ? hotovo() : mapa.once("style.load", () => hotovo())));
  el.querySelector(".mapa-caka")?.remove();
  mapa.addSource("skoly", { type: "geojson", data });
  // Názvy obcí a štátov po slovensky, kde ich OpenStreetMap má.
  for (const l of mapa.getStyle().layers) if (l.type === "symbol" && "source-layer" in l && l["source-layer"] === "place")
    mapa.setLayoutProperty(l.id, "text-field", ["coalesce", ["get", "name:sk"], ["get", "name"]]);
  // Body pod popisy obcí, aby názvy miest ostali čitateľné.
  const popisy = mapa.getStyle().layers.find((l) => l.type === "symbol")?.id;
  mapa.addLayer({
    id: "skoly", type: "circle", source: "skoly",
    paint: {
      "circle-color": farba,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3.5, 10, 6, 14, 8],
      "circle-stroke-color": tmavy ? "#0d1322" : "#fff", "circle-stroke-width": 1,
    },
  }, popisy);
  // data-stav="hotovo", keď mapa dokreslí (čakajú na to testy).
  mapa.on("idle", () => { el.dataset.stav = "hotovo"; });
  // Bublina so školou: text cez textContent, nie HTML z údajov.
  const bublina = new ml.Popup({ closeButton: true, maxWidth: "18rem", offset: 8 });
  mapa.on("click", "skoly", (e) => {
    const f = e.features?.[0];
    const i = Number(f?.properties.i);
    const r = riadky[i], b = body[i];
    if (!r || !b) return;
    const obsah = document.createElement("div");
    const a = Object.assign(document.createElement("a"), { href: r[2], textContent: r[0] });
    const kde = Object.assign(document.createElement("small"), { textContent: `${r[4] ? `${r[4]}, ` : ""}${r[1]} · ${STAV[r[3]]}` });
    obsah.append(a, kde);
    bublina.setLngLat(b).setDOMContent(obsah).addTo(mapa);
  });
  mapa.on("mouseenter", "skoly", () => { mapa.getCanvas().style.cursor = "pointer"; });
  mapa.on("mouseleave", "skoly", () => { mapa.getCanvas().style.cursor = ""; });

  return (vybrane: number[] | null) => {
    el.dataset.stav = "kreslim";
    bublina.remove();
    mapa.setFilter("skoly", vybrane ? ["in", ["get", "i"], ["literal", vybrane]] : null);
    const b = (vybrane ?? []).map((i) => body[i]).filter((x) => x !== null && x !== undefined);
    if (!vybrane || !b.length) { mapa.fitBounds(SLOVENSKO, { padding: 20, duration: 300 }); return; }
    const hranice = b.reduce((h, x) => h.extend(x), new ml.LngLatBounds(b[0]!, b[0]!));
    mapa.fitBounds(hranice, { padding: 40, maxZoom: 13, duration: 300 });
  };
};
