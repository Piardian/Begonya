# BEGONYA — NİHAİ PROMOTION EVIDENCE VE SİSTEM HAZIRLIK RAPORU

**Belge Versiyonu:** `final-promotion-evidence-v1`  
**Raporlama Tarihi:** 17 Eylül 2026  
**Hedef:** Begonya Macro + SMC Hibrit Sisteminin Gerçek Tarihsel Veriler Üzerinde Promotion/Readiness Değerlendirmesi  
**Genel Promotion Kararı:** `BLOCKED_PENDING_DATA`  
**Production Activation:** `false`  

---

## A) DATA SOURCES (Veri Kaynakları ve Denetim)

2025 H2 ve 2026 YTD holdout pencereleri için taranan tüm veri sağlayıcılarının teknik denetim matrisi:

| Sağlayıcı | Veri Kapsamı | Güvenilirlik / Provenance | PIT Durumu | Teknik Engel / Durum Özeti |
| :--- | :---: | :---: | :---: | :--- |
| **BLS / Census / ISM (Resmi)** | 2025-07 (6 Gözlem) | **Yüksek (Resmi Bülten)** | **Doğrulandı** | Temmuz 2025 verileri resmi basın bültenleriyle birebir doğrulandı. Gözden geçirilmiş tarihsel tablolar ise revizyon içerdiği için PIT kabul edilmedi. |
| **Forex Factory (Web)** | 2025-07 (İlk Hafta) | **Yüksek (Canlı Snapshot)** | **Doğrulandı** | İlk hafta başarıyla çekildi; ancak sonraki 60+ haftanın taranması **Cloudflare Bot Challenge (HTTP 403)** ile engellendi. |
| **Forex Factory (HF Cache)** | 2016-01 → 2025-04-07 | **Yüksek (Canonical)** | **Doğrulandı** | Açık önbellek 2025-04-07'de son bulmaktadır; 2025 H2 ve 2026 YTD mevcut değildir. |
| **Trading Economics** | Erişilemedi | — | — | Public/guest API **HTTP 410 (Discontinued)** dönmektedir. Ortamda ücretli kurumsal API anahtarı tanımlı değildir. |
| **Investing.com** | Erişilemedi | — | — | **Cloudflare Turnstile WAF** doğrudan tüm otomasyon isteklerini **HTTP 403** ile engellemektedir. |
| **FRED (St. Louis Fed)** | 2025-07 → 2026-09 | Yüksek (Actual) | **PIT Değil / Forecast Yok** | FRED yalnızca gerçekleşen değerleri ve revizyonları yayınlar; **asla piyasa konsensüs tahmini (consensus forecast) yayınlamaz**. Sürpriz hesaplanamaz. |
| **DailyFX / FXStreet** | Erişilemedi | — | — | Akamai/Cloudflare WAF (HTTP 403) ve DNS sıfırlaması. |
| **MT5 Broker (MetaQuotes-Demo)** | M30: 2022–2026<br>M5: 2025.11–2026<br>M1: 2026.07–2026 | **Yüksek (Gerçek Bar)** | **Doğrulandı** | Europe/Helsinki sunucu saat dilimi UTC'ye normalize edildi. Terminal tampon limiti (65.000 bar) nedeniyle M1/M5 geçmişi kısıtlıdır. |

---

## B) MACRO COVERAGE (Makro Kapsamı ve Holdout Durumu)

Begonya'nın 7 canonical indikatörü (`nfp`, `cpi`, `core_cpi`, `unemployment`, `pmi`, `retail_sales`, `gdp`) için kapsam durumu:

* **2025 H2 Penceresi (2025-07-01 → 2025-12-31):**
  * Toplam Gereken Küme: ~25–30 küme
  * Kurtarılan Geçerli Küme (Valid Clusters): **4 küme (6 gözlem)** $\rightarrow$ 1–17 Temmuz 2025
  * Kapsama Oranı: **~%15 (Kısmi / Yetersiz Örneklem)**
  * Durum: `INSUFFICIENT_DATA` (`partial_data: true`)
* **2026 YTD Penceresi (2026-01-01 → 2026-09-17):**
  * Toplam Gereken Küme: ~35–40 küme
  * Kurtarılan Geçerli Küme: **0 küme**
  * Kapsama Oranı: **%0.00**
  * Durum: `INSUFFICIENT_DATA` (`partial_data: false`)
