# BEGONYA — 90 GÜNLÜK BAĞIMSIZ BACKTEST RAPORU

**Tarih:** 2026-10-14  
**Test Penceresi:** 1 Temmuz 2026 00:00:00 UTC – 30 Eylül 2026 23:59:59 UTC (92 Gün Out-of-Sample)  
**Çalışma Ortamı:** `research/` (İzole Araştırma Katmanı — Üretim ve canlı altyapıya dokunulmamıştır)  
**Nihai Karar:** **YETERSİZ ÖRNEKLEM (INSUFFICIENT SAMPLE SIZE) — DOĞRULAMA GEÇERSİZ / TAMAMLANAMADI**

---

## 1. BTC #6 ZAMANLAMA DÜZELTMESİ VE 6 İŞLEMLİK KOHORTUN YENİDEN HESABI

Önceki denetimde tespit edilen paper tracker gecikmesi düzeltilmiş; gerçek piyasa mumları (giriş: 06:15 UTC, dip: 07:00 UTC, tepe/hedef: 07:30 UTC) tüm senaryolara yansıtılmıştır.

### Düzeltmenin İşlem Bazında Etkisi (BTC #6):
* **Senaryo A (15M Dar Stop \$83.485,37):** Fiyat saat `07:00 UTC`'de \$83.476,32'ye sarkarak dar stopu **gerçekte patlatmıştır**. Önceki yapay başabaş (+0,18R) iptal edilmiş, sonuç **SL (-1,00R brüt, -1,43R net)** olarak düzeltilmiştir.
* **Senaryo B (1H Yapısal 2R Hedef \$84.429,02):** Yapısal stop (\$83.205) \$83.449'luk geri çekilmeyi absorbe etmiş, MFE +1,73R'ye ulaşmış, başabaş devreye girmiş ve 11:15 UTC'de **BE (-0,13R net)** ile kapanmıştır.
* **Senaryo C (1H Yapısal Stop + Orijinal Hedef \$83.868,86):** Fiyat saat `07:30 UTC`'de \$84.114'e ulaşarak orijinal hedefe gerçek zamanında ulaşmıştır. Sonuç **TP (+0,63R brüt, +0,49R net)** olarak kesinleşmiştir.

### Düzeltilmiş 6 İşlemlik Kohort Özeti
| Metrik | Senaryo A (15M Dar Stop) | Senaryo B (1H Yapısal 2R) | Senaryo C (1H Yapısal + Orijinal Hedef) |
|---|---|---|---|
| **Sonuç Dağılımı** | **2 TP / 4 SL / 0 BE** | **2 TP / 1 SL / 3 BE** | **4 TP / 1 SL / 1 BE** |
| **Brüt PnL (R)** | **-0,40R** (Önceki: +1,20R) | **+3,00R** | **+1,75R** |
| **Toplam Maliyet (R)** | **3,622R** | **1,166R** | **1,166R** |
| **Net PnL (R)** | **-4,02R** (Önceki: -2,43R) | **+1,83R** | **+0,59R** |
| **İşlem Başına Net Beklenti ($E$)**| **-0,670R** | **+0,306R** | **+0,098R** |
| **Profit Factor (Brüt)** | **0,90** | **4,00** | **2,75** |
| **Maksimum Düşüş (Max DD)** | **5,30R** | **1,79R** | **1,55R** |

> [!CRITICAL]
> BTC #6'nın gerçek zamanlaması işlendiğinde, **Senaryo A'nın (15M dar stop) brüt kârının dahi negatife düştüğü (-0,40R brüt, -4,02R net)** ve mikro stop modelinin iflas ettiği kesin olarak kanıtlanmıştır.

---

## 2. 90 GÜNLÜK VERİ KAPSAMI VE EKSİK MUM DENETİMİ

* **Hedef Dönem:** 1 Temmuz 2026 00:00:00 UTC – 30 Eylül 2026 23:59:59 UTC (92 gün).
* **Veri Kaynağı:** `../swing-bos-core/data/replay_1year/BTCUSD_15m.json` ve `BTCUSD_1h.json`.
* **Kapsam ve Süreklilik:**
  * 15M Toplam Mum: **8.832 adet** (Beklenen: 92 gün $\times$ 24 saat $\times$ 4 bar = 8.832). Fark: **0**.
  * 1H Toplam Mum: **2.208 adet** (Beklenen: 92 gün $\times$ 24 saat = 2.208). Fark: **0**.
  * Zaman Boşluğu / Eksik Mum (Gaps): **0 adet (Kesintisiz veri akışı)**.

---

## 3. DONDURULMUŞ KURALLAR (FROZEN RULES)

Test başlamadan önce kurallar dondurulmuş ve simülasyon boyunca hiçbir parametre değiştirilmemiştir:

1. **Giriş Modeli:** 15M POI (OB için midpoint %50 CE, FVG için proximal sınır).
2. **Stop Modeli (1H Yapısal):** Yalnızca sinyal anından önce teyit edilmiş 5 barlık fraktal swing ($T_{conf} \le T_{signal}$) seviyesi + 20 USD tampon.
3. **Maliyet Filtresi:** $C/R = \text{Toplam Maliyet (\$)} / \text{Yapısal Risk (\$)} \le 0,25R$. $C/R > 0,25R$ olan sinyaller doğrudan elenir.
4. **Hedef Modeli (Senaryo C):** Karşıt likidite havuzu (Range / Swing Extreme) mesafesi.
5. **İşlem Yaşam Döngüsü:** 16 bar giriş bekleme süresi; 1.0R hareket görüldüğünde başabaş (BE) tetikleme; mum içi çelişkide SL önceliği.

