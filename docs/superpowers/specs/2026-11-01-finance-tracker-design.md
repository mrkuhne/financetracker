# Finance Tracker – tervdokumentum

Dátum: 2026-11-01 · Státusz: tervezet, jóváhagyásra vár

## 1. Mi ez és miért

Személyes pénzügyi app (iPhone főképernyőre telepített PWA), amivel a felhasználó követi a pénzét, és amiből napról napra látja, mennyit költhet még. Az app segít nagyobb vásárlásoknál dönteni („melyik kanapét vegyem, és mikor?”), segít félretenni és befektetni kezdeni, és a piaci híreket is összefoglalja. Az egészet erős AI-támogatás fogja össze.

A felhasználó most semmilyen befektetéssel nem rendelkezik. Azt szeretné, hogy az app a jövedelme és a szabad kerete alapján mutassa meg, hogyan bánjon okosan és biztonságosan a pénzével: tartalék, megtakarítás, befektetés, passzív jövedelem.

**Siker:** a felhasználó naponta használja. A kiadások nagy része SMS-ből magától bekerül, így ránézésre tudja a heti és a havi szabad keretét, és nagyobb vásárlás előtt az appot kérdezi meg.

## 2. Célok, nem célok, anti-célok

### Célok (első kör, v1)
1. Számlák és tranzakciók kézi rögzítése, gyors felvitellel.
2. Automatikus rögzítés a banki SMS-ekből, iOS Shortcuts segítségével.
3. Ismétlődő bevételek és kiadások.
4. Zsebpénz: heti és havi szabad keret.
5. Vásárlástervező: több opció összevetése, hatás a hónapra, AI-javaslat, a módosítások egy gombbal alkalmazhatók.
6. Megtakarítási számla és célok, „okos pénz” útmutató.
7. Befektetés: havi befektetési összeg, AI-elosztási javaslat, kézzel vezetett portfólió napi árfolyamokkal.
8. Hírek: felhasználó által megadott források, időzített gyűjtés, AI-összefoglalós feed, reggeli összefoglaló push értesítésben.
9. Beszélgetős AI-asszisztens, ami ismeri a felhasználó pénzügyeit.

### Nem célok (v1)
- Banki API vagy Open Banking kapcsolat. Revolut CSV-import sincs (később jöhet).
- Natív iOS vagy Android app (Expo/React Native). Ehhez kellene az Apple Developer Program ($99/év), amit a felhasználó nem akar. A PWA mindent lefed, amire v1-ben szükség van.
- Asztali nézetre optimalizálás. A PWA mobile-first, asztalon csak használható legyen.
- Automatikus kereskedés vagy brókeri integráció. Az app nem vesz és nem ad el semmit.
- Többfelhasználós funkciók (közös költségvetés, megosztás). Az alapokat viszont lásd a 4. pontban.
- Nyilvános megjelenés. Az appot **csak a felhasználó használja a saját iPhone-ján**, ezért nincs szükség adatvédelmi nyilatkozatra, fióktörlésre és kidolgozott nyilvános regisztrációra.

### Anti-célok (ha ez történik, a v1 kudarc, akkor is, ha műszakilag működik)
- Egy kiadás kézi felvitele lassú (több mint néhány koppintás vagy pár másodperc).
- A heti és havi keret szám nem megbízható vagy nem érthető, honnan jön.
- Az AI úgy ad befektetési vagy day trading „tippet”, mintha biztos utasítás lenne. Az AI-tartalom mindig oktató vagy tájékoztató jellegű, a döntés a felhasználóé, és ez látható is az appban.
- Bármelyik felhasználó látja egy másik adatait. Ez akkor is számít, ha most csak egy felhasználó van.

## 3. Platform és architektúra

**Döntések (a felhasználóval egyeztetve):**
- **Platform:** Base44, **React template** (full-stack: Vite + React + Tailwind frontend, Base44 backend). A frontendet is a Base44 hosztolja.
- **Kliens:** **PWA**, az iPhone főképernyőjére telepítve (Safari → Add to Home Screen). Natív app nincs, mert az Apple Developer Programot ($99/év) a felhasználó nem akarja.
- **Miért Base44 és nem a meglévő Hetzner k3s (mezo):** a Base44 előfizetés egy másik projekt miatt amúgy is megvan, így a bejelentkezés, a hozzáférési szabályok, az időzítés, az agent és az LLM-kreditek plusz költség nélkül készen vannak, üzemeltetni pedig nem kell.
- **Fejlesztés:** helyben, `base44 dev` (backend: localhost:4400, a `site.serveCommand`-dal a Vite frontend is elindul). Deploy: `base44 deploy`.
- **Felület nyelve:** angol. **Alap pénznem:** HUF.

