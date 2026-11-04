# Plan 5 – Hírek és reggeli összefoglaló: tervdokumentum

Dátum: 2026-11-04 · Státusz: jóváhagyásra vár
Kiegészíti és felülírja: `2026-11-01-finance-tracker-design.md` §6.8, és a Plan 4 (`2026-11-03-plan-4-investing-design.md`) egy nem-célját (lásd 2.).
Jóváhagyott képernyőtervek: `docs/superpowers/specs/2026-11-04-plan-5-screens.html` (mind a négy nézet, és a hírek saját fület kapnak).

## 1. Mi ez és miért

A felhasználó minden reggel ugyanabban az időpontban egy értesítést kap a telefonjára. Ebből két dolgot akar megtudni:
1. **Mi változott azokban, amikben befektetése van**, és mi erről az AI véleménye, értékelése.
2. **Mibe érdemes most befektetni** az elmúlt 24 óra és az elmúlt 1 hét alapján:
   - ha a havi befektetési összegből maradt még ebben a hónapban, ajánlás arra, mire menjen;
   - ha nem maradt, értékelés arról, megéri-e a következő havi befektetési pénzből előrehozni.

Emellett az appban **híreket is lehet olvasni** egy saját fülön. Témák: a befektetéseit érintő hírek és az általános gazdasági hírek (kamatdöntések, infláció, forint, piacok, ingatlan). **Nyelv: angol**, mert a felhasználó szerint az angol források jobbak, és a felület is angol.

**Siker:** a felhasználó reggel ránéz az értesítésre, és egy-két mondatból tudja, kell-e ma bármit csinálnia a befektetéseivel. Ha kíváncsi, koppint, és ott a részletes összefoglaló. Napközben a News fülön olvas.

## 2. Célok, nem célok, anti-célok

### Célok
1. **Reggeli értesítés** minden nap ugyanabban az időpontban (Web Push a főképernyőre telepített PWA-ra). Rövid, legfeljebb két mondat.
2. **Reggeli összefoglaló oldal** (az értesítésre koppintva vagy a News fülről nyílik). Három kártya:
   - a befektetések napi és heti változása, plusz az EUR/HUF;
   - „What happened”: AI-magyarázat, hivatkozva a felhasznált hírekre;
   - „This month's money”: a havi keret maradéka, ajánlás vagy előrehozási értékelés.
3. **News fül:** ötödik fül az alsó sávban (Home · Activity · Plan · Invest · News). Időrendben, szűrőkkel: Mine, All, Rates, Forint, Markets, Housing (és ami a címkékből adódik). Minden hír egysoros AI-összefoglalót kap, és az eredeti cikkre visz. A News fül tetején a mai összefoglaló kártyája.
4. **Settings → Morning brief:**
   - értesítés be/ki ezen a telefonon (az engedélyt gombnyomásra kéri);
   - időpont;
   - a hírgyűjtés gyakorisága;
   - az utolsó küldés állapota, hiba esetén az okkal;
   - „Send a test notification” gomb.

### Nem célok (Plan 5)
- Saját hírforrás hozzáadása URL-lel. *(Az én döntésem.)* A forráslista seedből jön, a Settingsben forrásonként ki-be kapcsolható. A spec §6.8 szerkeszthető listát írt, ezt későbbre hagyom.
- Valós idejű árfolyam vagy napközbeni riasztás. Naponta egy értesítés van.
- Teljes cikkszöveg tárolása vagy megjelenítése. Csak cím, forrás, link, idő és az AI egysoros összefoglalója kerül tárolásra.
- Az AI-asszisztens (Plan 6).
- Automatikus vásárlás. A vételt továbbra is a felhasználó rögzíti a Plan 4 „Megvettem” lapján.

**Felülírja a Plan 4-et:** a Plan 4 nem-célja volt a vételi időzítés. A felhasználó most kifejezetten kéri, hogy az összefoglaló a friss események alapján mondja meg, mibe és mikor érdemes a maradékot betenni, és hogy megéri-e előrehozni. Ez a 4.4-es korlátok között megengedett. Eladást továbbra sem javasol az app.