---

## 4. ÖRNEKLEM BÜYÜKLÜĞÜ VE KABUL KRİTERİ DENETİMİ

> [!CAUTION]
> **Kriter:** Testin istatistiksel geçerlilik kazanması için **en az 50 geçerli işlem** şart koşulmuştur.

### 90 Günlük Dağılım:
* **Üretilen Toplam BTC Sinyali:** 21 adet
* **$C/R > 0,25R$ ile Elenen Sinyal:** 0 adet (Yapısal stoplar maliyet oranını korumuştur)
* **Süresi Dolan (Unfilled - Emre Ulaşmayan):** 10 adet (%47,6)
* **Gerçekleşen Geçerli İşlem Sayısı:** **11 adet**

$$\text{Gerçekleşen İşlem Sayısı (11)} < \text{Gereken Minimum İşlem (50)}$$

### Hüküm: **YETERSİZ ÖRNEKLEM (INSUFFICIENT SAMPLE SIZE)**
Kural gereği: **Veri aralığı veya kurallar sonuç üretmek amacıyla sonradan genişletilmemiştir.** 90 günlük out-of-sample pencerede Begonya'nın katı SMC ve seans kuralları BTC üzerinde yalnızca 11 işleme izin vermiştir. Bu sayı istatistiksel genelleme için yetersizdir.

---

## 5. GERÇEKLEŞEN 11 İŞLEMİN PERFORMANS METRİKLERİ

11 işlemlik örneklemin sonuçları hipotez gözlemi olarak aşağıda sunulmuştur:

| # | Sinyal Zamanı (UTC) | Yön & Tip | Durum | Sonuç | C/R Oranı | Brüt PnL (R) | Net PnL (R) |
|---|---|---|---|---|---|---|---|
| **1** | 2026-08-19 08:30 | Long OB | FILLED | **TP** | 0,146R | +0,67R | +0,52R |
| **2** | 2026-08-19 08:30 | Long FVG | FILLED | **TP** | 0,103R | +0,93R | +0,83R |
| **3** | 2026-08-19 12:30 | Long OB | FILLED | **BE** | 0,119R | +0,00R | -0,12R |
| **4** | 2026-08-20 08:00 | Long FVG | FILLED | **BE** | 0,051R | +0,00R | -0,05R |
| **5** | 2026-08-20 08:00 | Long FVG | FILLED | **TP** | 0,022R | +1,69R | +1,67R |
| **6** | 2026-08-21 00:00 | Long OB | FILLED | **TP** | 0,063R | +0,69R | +0,63R |
| **7** | 2026-08-21 00:00 | Long FVG | FILLED | **TP** | 0,046R | +0,58R | +0,53R |
| **8** | 2026-08-21 08:15 | Long OB | FILLED | **TP** | 0,013R | +0,34R | +0,32R |
| **9** | 2026-08-24 06:00 | Long OB | FILLED | **BE** | 0,165R | +0,00R | -0,16R |
| **10**| 2026-08-24 10:00 | Long FVG | FILLED | **TP** | 0,045R | +0,46R | +0,41R |
| **11**| 2026-08-30 20:30 | Short OB | FILLED | **TP** | 0,095R | +0,44R | +0,35R |

### 11 İşlemlik Özet:
* **Sonuç Dağılımı:** 8 TP (%72,7) / 0 SL (%0,0) / 3 BE (%27,3)
* **Brüt PnL:** `+5,79R`
* **Toplam İşlem Maliyeti:** `0,866R`
* **Net PnL:** `+4,92R`
* **İşlem Başına Net Beklenti ($E$):** `+0,448R`
* **Profit Factor (Brüt):** `∞` (Hiçbir işlem SL olmamıştır)
* **Maksimum Düşüş (Max DD):** `0,17R`
* **Ortalama C/R:** `0,079R` (Maliyet riskin sadece %7,9'udur)

---

## 6. NİHAİ DEĞERLENDİRME VE SONUÇ

1. **Pozitif Yönler:**
   * 1H yapısal stop ve Senaryo C hedefleme modeli, 90 günlük dönemde sıfır kayıp (0 SL) ve +4,92R net kâr üreterek teorik olarak gürültüyü absorbe edebildiğini göstermiştir.
   * Ortalama C/R oranının 0,079R'ye düşmesi, işlem maliyeti patolojisini tamamen ortadan kaldırmıştır.
2. **Kritik Engel:**
   * **İşlem Sıklığı Yetersizliği:** 92 günde sadece 11 işlem açılması, stratejinin ayda yaklaşık 3,6 işlem frekansına sahip olduğunu gösterir. Bu frekansta 50 işlemlik istatistiksel güvenilirlik eşiğine ulaşmak için en az 14 aylık kesintisiz veriye ihtiyaç vardır.
3. **Üretim Yasağı:**
   * Kriter (en az 50 işlem) sağlanamadığı için **test başarısız/yetersiz kabul edilmiştir**.
   * Üretime hiçbir aktarım yapılmayacak, canlı emirler kesinlikle açılmayacaktır.
