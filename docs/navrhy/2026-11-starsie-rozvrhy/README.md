# Staršie rozvrhy triedy

Schválená ukážka: [ukazka.html](ukazka.html). Je to jeden súbor s vymyslenou školou a rozvrhmi. Kroky v lište sa dajú preklikať.

Ako to funguje na webe:

- **Výber verzie:** nad zoznamom tried je „Rozvrh platný“ s tlačidlami Starší a Novší a zoznamom verzií po školských rokoch.
  - Prvá verzia každého roka má štítok „nový školský rok“.
  - Ostatné verzie majú popis vpredu („II.A: 3 zmeny“, „II.A bez zmeny“, „II.A tu nie je“) a dátumy vzadu.
  - Verzia bez zmeny pre vybranú triedu ostane v zozname sivá.
- **Len dátumy:** názvy verzií, ktoré si dala škola, sa nepreberajú, lebo v nich býva aj meno. Verziu určujú len dátumy.
- **Vyznačenie zmien:** zmeny sa porovnávajú len s predchádzajúcou verziou toho istého školského roka.
  - Zmenená alebo nová hodina má červený obrys.
  - Zrušená hodina je prerušovaná a jej predmet je prečiarknutý.
- **Starší rozvrh:** nad mriežkou je upozornenie, odkedy dokedy rozvrh platil, a tlačidlo „Aktuálny rozvrh“.
  - Keď sa vtedy prvá hodina začínala inak, upozornenie to povie.
  - Dnešné počty (triedy, učebne) sa pri staršej verzii skryjú.
- **Adresa:** `#trieda=II.A&od=2025-09-02` otvorí triedu v staršej verzii.

Údaje:

- `web/historia.ts` číta archív `data/historia` (zbiera ho `prieskum/historia.ts`).
- Každá verzia prejde tým istým čistením mien ako dnešný rozvrh (`bezMien`).
- Výsledok sa zapíše do `/data/historia/<id>.json`.
  - Každá hodina školy je v súbore uložená raz a rozvrh triedy je zoznam jej čísel.
  - Typy a rozbalenie sú vo `web/ui/verzie.ts`.
