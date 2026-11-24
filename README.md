# Rozvrhy škôl

Zvonenie a rozvrhy hodín základných a stredných škôl na Slovensku: https://rozvrh.dvoriste.xyz
(webová stránka, [API](https://rozvrh.dvoriste.xyz/api/) a MCP server).

- `prieskum/`: zber z registra škôl CVTI SR, verejných rozvrhov na EduPage a webov škôl
  (najviac 1 požiadavka za sekundu, podľa robots.txt; obnova každý druhý týždeň, `systemd/`).
- `web/`: zostavenie statického webu a dát, filter mien (`web/sukromie.ts`).
- `site/`: Cloudflare Worker s API a MCP.

Chyba pri škole, meno v údajoch alebo škola, ktorá si neželá byť v prehľade:
[napíšte issue](https://github.com/Gooder24/rozvrh/issues). Vyradené školy sú v `data/vyradene.json`.
