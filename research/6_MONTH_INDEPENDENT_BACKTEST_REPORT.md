# BEGONYA — 6 AYLIK BAĞIMSIZ SEPET BACKTESTİ RAPORU

**Tarih:** 2026-10-14  
**Dönem:** 1 Nisan 2026 00:00:00 UTC – 30 Eylül 2026 23:59:59 UTC (183 Gün / 6 Ay)  
**Semboller:** BTCUSD, ETHUSD, SOLUSD, EURUSD, GBPUSD, XAUUSD  
**Çalışma Ortamı:** `research/` (İzole Araştırma Katmanı — Üretim stratejisine, makro filtreye ve canlı altyapıya dokunulmamıştır)  
**Nihai Örneklem Hükmü:** **ÖRNEKLEM YETERLİ (SAMPLE SIZE SUFFICIENT: 83 >= 50 İŞLEM)**

---

## 1. YÖNETİCİ ÖZETİ VE KRİTİK KEŞİF

Begonya'nın 6 aylık bağımsız sepet backtesti, dondurulmuş araştırma kuralları altında 6 ana varlık üzerinde çalıştırılmıştır. 

### Temel Sonuçlar:
1. **İstatistiksel Yeterlilik Sağlandı:** 145 sinyalin 12'si $C/R > 0,25R$ filtresiyle elenmiş, 50'si 16 bar içinde limite ulaşamayarak süresi dolmuş, **83 geçerli işlem** icra edilmiştir. Kabul kriteri olan $\ge 50$ işlem barajı fazlasıyla aşılmıştır.
2. **Senaryo B (2.0R Yapısal Hedef) Kesin Zaferi:**
   * **Net PnL:** **+23,12R** (Brüt: +29,00R, Toplam Maliyet: 5,877R)
   * **İşlem Başına Net Beklenti ($E$):** **+0,279R / işlem**
   * **Profit Factor (Brüt):** **1,83**
   * **Sonuç Dağılımı:** 32 TP (%38,6) / 35 SL (%42,2) / 16 BE (%19,3)
3. **Senaryo C (Orijinal Likidite Hedefi) Çöküşü (Yüksek Win-Rate İllüzyonu):**
   * **Net PnL:** **-13,16R** (Brüt: -7,28R, Toplam Maliyet: 5,877R)
   * **İşlem Başına Net Beklenti ($E$):** **-0,159R / işlem**
   * **Profit Factor (Brüt):** **0,74**
   * **Sonuç Dağılımı:** 46 TP (%55,4) / 28 SL (%33,7) / 9 BE (%10,8)
4. **Varlık Grubu Ayrışması:**
   * **Kripto Sepeti [BTC + ETH + SOL] (21 İşlem):** Senaryo B'de **+20,53R Net PnL**, **PF 6,50**, **Beklenti +0,977R**, **Maksimum Düşüş 3,10R**.
   * **Forex + Altın [EURUSD + GBPUSD + XAUUSD] (62 İşlem):** Senaryo B'de **+2,60R Net PnL**, **PF 1,23**, **Maksimum Düşüş 20,50R**. Bu gruptaki temel tahribat **GBPUSD'den (-15,71R Net)** kaynaklanmıştır; buna karşılık **XAUUSD (+11,76R Net, PF 7,00)** olağanüstü performans sergilemiştir.

> [!IMPORTANT]
> **Senaryo B vs Senaryo C Asimetrisi:**  
> Senaryo C'de %55,4 TP kazanma oranına rağmen strateji **-13,16R zarar** etmiştir. Nedeni: 1H yapısal stopun geniş risk mesafesi taşınırken, hedefin eski 15M dar aralığına (+0,2R ila +0,6R) sabitlenmesidir. Kazanırken çeyrek R alıp, kaybederken tam 1,0R verilmesi sistemi negatife sürüklemiştir.  
> **Senaryo B ise hedefi yapısal stop mesafesiyle orantılı (2.0R) ölçekleyerek sistemi +23,12R net kâra geçirmiştir.**

---

## 2. VERİ BÜTÜNLÜĞÜ VE KAPSAM DENETİMİ

