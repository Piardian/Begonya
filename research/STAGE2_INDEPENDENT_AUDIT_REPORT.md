# BEGONYA — İKİNCİ AŞAMA BAĞIMSIZ ADVERSARIAL DENETİM RAPORU
**Belge Kodu:** `research/STAGE2_INDEPENDENT_AUDIT_REPORT.md`  
**Denetim Tarihi:** 14 Ekim 2026 22:15 UTC+3  
**Kapsam:** Candle Timestamp Semantiği, Maliyet Modeli Duyarlılığı, Üretim-Replay Eşdeğerliği  
**İlgili Testler:** `research/test_timing_and_break_proof.js`, `research/test_stage2_audit.js`  
**Bağımsızlık Güvencesi:** `CONSOLIDATED_VALIDATION_REPORT.md` raporu değiştirilmemiş; üretim dosyalarına dokunulmamış, canlı emirler kesin olarak kapalı tutulmuştur.

---

## 1. YÖNETİCİ ÖZETİ VE KARAR TABLOSU

| Denetim Konusu | Karar | Temel Kanıt / Neden |
| :--- | :---: | :--- |
| **1. Candle Timestamp ve Sinyal Zamanı** | **PASS (Nedensellik)**<br>**FAIL (Adım Mekanizması)** | OHLC timestamp'leri kesin olarak mum **AÇILIŞINI** temsil eder. Replay motorunda `filterClosedCandles` kırılım mumunu henüz kapanmadığı için analize dahil etmez (look-ahead engellenir). Ancak `breakIndices` ile adım atılması, ara mumlarda oluşabilecek POI sinyallerinin atlanmasına yol açar. |
| **2. Maliyet Modeli ve Realizm** | **INSUFFICIENT DATA** | Gerçek bir broker/venue (ör. Bybit, Binance, Darwinex) sözleşme veya komisyon tarifesi kodda tanımlı değildir; maliyetler sezgisel (heuristic) yüzdelerdir. Senaryo B'de maliyetler %50 arttığında net getiri -0,93R'dan -1,90R'a, %100 arttığında -2,87R'a geriler. |
| **3. Üretim-Replay Eşdeğerliği** | **DIVERGENT (Araştırma Modifikasyonu)** | Replay; üretim poller'ının periyodik 15M taramasını değil `breakIndices` adımını, üretimin 15M dar stopunu değil 1H yapısal stopunu ve basitleştirilmiş bir in-memory dedup mekanizmasını kullanmaktadır. |

---

## 2. KONU 1: CANDLE TIMESTAMP VE SİNYAL ZAMANLAMASI DENETİMİ

### 2.1. Ham Veride Timestamp Semantiği: AÇILIŞ ZAMANI (OPEN TIME)
`../swing-bos-core/data/replay_1year/BTCUSD_15m.json` ham verisinden ardışık mumlar incelenmiştir:
- Mum #0: `2025-10-10T04:30:00.000Z` | Açılış: 121.288,07 | Kapanış: 121.152,69
- Mum #1: `2025-10-10T04:45:00.000Z` | Açılış: 121.152,68 | Kapanış: 121.234,51
- Zaman Farkı: $\Delta T = 1760071500000 - 1760070600000 = 900.000\text{ ms} = 15\text{ dakika}$.
- Ardışık 20 mumun 20'sinde de ($%100$) $C_{k+1}.\text{open} \approx C_k.\text{close}$ sürekliliği doğrulanmıştır (`test_timing_and_break_proof.js`).

**Kesin Sonuç:** Veri setindeki `timestamp`, mumun **AÇILIŞ** anını göstermektedir. Bir 15M mumu $[T_{\text{open}}, T_{\text{close}})$ aralığını kapsar ve ancak $T_{\text{close}} = T_{\text{open}} + 15\text{ dakika}$ anında kapanmış olur.

---

### 2.2. Replay Döngüsündeki Zamanlama Zinciri: Adım Adım Analiz
`run_true_historical_replay.js` (Satır 287–306):
1. `breakIndices`: `detectStructure(all15m, swings)` çalıştırılarak kırılım mumlarının indeksleri çıkarılır.
2. `curTime = all15m[idx].timestamp`: Kırılım mumunun **AÇILIŞ** zamanı `curTime` olarak atanır.
3. `c15 = all15m.slice(Math.max(0, idx - 150), idx + 1)`: Son elemanı `all15m[idx]` olan dilim alınır.
4. `runPipeline(sym, store, notified, curTime)` çağrılır.
5. `runPipeline` içinde `filterClosedCandles(candles, 15*60*1000, curTime)` çalışır:
   $$\text{Kural: } \text{candle.timestamp} + 15\text{m} \le \text{curTime}$$
   `all15m[idx]` mumu için:
   $$\text{curTime} + 15\text{m} \le \text{curTime} \implies \text{YANLIŞ (FALSE)}$$