### Anti-célok
*(A felhasználó jóváhagyta.)*
- **Pánikkeltés:** riasztó hangvétel normál ingadozásnál. Az értékelés megmondja, ha valami szokásos kilengés.
- **Folyamatos nyomás a vásárlásra:** a „most nem kell semmit csinálni” is gyakori, teljes értékű válasz. Előrehozást csak a 4.4 feltételeivel javasolhat.
- **Túl hosszú értesítés:** legfeljebb két mondat.
- **Kitalált szám vagy hír:** a számokat a kód számolja. Az AI csak a bemenetként kapott hírekre hivatkozhat, a nem létező hírazonosítókat a normalizálás eldobja.
- **Elfogyó kredit:** a hírgyűjtés nem élheti fel a Base44 kreditkeretet (amin a felhasználó egy másik projektje is osztozik), és nem akaszthatja meg az SMS-feldolgozást.
- **Néma hiba:** ha nem megy ki az értesítés, a Settingsben látszik, hogy miért nem.

## 3. Megkötések
- Platform és minta, mint az eddigi terveknél:
  - Base44, React + TS, angol felület, HUF alap, egész szám minor egységben;
  - tiszta függvények a `src/domain/`-ben unit-tesztekkel;
  - RLS minden új felhasználói entitáson (`created_by_id`).
- **A számokat determinisztikus kód számolja, az AI csak értelmez és szövegez.** Az AI-kimenetet normalizálni kell, és az érvénytelen részeket eldobni, mint a Plan 3–4-ben.
- **A havi keret maradéka és az előrehozási mozgástér pontosan ugyanaz a szám, amit az app mutatna** (Plan 4 `suggestInvestment` / `monthCard`, Plan 3 tartalék-feltétel). Ha a szerveroldali függvény nem tudja a `src/domain/` kódot használni, a kódot nem szabad kézzel lemásolni és eltérni hagyni. A megoldás a builderre van bízva (megosztott modul, build-lépés, vagy egy tesztelt közös fájl), de tesztnek kell őriznie, hogy a két oldal ugyanazt adja.
- Egy felhasználó, a saját iPhone-ján, időzóna `Europe/Budapest` (a User `timezone` mezője, ha üres, ez az alap).
- A Web Push csak a főképernyőre telepített PWA-ban működik (iOS 16.4+), és az engedélyt felhasználói gombnyomásra kell kérni.

## 4. Hogyan működik

### 4.1 Források
*(Az én döntésem; 2026-11-04-én élőben ellenőrizve, mind működő RSS.)*

| Forrás | Feed | Alap címkék |
|---|---|---|
| CNBC Top News | `https://www.cnbc.com/id/100003114/device/rss/rss.html` | markets |
| CNBC Economy | `https://www.cnbc.com/id/20910258/device/rss/rss.html` | economy |
| MarketWatch Top Stories | `https://feeds.content.dowjones.io/public/rss/mw_topstories` | markets |
| BBC Business | `https://feeds.bbci.co.uk/news/business/rss.xml` | economy |
| FT Markets | `https://www.ft.com/markets?format=rss` | markets |
| ECB press | `https://www.ecb.europa.eu/rss/press.html` | rates, inflation |
| Budapest Business Journal | `https://bbj.hu/rss` | hungary, forint |
| Hungary Today | `https://hungarytoday.hu/feed/` | hungary |

- Az MNB-nek nincs használható angol RSS-e. A Yahoo ticker-RSS a felhasználó ETF-jére üres. Ezért egyik sem kerül be.
- NewsAPI nem használható, mert az ingyenes csomag éles használatra tilos.
- Tárolás: csak cím, link, forrás, megjelenés ideje és az AI egysoros összefoglalója. A hír az eredeti oldalon nyílik meg.
- *(Az én döntésem)* A hírek 30 napig maradnak meg, a régebbieket a gyűjtő törli.

### 4.2 Hírgyűjtés
- Időzített backend függvény (Base44 automation), alapból **4 óránként**. A gyakoriság a Settingsben állítható: 2, 4, 8 vagy 12 óra.
- Lépései:
  1. lekéri az aktív forrásokat;
  2. az új tételeket a link alapján deduplikálja;
  3. az összes új tételt **egy** AI-hívásban kapja meg, olcsó modellel.
- Az AI-hívás kimenete tételenként:
  - egysoros összefoglaló (angol);
  - címkék egy rögzített listából: `markets`, `etf`, `stocks`, `bonds`, `crypto`, `rates`, `inflation`, `forint`, `hungary`, `housing`, `economy`;
  - `affects_portfolio`.