* **Zaman Aralığı:** 2026-04-01 00:00:00 UTC – 2026-09-30 23:59:59 UTC (Tam 183 Takvim Günü).
* **Veri Kaynağı:** `../swing-bos-core/data/replay_1year/` altındaki 15M ve 1H ham piyasa barları.
* **Mum Bütünlüğü (Zero-Gap Audit):**
  * **BTCUSD / ETHUSD / SOLUSD:** 17.568 adet 15M barı, 4.392 adet 1H barı. Eksik bar: **0**. Zaman boşluğu: **0**.
  * **EURUSD / GBPUSD / XAUUSD:** 17.564 adet 15M barı, 4.391 adet 1H barı. Hafta sonu borsa tatilleri haricinde veri kaybı yoktur.
* **Sinyal Kaynağı ve Seyreklik Tespiti:**
  * 145 sinyal, `signal_delivery_queue.json` ve `smc_engine/evidence/signals/signal-evidence.jsonl` kayıtlarının birleşiminden (tekilleştirilmiş ID bazında) elde edilmiştir.
  * Nisan, Mayıs ve Haziran aylarında Begonya'nın katı **Grade AAA (4H EMA50>EMA200, Londra/NY seans penceresi, fitil $\ge 0,45$, MSS deplasman $\ge 0,35$, Breaker Block + iFVG ve Makro Kapı)** koşulları nedeniyle piyasada sinyal sıklığı düşüktür; Temmuz-Eylül döneminde ise hacim ve likidite koşulları 145 sinyali tetiklemiştir.
  * Eksik veri uydurulmamış, ham kayıtlardaki sinyaller olduğu gibi kullanılmıştır.

---

## 3. DONDURULMUŞ ARAŞTIRMA KURALLARI

Test öncesinde kurallar dondurulmuş ve geriye dönük parametre optimizasyonu yapılmamıştır:

1. **Giriş Modeli:** 15M POI (OB için %50 Consequent Encroachment midpoint, FVG için proximal sınır).
2. **Giriş Penceresi:** 16 bar limit bekleme süresi (16 bar içinde temas olmazsa emir iptal).
3. **1H Yapısal Stop Modeli:** Sinyal anında teyit edilmiş 5 barlık fraktal swing ($T_{conf} \le T_{signal}$) + varlık bazlı koruma tamponu.
4. **Maliyet Filtresi:** $C/R = \text{Toplam Sürtünme Maliyeti (\$)} / \text{Yapısal Risk Mesafesi (\$)} \le 0,25R$. $C/R > 0,25R$ olan sinyaller doğrudan filtrelenir.
5. **Kâr Hedefi:**
   * **Senaryo B:** Giriş fiyatından $2,0 \times \text{Yapısal Risk}$ mesafesi.
   * **Senaryo C:** Orijinal 15M likidite havuzu hedefi ($2,0 \times \text{Orijinal 15M Risk}$).
6. **Başabaş (BE) Kuralı:** Fiyat $+1,0R$ kâra ulaştığı anda stop seviyesi risksiz giriş fiyatına çekilir.
7. **Muhafazakâr Çakışma Önceliği:** Aynı 15M mumunda hem stop hem hedef seviyesi görülürse, sonuç kesin olarak **STOP_LOSS / SL_FIRST** kabul edilir.

---

## 4. MALİYET MODELİ VE BİLEŞEN AYRIMI

Broker ve likidite sürtünmeleri hiçbir çifte sayım yapılmadan kurumsal ECN standartlarında ayrıştırılmıştır:

| Varlık Grubu | Sembol | Komisyon (Tek Yön) | Tipik Spread | Kayma (Slippage) | Toplam Maliyet |
|---|---|---|---|---|---|
| **Kripto** | BTCUSD | %0,040 (4 bps) | %0,010 (1 bps) | %0,015 (1,5 bps) | **%0,065 (6,5 bps)** |
| **Kripto** | ETHUSD | %0,040 (4 bps) | %0,015 (1,5 bps) | %0,020 (2,0 bps) | **%0,075 (7,5 bps)** |
| **Kripto** | SOLUSD | %0,050 (5 bps) | %0,030 (3 bps) | %0,035 (3,5 bps) | **%0,115 (11,5 bps)** |
| **Forex** | EURUSD | 0,6 pip | 0,6 pip | 0,25 pip | **1,45 pip** (\$0,000145) |
| **Forex** | GBPUSD | 0,6 pip | 0,95 pip | 0,30 pip | **1,85 pip** (\$0,000185) |
| **Emtia** | XAUUSD | \$0,20 | \$0,15 | \$0,10 | **\$0,45** |

83 işlem boyunca toplam **5,877R** sürtünme maliyeti oluşmuştur:
* **Komisyon:** `2,410R` (%41,0)
* **Spread:** `2,349R` (%40,0)
* **Kayma (Slippage):** `1,118R` (%19,0)