**Az én döntéseim:**
- A projekt `base44 create` paranccsal, React template-ből indul ebben a mappában (`Finance Tracker`). A `base44/` mappa és az `src/` frontend egy repóban van.
- TypeScript a frontendben is (a template JS-sel indul, a builder átállítja).
- PWA: `vite-plugin-pwa` (manifest, ikonok, service worker, offline app shell). A mezo frontendje ugyanezt használja, a konfigurációja átvehető minta (`/Users/mrkuhne/Applications/Personal/Mezo/mezo/frontend`).
- SDK: `@base44/sdk`, a template előre bekötött kliensével. Dev módban a `serverUrl`/`appBaseUrl` a helyi backendre mutat (a CLI által injektált `VITE_BASE44_*` változókkal).
- Backend függvények: Deno, `base44/functions/<name>/entry.ts`. Szerver oldali titkok `secrets` alatt (hír- és árfolyam-API kulcsok, VAPID kulcspár).
- Fejlesztői eszközök: Base44 Docs MCP (`https://docs.base44.com/mcp`) és Base44 skills (`npx skills add base44/skills -g`).
- Adatbiztonság: a Base44 backend béta, ezért kell egy egyszerű teljes adatexport (JSON/CSV) a Settings alatt, és erről a felhasználó rendszeresen ment magának.

## 4. Felhasználók, bejelentkezés, jövőbeli többfelhasználós mód

- Bejelentkezés kezdettől van, a Base44 beépített auth-jával. **E-mail és jelszó**, és a Google-bejelentkezés is engedélyezhető (`loginWithProvider('google')`), mert ez böngészőben fut. Az SDK localStorage-ban tárolja a tokent.
- **Ellenőrizendő:** a főképernyőre telepített iOS PWA külön tárolót használ, mint a Safari. A bejelentkezés (különösen a Google-átirányítás) a telepített PWA-n belül is működjön, és maradjon meg az app újraindítása után is.
- **RLS minden felhasználói entitáson:** `read/update/delete: {"created_by_id": "{{user.id}}"}`, `create: true`. Így többfelhasználós módban nem kell átírni az adatmodellt, és most sem kell felhasználói szűrést kézzel írni a kliensbe.
- A felhasználói beállítások a User entitás saját mezőiben vannak (`updateMe`), lásd 5. pont.

## 5. Adatmodell (első változat, a builder finomíthatja)

Minden entitáson RLS a 4. pont szerint. Pénzösszegek: egész szám a legkisebb egységben, vagy decimális. Ezt a builder dönti el, de legyen következetes. Minden összeghez tartozik egy `currency` mező.

| Entitás | Fő mezők |
|---|---|
| **User** (saját mezők) | `base_currency` (HUF), `monthly_savings_target`, `monthly_investment_amount` (nullable, ha üres, az app javasol), `emergency_fund_months` (alap 6), `week_start` (hétfő), `digest_time` (pl. 07:00), `timezone` |
| **Account** | név, típus (`checking` / `savings` / `cash` / `investment`), pénznem, nyitó egyenleg, alapértelmezett-e, archivált |
| **Category** | név, típus (kiadás/bevétel), ikon, opcionális havi keret (`monthly_budget`). Alap kategórialista seedből. |
| **Transaction** | számla, összeg, pénznem, HUF-ra átváltott összeg, kategória, dátum, megjegyzés, forrás (`manual` / `sms` / `recurring`), `needs_review` (bool), opcionális `recurring_rule_id`, `transfer_pair_id` (számlák közti átvezetéshez) |
| **RecurringRule** | név, összeg, pénznem, kategória, számla, gyakoriság (havi / heti / éves), következő dátum, aktív |
| **SavingsGoal** | név (pl. Emergency fund), célösszeg, hozzárendelt számla, prioritás |
| **PurchasePlan** | cím (pl. Couch), határidő (opcionális), státusz (`considering` / `decided` / `bought` / `dropped`), kiválasztott opció |
| **PurchaseOption** | terv, név, ár, fizetési mód (`one_time` / `installments` + havi részlet és darabszám), link, megjegyzés |
| **Holding** | eszköz típusa (`stock` / `etf` / `crypto` / `bond`), ticker/azonosító, mennyiség, átlagár, pénznem |
| **InvestmentTransaction** | holding, vétel/eladás, mennyiség, ár, dátum |
| **PriceQuote** | ticker, ár, pénznem, időpont (napi frissítés, cache) |
| **FxRate** | pénznempár, árfolyam, dátum |
| **NewsSource** | név, típus (`rss` / `api`), URL, címkék, aktív |
| **NewsItem** | forrás, cím, link, megjelenés ideje, AI-összefoglaló, címkék, `affects_portfolio` (bool) |
| **DailyDigest** | dátum, AI által írt szöveg, kapcsolódó hírek |
| **ApiKey** | kulcs hash-e, név (pl. "iPhone Shortcut"), utolsó használat, visszavonva |
| **PushSubscription** | Web Push subscription (endpoint, `p256dh`, `auth` kulcsok), eszköz neve |

