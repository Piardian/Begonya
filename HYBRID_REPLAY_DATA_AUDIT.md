# HYBRID REPLAY DATA AUDIT: BEGONYA & CHECKLISTTRIGGER (CLT)

**Denetim Tarihi:** 2026-10-14  
**Kapsam:** Hibrit Giriş Stratejisi (Makro Kapı + HTF 15M SMC POI + LTF 1M Sniper/Unicorn Doğrulama) Veri Envanteri ve Çalışabilirlik Analizi  
**Mod:** Salt İnceleme (Read-Only / No Code Changes / No Backtest Execution / No Commits)

---

## 1. Bulunan Dosyalar ve Yolları

### A. Sinyal, POI ve Yürütme Günlükleri
1. **Begonya Benchmark / Gerçek İşlem Kayıtları:**
   * `Begonya/benchmark/benchmark_records.json` (158 KB, 44 kayıt)
   * `Begonya/benchmark/macro_records.json` (32 KB, 18 kayıt)
   * `Begonya/benchmark/historical_smoke_2024-10-01.json` (9 KB)
2. **CLT Canlı İletim ve Bildirim Kuyruğu (Dispatched Signals):**
   * `swing-bos-core/data/signal_delivery_queue.json` (2.19 MB, 157 kayıt)
3. **POI Yaşam Döngüsü ve İzleme Listesi (Candidate POIs):**
   * `swing-bos-core/data/active_poi_watchlist.json` (645 POI kaydı)
   * `Begonya/data/active_poi_watchlist.json` (59 KB, 147 kayıt)
   * `Begonya/smc_engine/data/active_poi_watchlist.json` (9.68 MB, 23,705 POI kaydı)
   * `swing-bos-core/telemetry/poi-lifecycle-state.json` (11.55 MB, 22,936 POI kaydı)
4. **Gölge ve Karşı-Olgusal (Shadow/Counterfactual) İşlem Kütükleri:**
   * `Begonya/data/shadow_cohort_ledger.json` (189 KB, 180 kayıt)
   * `swing-bos-core/data/shadow_cohort_ledger.json` (1.63 MB, 1,420 kayıt)
   * `swing-bos-core/evidence/research/v1-canonical-counterfactual-signal-ledger.json` (305 KB)
   * `swing-bos-core/evidence/research/v1-filter-oos-signal-ledger.json` (1.68 MB)
5. **Makro Kapı Durum ve Takvim Dosyaları:**
   * `Begonya/macro_engine/gateways/macro_bias_gate.json` / `shared/macro_bias_gate.json` (105 KB, anlık canlı kapı durumu)
   * `Begonya/macro_engine/gateways/calendar_cache.json` (2.6 KB, anlık haftalık ekonomik takvim)
   * `Begonya/macro_engine/calibration/historical_event_research.json` (303 KB, 196 makro sürpriz olayı)

### B. Mum Veri Dosyaları (Candlestick Data)
1. **Standart Veri Havuzu (`swing-bos-core/data/`):** Toplam 215 JSON dosyası (FX, Kripto, Emtialar, Endeksler).
2. **Derin 1 Yıllık Veri Havuzu (`swing-bos-core/data/replay_1year/`):** 7 enstrüman için 15M, 1H, 4H mum serileri (BTCUSD, ETHUSD, EURUSD, GBPUSD, LTCUSD, SOLUSD, XAUUSD).
3. **Begonya SMC Veri Havuzu (`Begonya/smc_engine/data/`):** 28 enstrüman için kısa pencereli (500 barlık) 15m, 1h, 4h, 1m mum dosyaları.

---

## 2. Sembol ve Tarih Kapsamı

### A. Mum Verisi (OHLCV) Kapsamı