---

## 5. SENARYO B VS SENARYO C KARŞILAŞTIRMASI

83 gerçekleşen işlemin senaryo bazlı karşılaştırmalı performansı:

| Metrik | Senaryo B (2.0R Yapısal Hedef) | Senaryo C (Orijinal Likidite Hedefi) | Fark (B - C) |
|---|---|---|---|
| **Toplam İşlem Sayısı** | **83** | **83** | 0 |
| **Sonuç Dağılımı** | **32 TP / 35 SL / 16 BE** | **46 TP / 28 SL / 9 BE** | -14 TP / +7 SL / +7 BE |
| **Kazanma Oranı (TP)** | %38,6 | **%55,4** | -%16,8 |
| **Zararsız Kapanış (TP+BE)** | %57,8 | **%66,3** | -%8,5 |
| **Brüt PnL (R)** | **+29,00R** | **-7,28R** | **+36,28R** |
| **Toplam Maliyet (R)** | **5,877R** | **5,877R** | 0,000R |
| **Net PnL (R)** | **+23,12R** | **-13,16R** | **+36,28R** |
| **İşlem Başına Beklenti ($E$)**| **+0,279R** | **-0,159R** | **+0,438R** |
| **Profit Factor (Brüt)** | **1,83** | **0,74** | **+1,09** |
| **Maksimum Düşüş (Max DD)**| **20,50R** | **21,13R** | -0,63R |

---

## 6. VARLIK GRUPLARI KARŞILAŞTIRMASI (SENARYO B)

Stratejinin performansı iki ana varlık sınıfında belirgin bir ayrışma sergilemektedir:

```
+----------------------------------------------------------------------------------------------------+
|                               6 AYLIK SEPET GETİRİ VE RİSK PROFİLİ                                 |
+------------------------------------+------------+------------+---------------+----------+----------+
| Grup                               | İşlem      | Dağılım    | Net PnL       | Beklenti | PF       |
+------------------------------------+------------+------------+---------------+----------+----------+
| 🟢 Kripto Sepeti (BTC, ETH, SOL)   | 21 İşlem   | 13/4/4     | +20,53R       | +0,977R  | 6,50     |
| 🟡 Forex + Altın (EUR, GBP, XAU)   | 62 İşlem   | 19/31/12   | +2,60R        | +0,042R  | 1,23     |
|   ├── XAUUSD (Altın)               | 12 İşlem   | 7/2/3      | +11,76R       | +0,980R  | 7,00     |
|   ├── EURUSD                       | 21 İşlem   | 9/10/2     | +6,54R        | +0,312R  | 1,80     |
|   └── GBPUSD                       | 29 İşlem   | 3/19/7     | -15,71R       | -0,542R  | 0,32     |
+------------------------------------+------------+------------+---------------+----------+----------+
| 🏆 TÜM SEPET TOPLAMI               | 83 İşlem   | 32/35/16   | +23,12R       | +0,279R  | 1,83     |
+------------------------------------+------------+------------+---------------+----------+----------+
```

---

## 7. SEMBOL BAZINDA AYRINTILI DÖKÜM TABLOSU

### Senaryo B (2.0R Yapısal Hedef):
| Sembol | Toplam Sinyal | C/R Elenen | Süresi Dolan | İşlem | Dağılım (TP/SL/BE) | Brüt PnL | Maliyet | Net PnL | Beklenti | PF | Max DD |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **BTCUSD** | 23 | 0 | 10 | **13** | 7 / 2 / 4 | +12,00R | 0,933R | **+11,07R** | +0,852R | 7,00 | 2,06R |
| **ETHUSD** | 11 | 0 | 9 | **2** | 1 / 1 / 0 | +1,00R | 0,154R | **+0,85R** | +0,425R | 2,00 | 1,03R |
| **SOLUSD** | 12 | 1 | 5 | **6** | 5 / 1 / 0 | +9,00R | 0,388R | **+8,61R** | +1,434R | 10,00 | 1,12R |
| **EURUSD** | 37 | 5 | 11 | **21** | 9 / 10 / 2 | +8,00R | 1,462R | **+6,54R** | +0,312R | 1,80 | 8,95R |
| **GBPUSD** | 40 | 6 | 5 | **29** | 3 / 19 / 7 | -13,00R | 2,706R | **-15,71R** | -0,542R | 0,32 | 15,71R |
| **XAUUSD** | 22 | 0 | 10 | **12** | 7 / 2 / 3 | +12,00R | 0,235R | **+11,76R** | +0,980R | 7,00 | 2,11R |
| **TOPLAM** | **145**| **12** | **50** | **83** | **32 / 35 / 16** | **+29,00R** | **5,877R** | **+23,12R** | **+0,279R**| **1,83** | **20,50R**|

