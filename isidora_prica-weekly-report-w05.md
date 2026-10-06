# Nedeljni izveštaj

## 1. Osnovne informacije

| Polje | Odgovor |
| --- | --- |
| Ime i prezime | Isidora Prica |
| Adresa e-pošte | isi.prica@gmail.com |
| Discord korisničko ime | isidora8294 |
| Nedelja | Week 05 — Bounded Agentic Feature |
| Par / tim | Mateja Miletić |
| Moj konkretan doprinos / uloga | Zajednički rad na specifikaciji, implementacionim odlukama, Codex promptovima, pregledu diff-a, tool/security granicama, testovima, evidence-u i završnoj verifikaciji bounded agentic workflow-a. |
| Datum predaje | 2026-10-06 |
| Reference na rad i dokaze | `specs/002-brickpulse-training-agent/`, `docs/EVIDENCE_W05.md`, `docs/AI_USAGE_LOG_W05.md`, G9 `95a99126b98f2f04da18735fbe0ee10cd56519d1` (parent `7507dbb19b3d478a123fb1599ee8fb53c239c418`). |

## 2. Moj status

**Status:** Završeno

Mateja i ja smo završili bounded Training Planner, fake-first proveru, ograničenu live proveru, evidence i završni handoff gate.

## 3. Rad ove nedelje

Mateja i ja smo ove nedelje zajedno razvijali BrickPulse Agentic Training Planner. Polazni problem je bio jasan: nakon završene igre igrač ima rezultat, ali nema fokusiran plan za sledeću partiju zasnovan na dokazima. Zato korisnik tek posle `WON` ili `GAME_OVER` stanja eksplicitno bira CREATE TRAINING PLAN. Cilj koji smo definisali bio je da sistem analizira završenu igru i vrati kratak, proverljiv plan za narednu igru, a ne opšti autonomni agent.

Zajedno smo prolazili Week 05 specifikaciju i addendum, zatim SpecKit artefakte u `specs/002-brickpulse-training-agent/`: specifikaciju, plan, istraživanje, model podataka, ugovore, quickstart i task matricu. Najvažnija odluka bila je granica autoriteta: model predlaže, a aplikacija ostaje autoritet. Backend otvara i vodi run; u prvom model koraku prihvata samo predlog dozvoljenog alata, validira ga, izvršava alat i validira rezultat. Tek potom drugi model korak može predložiti strukturirani plan, koji aplikacija ponovo proverava pre prikaza u interfejsu.

Jedini dozvoljeni alat je `analyze_game_performance`. Zajedno smo proverili da je on lokalni, deterministički i read-only: nad već validiranim terminalnim sažetkom igre izračunava ograničene metrike i stabilne evidence ID-jeve. Ne menja kanonsko stanje igre, ne bira provajdera, nema shell, filesystem, mrežnu ili proizvoljnu tool mogućnost i ne prima činjenice o igri koje bi model mogao da izmisli. Registry je eksplicitna allowlista sa jednim alatom. Pre izvršenja se odbijaju nepoznat alat, dodatni ili pogrešni argumenti i ponovljena akcija; odbijeni predlog može imati nula izvršenja alata.

Sa Matejom sam zajedno pregledala validacije za predlog, argumente, rezultat alata i završni rezultat. Završni plan mora da koristi evidence ID-jeve iz tekućeg run-a i da podrži fokus i preporuku dokazima. Run ima eksplicitno stanje, stop razloge i odvojene budžete: najviše 3 agent koraka, 2 tool poziva, 2 pokušaja po model koraku, 6 provider pokušaja ukupno, timeout po pokušaju do 15 sekundi i ukupan rok 30 sekundi. Retry/fallback je ograničen, a zaštita od ponovljene akcije sprečava petlju. Gemini adapter je iza provider-neutral granice; frontend šalje samo sažetak igre i prikazuje samo validirani bezbedni rezultat ili bezbednu grešku. Taj dizajn ne izlaže chain-of-thought, sirove odgovore provajdera niti serverske tajne.

Rad smo vodili fake-first pristupom. Zajedno smo pregledali RED/GREEN zapise, testove negativnih putanja i evidence, umesto da verujemo samo uspešnom primeru. Finalni offline evaluator beleži A1–A18 kao PASS, uključujući invalidan ili nepoznat alat, nevažeće argumente, kvar alata ili provajdera, loš rezultat alata, neispravan završni izlaz, ponovljenu akciju i granice koraka/deadline-a. Evidence beleži završni offline suite od 35 fajlova i 420 testova, uz uspešne typecheck, build, frontend-boundary i smoke provere. Takođe smo pregledali da su Week 03/04 tokovi ostali sačuvani.

Važna lekcija bila je T101 preflight korekcija: P11 i P13 su pokazali manjak offline dokaza za drugu fazu adaptera i fixed-fallback transport/schema putanje, a ne produkcioni kvar. Dopunili smo dokaze bez mreže i tek tada nastavili. T100 je dao offline live-harness RED/GREEN dokaz. Prvi T102 poziv je istinito označen kao SKIPPED jer očekivani `.env` nije bio dostupan pre učitavanja harness-a; nije bilo provajder ili mrežnog poziva. Nakon što smo ručno ispravili naziv/lokaciju fajla i odobrili novi pokušaj, dogodio se tačno jedan provider-backed run: 2026-10-06, kategorija `gemini`, 2 logička koraka, 4 provider pokušaja, 1 tool poziv, `completed`, PASS. G9 je zatim prihvatio handoff.

Codex smo koristili kao inženjerskog asistenta za implementaciju, testove, dokumentaciju i rad u repozitorijumu pod eksplicitnim ograničenim instrukcijama. Mateja i ja smo zajedno sastavljali i pregledali promptove, diff-ove, ugovore, bezbednosne granice, testove i gate rezultate; izlaze nismo automatski prihvatali. Korekcija P11/P13 i prethodno utvrđen problem sa attempt-scoped token observability pokazuju da smo proveravali pretpostavke i korigovali rad pre prihvatanja. Pomoć tutora trenutno nije potrebna.

## 4. Sledeći korak

Pre naredne sesije Mateja i ja ćemo zajedno uvežbati i objasniti ceo tok: cilj → predlog modela → validacija → alat → validacija → završni model korak → završna validacija, i pripremiti kratak demo/evidence pregled.

## 5. Poverljiva napomena za tutora

Nema dodatne napomene
