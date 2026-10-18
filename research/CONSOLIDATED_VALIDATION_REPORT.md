# BEGONYA — TOPLU ADVERSARIAL DOĞRULAMA RAPORU
**Belge Kodu:** `research/CONSOLIDATED_VALIDATION_REPORT.md`  
**Denetim Tarihi:** 14 Ekim 2026 21:40 UTC+3  
**Denetlenen Kapsam:** `research/run_true_historical_replay.js`, `swing-bos-core/dist`, `smc_engine`, Ham OHLC Verisi  
**Tarih Aralığı:** 1 Nisan 2026 00:00 UTC – 30 Eylül 2026 23:59 UTC (6 Ay / 183 Gün / 17.568 adet 15M mum/sembol)  
**Denetlenen Semboller:** BTCUSD, ETHUSD, SOLUSD, EURUSD, GBPUSD, XAUUSD  
**Denetim Türü:** Bağımsız Adversarial Doğrulama (Independent Adversarial Audit)

---

## 1. NİHAİ KARAR VE YÖNETİCİ ÖZETİ

> [!CAUTION]
> ### NİHAİ KARAR: DATA INSUFFICIENT (VERİ VE ÖRNEKLEM YETERSİZ)
> 
> Yapılan metodolojik ve aritmetik denetimlerde, `run_true_historical_replay.js` motorunun geçmiş mumları kronolojik olarak işlediği, geleceğe bakış sızıntısı (look-ahead bias) barındırmadığı ve sinyallerin matematiksel olarak tam uzlaştığı (`94 = 65 Expired + 6 Filtered + 23 Filled`) doğrulanmıştır.
> 
> **ANCAK:**
> 1. 6 aylık ham veride 6 majör sembol taranmasına rağmen **yalnızca 23 geçerli işlem** gerçekleşmiştir.
> 2. Önceden dondurulan **minimum 50 geçerli işlem barajı AŞILAMAMIŞTIR (23 < 50)**.
> 3. EURUSD'de 8 sinyalin tamamı dolmadan iptal olmuş (0 işlem), GBPUSD'de yalnızca 1 işlem açılmış, SOLUSD'de 4 işlem, XAUUSD'de 5 işlem gerçekleşmiştir.
> 4. 23 işlem gibi aşırı küçük bir örneklem üzerinden herhangi bir istatistiksel güvenilirlik, matematiksel beklenti (edge) veya kârlılık kararı verilemez.
> 
> **Hüküm:** Metodoloji ve simülasyon muhasebesi doğrulanmış olmakla birlikte, istatistiksel geçerlilik ve üretim onayı için **VERİ VE ÖRNEKLEM YETERSİZDİR (DATA INSUFFICIENT)**. Sistem kesinlikle canlıya aktarılmamalıdır.

---

## 2. METODOLOJİ VE KORUMA SINIRLARI DENETİMİ

| Koruma Kuralı | Durum | Kanıt ve Doğrulama |
| :--- | :---: | :--- |
| **Production Kodu Korunumu** | **PASS** | `src/`, `server/pipeline.ts`, `macro_engine/` üzerinde üretim parametreleri değiştirilmemiştir. |
| **Canlı Emir Altyapısı** | **PASS** | `ENABLE_ORDER_EXECUTION` kapalı; canlı API bağlantısı pasif, sıfır gerçek emir gönderilmiştir. |
| **İzinsiz Git İşlemleri** | **PASS** | Başlangıç Git ağacı korunmuş; commit, push veya merge yapılmamıştır. |
| **Geçmiş Rapor ve Log Korunumu**| **PASS** | Hiçbir geçmiş rapor veya ham kanıt dosyası silinmemiş ya da üzerine yazılmamıştır. |
| **Sonuca Göre Parametre Seçimi** | **PASS** | Parametre optimizasyonu, curve-fitting veya kural gevşetme yapılmamıştır. |

---

## 3. LOOK-AHEAD BIAS VE NEDENSELLİK DENETİMİ

