// Mestá, mestské časti a obce: ako o mieste písať („v meste Žilina“, nie „v obci Žilina“).
// Zoznam 141 miest SR: sk.wikipedia.org, Zoznam miest na Slovensku (stav 2025; posledné nové mesto Nesvady, 2020).
// Mesto pribudne len zákonom NR SR, takže zoznam sa mení raz za roky.
const MESTA = new Set(("Bratislava;Košice;Prešov;Žilina;Nitra;Banská Bystrica;Trnava;Trenčín;Martin;Poprad;Prievidza;Zvolen;" +
  "Považská Bystrica;Nové Zámky;Michalovce;Spišská Nová Ves;Komárno;Levice;Liptovský Mikuláš;Bardejov;Humenné;Ružomberok;" +
  "Piešťany;Lučenec;Pezinok;Topoľčany;Dunajská Streda;Trebišov;Čadca;Dubnica nad Váhom;Rimavská Sobota;Senec;Partizánske;" +
  "Vranov nad Topľou;Brezno;Šaľa;Hlohovec;Senica;Malacky;Snina;Dolný Kubín;Rožňava;Púchov;Žiar nad Hronom;" +
  "Bánovce nad Bebravou;Stará Ľubovňa;Galanta;Skalica;Handlová;Kežmarok;Sereď;Kysucké Nové Mesto;Levoča;Šamorín;Detva;" +
  "Stupava;Sabinov;Zlaté Moravce;Bytča;Revúca;Holíč;Kolárovo;Myjava;Moldava nad Bodvou;Nová Dubnica;Nové Mesto nad Váhom;" +
  "Veľký Krtíš;Stropkov;Fiľakovo;Svidník;Štúrovo;Banská Štiavnica;Modra;Šurany;Tvrdošín;Krompachy;Sečovce;Veľké Kapušany;" +
  "Vráble;Stará Turá;Veľký Meder;Svit;Krupina;Vrútky;Námestovo;Kráľovský Chlmec;Hurbanovo;Veľký Šariš;Liptovský Hrádok;" +
  "Trstená;Hriňová;Šahy;Nová Baňa;Turzovka;Spišská Belá;Tornaľa;Želiezovce;Lipany;Krásno nad Kysucou;Hnúšťa;Nemšová;" +
  "Svätý Jur;Turčianske Teplice;Sobrance;Gelnica;Medzilaborce;Rajec;Vrbové;Žarnovica;Ilava;Sládkovičovo;Gabčíkovo;Dobšiná;" +
  "Poltár;Bojnice;Nesvady;Šaštín-Stráže;Sliač;Gbely;Kremnica;Brezová pod Bradlom;Medzev;Strážske;Nováky;Turany;" +
  "Trenčianske Teplice;Giraltovce;Leopoldov;Vysoké Tatry;Hanušovce nad Topľou;Spišské Podhradie;Tisovec;Tlmače;" +
  "Čierna nad Tisou;Spišské Vlachy;Jelšava;Podolínec;Rajecké Teplice;Spišská Stará Ves;Modrý Kameň;Dudince").split(";"));

/** Register CVTI reže názov obce na 25 znakov; tieto názvy tak prichádzajú orezané. */
const OREZANE: Record<string, string> = {
  "Bratislava-Devínska Nová": "Bratislava-Devínska Nová Ves",
  "Bratislava-Podunajské Bis": "Bratislava-Podunajské Biskupice",
  "Bratislava-Záhorská Bystr": "Bratislava-Záhorská Bystrica",
  "Košice-Dargovských hrdino": "Košice-Dargovských hrdinov",
};
export const celaObec = (miesto: string) => OREZANE[miesto] ?? miesto;

export type DruhObce = "mesto" | "mestská časť" | "obec";
export const druhObce = (miesto: string): DruhObce =>
  MESTA.has(miesto) ? "mesto" : /^(Bratislava|Košice)-/.test(miesto) ? "mestská časť" : "obec";
const V: Record<DruhObce, string> = { mesto: "v meste", "mestská časť": "v mestskej časti", obec: "v obci" };
/** „v meste“, „v mestskej časti“, „v obci“. */
export const vDruhu = (miesto: string) => V[druhObce(miesto)];
/** „v meste Žilina“, „v mestskej časti Bratislava-Rača“, „v obci Hájik“. */
export const vObci = (miesto: string) => `${V[druhObce(miesto)]} ${miesto}`;