- Az AI megkapja a felhasználó holdingjainak listáját (fajta, név, ticker, pénznem, csak azonosítók, összeg nélkül).
- „Mine” = `affects_portfolio`. *(Az én döntésem)* Holdingok nélkül is „Mine” lehet egy hír, ha a forintot vagy a magyar kamatot érinti, mert ez a felhasználó pénzét akkor is érinti.
- Egy futásban legfeljebb ~40 új tétel kerül az AI-hívásba, a többi a következő futásra marad. Ez korlátozza a kreditfogyást.
- Ha az AI nem érhető el, a tétel összefoglaló és címke nélkül kerül be (a forrás alap címkéivel), és a következő futás pótolja.
- *(Az én döntésem, az „elfogyó kredit” anti-cél miatt)* **Kódban kikényszerített napi plafon:** naponta legfeljebb 10 gyűjtő AI-hívás és 2 összefoglaló AI-hívás (a második a teszt- vagy ismételt futásé). A plafon felett a hírek AI nélkül kerülnek be, a Settings pedig kiírja: „Daily AI limit reached”.

### 4.3 Piaci adatok az összefoglalóhoz
- **Holdingok:** napi és heti változás a Yahoo chart végpontból, a Plan 4 `quotes` függvényének logikájával (`range` legalább 1 hónap, `interval=1d`).
  - Napi változás: utolsó záró / előző záró.
  - Heti változás: utolsó záró / az utolsó, legalább 7 nappal korábbi záró.
- **Állampapír:** nincs piaci ár. A determinisztikus (Plan 4) érték változása kerül ki („fixed”).
- **EUR/HUF** (és USD/HUF, ha van USD-s holding): az EKB napi referenciaárfolyama. Ez élőben működik: `https://api.frankfurter.app/latest?from=EUR&to=HUF`. Az érték a meglévő `FxRate` entitásba kerül.
- Holdingok nélkül is van összefoglaló. Az első kártya ekkor a piacok és a forint mozgását mutatja (egy világ-ETF, például a katalógus VWCE-je, és az EUR/HUF), és „You have no investments yet” jelzést kap.

### 4.4 „This month's money”: maradék és előrehozás
A kód számolja, az AI csak szövegez:
- `left = max(0, suggested − investedThisMonth)` a Plan 4 `monthCard` szerint.
- **Ha `left > 0`:** az AI ajánlása arról, mire menjen a maradék. Csak a Plan 4 ez havi felosztásán (`splitInvestment`) és a katalóguson belül választhat, és a „wait” is érvényes válasz. A katalóguson kívüli termék vagy a `left`-nél nagyobb összeg eldobásra kerül.
- **Ha `left = 0`, előrehozási értékelés.** *(Az én döntésem a biztonsági szabályokra.)* Előrehozni csak akkor lehet, ha mind teljesül:
  - a vészhelyzeti tartalék megvan (ugyanaz a feltétel, mint a guide 2. lépcsőjénél);
  - a hónap hátralévő szabad kerete nagyobb, mint a várható költés a hónap végéig (átlagos napi költés × hátralévő napok). *(Az én döntésem a definíciókra:)*
    - „hátralévő szabad keret”: a havi zsebpénz maradéka, ahogy az app Home képernyője mutatja (`computeMonthlyAllowance`). Ebben a megtakarítási cél és az ismétlődő tételek már le vannak vonva.
    - „átlagos napi költés”: a szabad költés (`isSpend`, ismétlődők nélkül) napi átlaga. Két érték közül a nagyobb számít: az e havi eddigi átlag és a teljes hónapok átlaga. Az óvatosabb érték véd attól, hogy olyan előrehozást javasoljon, amit a felhasználó nem engedhet meg magának;
  - az összeg legfeljebb a következő havi javasolt összeg 50%-a, és legfeljebb a fenti többlet.