Megjegyzés: a `PriceQuote`, `FxRate` és `NewsItem` lehet közös adat is (nem felhasználónkénti). V1-ben felhasználónkénti is maradhat. Ezt a builder dönti el, de többfelhasználós módban a közös cache-t javaslom.

## 6. Funkciók részletesen

### 6.1 Számlák és gyors rögzítés
- Főképernyő: legfelül a **heti keret hátralévő része** és a **havi keret hátralévő része** a legnagyobb számok. Alattuk az összesített egyenleg és a legutóbbi tranzakciók. A „needs review” tételek kiemelve.
- Gyors felvitel: nagy „+” gomb. Az összeg mezőn azonnal ott a fókusz, a legutóbbi kategóriák elöl vannak, az alapértelmezett számla előre ki van választva. Cél: egy kiadás 2–3 koppintás után mentve.
- Több pénznem: a tranzakció a saját pénznemében tárolódik, mellé a HUF-értéke is, a tranzakció napi árfolyamán (FxRate). A keretek és összesítések HUF-ban vannak.
- Átvezetés számlák között (pl. Revolut → megtakarítás): nem kiadás és nem bevétel, nem csökkenti a keretet.

### 6.2 Automatikus rögzítés SMS-ből (v1)
- A felhasználó iOS Shortcuts **személyes automatizálást** állít be: „üzenet érkezik a bank feladójától → Get Contents of URL (POST)”, futtatás megerősítés nélkül.
- Végpont: Base44 backend függvény, közvetlen HTTP-n: `POST https://<app-domain>/functions/ingestSms`, body: `{ "text": "...", "sender": "...", "received_at": "..." }`, header: `Authorization: Bearer <személyes API kulcs>`.
- Közvetlen HTTP hívásnál **nincs felhasználói kontextus**, ezért a függvény maga ellenőrzi az API kulcsot (hash összevetés az `ApiKey` entitással), és `asServiceRole`-lal ír, a kulcs tulajdonosának nevében (a `created_by`/`created_by_id` beállításának módját a builder ellenőrizze).
- Az AI (InvokeLLM, strukturált kimenet) kinyeri az összeget, a pénznemet, a kereskedőt, a dátumot, az irányt (terhelés/jóváírás) és a számlát (a bank feladója alapján), és kategóriát javasol. A tranzakció `source: sms`, `needs_review: true` jelöléssel kerül be.
- Duplikáció-védelem: ugyanaz az SMS kétszer ne kerüljön be (pl. a szöveg hash-e és az időpont alapján).
- Ha az AI nem tudja értelmezni az SMS-t (pl. OTP vagy reklám), a függvény nem hoz létre tranzakciót, de naplózza.
- Az appban: „Settings → SMS automation”. Itt lehet API kulcsot generálni (egyszer jelenik meg), lépésről lépésre útmutató van a Shortcut beállításához, és itt lehet a kulcsot visszavonni.
- **Az SMS-eket az MBH Bank küldi** (a felhasználó minden számlamozgásról kap SMS-t). A v1 SMS-értelmezése MBH-formátumra készül. A teszteléshez a felhasználó kitakart minta-SMS-eket ad.
- **A Revolut csak push értesítést küld.** Az iOS Shortcuts nem tud más appok értesítéseire automatizálást indítani, ezért a Revolut-tranzakciók v1-ben kézzel kerülnek be. Később jöhet Revolut CSV-import.

### 6.3 Ismétlődő tételek
- A szabályokból a tranzakciók az esedékesség napján generálódnak (napi időzített függvény), `source: recurring`.
- A havi keret számításához a hónap **várható** ismétlődő tételei is kellenek, akkor is, ha még nem estek esedékessé.

