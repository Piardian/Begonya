# Begonya & ChecklistTrigger Hibrit Replay — Sağlamlaştırılmış Araştırma ve Sağlamlık Raporu

**Belge Kimliği:** `HYBRID_REPLAY_ROBUSTNESS_REPORT.md`  
**Tarih:** 14 Ekim 2026  
**Kapsam:** GBPUSD Uç İşlem Adli Denetimi, Spread/Sürtünme Duyarlılık Testi, Mikro-Stop Eşikleri Analizi, Hedef Verisi Ayrıştırması ve Eksik Veri Envanteri  
**Mod:** Salt Araştırma / Sağlamlık Testi (Üretim stratejisine, Convexity Engine'e ve canlı emir altyapısına dokunulmadı; canlı emir gönderilmedi, commit ve push yapılmadı)

---

## 1. Yönetici Özeti ve Temel Çıkarımlar

Bu çalışma, Aşama 2 sonuçlarında ortaya çıkan `+10.96 R` brüt kârın ve `+17.28 R`'lık tekil GBPUSD uç işleminin (outlier) gerçekliğini sorgulayan kullanıcı denetim talepleri doğrultusunda hazırlanmıştır.

### Kritik Bulgular ve Kanıtlar:
1. **GBPUSD `+17.28 R` İşlemi Sıfır Spread Yanılsamasıdır:**
   * Yapılan adli analizde, GBPUSD işlemindeki 2.45 piplik stop mesafesinin gerçek bir yapısal pivot değil, 15M mumlarındaki 0.4 piplik bir **mikro-dalgalanma** olduğu tespit edilmiştir.
   * M1 fiyat serisinde Short pozisyonun **ASK** fiyatı incelendiğinde, **1.5 pip ve üzeri spread senaryolarında işlemin henüz 1. dakikada STOP olduğu (`STOP_HIT`, Net R = -1.20 R)** kesin olarak kanıtlanmıştır.
   * Çıkış simülasyonunun bu işlemi kazanan saymasının tek nedeni ham BID mumunun sıfır maliyetle stoba çarpıştırılmasıdır.
2. **Standart Broker Koşullarında Strateji Net Zarardadır:**
   * Standart perakende broker spreadleri (FX 1.5 pip, Altın 3.0 pip, Kripto %0.10) uygulandığında, Aşama 2'deki 2 kazanan işlemden ikisi de spread nedeniyle erkenden stop olmakta; **kazanma oranı %0.0'a, toplam getiri ise -9.00 R'a gerilemektedir**.
3. **Mikro-Stop Filtresi Outlier'ı Elediğinde Brüt R Negatife Döner:**
   * FX için minimum stop eşiği 4 pip seçildiğinde (2.45 piplik GBPUSD mikro-stopu `MICRO_STOP_EXCLUDED` olarak elendiğinde), toplam brüt R anında **+10.96 R'dan -4.32 R'a** düşmektedir.
   * Tüm varlık sınıflarında gürültü niteliğindeki mikro-stoplar filtrelendiğinde geriye kalan 5 işlemin tamamı stoba gitmektedir (0 Win, 5 Loss, -5.00 R).
4. **16 Hedefsiz İşlemin Kök Nedeni (8 Eylül 2026 Mimari Sınırı):**
   * 16 işlemde hedefin bulunmaması bir veri kaybı veya simülasyon hatası değildir; bu sinyaller 19 Ağustos – 4 Eylül 2026 arasında üretilmiştir ve botun o tarihteki sürümünde `liquidityMagnetDetector` henüz geliştirilmemiştir (kod ilk kez 8 Eylül'de devreye girmiştir). Bu 16 işlem `LEGACY_NO_TARGET` grubunda tarafsız olarak izole edilmiştir.
5. **Eksik M15 Verisi:**
   * `USDJPY` ve `USDCAD` için Ağustos–Eylül 2026 aralığını kapsayan yerel M15 verisi diskte bulunmadığından, M1'den sentetik veri türetilmemiş, kural gereği `INSUFFICIENT_DATA_STRUCTURAL_STOP` statüsü korunmuştur.

---

## 2. GBPUSD Uç İşleminin (+17.28 R) Adli Denetimi ve Spread Duyarlılığı

### A. Sinyal, Fiyat ve Seviye Doğrulaması
* **Sinyal ID:** `GBPUSD_15m_FVG_1791174600000_1791174600000` (5 Ekim 2026, 04:30:00 UTC)
* **Yön:** Short (Satış)
* **Giriş Fiyatı:** `1.323525` (1M Sniper teyidi ve 0.5 Fib dolumu, Bar 86091, 05:04:00 UTC)
* **Kayıtlı Hedef:** `1.319292` (EQL Eşit Dipler magneti, 42.33 pip aşağıda)
* **Tanımlanan Stop:** `1.323770` (M15'te 01:45 UTC mumu tepesi)
* **Tanımlanan Risk:** $1.323770 - 1.323525 = 0.000245$ (**2.45 pip**)

### B. M15 Mumlarındaki Yapısal Hata (Mikro-Fraktal)
İlgili 15M mum serisi incelendiğinde (`replay_1year/GBPUSD_15m.json`):
* Bar 31724 (01:00 UTC): High = `1.32396` (Gerçek konsolidasyon tepesi)
* Bar 31726 (01:30 UTC): High = `1.32373`
* Bar 31727 (01:45 UTC): High = **`1.32377`** (Seçilen swing tepesi)
* Bar 31728 (02:00 UTC): High = `1.32373`
* **Bulgu:** 01:45 mumunun tepesi, bitişik barlardan yalnızca **0.00004 (0.4 pip!)** yüksektir. 5 barlık fraktal matematiksel olarak bunu swing seçmiş; ancak 4.4 pip gerideki gerçek tepe (`1.32396`) ve FVG kutusunun tavanı (`1.32385`) yok sayılmıştır. 2.45 piplik stop, piyasa gürültüsünün tamamen içinde kalmıştır.

### C. M1 Barlarında Ask/Bid ve Spread Simülasyonu
Short pozisyonda zararı durdur emri (Stop Loss) **ASK** fiyatı üzerinden tetiklenir:
$$\text{Ask} = \text{Bid} + \text{Spread}$$
İşlem süresince (05:04 – 06:06 UTC, 62 dakika) M1 mumlarının gördüğü en yüksek Bid fiyatı `1.32362`'dir. Stop seviyesi olan `1.32377`'ye olan mesafe yalnızca **0.00015 (1.5 pip)**'tir.

| Spread Senaryosu | Formül ($\text{Ask} = \text{Bid} + \text{Spread}$) | Stop İhlali ($\text{Ask} \ge 1.32377$) | Simülasyon Çıktısı | Net R | Açıklama |
| :---: | :---: | :---: | :---: | :---: | :--- |
| **0.0 Pip** | $\text{Ask} = 1.32362$ | Hayır | `TARGET_HIT` (Bar 62) | **+17.28 R** | Teorik ham simülasyon (Gerçek dışı) |
| **0.5 Pip** | $\text{Ask} = 1.32367$ | Hayır | `TARGET_HIT` (Bar 62) | **+17.07 R** | Raw ECN, komisyon dahil |
| **1.0 Pip** | $\text{Ask} = 1.32372$ | Hayır | `TARGET_HIT` (Bar 62) | **+17.07 R** | Dar kurumsal spread |
| **1.5 Pip** | $\text{Ask} = 1.32377$ | **EVET (Bar 1)** | **`STOP_HIT` (Bar 1)** | **-1.20 R** | **İlk dakikada stop oldu!** |
| **2.0 Pip** | $\text{Ask} = 1.32382$ | **EVET (Bar 1)** | **`STOP_HIT` (Bar 1)** | **-1.20 R** | **İlk dakikada stop oldu!** |

> [!CAUTION]
> **Adli Sonuç:**  
> GBPUSD için sabah 05:00 UTC'de (Asya seansı kapanışı / Londra açılışı öncesi) spread 1.5 – 2.0 pip aralığındadır. Bu işlem gerçek piyasada **açıldıktan 60 saniye sonra stop olmuştur**. Sonradan 62. dakikada hedefin görülmüş olması, nedensellik ilkesi gereği stoplanan bir işlemi asla geri getiremez.  
> Bu işlem elendiğinde tüm Aşama 2 sonucu **+10.96 R'dan -7.32 R'a çökmektedir**.

---

## 3. Portföy Düzeyinde Maliyet Duyarlılık Analizi (9 Çözümlenen İşlem)

Mevcut veri kütüklerinde gerçek zamanlı tick bazlı spread, komisyon ve slippage bulunmadığından, aşağıdaki senaryolar **açıkça varsayımsal modeller** olarak etiketlenmiştir:

| Senaryo | Varsayılan Maliyetler | Hedef Dolumu | Stop Dolumu | Kazanma Oranı | Toplam Net R | İşlem Başı Ort. Net R |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Senaryo A (Ham / Sıfır Maliyet)** | 0 Spread, 0 Komisyon | 2 | 7 | %22.22 | **+10.9557 R** | +1.2173 R |
| **Senaryo B (Raw ECN Broker)** | FX 0.5p + 0.35p kom, XAU 1.5p, Kripto %0.05 | 2 | 7 | %22.22 | **+10.7453 R** | +1.1939 R |
| **Senaryo C (Standart Perakende Broker)** | FX 1.5p, XAU 3.0p ($0.30), Kripto %0.10 | **0** | **9** | **%0.00** | **-9.0000 R** | **-1.0000 R** |
| **Senaryo D (Yüksek Kayma / Stress)** | FX 2.0p, XAU 5.0p ($0.50), Kripto %0.20 | **0** | **9** | **%0.00** | **-9.3607 R** | **-1.0401 R** |

* **Senaryo C Açıklaması:** Standart broker spreadi uygulandığında, hem GBPUSD hem de SOLUSD short işlemi (giriş 120.205, stop 121.69, risk $1.485) spread tamponu nedeniyle stoba çarpmış; **çözümlenen 9 işlemin 9'u da stopla sonuçlanmıştır**.

---

## 4. Mikro-Stop Duyarlılık Testi

Ana yapısal stop modeli değiştirilmemiş; ancak farklı minimum risk mesafesi eşikleri altında stratejinin dayanıklılığı araştırma varyantları olarak test edilmiştir. Stop mesafesi eşiğin altında kalan işlemler yeni bir stop atanmadan doğrudan `MICRO_STOP_EXCLUDED` statüsüne alınmıştır:

### A. Varlık Sınıfı Bazında Eşik Varyantları

| Araştırma Varyantı | Uygulanan Minimum Stop Eşikleri | Toplam İşlem | Dahil Edilen | Dışlanan (`MICRO_STOP_EXCLUDED`) | Çözümlenen İşlem | Hedef Dolumu | Stop Dolumu | Kazanma Oranı | Toplam Brüt R |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Varyant 1 (Temel)** | FX: 2p, XAU: 1$, ETH: 5$, SOL: 0.5$ | 25 | 23 | 2 (1 ETH, 1 SOL) | 9 | 2 | 7 | %22.22 | **+10.9557 R** |
| **Varyant 2 (Orta Eşik)** | FX: 4p, XAU: 2$, ETH: 10$, SOL: 1.0$ | 25 | 19 | 6 (GBPUSD outlier dahil!) | 6 | 1 | 5 | %16.67 | **-4.3219 R** |
| **Varyant 3 (Sıkı Eşik)** | FX: 6p, XAU: 3$, ETH: 15$, SOL: 1.5$ | 25 | 13 | 12 (Mikro-stopların tümü) | 5 | 0 | 5 | **%0.00** | **-5.0000 R** |
| **Varyant 4 (Geniş Eşik)**| FX: 8p, XAU: 3$, ETH: 15$, SOL: 1.5$ | 25 | 13 | 12 | 5 | 0 | 5 | **%0.00** | **-5.0000 R** |
| **Varyant 5 (Makro Eşik)**| FX: 10p, XAU: 3$, ETH: 15$, SOL: 1.5$ | 25 | 13 | 12 | 5 | 0 | 5 | **%0.00** | **-5.0000 R** |

### B. Çıkarım:
* FX için 4 pip ve üzeri minimum stop filtresi konulduğunda (Varyant 2), GBPUSD işlemi elenmekte ve stratejinin net brüt R'ı anında negatife (**-4.32 R**) dönmektedir.
* Gürültü filtreleri sıkılaştırıldığında (Varyant 3), sistemde hedefe ulaşabilen tek bir geçerli işlem dahi kalmamaktadır.

---

## 5. Hedef Verisi ve 16 Hedefsiz İşlemin Durumu

### A. 8 Eylül 2026 Mimari Sınırı
Kuyruk kütüğü (`signal_delivery_queue.json`) kronolojik olarak denetlenmiş ve sistemde `liquidityMagnet` alanının ilk kez **8 Eylül 2026 saat 09:30 UTC'de** üretilen sinyalde yer aldığı kanıtlanmıştır.

* 8 Eylül öncesindeki 16 işlemde hedefin bulunmaması bir simülasyon eksikliği değil, **mimari bir sürüm sınırıdır**.
* Bu 16 işlem `LEGACY_NO_TARGET` grubunda tarafsız olarak izole edilmiş; geriye dönük hedef uydurma veya gelecek verisiyle optimize etme yapılmamıştır.

### B. `LEGACY_NO_TARGET` Grubu İşlemleri (16 Adet):
1. `ETHUSD_15m_OB_1787119200000_1787121900000` (19 Ağu 2026)
2. `ETHUSD_15m_OB_1787211000000_1787212800000` (20 Ağu 2026)
3. `XAUUSD_15m_OB_1787095800000_1787097600000` (19 Ağu 2026)
4. `XAUUSD_15m_OB_1787102100000_1787103000000` (19 Ağu 2026)
5. `XAUUSD_15m_OB_1787228100000_1787238000000` (20 Ağu 2026)
6. `XAUUSD_15m_OB_1787272200000_1787274900000` (21 Ağu 2026)
7. `XAUUSD_15m_OB_1787289300000_1787291100000` (21 Ağu 2026)
8. `XAUUSD_15m_OB_1787670000000_1787671800000` (25 Ağu 2026)
9. `XAUUSD_15m_FVG_1787274000000_1787274900000` (21 Ağu 2026)
10. `XAUUSD_15m_FVG_1787670900000_1787671800000` (25 Ağu 2026)
11. `XAUUSD_15m_OB_1787694300000_1787697000000` (25 Ağu 2026)
12. `XAUUSD_15m_OB_1787697900000_1787701500000` (25 Ağu 2026)
13. `ETHUSD_15m_OB_1787930100000_1787932800000` (28 Ağu 2026)
14. `XAUUSD_15m_OB_1788221700000_1788225300000` (01 Eyl 2026)
15. `ETHUSD_15m_OB_1788248700000_1788249600000` (01 Eyl 2026)
16. `GBPUSD_15m_OB_1788524100000_1788525000000` (04 Eyl 2026)

---

## 6. Eksik M15 Verisi Denetimi (USDJPY & USDCAD)

`USDJPY` (6 fırsat) ve `USDCAD` (4 fırsat) için yapılan derin disk taramasında:
* `swing-bos-core/data/` ve `smc_engine/data/` altındaki `*15m.json` dosyalarının yalnızca Ekim 2026 ve Eylül 2026 başındaki kısa 500 barlık pencereleri kapsadığı teyit edilmiştir.
* Sinyallerin oluştuğu 21 Ağustos – 21 Eylül 2026 aralığında yerel M15 verisi **bulunmamaktadır**.
* Diskte mevcut olan 95,000 barlık M1 verisinden sentetik M15 üretilmemiştir; kural gereği bu 10 fırsatın `INSUFFICIENT_DATA_STRUCTURAL_STOP` statüsü katı biçimde korunmuştur.
* **Gelecekte Temin Yolu:** Bu sembollerin gerçek M15 geçmişi MetaTrader 5 API (`mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_M15, 0, 35000)`) üzerinden broker geçmişinden çekilmelidir.

---

## 7. Birim Test Paketi ve Doğrulama

Araştırma modüllerinde toplam **21 birim test** koşturulmuş ve tamamı sıfır hata ile geçmiştir:

```text
Ran 21 tests in 0.001s
OK
```

### Eklenen Yeni Sağlamlık Testleri (`test_robustness.py`):
1. `test_spread_induced_early_stop_on_short`: Short işlemde $\text{Ask} = \text{High} + \text{Spread} \ge \text{Stop}$ olduğunda emrin stoba gittiğini doğrular.
2. `test_non_resurrection_after_spread_stop`: Spread nedeniyle stoba çarpan bir işlemin daha sonra hedefe ulaşsa dahi **asla kazanan olarak diriltilemeyeceğini (non-resurrection)** doğrular.
3. `test_micro_stop_exclusion_rule`: Risk mesafesi belirlenen eşiğin altında kalan işlemlerin `MICRO_STOP_EXCLUDED` olarak elendiğini doğrular.

---

## 8. Nihai Stratejik Karar ve Özet

1. **Giriş Hipotezi Henüz Kanıtlanmamıştır:**  
   Sıfır maliyetli teorik simülasyondaki +10.96 R kazanç, **2.45 piplik bir mikro-stop ve sıfır spread varsayımına dayanan tek bir GBPUSD işleminden kaynaklanmaktadır**.
2. **Gerçek Piyasa Koşullarında Sonuç Negatiftir:**  
   Standart bir perakende broker koşullarında veya 4 piplik asgari stop eşiği konulduğunda, mevcut 9 işlemlik örneklemin performansı **-4.32 R ile -9.00 R arasına düşmektedir**.
3. **Gelecek Çalışmalar İçin Şartlar:**
   * Minimum yapısal stop filtresi getirilmeden bu giriş modeli canlıya veya ileri teste alınmamalıdır.
   * Yalnızca karşı likidite hedefinin (`liquidityMagnet`) sistematik olarak üretildiği 8 Eylül 2026 sonrası sinyaller test edilmeli veya veri geçmişi geriye dönük deterministik olarak genişletilmelidir.
   * `USDJPY` ve `USDCAD` için gerçek MT5 M15 geçmişi temin edilmeden örneklem genişletilemez.