- Ezt a kód `pullForwardRoomMinor` számként adja. Ha 0, az AI csak azt mondhatja, hogy most nem érdemes előrehozni, és miért. Ha nagyobb, értékelheti, hogy a heti események alapján megéri-e, legfeljebb ekkora összeggel.
- *(Az én döntésem)* Az előrehozás következménye:
  - Ha a felhasználó egy hónapban többet vett a javasoltnál, a többlet a következő havi javaslatból levonódik, de legfeljebb a következő havi (levonás előtti) javaslat 50%-a.
  - Ez a Plan 4 `suggestInvestment`/`monthCard` számát módosítja, így az Invest fület is. Szándékosan, mert a két helynek egyeznie kell (3. pont).
  - Ha a felhasználó a Settingsben fix havi összeget adott meg, levonás nincs: a saját beállítása az irányadó.
  - Ez a Plan 4 „nincs átvitel” szabályának egyirányú kiegészítése: a fel nem használt összeg továbbra sem halmozódik.
- Adat nélkül (nincs teljes hónap) ez a kártya a Plan 4 viselkedését követi: megmondja, hogy nincs elég adat, és nem talál ki számot.

### 4.5 Az összefoglaló elkészítése és kiküldése
- Időzített függvény, *(az én döntésem)* 15 percenként fut, és megnézi, elérkezett-e a felhasználó `digest_time`-ja (alap 07:00), és elkészült-e már a mai összefoglaló. Így a Settingsben átállított időpont azonnal érvényes, és nem kell az ütemezést módosítani.
- Lépései:
  1. kiszámolja a 4.3 és 4.4 számait;
  2. kiválasztja az elmúlt 24 óra „Mine” híreit, és ha kevés van, az elmúlt hét fontosabb híreit (legfeljebb ~15 tétel);
  3. **egy** AI-hívást indít, erősebb modellel.
- Az AI-hívás kimenete:
  - `notification`: legfeljebb 2 mondat, legfeljebb ~180 karakter;
  - `what_happened`;
  - `this_month`;
  - a felhasznált hírek azonosítói.
- Az eredmény egy `DailyDigest` rekordba kerül, a számokkal együtt, majd Web Push megy minden aktív feliratkozásra.
- **Ha az AI nem érhető el:**
  - az összefoglaló a számokkal elkészül, a szöveges kártyákon „AI note unavailable”;
  - az értesítés a kód által írt sablonszöveg, például „Portfolio +0.8% this week. 15 000 Ft left to invest this month.”
- **Ha hiányzik egy ár vagy árfolyam:** az adott sor „no data” jelzést kap, az összefoglaló „incomplete” jelölést, és a szöveg nem talál ki számot.
- **Ha a push sikertelen:** a hibát (HTTP-státusz, rövid ok) a `DailyDigest` tárolja, és a Settings mutatja. A 404 vagy 410 választ adó feliratkozás inaktívvá válik.
- Az összefoglaló akkor is elkészül, ha a push ki van kapcsolva vagy nincs feliratkozás: a News fül tetején ott van.
- Egy napra egy összefoglaló készül. A „Send a test notification” nem készít újat, hanem a legutóbbit (vagy egy fix tesztszöveget) küldi el.

### 4.6 Web Push
- *(Az én döntésem a kutatás alapján)* Deno oldalon `jsr:@negrel/webpush`, VAPID-kulcspár szerveroldali titokként, a `sub` egy valódi `mailto:` cím. Az Apple elutasítja a helyi vagy kitalált címet. A builder egy élő próbával dönti el, hogy ez vagy az `npm:web-push` működik-e a Base44 Deno futtatókörnyezetében.
- A service worker `push` és `notificationclick` kezelőt kap. A koppintás a mai összefoglalót nyitja meg (`/brief/<dátum>`), és ha az app már nyitva van, azt az ablakot fókuszálja.
- Ehhez a `vite-plugin-pwa` generateSW módja nem elég, át kell állni `injectManifest`-re. A meglévő viselkedés maradjon meg: precache, `navigateFallback` (az `/api/` kizárásával), `skipWaiting` + `clientsClaim`, és a frissítés utáni automatikus újratöltés (`registerSW` a `src/main.tsx`-ben).
- Feliratkozás: a Settings kapcsolója a felhasználó koppintására kér engedélyt, majd `PushSubscription` rekordot ment. A kikapcsolás leiratkoztat és törli a rekordot.
- A payload kicsi (cím, szöveg, URL). Minden push látható értesítést jelenít meg, mert az iOS a néma pusht büntetheti.