**Kritik Bulgular:**
- **Kırılım Kapanmadan Sinyal Üretilebilir mi?**  
  **HAYIR.** Çünkü `all15m[idx]` mumu `filterClosedCandles` tarafından kesin olarak elenmektedir. `runPipeline`'a giren en son kapalı mum `all15m[idx - 1]` (yani $idx$ kırılımından önceki 15M mumu) olmaktadır. Bu bakımdan geleceğe bakış sızıntısı (look-ahead) fiziksel olarak engellenmiştir (**PASS**).
- **Sinyal Yanlış Mumla mı Eşleşiyor?**  
  **EVET.** Loop iterasyonu $idx$ indeksinde iken, pipeline analizi $idx-1$ mumuna göre yapmaktadır. Dolayısıyla $idx$ adımında üretilen aday sinyal, $idx$ kırılımının ürünü DEĞİLDİR; daha önce oluşmuş ve $idx-1$ anında aktif olan eski bir POI'dir!
- **Bilinen Bir Kırılım İçin En Erken Kullanılabilir Zaman:**  
  Bir kırılım $idx$ mumunda gerçekleşmişse, bu olayın bilinebilmesi için $idx$ mumunun tamamlanması şarttır. Dolayısıyla bu kırılımın en erken değerlendirilebileceği an:
  $$T_{\text{earliest}} = \text{all15m}[idx].\text{timestamp} + 15\text{m} = \text{all15m}[idx+1].\text{timestamp}$$
  Replay motoru $idx$ adımında bu mumu görmemekte; bir sonraki kırılım indeksine kadar beklemektedir.

---

## 3. KONU 2: MALİYET MODELİ VE DUYARLILIK ANALİZİ

### 3.1. Maliyet Formüllerinin Koddan Çıkarımı
`run_true_historical_replay.js` (Satır 66–106):
```javascript
// BTCUSD Örneği:
commUsd = entryP * 0.00040; // 4.0 bps
sprdUsd = entryP * 0.00010; // 1.0 bp
slipUsd = entryP * 0.00015; // 1.5 bps
totalCostUsd = commUsd + sprdUsd + slipUsd; // 6.5 bps
cr = totalCostUsd / structRisk;
```

### 3.2. Maliyet Bileşenlerinin Uygulanış Biçimi
1. **Fiyat Temeli:** Yalnızca giriş fiyatına (`entryP`) uygulanmaktadır. Pozisyon kapanırken çıkış fiyatı (kârda daha yüksek, zararda daha düşük) üzerinden ikinci bir komisyon hesabı yapılmamaktadır. Gidiş-dönüş maliyetinin sabit 6,5 bps içinde kapsandığı varsayılmıştır.
2. **İşlem Yönü:** Long ve Short işlemler için komisyon, spread ve kayma tamamen aynıdır. Short pozisyonlarda borçlanma maliyeti (funding rate / swap) hesaba katılmamıştır.
3. **Pozisyon Boyutlandırması ve Normalizasyon:**
   Sabit parasal risk modelinde pozisyon büyüklüğü $Q = \frac{\text{Risk}_{\$}}{\text{structRisk}}$'tir.  
   Toplam parasal maliyet $Q \times \text{totalCostUsd} = \text{Risk}_{\$} \times \left(\frac{\text{totalCostUsd}}{\text{structRisk}}\right)$ olur.  
   R cinsinden maliyet: $C/R = \frac{\text{totalCostUsd}}{\text{structRisk}}$. Boyutsal analiz ve normalizasyon matematiksel olarak tutarlıdır.
4. **Gerçek Broker/Venue Tarifesi Durumu: INSUFFICIENT DATA**  
   Kod tabanında gerçek bir borsa/broker API tarifesi (ör. Bybit VIP kademesi, Binance Futures taker fee, Darwinex raw spread sözleşmesi) yer almamaktadır. Belirtilen 6,5 bps tamamen sezgisel (heuristic) bir varsayımdır. Bu nedenle maliyet realizmi **INSUFFICIENT DATA** olarak sınıflandırılmıştır.

---

