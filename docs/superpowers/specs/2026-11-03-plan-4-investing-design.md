# Plan 4 – Befektetés: tervdokumentum

Dátum: 2026-11-03 · Státusz: tervezet, jóváhagyásra vár
Kiegészíti és felülírja: `2026-11-01-finance-tracker-design.md` §6.7 (és ahol jelölve, §6.4).

## 1. Mi ez és miért

A felhasználónak most semmilyen befektetése nincs. Mind a négy fajtát (állampapír, ETF, részvény, kripto) ki szeretné próbálni, de nem ért hozzá, ezért azt kéri, hogy **az app ajánljon a bevétele alapján**, vezesse végig, és **tartsa számon, mit vett és hol**. Az ajánlás minden hónapban abból induljon ki, amit már közösen felépítettek, ne nulláról.

Számlái: **MBH** (bank, folyószámla, innen jönnek az SMS-ek) és **Revolut**. Más bróker- vagy kriptoszámlája nincs.

**Siker:** a felhasználó minden hónapban megnyitja az Invest fület, látja, mennyit és mibe érdemes tenni, megveszi az MBH-n vagy a Revoluton, egy koppintással jelzi, és a portfólióban látja, mennyit ér az egész forintban.

## 2. Célok, nem célok, anti-célok

### Célok
1. **Havi ajánló kártya** (a felhasználó az „A” vázlatot választotta): a hónapban javasolt befektetési összeg és annak elosztása a négy fajta között.
2. **Külön oldal mind a négy fajtának:** mi ez, mit érdemes konkrétan venni, mennyit, hol (MBH vagy Revolut), és miért. A meglévő portfólióval számol.
3. **Hol érdemes kezdeni:** az app javasolja a platformot, elsősorban a meglévő MBH és Revolut közül; újat csak akkor, ha egy fajta ezeken nem elérhető.
4. **Portfólió:** a vételek és eladások vezetése platformmal együtt („MBH”, „Revolut”), napi árfolyammal frissülő érték és hozam forintban.
5. **„Megvettem” gomb** az ajánlásnál: a vétel egy koppintással (és az összeg, darabszám megerősítésével) bekerül.
6. **Óvatos induló profil**, ami a tapasztalattal bátrabbra állítható (lásd 4.3).
7. **Ajánlás már most is**, a vészhelyzeti tartalék építése mellett, kis összeggel (a felhasználó döntése, lásd 4.1).

### Nem célok (Plan 4)
- Automatikus kereskedés, brókeri vagy banki integráció. Az app nem vesz és nem ad el semmit.
- **Napi piaci összefoglaló** („day trading tippek” helyett). A spec §6.7 ide sorolta, de **átkerül a Plan 5-be** (hírek), mert ugyanazokból a forrásokból dolgozik. *(Az én döntésem.)*
- Adóbevallás, adószámítás, TBSZ-kezelés. Az oktató szövegek megemlíthetik, hogy ezek léteznek, de az app nem számol velük.
- Valós idejű árfolyam. Napi frissítés elég.
- Eladási vagy vételi időzítés („most adj el”).

### Anti-célok (ha ez történik, a Plan 4 kudarc)
- Az AI biztos utasításként ad tippet, vagy hozamot ígér. Minden ajánlás oktató jellegű, és ez minden ajánló képernyőn látszik: „Educational, not personal financial advice. You decide.”
- **Az app kitalál termékfeltételt** (kamatot, díjat, elérhetőséget), ami nem igaz. Konkrét termékadat csak ellenőrzött, az appban tárolt forrásból jöhet (lásd 4.4).
- A javasolt összeg már a vétel előtt csökkenti a költhető keretet.
- Egy befektetés kétszer számít: egyszer kiadásként a havi átlagokban, egyszer vagyonként.
- Az elosztás egy kilengés után eladást javasol a kiegyensúlyozáshoz.