### 6.4 Zsebpénz (heti és havi keret)
Az én definícióm, minden HUF-ban, naptári hónapra:
- **Havi szabad keret** = a hónap várható bevételei (ismétlődő + már rögzített egyszeri bevétel) − a hónap ismétlődő kiadásai − `monthly_savings_target` − `monthly_investment_amount` (vagy a javasolt összeg) − a hónapban már esedékes vásárlási részletek.
- **Havi hátralévő** = havi szabad keret − a hónap nem ismétlődő kiadásai eddig.
- **Heti keret** (a hét elején rögzítve) = a hét elején még hátralévő havi keret ÷ a hónapból hátralévő hetek száma (a csonka hetek arányosan számítanak). **Heti hátralévő** = heti keret − a héten eddigi nem ismétlődő kiadások. Ha egy héten többet költesz, a következő hetek kerete automatikusan kisebb lesz.
- A szám mellett legyen egy koppintással megnyitható bontás: miből jön ki.
- Átvezetés és megtakarításba utalás nem számít kiadásnak.
- *(Az én döntésem)* Minden számla nem ismétlődő kiadása csökkenti a keretet, akár checking, akár cash, akár savings, kivéve az átvezetéseket és a befektetési vételeket (azokat a `monthly_investment_amount` fedezi).
- *(Az én döntésem)* Nincs dupla levonás: ha egy rögzített tranzakció egy ismétlődő szabályhoz vagy egy vásárlási terv részletéhez kötődik, azt a képlet már fix tételként levonta, ezért a „nem ismétlődő kiadások” közé nem számít bele.
- *(Az én döntésem)* Ha egy hét két hónapra esik, a napjai arányában oszlik meg a két hónap között. A heti keret a két hónap napi kereteinek összege.
- **Hónapváltás (a felhasználó döntése):** minden hónap tiszta lappal indul. A hónap végén **megmaradt** keret automatikusan a megtakarításba kerül, átvezetésként a megtakarítási számlára, vagy legalább jóváhagyandó javaslatként. A **túlköltés** viszont levonódik: a következő hónap havi szabad kerete ennyivel kisebb.

### 6.5 Vásárlástervező (a jóváhagyott vázlat szerint, 4 képernyő)
1. **Felvitel:** terv neve, 1–N opció (név, ár, link), opcionális határidő, fizetési mód (egyben vagy részlet).
2. **Hatás opciónként:** mennyi marad a havi keretből, ha most veszi meg. Érinti-e a megtakarítást (igen/nem, mennyivel). Ha nem fér bele: a legkorábbi dátum, amikor biztonságosan megveheti, a jelenlegi havi szabad keretből félretéve, a vészhelyzeti tartalék megsértése nélkül.
3. **AI-javaslat:** melyik opciót érdemes választani, és konkrét módosításokat javasol (kategória keret csökkentése, a havi megtakarítás ideiglenes csökkentése, a vásárlás eltolása). Mutatja, hogy ezek után mennyi a vészhelyzeti tartalék (hány havi kiadást fed le). **„Apply changes”** gomb: a javasolt módosításokat jóváhagyás után beírja (kategória keretek, User beállítások csak az adott hónapra vagy véglegesen, a módot a felhasználó választja).
4. A tervek listája státusszal. A megvett terv tranzakcióvá alakítható.

Alapelv: **a számokat determinisztikus kód számolja, az AI csak értelmez és javasol.** Az AI soha nem talál ki egyenleget.

### 6.6 Megtakarítás és „okos pénz” útmutató
- Megtakarítási célok haladásjelzővel (vészhelyzeti tartalék = `emergency_fund_months` × az átlagos havi kiadás).
- Útmutató: a jövedelem és a keret alapján lépcsőzetes ajánlás (pl. 1. vészhelyzeti tartalék → 2. drága tartozások → 3. rendszeres befektetés → 4. passzív jövedelem terv). Ezt az AI szövegezi meg, a felhasználó saját számaira szabva, oktató hangnemben, és megmondja, melyik lépcsőn tart most a felhasználó.

### 6.7 Befektetés
- A felhasználó megadja a havi befektetési összeget. Ha nem adja meg, az app javasol egyet a szabad keret alapján, és ez az összeg kikerül a zsebpénzből.
- AI-elosztási javaslat (állampapír / ETF / részvény / kripto), kockázati magyarázattal. Figyelembe veszi, hogy megvan-e már a vészhelyzeti tartalék. Oktató jelleg, disclaimerrel.
- Portfólió: kézzel felvitt vételek és eladások, napi árfolyam-frissítés (időzített függvény → PriceQuote), érték és hozam HUF-ban.
- „Day trading tippek”: v1-ben **napi piaci összefoglalóként** jelenik meg (mi mozgott, miért), nem vételi vagy eladási utasításként.

