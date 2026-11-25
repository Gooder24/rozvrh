// Krstné mená a časté priezviská (slovenské, české, maďarské, ukrajinské), bez diakritiky a malými písmenami; kratšie ako 4 písmená sa neporovnávajú.
const MENA = `
adam adrian adriana agata agnesa albert alena alex alexander alexandra alexej alica alina alojz alzbeta andrea andrej andrii anastasia anastasiia aneta anika aniko anita anna annamaria antal anton antonia arina arnold arpad artem attila augustin
balazs barbora barnabas bartolomej beata beatrix bela benedikt benjamin bence bernadett bianka blanka bohdan bohdana bohumil bohuslav boris botond boglarka branislav branko brigitta bronislava bruno bystrik
csaba csilla cyril
damian daniel daniela danylo daria dariia david denis denisa denys dezider dezso diana dionyz dmytro dobroslav dominik dominika dora dorina dorota drahomir drahomira dusan
edita edmund eduard elena eliska ella emese emil emilia endre eniko erik erika ernest erno erzsebet estera eugen evelin
fabian fanni ferenc filip flora frantiska frantisek
gabor gabriel gabriela gejza gergely gergo gertruda geza gregor gustav gyongyi gyozo gyula
hajnalka hana hanna hedviga helena henrich henrieta henrietta herminka hermina hubert hugo
ignac igor ildiko illia ilona imre imrich ingrid ingrida irena iren irma iryna istvan iveta ivan ivana ivanna ivica izabela izidor
jakub jarmila jaroslav jaroslava jazmin jeno jergus jindrich jiri jitka jolana jonas jozef jozefa jozefina jozsef judit julia julius juliana juraj
kalman kamil kamila karina karol karolina karoly katalin katarina katerina kateryna kazimir kevin khrystyna kinga kira kitti klara klaudia koloman kornelia kristian kristina krisztian krisztina kristof kvetoslava
ladislav ladislava lajos laszlo laura lenka leonard leopold levente libor liliana liliana livia lubica lubomir lubomira lubos luboslava lucas lucia lucie ludmila ludovit lukas lydia
magdalena magdolna maksym marcel marcela marcell margit margita maria mariana marian marianna marie marek mariia marketa mark maros marta martin martina mate matej matias matus maximilian medard melania melinda metod michaela michal mihaly miklos milada milan milana milena milos miloslav miriama mirka miroslav miroslava monika mykola
nadezda natalia nataliia natasa nazar nela nikola nikolaj nikolas nikoleta nikolett noemi nora norbert
oksana oleksandr oleksandra olena oliver olivia olga ondrej orsolya oskar otilia otto
patrik paulina pavel pavol peter petr petra piroska polina
radek radka radoslav radoslava radovan rastislav rebeka regina reka renata richard robert roland romana rozalia rudolf ruzena
sabina samuel sandor sarlota sebastian serhii sidonia silvia simon simona slavomir slavomira sofia sofiia stanislav stanislava stela svatopluk svetlana szabina szabolcs szilvia
tadeas tamara tamas taras tatiana tereza terezia tetiana tibor timea timotej tobias tomas tunde
ursula
vaclav valentin valentina valeria valeriia vanda vanesa vanessza vavrinec veronika viera vieroslava viktor viktoria viktoriia viliam vilma vilmos vincent vivien vladimir vladimira vladislav vladyslav vojtech vojtech volodymyr
yana yaroslav yulia yuliia yurii
zdenek zdenka zdenko zita zlatica zofia zoltan zsofia zsolt zsuzsanna zaneta zigmund
adela artur aurelia berta dagmar dalibor darina ervin evelina felix florian frederik gizela herbert jana janka jaromir jasmina johana justin kornel leon linda lorant lujza magda mario marko miriam nikodem nina otakar paula petronela rene sandra sara sergej stefan stefania tina vendelin vlasta xenia zuzana zuzka
zselyke zsofi zsuzsa zsombor kata gabriella imola izabella jolan lilla luca anett adel aliz dalma dorottya edina greta kamilla leila mira panna rita szandra virag janos marton nandor zalan akos aron balint denes gyorgy lorinc otto szilard zsigmond hunor csongor
`;
export const KRATKE = new Set("ada ali ema eva ela ida iva jan leo lea mia max ota oto tom tim".split(" "));
export const KRSTNE = new Set(MENA.split(/\s+/).filter((m) => m.length >= 4));

// Časté priezviská (mužský tvar; ženské -ová chytá pravidlo zvlášť), bez diakritiky, malými písmenami.
export const PRIEZVISKA = new Set(`
bajus balaz balog balogh bandy baranek bartko bartos benko biro blaho blasko bodnar cervenak cierny conka danko dudas dunka dvorak
fabian farkas fazekas fekete ferko gabor gajdos gal gazi gazo hric holub horvat horvath hudak juhasz jurko kaleja kis kiss kocis
kollar kotlar kovac kovacik kovacs kozak krajci kral krejci kubik kucera kuruc lacko lakatos lakatos lengyel lukac macko majernik
meszaros michalik mihalik mikula minac mirga molnar moravcik nagy nemec nemeth novak novotny olah oravec orsag pal pap papp pavlik
petras pokorny pokuta polak pospisil prochazka racz rigo rusnak sabo sarkozi sebo sedlak simko slovak sokol soltes staron svec
szabo szucs sztojka takacs toman toth urban valent varga vasko vesely vojtko zajac zeman ziga
`.split(/\s+/).filter(Boolean));