## 3. Megkötések
- Platform, nyelv, minta: mint az eddigi terveknél (Base44, React + TS, angol felület, HUF alap, egész szám minor egységben, tiszta függvények a `src/domain/`-ben unit-tesztekkel).
- **A számokat determinisztikus kód számolja, az AI csak értelmez és szövegez** (spec §6.5 alapelve). Az AI kimenete normalizálva, az érvénytelen részek eldobva, mint a Plan 3-ban.
- AI-hívás: kliensoldali `InvokeLLM` működik élesben (2026-11-02-án ellenőrizve). Havi ajánlásonként egy hívás, cache-elve, mint a guide-nál.
- Egy felhasználó, a saját iPhone-ján. RLS minden új entitáson (`created_by_id`).

## 4. Hogyan működik (a felhasználó döntései és az én döntéseim)

### 4.1 Havi befektethető összeg
- *(A felhasználó döntése)* **A javasolt összeg csak javaslat.** A költhető keretből akkor vonódik le, amikor a felhasználó a „Megvettem” gombbal jelzi a vételt, és pontosan annyi, amennyit ténylegesen befektetett.
  - Ez **felülírja a spec §6.4-et:** a `monthly_investment_amount` többé nem vonódik le előre a havi szabad keretből. A meglévő `investmentMinor` sor a keret-bontásban (AllowanceBreakdown) a hónapban ténylegesen befektetett összeget mutatja.
- *(A felhasználó döntése)* **Ajánlás már a vészhelyzeti tartalék előtt is.** *(Az én döntésem a hogyanra:)* amíg a tartalék nincs meg, a befektetésre és megtakarításra szánható havi összegnek csak kisebb része (javaslat: 25%) megy befektetésre, a többi a tartalékba. Ha a tartalék megvan, a befektetés aránya nő (javaslat: 60%). A pontos arányok a builder hangolhatják, de konstansként, tesztelve.
- *(Az én döntésem)* **Az alap a megtakarítási cél fölötti többlet:** átlagos havi bevétel − átlagos havi kiadás − `monthly_savings_target` (Plan 3 `averageMonthlyIncomeMinor` / `averageMonthlyExpensesMinor`, a teljes hónapokra), és nem lehet több, mint az aktuális havi szabad keret (amiből a megtakarítási cél már le van vonva). A tartalékot továbbra is a megtakarítási cél és a hónap végi maradék-átvezetés építi; a nem befektetett rész egyszerűen a keretben marad, külön „tartalékba” javaslat nincs.
- *(Az én döntésem)* Ebből a 25% / 60% a javasolt befektetés. A „tartalék megvan” feltétel ugyanaz, mint a guide 2. lépcsőjénél (Plan 3 `savings.ts`).
- Ha nincs elég adat (nincs teljes hónap), az app ezt mondja meg, és nem talál ki számot.
- *(Az én döntésem)* **A kártya élő, nem befagyasztott:** „Suggested X · invested Y · Z left this month”. A javaslat minden megnyitáskor újraszámolódik a hónap elejei számokból; a fel nem használt összeg nem halmozódik át a következő hónapra.
- *(Az én döntésem)* Ha a felhasználó a Settingsben megadja a `monthly_investment_amount`-ot, az csak a javasolt befektetési összeget írja felül (adat nélkül is működik), és ez is csak javaslat: a keretből továbbra is csak vételkor vonódik le.

### 4.2 Elosztás és kiegyensúlyozás
- Négy fajta: `bond` (állampapír), `etf`, `stock` (egyedi részvény), `crypto`.
- *(Az én döntésem, a felhasználó jóváhagyta az óvatos indulást)* Profilok célarányokkal (builder hangolhatja):
  - **Cautious (induló):** bond 50%, ETF 35%, stock 8%, crypto 7%. A kockázatos rész kis „tanulópénz”.
  - **Balanced:** 35 / 45 / 12 / 8.
  - **Bold:** 15 / 45 / 25 / 15.
- **Kiegyensúlyozás csak új pénzzel:** a havi összeg elsősorban a célaránytól elmaradt fajtákba megy. Az app soha nem javasol eladást a kiegyensúlyozáshoz.
- Minimális tétel: ha egy fajtára jutó összeg túl kicsi ahhoz, hogy értelmes legyen (pl. állampapír minimális címlete), az app ebben a hónapban a többi fajtához csapja, és ezt kiírja („too small this month”). Hónapok közötti átvitel nincs.