### 6.8 Hírek és reggeli összefoglaló
- Források: a felhasználó adja meg és szerkeszti (RSS URL-ek, illetve előre beállított API-források). Kezdő lista seedből (a builder választja ki).
- Gyűjtés: időzített függvény (alap: óránként, a gyakoriság állítható a kreditköltség miatt). Új hírek → NewsItem, AI rövid összefoglaló és címkék, `affects_portfolio`, ha valamelyik holdingot vagy követett devizát érinti.
- Feed: időrendben, szűrhető címke és forrás szerint, link az eredeti cikkre.
- Reggeli összefoglaló: időzített függvény a felhasználó `digest_time`-jában → DailyDigest (részvény, deviza, a portfólió, nap eleji helyzet) → **Web Push** értesítés (a függvény VAPID-kulccsal küld a PushSubscription alapján, pl. a `web-push` npm csomaggal Deno alatt). iOS-en a Web Push csak a főképernyőre telepített PWA-ban működik, és az engedélyt felhasználói gombnyomásra kell kérni (Settings → „Enable notifications”). A mezo saját Web Push megoldása referenciaként használható (`techcore/webpush`, ADR 0014).
- A hír- és árfolyam-API-k konkrét kiválasztása a builderre van bízva, fontos szempont a jó ingyenes keret.

### 6.9 AI-asszisztens
- Base44 agent (`base44/agents/finance_assistant.jsonc`), csevegőfelület az appban (`base44.agents` SDK).
- Eszközei: olvasás (Account, Transaction, Category, RecurringRule, SavingsGoal, PurchasePlan, Holding, NewsItem), függvény-eszközök a determinisztikus számításokhoz (`computeAllowance`, `simulatePurchase`), és módosító műveletek (pl. kategória keret átállítása, vásárlási terv létrehozása). Módosítás csak a felhasználó kifejezett jóváhagyása után.
- Ugyanazok az elvek, mint a 6.5-ben: a számokat a függvények számolják, a befektetési tartalom oktató jellegű.
- **Ellenőrizendő:** az agent entity tooljai betartják-e az RLS-t. Ha nem, az agent csak a felhasználó kontextusában futó függvényeken keresztül férjen az adatokhoz.

## 7. AI-használat és költség
- LLM-hívások: Base44 InvokeLLM (SMS-értelmezés, hírösszefoglaló, vásárlási javaslat, útmutató), plusz a Base44 agent. Mindkettő a workspace kreditjeiből fogy.
- A gyakori hívásokat (SMS, hírek) kis vagy olcsó modell végezze, a döntéstámogatást (vásárlás, asszisztens) erősebb modell. A gyűjtések gyakorisága legyen konfigurálható.
- Pénzügyi adatokat csak a feladathoz szükséges mértékben küldünk az LLM-nek.

## 8. Kockázatok és első spike-ok (a megvalósítás elején)
1. **PWA + auth iOS-en:** telepített PWA-ban működik-e a bejelentkezés, és megmarad-e a munkamenet. A helyi `base44 dev` és a deployolt verzió ellen is.
2. **SMS-végpont:** közvetlen HTTP hívás a deployolt függvényre a Shortcutból, saját kulcs-ellenőrzéssel. A rekord a felhasználó nevében jön-e létre (`created_by_id`), amikor `asServiceRole`-lal írunk.
3. **Agent és RLS:** lásd 6.9.
4. **Web Push egy Base44 (Deno) függvényből**, VAPID-kulccsal, a telepített iOS PWA-ra.
5. **Kreditfogyasztás:** a $50-os csomag integrációs kreditjei közösek a felhasználó másik Base44 projektjével. Az első hetekben mérni kell, mennyit fogyaszt az SMS-értelmezés, a hírgyűjtés és az asszisztens, és ehhez igazítani az alap gyakoriságokat.
6. A Base44 backend béta. Pénzügyi adatokról van szó, ezért kell a teljes adatexport (3. pont).

## 9. A builderre bízva
- A UI pontos megjelenése (mobile-first, iPhone-ra), a navigáció (javaslat: alsó tab bar: Home / Transactions / Plan / Invest / News, plus asszisztens), komponens-könyvtár (a template shadcn-stílusú `components/ui`-ja kézenfekvő), állapotkezelés, router.
- A konkrét hír-, árfolyam- és deviza-API-k.
- Az alap kategórialista és a hírforrások kezdő listája.
- A pénzösszegek tárolási formája (5. pont).
- A tesztelési stratégia. A keret- és vásárlás-számítások legyenek tiszta, unit-tesztelt függvények.
- A v1-en belüli sorrend. Javaslat: alapok (auth, számlák, tranzakciók, kategóriák) → ismétlődő tételek + keret → SMS → vásárlástervező → megtakarítás és útmutató → befektetés → hírek és összefoglaló → asszisztens.