### 3.1. Fraktal Swing ve Sağ Taraf Doğrulama Kuralı
- **Denetim:** `swing-bos-core/src/swingDetector.ts` incelendi.
- **Bulgu:** Fraktal swing $i$ indeksinde oluştuğunda `formedAtIndex = i`, `confirmedAtIndex = i + 2` olarak işaretlenmektedir.
- **Doğrulama:** `detectStructure.ts` içinde `swings.filter(s => s.confirmedAtIndex <= idx)` filtresi uygulanmaktadır. Mum $idx$ anında yalnızca $idx - 2$ ve öncesinde teyit edilmiş swing'ler hesaba katılmaktadır. Gelecek muma bağımlılık yoktur.

### 3.2. Veri Kesme (Truncation) ve Pertürbasyon Testi
- **Denetim:** 1 Temmuz 2026 öncesindeki 2.344 adet yapısal kırılım (BOS/CHoCH) olayı, tüm veri kümesi üzerinde ve 1 Temmuz'da kesilmiş veri kümesi üzerinde bağımsız olarak çalıştırıldı.
- **Sonuç:** **2.344 Eşleşme, 0 Uyuşmazlık (%100 Deterministic Match)**. Gelecekteki mumların varlığı geçmiş sinyalleri hiçbir şekilde etkilememektedir.

### 3.3. Çoklu Zaman Dilimi (15M, 1H, 4H) Mum Kapanış ve Hizalama Denetimi
- **Denetim:** `swing-bos-core/server/pipeline.ts` içerisindeki `filterClosedCandles` fonksiyonu denetlendi.
- **Bulgu:** `candle.timestamp + duration <= analysisTimestamp` kuralı uygulanmaktadır.
  - Sinyal saati `curTime` (ör. 23:00) anında açılan 23:00 15M mumu analizden elenmekte; analize giren son kapalı 15M mum 22:45 mumu (kapanışı 23:00) olmaktadır.
  - 1H için yalnızca $T + 3600 \le 23:00$ olan mumlar (en son saat 22:00 mumu) kabul edilmektedir.
  - İleriye dönük işlem simülasyonu ise tam olarak `fwdCandles.filter(c => c.timestamp >= sigTs)` ile 23:00 mumu ve sonrasını taramaktadır. Sinyal üretimi ile işlem başlangıcı arasında milisaniyelik bir örtüşme veya sızıntı yoktur.

---

## 4. SİNYAL ÜRETİMİ VE KAYIT UZLAŞTIRMASI (EXACT RECONCILIATION)

Önceki taslaklarda $94 - 65 - 23 = 6$ sinyalin akıbeti netleştirilememişti. Ham `research/true_historical_replay_results.json` kayıtları üzerinde yapılan tam uzlaştırma:

$$\text{Toplam Tekilleştirilmiş Sinyal (94)} = \text{Expired (65)} + \text{Filtered C/R (6)} + \text{Filled (23)}$$

### Sembol Bazında Kesin Ayrım Tablosu:
| Sembol | Toplam Sinyal | Limit Süresi Dolan (Expired) | C/R > 0.25 Elenen (Filtered) | Gerçekleşen (Filled) |
| :--- | :---: | :---: | :---: | :---: |
| **BTCUSD** | 29 | 18 | 3 | **8** |
| **ETHUSD** | 18 | 12 | 1 | **5** |
| **SOLUSD** | 18 | 13 | 1 | **4** |
| **EURUSD** | 8 | 8 | 0 | **0** |
| **GBPUSD** | 9 | 8 | 0 | **1** |
| **XAUUSD** | 12 | 6 | 1 | **5** |
| **TOPLAM** | **94** | **65** | **6** | **23** |

> [!NOTE]
> Bütün 94 sinyalin her birinin tekil kimliği, sinyal zamanı, POI aralığı ve elenme/dolma durumu kayıt altındadır. Sistemde hiçbir hayalet ("ghost") ya da sınıflandırılamayan sinyal bulunmamaktadır.