### 4.3 A profil változása
- Indulás: Cautious.
- *(A felhasználó jóváhagyta)* Ha valami nagyot esik, az app **magyaráz, nem riaszt**: a holding oldalán rövid szöveg arról, hogy ez erre a fajtára jellemző, és mit szoktak ilyenkor kezdők rosszul csinálni (pánikeladás).
- Néhány hónap után (javaslat: 3 hónappal az első vétel után) az app rákérdez, hogyan érezte magát a kilengések alatt, és ha nyugodt maradt, felajánlja a bátrabb profilt. A profil a Settingsben bármikor kézzel is állítható.

### 4.4 Fajtánkénti oldal és „hol vegyem meg”
- Minden fajtának egy oldala: mi ez (2–3 mondat, kezdő nyelven), mennyit javasol most, konkrétan mit (pl. melyik állampapír, melyik világ-ETF), hol (MBH / Revolut), és a jelenlegi portfólióban mennyi van belőle.
- **Termékadat forrása** *(az én döntésem, az anti-cél miatt)*: az app egy **kódban tárolt, kézzel karbantartott termékkatalógusból** dolgozik (fajta, név, azonosító/ticker, hol elérhető: MBH/Revolut/egyéb, rövid leírás, kockázati szint, az adat ellenőrzésének dátuma). A builder a terv elején aktuális, hivatalos forrásokból tölti fel, és minden tételnél kiírja: „Check the current terms before you buy.” Az AI csak ebből a katalógusból választhat; a katalóguson kívüli javaslatot a normalizálás eldobja.
- Platform-javaslat: elsősorban MBH és Revolut. Ha egy fajta egyiken sem elérhető (ezt a builder a katalógus feltöltésekor ellenőrzi), az app megnevez egy alternatívát, és jelzi, hogy ehhez új számla kell.

### 4.5 „Megvettem” és a portfólió
- A gomb egy rövid lapot nyit: termék (előre kitöltve az ajánlásból), összeg HUF-ban, opcionálisan darabszám és ár, dátum (ma), platform (MBH / Revolut / egyéb), és melyik számláról ment a pénz.
- *(Az én döntésem)* Forrásszámla csak `checking` vagy `cash` lehet (MBH, Revolut). Megtakarítási számláról nem, mert az a vészhelyzeti tartalékot csökkentené.
- Hatás *(az én döntésem a könyvelésre)*:
  - A forrásszámla egyenlege csökken.
  - A hónap hátralévő költhető kerete csökken a befektetett összeggel (4.1).
  - **Nem számít kiadásnak** az átlagos havi kiadásban, a vészhelyzeti tartalék céljában és a „Safe to buy” számításban (Plan 3), különben az anti-cél szerinti dupla számítás lépne fel.
  - Létrejön vagy frissül a Holding, és egy InvestmentTransaction.
- **MBH SMS ugyanarra a terhelésre** *(az én döntésem)*: az MBH minden terhelésről SMS-t küld, ami magától kiadásként kerülne be. Ezért:
  - „Megvettem”-kor, ha a forrás az MBH, az app megkeresi a 3 napon belüli, azonos összegű, még nem befektetésként jelölt SMS-es terhelést, és azt jelöli át befektetési vétellé (nem hoz létre újat). Ha több jelölt van, a felhasználó választ.
  - Ha az SMS a koppintás után érkezik, az `ingest-sms` ugyanígy keres egy azonos összegű, SMS nélküli befektetési mozgást (±3 nap), és ahhoz köti az SMS-t, nem hoz létre kiadást.
  - A Revolutnak nincs SMS-e, ott ez nem kérdés.