### 3.3. Maliyet Duyarlılık Analizi (Net R Sensitivity)
Strateji kuralları ve işlem sonuçları değiştirilmeden, farklı maliyet çarpanları altında 23 işlemin yeniden hesaplanmış performans tablosu:

#### A. Portföy Geneli (23 İşlem)
| Maliyet Senaryosu | Çarpan | Toplam Maliyet (R) | Senaryo B Net PnL (R) | Senaryo B Beklenti (R/işlem) | Senaryo B Max DD (R) | Senaryo C Net PnL (R) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Mevcut (Heuristic)** | **1.00x** | **1,934R** | **-0,93R** | **-0,041R** | **4,91R** | **-6,53R** |
| **Ilımlı Artış** | **1.25x** | **2,418R** | **-1,42R** | **-0,062R** | **5,13R** | **-7,02R** |
| **Yüksek Kayma/Ücret** | **1.50x** | **2,901R** | **-1,90R** | **-0,083R** | **5,36R** | **-7,50R** |
| **Pessimistik / Perakende**| **2.00x** | **3,869R** | **-2,87R** | **-0,125R** | **5,81R** | **-8,47R** |

#### B. Yalnızca Kripto Sepeti (BTC, ETH, SOL — 17 İşlem)
| Maliyet Senaryosu | Çarpan | Kripto Maliyet (R) | Kripto Senaryo B Net R | Kripto Beklenti (R/işlem) | Kripto Max DD (R) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **1.00x (Mevcut)** | 1.00x | 1,554R | **+4,45R** | **+0,262R** | 2,59R |
| **1.25x** | 1.25x | 1,943R | **+4,06R** | **+0,239R** | 2,74R |
| **1.50x** | 1.50x | 2,331R | **+3,67R** | **+0,216R** | 2,89R |
| **2.00x** | 2.00x | 3,109R | **+2,89R** | **+0,170R** | 3,19R |

> [!IMPORTANT]
> **Duyarlılık Çıkarımı:**
> Kripto alt grubu maliyetler %100 artsa dahi pozitif net R üretmeye devam ederken (+2,89R), portföy geneli Forex ve Altın'daki negatif katkı sebebiyle her senaryoda negatif net R vermektedir. Stratejinin kâr/zarar eşiği maliyet varsayımına karşı oldukça kırılgandır.

---

## 4. KONU 3: ÜRETİM-REPLAY EŞDEĞERLİĞİ KARŞILAŞTIRMASI

Aşağıdaki matris, üretim kod tabanı ile araştırma replay motoru arasındaki 8 temel boyutu karşılaştırmaktadır:

| Boyut | Üretim Kodu (Production) | Replay Motoru (`run_true_historical_replay.js`) | Karşılaştırma Sonucu ve Etki |
| :--- | :--- | :--- | :--- |
| **1. Sinyal Üretim Tetikleyicisi** | `poller.ts` (Satır 83–92): Her 15M mum kapanışında periyodik olarak `runPipeline()` çağrılır. | `run_true_historical_replay.js` (Satır 278, 287): Yalnızca `breakIndices` (yapısal kırılım olan barlar) üzerinde çalışır. | **DIVERGENT (FAIL):** Replay ara barları atlar. Bu durum, kırılım olmayan barlarda uygun hale gelen POI'lerin tespit edilememesine neden olur. |
| **2. Kapalı Mum Filtresi** | `pipeline.ts` (Satır 284–286, 1211–1224): `filterClosedCandles` canlı zamanda `Date.now()` ile kapalı barları alır. | `run_true_historical_replay.js` (Satır 289, 305): `curTime = all15m[idx].timestamp` ile çalışır. | **DIVERGENT:** `curTime` açılış zamanı olduğundan, $idx$ mumu filtrelenir ve analiz 1 bar geriden ($idx-1$) yürür. |
| **3. Killzone Filtresi** | `killzone.ts` (Satır 40–128) & `poller.ts` (Satır 84): TRT UTC+3 seans saatlerini denetler. | `run_true_historical_replay.js` (Satır 292): Üretimdeki `evaluateKillzoneFilter` fonksiyonunu doğrudan import eder. | **EQUIVALENT (PASS):** Birebir aynı killzone mantığı ve kuralları uygulanmıştır. |
| **4. Tekilleştirme (Deduplication)** | `setupFamilyGuard.ts` (Satır 24–65): 45 dk cooldown, impulse kökenli bloklama ve A+ tier upgrade kontrolü yapar. | `run_true_historical_replay.js` (Satır 340–366): Aynı mum/yöndeki sinyalleri gruplayıp A+ > A, OB > FVG sıralamasıyla ilkini alır. | **DIVERGENT:** Amaç aynıdır (1 barda 1 sinyal), ancak replay state tutmayan basitleştirilmiş bir in-memory dedup kullanır. |
| **5. Makro Gate** | `macro_engine/gateways/macro_bias_gate.json`: Canlı emir öncesi yön filtresi uygular. | `run_true_historical_replay.js`: Makro gate tamamen devre dışı bırakılmıştır. | **DELIBERATE ISOLATION (PASS):** Doğrudur; güncel statik makro verisini geçmişe uygulamak veri sızıntısı yaratırdı. |
| **6. POI / Entry Mekaniği** | `activePoiWatchlist.ts` & `poller.ts` (Satır 157–160): Canlı emir emisyonu ve fiyat teması takibi. | `run_true_historical_replay.js` (Satır 390, 423–436): FVG proximal, OB %50 CE, 16 bar bekleme penceresi. | **EQUIVALENT IN THEORY, UNVERIFIED IN PRACTICE:** Teorik kurallar eşdeğerdir; canlı broker dolum/kayma realizmi doğrulanamaz. |
| **7. Stop / Target Kuralları** | `riskEngine.ts`: 15M dar POI invalidation stopu kullanır. | `run_true_historical_replay.js` (Satır 395–416): 1H fraktal yapısal stop + 2.0R hedef (Senaryo B) kullanır. | **FROZEN RESEARCH EXPERIMENT:** Bu fark bilinçli bir araştırma modifikasyonudur; dar stop maliyet patlamasını önlemek için test edilmiştir. |
| **8. Maliyet Muhasebesi** | Canlı broker spread ve taker komisyonu ile gerçek zamanlı kesinti. | `run_true_historical_replay.js` (Satır 66–106): 6,5–11,5 bps ve pip bazlı formül; $Net R = Gross R - C/R$. | **INSUFFICIENT DATA:** Gerçek borsa emir defteri/broker kayma verisiyle doğrulanmamıştır. |

---

## 5. BAĞIMSIZ TEST ÇIKTILARI

`research/test_timing_and_break_proof.js` ve `research/test_stage2_audit.js` test paketlerinin terminal çıktıları:

```text
================================================================================
BEGONYA STAGE 2 INDEPENDENT AUDIT SUITE
================================================================================
[PASS] Test 1: 1.1. OHLC Timestamps Represent Candle Open Time (Empirical Continuity)
[PASS] Test 2: 1.2. Earliest Usable Time for Break Candle (T_break + 15m Close Requirement)
[PASS] Test 3: 1.3. Replay curTime Timing Isolation (No Candle idx Leakage in runPipeline)
[PASS] Test 4: 2.1. Cost Model Structure (Applied Solely to Entry Price, Not Exit Price)
[PASS] Test 5: 2.2. Cost Sensitivity Analysis Verification
[PASS] Test 6: 3.1. Replay Uses Frozen 1H Structural Stop Formula (Independent of Production 15M Invalidation)
[PASS] Test 7: 3.2. Macro Gate Isolation (Replay decoupled from macro_bias_gate.json)
================================================================================
STAGE 2 AUDIT: 7 / 7 Tests Passed.
================================================================================
```

---

## 6. NİHAİ DEĞERLENDİRME VE ÖNERİLER

1. **Zamanlama ve Adım Mekanizması Düzeltmesi (Araştırma İçi):**  
   Gelecekteki replay motorlarında `breakIndices` üzerinden atlayarak adım atmak yerine, üretim poller'ı gibi her 15M mum kapanışında ($T_{\text{open}} + 15\text{m}$) `runPipeline` çalıştırılmalıdır. Bu sayede hem zamanlama hatası ortadan kalkacak hem de kırılımdan bağımsız oluşan geçerli POI'ler kaçırılmayacaktır.
2. **Maliyet Modeli Standardizasyonu:**  
   Broker veya borsa hesap sözleşmesinden (ör. Bybit VIP 1 maker/taker komisyonu, gerçek ECN spread tablosu) resmi bir ücret tarifesi araştırma ortamına dahil edilene kadar maliyet realizmi **INSUFFICIENT DATA** olarak kalmalıdır.
3. **Üretim Onayı:**  
   Sistem canlı üretime aktarılmaya hazır değildir; canlı emirler kapalı kalmalıdır.