---

## 5. EMİR SİMÜLASYONU VE İŞLEM MUHASEBESİ DENETİMİ

1. **Limit Giriş ve 16 Bar Kuralı:** FVG için yakın sınır (proximal), OB için %50 orta nokta (CE) kullanılmıştır. 16 bar içinde temas almayan emirlerin tümü `EXPIRED_UNFILLED` olarak doğru işaretlenmiştir.
2. **Yapısal Stop Hesaplaması:** Yalnızca $T_{\text{conf}} \le T_{\text{sig}}$ koşulunu sağlayan 1H fraktal swing tepeleri/dipleri kullanılmıştır. Stop seviyeleri Long için girişin altında, Short için girişin üstünde yer almaktadır.
3. **Aynı Mumda SL ve TP Çakışması:** Muhafazakâr kural (`CONFLICT_SL_FIRST`) eksiksiz uygulanmış; aynı mumda hem SL hem TP görüldüğünde kâr verilmemiş, işlem SL veya BE olarak sonlandırılmıştır.
4. **MFE ve MAE Ölçümleri:** MAE ve MFE yalnızca pozisyonun açık kaldığı süre boyunca ($T_{\text{entry}}$ ile $T_{\text{exit}}$ arası) ölçülmüştür. İşlem kapandıktan sonraki hareketler hesaba katılmamıştır.
5. **R Muhasebesi:** $\text{Net R} = \text{Brüt R} - \text{Maliyet (C/R)}$ formülü tüm 23 işlemde $10^{-6}$ hassasiyetle doğrulanmıştır.

---

## 6. MALİYET MODELİ VE DUYARLILIK ANALİZİ

### 6.1. Maliyet Varsayımları
- **BTCUSD:** Komisyon 4,0 bps, Spread 1,0 bp, Slippage 1,5 bps $\rightarrow$ Toplam 6,5 bps.
- **ETHUSD:** Komisyon 4,0 bps, Spread 1,5 bps, Slippage 2,0 bps $\rightarrow$ Toplam 7,5 bps.
- **SOLUSD:** Komisyon 5,0 bps, Spread 3,0 bps, Slippage 3,5 bps $\rightarrow$ Toplam 11,5 bps.
- **EURUSD:** 1,45 pip toplam (0,6 komisyon + 0,6 spread + 0,25 slippage).
- **GBPUSD:** 1,85 pip toplam (0,6 komisyon + 0,95 spread + 0,3 slippage).
- **XAUUSD:** $0,45 / oz toplam ($0,20 komisyon + $0,15 spread + $0,10 slippage).

### 6.2. Duyarlılık (Sensitivity)
- 23 işlemde toplam kesilen maliyet **1,934R**'dır (işlem başına ortalama ~0,084R).
- Senaryo B'de brüt getiri $+1,00R$ iken, 1,934R maliyet düşüldüğünde net sonuç **-0,93R**'a gerilemektedir.
- Eğer maliyetler %50 artsaydı (işlem başına ~0,126R), net sonuç **-1,90R** olurdu.
- Stratejinin net sonucu maliyet modeline aşırı derecede duyarlıdır; 1H yapısal stop mesafesi daraldığı anda maliyet oranı hızla yükselmektedir.

---

## 7. MAKRO GATE VE VERİ SIZINTISI DEĞERLENDİRMESİ

- `research/run_true_historical_replay.js` içerisinde statik `macro_bias_gate.json` dosyası geriye dönük olarak **KULLANILMAMIŞTIR**.
- Bu yaklaşım kritik bir veri sızıntısını önlemiştir: Güncel (Ekim 2026) makro rejimini Nisan–Eylül 2026 geçmişine geriye dönük uygulamak sahte bir filtreleme yanılsaması yaratırdı.
- Test saf SMC motorunun ham performansını izole etmiştir.

---

## 8. İSTATİSTİKSEL VE PERFORMANS YENİDEN HESAPLAMASI