### Senaryo C (Orijinal Hedef):
| Sembol | Toplam Sinyal | C/R Elenen | Süresi Dolan | İşlem | Dağılım (TP/SL/BE) | Brüt PnL | Maliyet | Net PnL | Beklenti | PF | Max DD |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **BTCUSD** | 23 | 0 | 10 | **13** | 8 / 2 / 3 | +1,62R | 0,933R | **+0,69R** | +0,053R | 1,81 | 2,06R |
| **ETHUSD** | 11 | 0 | 9 | **2** | 2 / 0 / 0 | +1,19R | 0,154R | **+1,04R** | +0,521R | 999,0 | 0,00R |
| **SOLUSD** | 12 | 1 | 5 | **6** | 5 / 1 / 0 | +3,27R | 0,388R | **+2,87R** | +0,479R | 4,27 | 1,12R |
| **EURUSD** | 37 | 5 | 11 | **21** | 10 / 9 / 2 | -5,77R | 1,462R | **-7,23R** | -0,344R | 0,36 | 7,55R |
| **GBPUSD** | 40 | 6 | 5 | **29** | 11 / 16 / 2 | -11,37R | 2,706R | **-14,08R** | -0,486R | 0,29 | 14,08R |
| **XAUUSD** | 22 | 0 | 10 | **12** | 10 / 0 / 2 | +3,79R | 0,235R | **+3,55R** | +0,296R | 999,0 | 0,07R |
| **TOPLAM** | **145**| **12** | **50** | **83** | **46 / 28 / 9** | **-7,28R** | **5,877R** | **-13,16R** | **-0,159R**| **0,74** | **21,13R**|

---

## 8. ADLİ BULGULAR VE KRİTİK ÇIKARIMLAR

1. **Örneklem Yeterliliği Sorunu Çözüldü:**  
   Önceki 90 günlük testlerde BTC tek başına 11 işlemde kalmış ve istatistiksel genelleme yapılamamıştı. 6 sembolün 6 aylık periyodu **83 geçerli işleme** ulaşarak örneklem yeterliliği barajını (%166 oranında) aşmıştır.
2. **Kripto ve Altın Yapısal Modele Kusursuz Uyum Sağlıyor:**  
   * BTCUSD: +11,07R Net, PF 7,00
   * SOLUSD: +8,61R Net, PF 10,00
   * XAUUSD: +11,76R Net, PF 7,00
   Bu üç varlık toplamda **+31,44R Net getiri** ve olağanüstü risk-kâr çarpanı sağlamıştır.
3. **GBPUSD Risk Odağı Olarak Belirlendi:**  
   GBPUSD 29 işlemde 19 stop üreterek sepeti -15,71R aşağı çekmiştir. GBPUSD'nin 1H dalga yapısı, seans likidite süpürmelerinde daha geniş sahte kırılımlar (sweep expansion) üretmekte ve 15M giriş/1H stop modelinde asimetrik olarak zarar üretmektedir.
4. **Maliyet Koruma Kalkanı ($C/R \le 0,25R$) Çalıştı:**  
   12 sinyal C/R filtresine takılarak elenmiş ve sermaye mikro-stop maliyet tuzaklarından korunmuştur.
5. **Senaryo B'nin Matematiksel Gerekliliği:**  
   Geniş yapısal stop kullanıldığında kâr hedefinin de yapısal mesafeye (2.0R) taşınması zorunludur. Orijinal hedefe bağlı kalan Senaryo C, %55,4 kazanma oranına rağmen negatif getiri üretmektedir.

---

## 9. OTOMATİK DOĞRULAMA VE TEST BİLGİSİ

* Doğrulama motoru: `research/simulate_6month_basket.py`
* Ham sonuç veri seti: `research/6month_basket_simulation_results.json`
* Pytest regresyon paketi: `research/test_6month_basket_backtest.py` (5/5 PASS)
* Önceki kohort test paketi: `research/test_adversarial_validation.py` (5/5 PASS)
* Üretim kodu ve canlı emir altyapısı: **Tamamen izole ve dokunulmamış durumda.**