## 5. Adatmodell (első változat, a builder finomíthatja)
| Entitás | Fő mezők |
|---|---|
| **User** (új mezők) | `digest_enabled` (bool), `news_interval_hours` (2/4/8/12, alap 4). A meglévő `digest_time` (alap `07:00`) és `timezone` mezőket használja. |
| **NewsSource** | `name`, `url`, `default_tags`, `active`, `last_fetched_at`, `last_error` |
| **NewsItem** | `source_id`, `title`, `link` (egyedi), `published_at`, `summary` (nullable), `tags`, `affects_portfolio`, `ai_done` (bool) |
| **DailyDigest** | `date` (egyedi), `numbers` (a 4.3–4.4 számai, objektum), `notification`, `what_happened`, `this_month`, `news_ids`, `incomplete` (bool), `ai_ok` (bool), `push_status` (`sent` / `failed` / `skipped`), `push_error` |
| **PushSubscription** | `endpoint`, `p256dh`, `auth`, `device_name`, `active`, `last_error` |

Az időzített függvények service role-lal futnak, de minden rekord a felhasználóhoz kötött (`created_by_id`), mint az `ingest-sms`-nél. A forrás seed a felhasználóhoz kötve jön létre az első futáskor vagy az első megnyitáskor (a builder dönti el).

## 6. Képernyők
A jóváhagyott képernyőtervek szerint (lásd a fejlécet), az app meglévő tokenjeivel és stílusával:
- **Lezárt képernyős értesítés:** cím „Morning brief”, legfeljebb két mondat.
- **Brief oldal** (`/brief/:date`):
  - a három kártya (4.3, 4.4, „What happened” a forrásneveivel);
  - lábjegyzet: „Educational, not financial advice. You decide and record the buy.”;
  - a „This month's money” kártya a Plan 4 „Megvettem” lapjára visz.
- **News fül** (`/news`): a mai összefoglaló kártyája felül, alatta a szűrő chipek és a hírlista. A „Mine” jelölés kiemelt chipet kap.
- **Settings → Morning brief:** a 2. pont 4. célja szerint, a forrásonkénti ki-be kapcsolókkal együtt.
- Üres állapotok:
  - még nincs hír: „News arrives within a few hours.”;
  - még nincs összefoglaló: „Your first brief arrives tomorrow at 07:00.”;
  - nincs telepítve az app: „Add the app to your Home Screen to get notifications.”.

## 7. Kockázatok és első próbák
*(Az én döntésem: a terv első feladatai, továbblépési kapuként.)* Az 1. és 2. próba a felület építése előtt fut le. Ha az időzített függvény vagy a push nem működik, a builder megáll, és a felhasználóval egyeztet a tartalékról. Nem építi meg magától a push nélküli változatot.
1. **Időzített függvény Base44-en:**
   - van-e cron-szerű automation, és mi a legrövidebb intervallum;
   - service role-lal fut-e;
   - működik-e szerveroldalról az InvokeLLM. Kliensoldalról működik; szerveroldalról ez még nincs ellenőrizve.
   - Tartalék, ha nincs időzítés: a hírgyűjtés és az összefoglaló az app megnyitásakor fut. Push ekkor nincs, ezt a felhasználónak meg kell mondani.
2. **Web Push Deno függvényből a felhasználó iPhone-jára.** Ehhez az appnak a főképernyőre telepítve kell lennie, ez felhasználói lépés. Ha nem megy, az összefoglaló az appban akkor is elkészül.
3. **Közös domain-kód** a függvény és az app között (3. pont).
4. **Kreditfogyás:** napi ~6 gyűjtő-hívás (olcsó modell) és 1 összefoglaló-hívás (erősebb modell). Az első héten figyelni kell, és ha sok, a gyűjtés gyakoriságát csökkenteni.

## 8. A builderre bízva
- A források pontos URL-jei (a 4.1 táblázat élőben ellenőrzött; egy leállt feed cserélhető) és az alap címkék.
- Az AI-modellek (olcsó a gyűjtéshez, erősebb az összefoglalóhoz) és a promptok, a normalizálással.
- A közös domain-kód megoldása, a 3. pont tesztkövetelményével.
- A seed létrehozásának időpontja, a régi hírek törlésének módja.
- A pontos küszöbök (40 tétel, 15 hír, 50%) konstansként, tesztekkel.
- A Settings és a News fül részletei a képernyőtervek szellemében.