| Sembol | 1M Verisi | 15M Verisi | 1H Verisi | 4H Verisi | Durum / Kapsam |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **EURUSD** | 95,000 bar (13 Tem 2026 – 13 Eki 2026) | 32,247 bar (10 Eki 2025 – 10 Eki 2026) | 8,066 bar (1 Yıl) | 2,033 bar (1 Yıl) | M1 3 Ay Tam; HTF 1 Yıl Tam |
| **GBPUSD** | 95,000 bar (13 Tem 2026 – 13 Eki 2026) | 32,218 bar (10 Eki 2025 – 10 Eki 2026) | 8,064 bar (1 Yıl) | 2,033 bar (1 Yıl) | M1 3 Ay Tam; HTF 1 Yıl Tam |
| **USDJPY** | 95,000 bar (13 Tem 2026 – 13 Eki 2026) | 500 bar (07 Eki 2026 – 14 Eki 2026) | 500 bar (1 Ay) | 500 bar (4 Ay) | M1 3 Ay Tam; HTF 1 Yıl Eksik |
| **USDCAD** | 95,000 bar (13 Tem 2026 – 13 Eki 2026) | 500 bar (07 Eki 2026 – 14 Eki 2026) | 500 bar (1 Ay) | 500 bar (4 Ay) | M1 3 Ay Tam; HTF 1 Yıl Eksik |
| **XAUUSD** | 95,000 bar (07 Tem 2026 – 13 Eki 2026) | 33,604 bar (10 Eki 2025 – 10 Eki 2026) | 8,405 bar (1 Yıl) | 2,115 bar (1 Yıl) | M1 3 Ay Tam; HTF 1 Yıl Tam |
| **BTCUSD** | 500 bar (13 Eki 2026, 13 saat) | 35,040 bar (10 Eki 2025 – 10 Eki 2026) | 8,760 bar (1 Yıl) | 2,190 bar (1 Yıl) | **M1 Yetersiz (<1 Gün)**; HTF 1 Yıl Tam |
| **ETHUSD** | 95,000 bar (07 Ağu 2026 – 13 Eki 2026) | 35,040 bar (10 Eki 2025 – 10 Eki 2026) | 8,760 bar (1 Yıl) | 2,190 bar (1 Yıl) | M1 2 Ay Tam; HTF 1 Yıl Tam |
| **SOLUSD** | 95,000 bar (07 Ağu 2026 – 13 Eki 2026) | 35,040 bar (10 Eki 2025 – 10 Eki 2026) | 8,760 bar (1 Yıl) | 2,190 bar (1 Yıl) | M1 2 Ay Tam; HTF 1 Yıl Tam |
| **Diğer 18 Çift** | 200 - 500 bar (~2-3 gün) | 500 bar (~7 gün) | 500 bar (~20 gün) | 200-500 bar (~3 ay) | M1 & 15M Tarihsel Yetersiz |

