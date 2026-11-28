// Texty na hľadanie škôl v API a MCP: malé písmená bez diakritiky. Zostavenie (web/build.ts) ich zapíše do
// /data/api-hladanie.json v poradí /data/skoly.json, aby studený štart Workera nenormalizoval tisíce textov
// (to stálo vyše 10 ms CPU, limit Free plánu Workers). Bez väzieb Workera, aby ho mohol použiť aj build.
import type { SkolaKratko } from "../../web/typy";

export const bezDiakritiky = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** [názov + obec + okres + subdoména, obec, kraj] */
export type TextyHladania = [text: string, miesto: string, kraj: string][];
export const textyHladania = (skoly: SkolaKratko[]): TextyHladania =>
  skoly.map((s) => [bezDiakritiky(`${s.nazov} ${s.miesto} ${s.okres} ${s.edupage ?? ""}`), bezDiakritiky(s.miesto), bezDiakritiky(s.kraj)]);