- **Eladás** *(az én döntésem)*: kézzel rögzíthető (termék, összeg, platform, melyik számlára jött a pénz). A pénz a számlára kerül, de nem számít bevételnek: sem a havi szabad keretben, sem az átlagos havi bevételben, sem a hónapzárásnál.
- Portfólió-képernyő: teljes érték forintban, hozam (forintban és %-ban), elosztás a célarányhoz képest, holdingok listája platformmal.
- **Árfolyam** *(a builderre bízva a forrás)*: napi frissítés. Kripto, ETF, részvény árfolyam-API-ból (jó ingyenes kerettel; a kulcs szerveroldali titok, a lekérés backend függvényből). Deviza → HUF a meglévő FxRate-tel. **Állampapír:** nincs piaci ár, az érték determinisztikusan számolódik a vételi összegből és a katalógusban vagy a vételnél megadott kamatból.

### 4.6 AI-szöveg
- Egy hívás havonta (és ha a felhasználó frissítést kér): a kártya rövid magyarázata és a négy fajtaoldal „miért” szövege. Bemenet: a kód által kiszámolt összeg és elosztás, a portfólió, a profil, a tartalék állapota, a katalógus releváns tételei. Kimenet: szöveg + a katalógusból választott termékazonosítók. Cache a portfólió és az összeg ujjlenyomatával, mint a guide-nál.
- Ha az AI nem érhető el: alapszöveg a katalógusból, a számok ugyanazok.

## 5. Adatmodell (első változat, a builder finomíthatja)
| Entitás | Fő mezők |
|---|---|
| **User** (új mezők) | `risk_profile` (`cautious` / `balanced` / `bold`, alap `cautious`), `risk_checkin_at` (mikor kérdezett rá utoljára), `invest_cache` (az AI-szöveg cache-e) |
| **Holding** | `asset_type` (`bond` / `etf` / `stock` / `crypto`), `product_id` (katalógus-azonosító), `name`, `ticker` (nullable), `platform` (`mbh` / `revolut` / `other` + opcionális név), `quantity`, `cost_huf_minor`, `currency`, `bond_rate` (nullable) |
| **InvestmentTransaction** | `holding_id`, `side` (`buy` / `sell`), `amount_huf_minor`, `quantity` (nullable), `price` (nullable), `currency`, `date`, `account_id` (honnan / hová ment a pénz), `transaction_id` (a kapcsolódó számlamozgás) |
| **PriceQuote** | `ticker`, `price`, `currency`, `as_of` (napi cache) |

A számlamozgás a meglévő Transaction entitásban jelenik meg egy új jelöléssel (pl. `kind: 'invest_buy' / 'invest_sell'`, vagy egy flag). A builder dönti el a formát; a követelmény a 4.5-ös hatáslista.

## 6. Képernyők
- **Invest tab** (a prototípus szerint az alsó sávban, a Plan után): üres állapot („You have no investments yet”), havi ajánló kártya, portfólió-összegzés.
- **Fajtaoldal** ×4 (a kártya soraiból).
- **Megvettem / eladás lap.**
- **Holding oldal:** érték, hozam, vételek listája, esésnél magyarázó szöveg.
- **Settings:** havi befektetési összeg (meglévő mező), kockázati profil.
- A megjelenés a jóváhagyott prototípust követi (`docs/prototype/finance-tracker-prototype.html`, Invest szekció), azzal az eltéréssel, hogy a havi összeg nem „Comes out of your allowance” azonnal, hanem csak vételkor.

## 7. A builderre bízva
- Az árfolyam-API(k) kiválasztása (jó ingyenes keret, HUF vagy átváltható deviza).
- A termékkatalógus feltöltése aktuális, hivatalos forrásokból, az ellenőrzés dátumával; hogy MBH-n és Revoluton mi érhető el.
- A pontos arányok és küszöbök konstansként (4.1, 4.2, 4.3), tesztekkel.
- A Transaction jelölés formája (5. pont).
- A napi frissítés módja (időzített függvény vagy az app megnyitásakor, ha a cache egy napnál régebbi). *(Az én döntésem)* A terv első feladata egy rövid élő próba: működik-e Base44-en a szerveroldali titok és az időzített függvény. Ha nem, a tartalék: az app megnyitásakor hívott függvény, illetve kulcs nélküli API.