### B. Tarihsel Sinyal / Kayıt Kapsamı
* `benchmark_records.json`: **2026-09-05T09:15:00Z → 2026-10-06T14:00:00Z** (31 Günlük operasyonel dönem, 20 farklı sembol).
* `signal_delivery_queue.json`: **2026-08-17T17:00:00.000Z → 2026-10-12T11:00:00.000Z** (56 Günlük canlı iletim kuyruğu, 26 enstrüman).
* `active_poi_watchlist.json`: **Ağustos – Ekim 2026** (15M kırılımları üzerinden oluşan aday POI'ler).

---

## 3. Kayıt ve Bağımsız Fırsat Sayıları (Kayıt Türü Ayrımı)

Sistemdeki kayıtlar yapısal olarak 3 farklı katmanda tutulmaktadır:

1. **Gerçekleşmiş İşlem Günlükleri (Executed/Audited Trades): 44 Kayıt**
   * *Dosya:* `Begonya/benchmark/benchmark_records.json`
   * *Dağılım:*
     * Doldurulan ve Kapatılan İşlemler (Executed): **28 Kayıt** (7 Win, 4 Win-Partial/BE, 1 BE, 15 Loss, 1 Aktif)
     * İptal Edilen / Giriş Koşulu Sağlanmayan (Invalid/No Entry): **16 Kayıt** (M1 teyidi gelmediği veya fitil çarpmadığı için işleme girilmemiş)
   * *Detay:* Giriş yönü, tahmini stop, tahmini hedef, gerçekleşen R (`realized_r`), PnL USD, spread/komisyon bilgisi ve detaylı audit metinleri mevcuttur.

2. **Üretilmiş ve Sevk Edilmiş HTF Sinyalleri (Dispatched Signals): 157 Kayıt**
   * *Dosya:* `swing-bos-core/data/signal_delivery_queue.json`
   * *Durum:* 156 adet `SENT` (Telegram'a sevk edilmiş), 1 adet `SCREENSHOT_FAILED`.
   * *Bağımsız Fırsat Sayısı:* 157 sinyalden bazıları aynı POI'nin (örneğin hem OB hem FVG) eşzamanlı bildirilmesidir. Bağımsız `dedupeKey` bazında net **~112 tekil sinyal fırsatı** mevcuttur.

3. **Aday / İzlenen POI'ler (Candidate POIs / Watchlist):**
   * `active_poi_watchlist.json`: **645 POI** (572 Geçersiz/Invalidated, 39 Süresi Dolmuş/Expired, 1 Test Edilmiş/Tested, 33 Aktif).
   * `poi-lifecycle-state.json`: **22,936 POI** (Algoritmanın 15M barlarda tespit ettiği fakat kalite/onay süzgecinden geçirdiği tüm ham bloklar).

---

## 4. Eksik Veriler ve Veri Kalitesi Sorunları

### ⚠️ INSUFFICIENT_DATA ve Kalite Açıkları:

1. **M1 Veri Derinliği Kısıtı (Brokera Bağlı MT5 Kısıtı):**
   * MetaTrader 5 terminalinde M1 geçmişi en fazla 95,000 bar tutmaktadır. Bu da zaman boyutunda **yalnızca 13 Temmuz 2026 – 13 Ekim 2026 (~3 ay)** aralığına denk gelmektedir.
   * **1 Yıllık M1 verisi bulunmamaktadır.** Dolayısıyla 1 yıllık periyotta 1M bazlı tick-by-tick reaksiyon replay'i yapmak deterministik olarak imkansızdır (`INSUFFICIENT_DATA_FOR_1Y_M1`).
   * **BTCUSD M1 Boşluğu:** `swing-bos-core/data/BTCUSD_1m.json` dosyasında sadece 500 bar (~13 saat) veri bulunmaktadır. BTCUSD için 1 ve 3 aylık 1M testi de yapılamaz (`INSUFFICIENT_DATA_FOR_BTC_M1`).

2. **M5 Mum Verisinin Bulunmayışı:**
   * Projede `*5m.json` adında hiçbir veri dosyası **yoktur**. İkincil LTF teyidi için M5 kullanılmak istenirse, M1 barlarından sentetik resample yapılması zorunludur.

3. **Gerçek İşlem Günlüğündeki Mikroskobik Eksikler (`benchmark_records.json`):**
   * `exit_timestamp` alanı açıkça yer almamaktadır; çıkış anı `holdingBars` veya metin notlarından (`exit_reason`) türetilmektedir.
   * `executed_entry_price` alanı 44 kaydın sadece 2'sinde sayısal olarak mevcuttur; diğer 42 kayıtta `entry_zone` ([min, max]) aralığı verilmiştir.
   * Net komisyon/swap rakamı USD bazlı ayrı bir sütun olarak tutulmamış, `spread_pips_at_signal` ve `realized_pnl_usd` içine dahil edilmiştir.

---

## 5. HTF Sinyalleri ve Makro Kapı Tarihsel Doğrulaması

### ⚠️ Kritik Mimari Bulgu (Macro Gate Tarihsel Durumu):
* **Anlık Dosya Durumu:** `Begonya/macro_engine/gateways/macro_bias_gate.json` ve `shared/macro_bias_gate.json` dosyaları **yalnızca tekil, en son üretilen canlı anlık durumu** (`timestamp: 2026-10-14 11:17:44`) saklamaktadır. Dosya üzerine atomik olarak yeniden yazılmakta (`os.replace`), geçmişe dönük bir zaman serisi tablosu (örneğin SQL veya tarihsel JSONL) tutulmamaktadır.
* **Tarihsel Sinyallerdeki Makro Bilgisi:**
  * `benchmark_records.json` (44 kayıt) içinde sinyalin üretildiği andaki makro rejim (`primary_regime`), makro kapısı (`macro_bias_gate`: SHORT_ONLY / LONG_ONLY / NEUTRAL_ALL) ve risk çarpanı dondurulmuş şekilde yer almaktadır.
  * `macro_records.json` (18 kayıt) içinde DXY, US10Y, VIX, para birimi skorları ve gerekçeler birebir tarih damgasıyla saklanmıştır.
  * Ancak `signal_delivery_queue.json` (157 kayıt) CLT tarafında üretildiği için `candidate.macroContext` alanı boştur; makro filtresi Begonya tarafında orkestre edilmektedir.
* **Sonuç:** Bugünkü canlı `macro_bias_gate.json` dosyasını geçmişe aitmiş gibi kullanmak look-ahead bias (gelecekten sızma) yaratır. Geçmişe yönelik replay yapılırken sadece `benchmark_records.json`'da dondurulmuş 44 kayıt veya `historical_event_research.json` (196 olaylık makro takvim araştırması) referans alınabilir.

---

## 6. Mevcut Bileşenlerden Yeniden Kullanılabilecek Kodlar

İnceleme sonucunda, hibrit giriş replay'i için sıfırdan kod yazılmasına gerek bırakmayacak son derece olgun bileşenler tespit edilmiştir:

1. **`swing-bos-core/src/entryMechanics.ts`:**
   * `evaluate1mUnicornSniperEntry()`: 1M SFP (IDM Sweep) + Inversion FVG + Breaker Block (MSS) + Dinamik 0.5 Fib Retest mekanizmasını eksiksiz simüle eden deterministik fonksiyon.
   * `calculateDynamicStopBuffer()`: Enstrümana özel volatilite/spread tamponu hesaplayıcı.
   * `isSliceThroughCandle()`: POI'nin tepki vermeden doğrudan parçalanıp delinmesini tespit eden koruma.
2. **`swing-bos-core/src/signalOutcomeTracker.ts` & `src/outcomeEngine.ts`:**
   * `evaluateOutcome()`: 1R BE koruması, 3R TP2 hedefi, Max hold bar ve window bar süre aşımı mantığını barındıran motor.
3. **`Begonya/smc_engine/src/executionStateMachine1m.ts`:**
   * `LtfExecutionStateMachine`: 10 farklı aşamadan oluşan (`WATCHING_POI_TOUCH` -> `POI_PENETRATED` -> `SWEEP_DETECTED` -> `LIMIT_ARMED` -> `FILLED` -> `EXITED`) profesyonel state-machine altyapısı.
4. **`Begonya/smc_engine/server/macroGateAdapter.ts`:**
   * `MacroGateAdapter`: Makro rejim, döviz puanları ve kripto rotasyon kurallarını değerlendiren ana adaptör mantığı.
5. **`swing-bos-core/server/historicalMarketReplay.ts`:**
   * Geriye dönük bar-bar oynatma ve deterministik olay simülasyon iskeleti.

---

## 7. Sonraki Aşama İçin Önerilen En Küçük Uygulanabilir Plan (MVP)

Tarihsel veri gerçekleri ve M1 kısıtları göz önüne alındığında, sonraki aşama için en güvenilir ve yanıltıcı olmayan en küçük uygulanabilir plan:

* **Adım 1 (Veri Seti Sınırlandırması - 3 Aylık Altın Havuz):**
  * Replay kapsamını M1 verisinin eksiksiz bulunduğu **13 Temmuz 2026 – 13 Ekim 2026 (95,000 M1 barı)** dönemi ve elinde tam M1 verisi bulunan 6 majör enstrümanla (`EURUSD`, `GBPUSD`, `USDJPY`, `USDCAD`, `XAUUSD`, `ETHUSD`) sınırlandırmak. (M1 verisi 13 saat olan BTCUSD hariç tutulmalıdır).
* **Adım 2 (Tarihsel Sinyal Eşleştirme):**
  * `benchmark_records.json` içindeki doğrulanmış 44 kaydı ve `signal_delivery_queue.json` içindeki 156 sevk edilmiş sinyali "zaman ve POI sınırları" bazında M1 veri pencereleriyle indekslemek.
* **Adım 3 (Mevcut Fonksiyonlarla Çift Yönlü Replay):**
  * Yeni kod yazmadan, doğrudan `evaluate1mUnicornSniperEntry()` fonksiyonu kullanılarak:
    * Giriş tetiklenme oranı (Kaç POI temas etti ve 1M'de onay verdi?)
    * Filtrelenen sahte kırılımlar (Kaç POI 1M onayı vermeden doğrudan delindi / stop oldu?)
    * Deterministik R gerçekleşmesi test edilmelidir.
* **Adım 4 (1 Yıllık Periyot Ayrımı):**
  * 1 yıllık dönem için M1 verisi fiziksel olarak terminalde bulunmadığından (`INSUFFICIENT_DATA`), 1 yıllık analiz sadece 15M/1H/4H mumları üzerinden `evaluateOutcome()` (15M SMC temel modeli) ile sınırlandırılmalı, 1M varsayımı yapılmamalıdır.

---
*Rapor tamamlanmıştır. Hiçbir strateji kodu veya veritabanı dosyası değiştirilmemiştir.*