### 8.1. Genel Portföy Performansı (23 İşlem)
| Metrik | Senaryo B (2.0R Hedef) | Senaryo C (Orijinal Likidite Hedefi) |
| :--- | :---: | :---: |
| **Kazanma Oranı (Win Rate)** | %21,7 (5 TP / 9 SL / 9 BE) | %34,8 (8 TP / 8 SL / 7 BE) |
| **Brüt PnL (R)** | **+1,00R** | **-4,60R** |
| **Maliyet Toplamı (R)** | **1,934R** | **1,934R** |
| **Net PnL (R)** | **-0,93R** | **-6,53R** |
| **Net Beklenti (Expectancy)** | **-0,041R / işlem** | **-0,284R / işlem** |
| **Profit Factor** | **1,11** | **0,43** |
| **Maksimum Düşüş (Max DD)** | **4,91R** | **6,53R** |

### 8.2. Kripto vs. Forex & Altın Ayrışması
- **Kripto (BTC, ETH, SOL — 17 İşlem):**
  - Senaryo B: Brüt +6,00R, Maliyet 1,55R, **Net +4,45R**, PF: 2,50, Expectancy: +0,262R/işlem.
- **Forex & Altın (EUR, GBP, XAU — 6 İşlem):**
  - Senaryo B: Brüt -5,00R, Maliyet 0,38R, **Net -5,38R**, PF: 0,00, Expectancy: -0,897R/işlem.

---

## 9. TEST VE DOĞRULAMA KONTROLLERİ TABLOSU

| Kontrol Alanı | Sonuç | Doğrulama Kanıtı | Önem Derecesi | Kalan Risk |
| :--- | :---: | :--- | :---: | :--- |
| **Look-Ahead Bias** | **PASS** | `filterClosedCandles` + Truncation Test (2344/2344 eşleşme) | Kritik | Yok |
| **Swing Teyit Kuralı** | **PASS** | 2-bar sağ taraf teyit şartı ($i+2 \le \text{idx}$) | Kritik | Yok |
| **Determinizm** | **PASS** | Tekrarlanan testlerde birebir aynı sinyaller | Yüksek | Yok |
| **Sinyal Uzlaştırması** | **PASS** | $94 = 65 \text{ Expired} + 6 \text{ Filtered} + 23 \text{ Filled}$ | Kritik | Yok |
| **Aritmetik ve R Hesabı** | **PASS** | $\text{Net R} = \text{Brüt R} - \text{C/R}$ bağımsız doğrulandı | Kritik | Yok |
| **Muhafazakâr Çakışma** | **PASS** | Aynı barda SL+TP $\rightarrow$ SL/BE (`CONFLICT_SL_FIRST`) | Yüksek | Yok |
| **MFE/MAE Sınırları** | **PASS** | Yalnızca işlem ömrü içinde hesaplandı ($MFE \ge 0$) | Orta | Yok |
| **Makro Veri Sızıntısı** | **PASS** | Statik makro gate geçmişe uygulanmadı | Kritik | Tarihsel makro serisi eksik |
| **Maliyet Realizmi** | **PASS** | 6,5–11,5 bps ve pip bazlı sembolik model | Yüksek | Broker kayması artabilir |
| **Örneklem Boyutu** | **FAIL** | **23 işlem < 50 barajı** | **Kritik** | **İstatistiki yetersizlik** |

---

## 10. NİHAİ KARAR VE EYLEM PLANI

1. **Nihai Karar:** **DATA INSUFFICIENT**
2. **Gerekçe:** Algoritmik ve matematiksel replay sistemi doğrulanmıştır (`RESEARCH VALIDATION PASS`); ancak gerçekleşen işlem hacmi ($N=23$), istatistiki bir güven aralığı oluşturmak ve stratejinin gelecekteki kârlılığını teyit etmek için kesinlikle yetersizdir.
3. **Canlı Sistem Durumu:** Production stratejisi, konfigürasyonu ve canlı emir altyapısı değiştirilmemiştir. Canlı emir gönderimi kapalıdır.