* **Toplam Pipeline Gözlemleri:**
  * Canonical (Pre-2025-07-01): 196 event cluster
  * Recovered Holdout: 4 event cluster
  * Toplam: **200 event cluster**

---

## C) FROZEN CALIBRATION (Dondurulmuş Kalibrasyon & Leakage)

* **Kalibrasyon Cutoff:** `2025-07-01 00:00:00 UTC` (Kesin ve Tavizsiz)
* **Holdout İzolasyonu:** Temmuz 2025 verileri hiçbir şekilde sigma fit fonksiyonuna (`fit_surprise_sigmas`) sokulmamıştır.
* **Leakage Test Sonucu:** [`tests/test_calibration_leakage.py`](file:///c:/Users/piard/.gemini/antigravity/scratch/Begonya/macro_engine/tests/test_calibration_leakage.py) ve [`tests/test_holdout_macro_adapter.py`](file:///c:/Users/piard/.gemini/antigravity/scratch/Begonya/macro_engine/tests/test_holdout_macro_adapter.py) çalıştırılmış, sıfır veri sızıntısı doğrulanmıştır.
* **Dondurulmuş Sigmalar (Pre-Cutoff):**
  * `core_cpi`: $\sigma_{MAD} = 0.1483$ | $\sigma_{STD} = 0.1361$
  * `cpi`: $\sigma_{MAD} = 0.1483$ | $\sigma_{STD} = 0.1339$
  * `gdp`: $\sigma_{MAD} = 0.5930$ | $\sigma_{STD} = 0.8794$
  * `nfp`: $\sigma_{MAD} = 86,732.10$ | $\sigma_{STD} = 996,871.26$
  * `pmi`: $\sigma_{MAD} = 1.6309$ | $\sigma_{STD} = 1.6562$
  * `retail_sales`: $\sigma_{MAD} = 0.4448$ | $\sigma_{STD} = 1.3171$
  * `unemployment`: $\sigma_{MAD} = 0.1483$ | $\sigma_{STD} = 0.6298$
* **Dondurulmuş Eşik:** $|Z_{MAD}| \ge 1.0$ (Holdout sonuçlarına göre optimize edilmemiştir).

---

## D) M30 OUT-OF-SAMPLE (OOS) EXACT-HORIZON SONUÇLARI

Kurtarılan 4 Temmuz 2025 event kümesi üzerinde MT5 M30 barlarıyla hesaplanan exact-horizon getirileri:

### 1. EURUSD Sonuçları (USD Güçlenme Getirisi, bps):

| Olay | Tarih (UTC) | Dominant $Z_{MAD}$ | Filtre Kararı | +30m USD | +60m USD | +240m USD | 30m MFE / MAE |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **ISM PMI** | 2025-07-01 14:00 | $+0.12$ | **ELENDİ (Gated)** | $+7.97\text{ bps}$ | $+18.73\text{ bps}$ | $+16.18\text{ bps}$ | $+15.76\text{ / } -0.25$ |
| **NFP + İşsizlik** | 2025-07-03 12:30 | **$+1.35$** | **GEÇTİ (Actionable)** | **$+40.73\text{ bps}$** | **$+18.92\text{ bps}$** | **$+34.62\text{ bps}$** | $+58.63\text{ / } 0.00$ |
| **CPI + Çekirdek CPI** | 2025-07-15 12:30 | $-0.67$ | **ELENDİ (Gated)** | $-10.80\text{ bps}$ | $-1.46\text{ bps}$ | $+53.24\text{ bps}$ | $+2.74\text{ / } -21.86$ |
| **Perakende Satışlar** | 2025-07-17 12:30 | **$+1.12$** | **GEÇTİ (Actionable)** | **$-9.76\text{ bps}$** | **$-11.23\text{ bps}$** | **$-21.68\text{ bps}$** | $+16.50\text{ / } -14.43$ |

### 2. XAUUSD (Altın) Sonuçları:
* **PMI (Elendi):** $+30m$: $-2.36\text{ bps}$ | $+60m$: $+15.31\text{ bps}$ | $+240m$: $+33.04\text{ bps}$
* **NFP + İşsizlik (Geçti):** $+30m$: **$+75.20\text{ bps}$** | $+60m$: $+51.74\text{ bps}$ | $+240m$: $+63.11\text{ bps}$
* **CPI (Elendi):** $+30m$: $+16.84\text{ bps}$ | $+60m$: $+40.45\text{ bps}$ | $+240m$: $+85.71\text{ bps}$
* **Perakende Satışlar (Geçti):** $+30m$: **$+33.84\text{ bps}$** | $+60m$: $+20.33\text{ bps}$ | $+240m$: $-43.71\text{ bps}$

### 3. Maliyet Düzeltmeli EURUSD Performansı (15 bps Maliyet):
* **Baseline (4 İşlem):** Hit Rate: %25.0 | Ortalama: $-2.57\text{ bps}$ | Profit Factor: 0.71 | MaxDD: $28.96\text{ bps}$
* **Frozen MAD ($|Z| \ge 1.0$, 2 İşlem):** Hit Rate: %50.0 | Ortalama: **$+0.48\text{ bps}$** | Profit Factor: **1.04** | MaxDD: $24.76\text{ bps}$
* **Filtrelenen Havuz (2 İşlem):** Hit Rate: %0.0 | Ortalama: $-5.62\text{ bps}$ | Profit Factor: 0.00 | MaxDD: $11.23\text{ bps}$

---

## E) EXECUTION EVIDENCE (İcra Gerçekliği & Limitler)

* **M1 Veri Kapsamı:** MT5 sunucu tamponunda yalnızca son 65.000 bar mevcuttur (~16 Temmuz 2026 → 17 Eylül 2026). **2025 H2 ve 2026 H1 için M1 verisi bulunmamaktadır.**
* **M5 Veri Kapsamı:** ~3 Kasım 2025 → 17 Eylül 2026 arasını kapsamaktadır. Temmuz–Ekim 2025 barları eksiktir.
* **Tick Verisi:** Broker demo sunucusu geçmiş tick verisini arşivlememektedir.
* **İcra Simülasyon Durumu:** `promotion_simulation.py` içindeki `T0_MARKET` ve `T5_RETEST_LIMIT` icra simülasyon motoru hazır olmasına rağmen, Temmuz 2025 makro olaylarında M1 barlarının bulunmaması sebebiyle deterministik M1 icra stres testi holdout döneminde **INSUFFICIENT_DATA** olarak kalmıştır.

---

## F) SMC HISTORICAL REPLAY (SMC Replay & Ledger İncelemesi)

* **Mevcut Sinyal Logu:** `smc_engine/evidence/signals/signal-evidence.jsonl`
  * Toplam log: 10.936 satır | Tekil sinyal: **155 adet** (Tarih aralığı: 2026-07-20 → 2026-09-15).
* **Mevcut Benchmark Kayıtları:** `benchmark/benchmark_records.json`
  * 16 adet canlı doğrulanmış işlem kaydı (Eylül 2026).
* **Neden Deterministik Geriye Dönük SMC Ledger Üretilemez? (Teknik Engeller):**
  1. **M1 LTF Teyit Şartı:** Begonya SMC kural setine (`smc-journal.md`) göre sinyalin işleme dönüşmesi için M1 üzerinde sweep + displacement şarttır. M1 verisi Temmuz 2026 öncesinde mevcut olmadığından geçmiş sinyallerin tetiklenip tetiklenmediği nesnel olarak bilinemez.
  2. **Foundation Sprint Mimarisi:** `smc_engine/src/signalOutcome.ts` kodunda açıkça belirtildiği üzere:  
     `"Signal passed risk evaluation and is waiting for entry-zone retest. No real TP/SL tracking is performed in this foundation sprint."` ve `realExecutionTracked: false`. SMC motoru bir emir takip ve execution defteri değil, sinyal ve plan üretim katmanıdır (`action: 'PLAN_ONLY'`).
  3. **Kural İhlali Yasağı:** Kodun ve broker verisinin izin vermediği bir yerde sentetik/uydurma trade ledger üretmek kesin olarak yasaklandığından, geçmişe dönük SMC trade ledger'ı **üretilmemiş**, dürüstçe **INSUFFICIENT_DATA** olarak raporlanmıştır.

---

## G) INCREMENTAL SMC + MACRO ALPHA

* **Zamansal Örtüşme (Temporal Overlap):**
  * Makro doğrulanmış veri: 2016 → 2025-07-17
  * SMC sinyal kanıtları: 2026-07-20 → 2026-09-15
  * İki veri kümesi arasında **12 aylık kronolojik boşluk** vardır. Eşzamanlı örtüşen gözlem sayısı: **0**.
* **Benchmark Örneği (16 Sinyal, Eylül 2026):**
  * `benchmark_records.json` içindeki 16 işlemde makro gating layer (`macro_bias_gate`) devredeydi.
  * Makro kapısı ve M1 teyidi, hatalı 4 sinyali engelleyerek sermayeyi korudu (`AVERTED_LOSS: +1.45 R`).
  * Ancak bu 16 işlem henüz dondurulmuş $|Z_{MAD}| \ge 1.0$ sürpriz takvimiyle eşleşen planlı bir makro haber bülteni sırasında gerçekleşmemiştir.

---

## H) PROMOTION STATUS (Nihai Statü)

### **Statü: BLOCKED_PENDING_DATA**

```
Checks:
[PASS] threshold_frozen: true (1.0)
[PASS] no_holdout_fitting: true (zero leakage)
[FAIL] holdout_2025_h2_populated: false (4 clusters < 15 required; PARTIAL)
[FAIL] holdout_2026_ytd_populated: false (0 clusters; INSUFFICIENT_DATA)
[FAIL] smc_ledger_available: false (missing historical execution ledger)
[FAIL] execution_data_available: false (missing M1 bar history)
```

---

## I) PRODUCTION ACTIVATION

### **`production_activation: false`**

Mevcut eksik veri ve icra kanıtları tamamlanmadan sistemin canlıya alınması mimari ve ekonometrik olarak engellenmiştir.

---

## J) SEVİYE DEĞERLENDİRMESİ (ACCEPTANCE CRITERIA)

* **LEVEL 1 (Kod + test altyapısı):** ✅ **BAŞARILDI** (140 unit test tam yeşil, pipeline hazır).
* **LEVEL 2 (Macro holdout gerçek verilerle genişletildi):** ✅ **BAŞARILDI** (Temmuz 2025 6 PIT gözlem kurtarıldı).
* **LEVEL 3 (2025 H2 + 2026 YTD yeterli coverage):** ❌ **BLOCKED** (WAF ve kapalı API'ler nedeniyle yalnızca Temmuz 2025 mevcut).
* **LEVEL 4 (Exact-horizon OOS sonuçları):** ✅ **BAŞARILDI (Kısmi)** (Temmuz 2025 için EURUSD ve XAUUSD tamamlandı).
* **LEVEL 5 (Execution stress evidence):** ❌ **BLOCKED** (Broker M1 tampon limiti nedeniyle 2025 H2 M1 verisi yok).
* **LEVEL 6 (Historical SMC ledger):** ❌ **BLOCKED** (Geçmiş M1 eksikliği ve motorun alerting aşamasında olması).
* **LEVEL 7 (SMC baseline vs Macro alpha):** ❌ **BLOCKED** (Zaman serileri arasında 12 aylık desenkronizasyon).
* **LEVEL 8 (Tüm promotion evidence eksiksiz):** ❌ **BLOCKED** (Eksik veriler tamamlanana kadar promotion açılamaz).

**Ulaşılan En İleri Nokta:** **LEVEL 2 ve LEVEL 4 (Kısmi Holdout)**.

---

## K) İSTATİSTİKSEL VE METODOLOJİK DİSİPLİN UYARISI

> [!CAUTION]
> Temmuz 2025'ten elde edilen 4 kümelik (6 gözlemlik) sonuçlar:
> * Kesinlikle bir **kanıt ("proof")** veya **doğrulanmış üstünlük ("validated edge")** DEĞİLDİR.
> * "Kusursuz çalışıyor ("works perfectly")" veya "canlıya hazır ("production ready")" denemez.
> * Yalnızca ve kesinlikle **kısmi holdout kanıtı ("partial holdout evidence")** ve yerel broker verisi üzerinde bir **sağlama kontrolü ("sanity check")** niteliğinde **yetersiz bir örneklemdir ("insufficient sample")**.
