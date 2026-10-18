# Begonya & ChecklistTrigger Hibrit Replay — Yapısal Stop Referansı Denetim Raporu

**Belge Kimliği:** `HYBRID_REPLAY_STRUCTURAL_STOP_AUDIT.md`  
**Denetim Tarihi:** 14 Ekim 2026  
**Kapsam:** 66 Fırsat Üzerinde M15 Başlangıç Swing Noktası Tespiti, Nedensellik/Sıfır Sızıntı Denetimi ve Alternatif POI Stop Modeli Analizi  
**Mod:** Salt Araştırma / İnceleme (Üretim koduna ve Convexity Engine'e dokunulmadı; canlı emir, çıkış simülasyonu, net R veya kârlılık hesabı yapılmadı)

---

## 1. Yönetici Özeti ve Temel Bulgular

Aşama 1 denetiminde `brokenSwing.price` referansının 32 dolumun 27'sinde (%84.4) emrin yanlış tarafında kaldığı kanıtlandıktan sonra, bu çalışmada sinyalin bilindiği andaki (`signal_known_timestamp`) M15 mum geçmişi taranarak gerçek **Başlangıç Swing Noktası** (Originating Swing Point) araştırılmış ve doğrulanmıştır.

### Özet İstatistikler (66 Fırsat):
* **Doğrulanan Yapısal Stop (`VERIFIED_STRUCTURAL_STOP`):** **49 Fırsat (%74.2)**
  * Sinyal anından önce teyit edilmiş, doğru yönde (Long için Stop < Giriş, Short için Stop > Giriş) ve yapısal tepe/dip kuralını karşılayan M15 fraktal swing noktası tespit edilmiştir.
* **Yetersiz Veri (`INSUFFICIENT_DATA_STRUCTURAL_STOP`):** **10 Fırsat (%15.2)**
  * Tamamı `USDJPY` (6) ve `USDCAD` (4) çiftlerine aittir. Bu iki sembol için Ağustos–Eylül 2026 sinyal aralığını kapsayan yerel 1 yıllık M15 veri dosyası bulunmamaktadır. Kural gereği eksik veri tahminle doldurulmamış, açık hata durumuyla izole edilmiştir.
* **Geçersiz Yön (`INVALID_STRUCTURAL_STOP_DIRECTION`):** **7 Fırsat (%10.6)**
  * M15 geçmişinde teyitli bir swing bulunmuş; ancak swing fiyatı referans fiyatın yanlış tarafında kalmıştır (Örn: Long için swing dibinin giriş fiyatının üstünde kalması).

### Aşama 1'de Doldurulan 32 İşlem (`ENTRY_FILLED`) Üzerindeki Dağılım:
* **Güvenilir Yapısal Stop Bulunan:** **25 İşlem (%78.1)**
* **Yetersiz M15 Verisi Nedeniyle Dışarıda Kalan:** **5 İşlem (%15.6)** (2 USDJPY, 3 USDCAD)
* **Yön Uyuşmazlığı Nedeniyle Dışarıda Kalan:** **2 İşlem (%6.3)** (1 XAUUSD, 1 GBPUSD)

---

## 2. `brokenSwing.price` Referansının Reddedilme Gerekçesi

ChecklistTrigger mimarisinde `poi.relatedEvent.brokenSwing` alanı, kırılımı başlatan koruyucu pivotu değil, **hareketin kırdığı karşı tepe/dibi** ifade eder:
* **Bullish BOS (LONG):** Kırılan seviye önceki bir **Swing High**'dır (fiyatın üstündedir). Stop olarak kullanıldığında `Stop > Entry` olmakta ve pozisyon açıldığı anda zararda kapanmaktadır.
* **Bearish BOS (SHORT):** Kırılan seviye önceki bir **Swing Low**'dır (fiyatın altındadır). Stop olarak kullanıldığında `Stop < Entry` olmakta ve kural ihlali oluşmaktadır.

Bu nedenle `brokenSwing.price` kalıcı olarak koruyucu Stop Loss adaylığından çıkarılmıştır.

---

## 3. M15 Başlangıç Swing Tespiti ve Sıfır Sızıntı (No-Lookahead) Metodolojisi

M15 grafiğinde başlangıç swing noktasının tespiti, `swing-bos-core/src/swingDetector.ts` içindeki katı 5 barlık fraktal kuralına ve nedensellik ilkesine dayandırılmıştır:

### Fraktal Swing Kuralları:
1. **Swing High:** `high[i] > high[i-1]`, `high[i] > high[i-2]`, `high[i] > high[i+1]` ve `high[i] > high[i+2]`.
2. **Swing Low:** `low[i] < low[i-1]`, `low[i] < low[i-2]`, `low[i] < low[i+1]` ve `low[i] < low[i+2]`.
3. **Eşitlik Yasağı:** Eşit tepe veya eşit dip durumları kesinlikle swing sayılmaz (katı eşitsizlik `>` ve `<`).

### Sıfır Gelecek Sızıntısı Koruması (Zero-Lookahead):
* Bir swing $i$ indeksinde oluşur (`formedAtIndex = i`); fakat fraktal tanımı gereği ancak $i+2$ mumunun **kapanışında** teyit edilebilir (`confirmedAtIndex = i + 2`).
* Bir 15M mumu açık kaldığı sürece kapanmamıştır. Mumun kapanış zamanı `candle[i+2].timestamp + 15 dakika`dır.
* **Katı Koşul:** Sadece $\text{confirmed\_timestamp} \le \text{signal\_known\_timestamp}$ şartını sağlayan swing'ler karara dahil edilmiştir. Sinyal anında henüz $i+2$ kapanışı gelmemiş hiçbir swing geriye dönük kullanılmamıştır.

### Yapısal Yön Kriteri:
* **LONG:** Koruyucu swing bir `SWING_LOW` olmalıdır. BOS kırılımından önce oluşmuş en güncel teyitli dip seçilir. Fiyatı kesinlikle giriş seviyesinin altında olmalıdır (`stop_price < entry_price`).
* **SHORT:** Koruyucu swing bir `SWING_HIGH` olmalıdır. BOS kırılımından önce oluşmuş en güncel teyitli tepe seçilir. Fiyatı kesinlikle giriş seviyesinin üstünde olmalıdır (`stop_price > entry_price`).

---

## 4. 66 Fırsatın Sembol Bazında Denetim Sonuçları

| Sembol | Toplam Fırsat | VERIFIED_STRUCTURAL_STOP | INSUFFICIENT_DATA | INVALID_DIRECTION | Doğrulama Oranı |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **XAUUSD** | 25 | 23 | 0 | 2 | %92.0 |
| **ETHUSD** | 12 | 11 | 0 | 1 | %91.7 |
| **SOLUSD** | 12 | 10 | 0 | 2 | %83.3 |
| **GBPUSD** | 4 | 3 | 0 | 1 | %75.0 |
| **EURUSD** | 3 | 2 | 0 | 1 | %66.7 |
| **USDJPY** | 6 | 0 | 6 (M15 Yok) | 0 | %0.0 |
| **USDCAD** | 4 | 0 | 4 (M15 Yok) | 0 | %0.0 |
| **GENEL TOPLAM** | **66** | **49** | **10** | **7** | **%74.2** |

---

## 5. Dışarıda Kalan Fırsatların Detaylı Listesi

### A. Yetersiz M15 Verisi Nedeniyle Dışarıda Kalanlar (10 Fırsat):
Bu fırsatların sinyal zamanı Ağustos–Eylül 2026 aralığındadır; ancak diskteki `*15m.json` dosyaları yalnızca Ekim 2026 veya Eylül 2026 başındaki kısa 500 barlık pencereleri içermektedir.

| Sembol | Fırsat / Sinyal Kimliği | Yön | Aşama 1 Durumu | Sinyal Zamanı (UTC) | Hata Nedeni |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **USDJPY** | `USDJPY_15m_OB_1787289300000_1787290200000` | Short | ENTRY_FILLED | 2026-08-21 05:30:00 | Yerel 1 yıllık M15 verisi eksik |
| **USDJPY** | `USDJPY_15m_FVG_1787290200000_1787290200000` | Short | ENTRY_FILLED | 2026-08-21 05:30:00 | Yerel 1 yıllık M15 verisi eksik |
| **USDCAD** | `USDCAD_15m_OB_1787314500000_1787315400000` | Long | ENTRY_FILLED | 2026-08-21 12:30:00 | Yerel 1 yıllık M15 verisi eksik |
| **USDCAD** | `USDCAD_15m_FVG_1787528700000_1787528700000` | Long | ENTRY_FILLED | 2026-08-23 23:45:00 | Yerel 1 yıllık M15 verisi eksik |
| **USDJPY** | `USDJPY_15m_OB_1788240600000_1788242400000` | Long | INVALIDATED | 2026-09-01 06:00:00 | Yerel 1 yıllık M15 verisi eksik |
| **USDJPY** | `USDJPY_15m_OB_1788411600000_1788414300000` | Short | INVALIDATED | 2026-09-03 05:45:00 | Yerel 1 yıllık M15 verisi eksik |
| **USDJPY** | `USDJPY_15m_OB_1788875100000_1788905700000` | Short | INVALIDATED | 2026-09-08 22:15:00 | Yerel 1 yıllık M15 verisi eksik |
| **USDCAD** | `USDCAD_15m_FVG_1789581600000_1789581600000` | Long | INVALIDATED | 2026-09-16 18:00:00 | Yerel 1 yıllık M15 verisi eksik |
| **USDCAD** | `USDCAD_15m_FVG_1789944300000_1789967700000` | Long | ENTRY_FILLED | 2026-09-21 05:15:00 | Yerel 1 yıllık M15 verisi eksik |
| **USDJPY** | `USDJPY_15m_OB_1789996500000_1789998300000` | Long | INVALIDATED | 2026-09-21 13:45:00 | Yerel 1 yıllık M15 verisi eksik |

### B. Yön Uyuşmazlığı Nedeniyle Dışarıda Kalanlar (7 Fırsat):
Bu fırsatlarda teyitli swing bulunmuş; ancak giriş veya POI referans seviyesinin yanlış tarafında kaldığı tespit edilmiştir.

| Sembol | Fırsat Kimliği | Yön | Aşama 1 Durumu | Referans / Giriş | Swing Fiyatı | Gerekçe |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **XAUUSD** | `XAUUSD_15m_OB_1787283000000_1787285700000` | Long | **ENTRY_FILLED** | 4526.155 | 4526.730 | Long işlemde swing dibi girişin üstünde kaldı (`SL > Entry`) |
| **GBPUSD** | `GBPUSD_15m_OB_1789641900000_1789642800000` | Short | **ENTRY_FILLED** | 1.340285 | 1.339930 | Short işlemde swing tepesi girişin altında kaldı (`SL < Entry`) |
| **SOLUSD** | `SOLUSD_15m_OB_1787314500000_1787397300000` | Long | EXPIRED | 90.180 | 91.340 | POI tabanının üstünde swing dibi |
| **SOLUSD** | `SOLUSD_15m_FVG_1787315400000_1787397300000` | Long | NO_ENTRY | 90.460 | 91.340 | POI tabanının üstünde swing dibi |
| **XAUUSD** | `XAUUSD_15m_OB_1787130900000_1787133600000` | Long | INVALIDATED | 4354.073 | 4354.073 | Stop ile referans eşit ($Risk = 0$) |
| **EURUSD** | `EURUSD_15m_OB_1787928300000_1787932800000` | Short | INVALIDATED | 1.162260 | 1.162260 | Stop ile referans eşit ($Risk = 0$) |
| **ETHUSD** | `ETHUSD_15m_OB_1790848800000_1790851500000` | Long | INVALIDATED | 2677.000 | 2677.000 | Stop ile referans eşit ($Risk = 0$) |

---

## 6. Dolan 25 İşlem İçin Doğrulanan Yapısal Stoplar

Aşama 1'de dolan ve yapısal stopu başarıyla doğrulanan 25 işlemin parametreleri:

| Sembol | Sinyal Kimliği | Yön | Giriş Fiyatı | Doğrulanan Stop | Risk Mesafesi | Swing Oluşum (UTC) | Swing Teyit (UTC) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **XAUUSD** | `XAUUSD_15m_OB_1787095800000` | Long | 4334.390 | **4331.897** | 2.493 | 2026-08-18 22:00 | 2026-08-18 22:45 |
| **XAUUSD** | `XAUUSD_15m_OB_1787102100000` | Long | 4334.390 | **4327.506** | 6.884 | 2026-08-18 23:30 | 2026-08-19 00:15 |
| **XAUUSD** | `XAUUSD_15m_FVG_1787103000000` | Long | 4334.390 | **4327.506** | 6.884 | 2026-08-18 23:30 | 2026-08-19 00:15 |
| **ETHUSD** | `ETHUSD_15m_OB_1787119200000` | Long | 1910.595 | **1887.350** | 23.245 | 2026-08-19 03:00 | 2026-08-19 03:45 |
| **ETHUSD** | `ETHUSD_15m_FVG_1787119200000` | Long | 1910.595 | **1887.350** | 23.245 | 2026-08-19 03:00 | 2026-08-19 03:45 |
| **SOLUSD** | `SOLUSD_15m_OB_1787158800000` | Long | 88.580 | **87.210** | 1.370 | 2026-08-19 12:45 | 2026-08-19 13:30 |
| **SOLUSD** | `SOLUSD_15m_FVG_1787159700000` | Long | 88.580 | **87.210** | 1.370 | 2026-08-19 12:45 | 2026-08-19 13:30 |
| **XAUUSD** | `XAUUSD_15m_OB_1787679000000` | Long | 4516.480 | **4506.702** | 9.778 | 2026-08-25 14:45 | 2026-08-25 15:30 |
| **XAUUSD** | `XAUUSD_15m_OB_1787680800000` | Long | 4514.860 | **4506.702** | 8.158 | 2026-08-25 14:45 | 2026-08-25 15:30 |
| **XAUUSD** | `XAUUSD_15m_FVG_1787683500000` | Long | 4514.860 | **4506.702** | 8.158 | 2026-08-25 14:45 | 2026-08-25 15:30 |
| **GBPUSD** | `GBPUSD_15m_OB_1788523200000` | Long | 1.353380 | **1.351050** | 0.00233 | 2026-09-04 11:15 | 2026-09-04 12:00 |
| **GBPUSD** | `GBPUSD_15m_FVG_1788523200000` | Long | 1.353380 | **1.351050** | 0.00233 | 2026-09-04 11:15 | 2026-09-04 12:00 |
| **XAUUSD** | `XAUUSD_15m_OB_1788960300000` | Long | 4339.290 | **4314.920** | 24.370 | 2026-09-09 10:45 | 2026-09-09 11:30 |
| **XAUUSD** | `XAUUSD_15m_OB_1789123200000` | Long | 4336.565 | **4318.528** | 18.037 | 2026-09-11 08:30 | 2026-09-11 09:15 |
| **XAUUSD** | `XAUUSD_15m_FVG_1789124100000` | Long | 4336.565 | **4318.528** | 18.037 | 2026-09-11 08:30 | 2026-09-11 09:15 |
| **XAUUSD** | `XAUUSD_15m_OB_1790159400000` | Long | 4257.655 | **4243.684** | 13.971 | 2026-09-23 08:45 | 2026-09-23 09:30 |
| **XAUUSD** | `XAUUSD_15m_FVG_1790160300000` | Long | 4257.655 | **4243.684** | 13.971 | 2026-09-23 08:45 | 2026-09-23 09:30 |
| **XAUUSD** | `XAUUSD_15m_OB_1790757000000` | Long | 4172.960 | **4158.468** | 14.492 | 2026-09-30 06:15 | 2026-09-30 07:00 |
| **ETHUSD** | `ETHUSD_15m_OB_1790873100000` | Long | 2696.090 | **2685.200** | 10.890 | 2026-10-01 15:45 | 2026-10-01 16:30 |
| **ETHUSD** | `ETHUSD_15m_FVG_1790873100000` | Long | 2696.090 | **2685.200** | 10.890 | 2026-10-01 15:45 | 2026-10-01 16:30 |
| **ETHUSD** | `ETHUSD_15m_OB_1791117000000` | Long | 2758.300 | **2722.500** | 35.800 | 2026-10-04 11:30 | 2026-10-04 12:15 |
| **ETHUSD** | `ETHUSD_15m_FVG_1791117000000` | Long | 2758.300 | **2722.500** | 35.800 | 2026-10-04 11:30 | 2026-10-04 12:15 |
| **XAUUSD** | `XAUUSD_15m_OB_1791219600000` | Long | 4137.805 | **4125.818** | 11.987 | 2026-10-05 12:30 | 2026-10-05 13:15 |
| **XAUUSD** | `XAUUSD_15m_OB_1791265500000` | Long | 4128.820 | **4120.400** | 8.420 | 2026-10-06 01:15 | 2026-10-06 02:00 |
| **XAUUSD** | `XAUUSD_15m_FVG_1791266400000` | Long | 4128.820 | **4120.400** | 8.420 | 2026-10-06 01:15 | 2026-10-06 02:00 |

*Tüm 25 işlemde stop seviyesi girişin altındadır (`stop < entry`) ve risk mesafesi pozitiftir.*

---

## 7. Alternatif Model: POI Sınırını Stop Kabul Eden Varyant (`VARIANT_POI_BOUNDARY_STOP`)

Kullanıcının 7. maddede belirttiği üzere, bu model **ayrı bir araştırma varyantı** olarak tanımlanmıştır ve ana modelin yerine sessizce konulmamıştır.

### Tanım:
* **Long Pozisyon:** $Stop = \text{zone\_low}$ (OB tabanı veya FVG alt sınırı)
* **Short Pozisyon:** $Stop = \text{zone\_high}$ (OB tavanı veya FVG üst sınırı)

### Karşılaştırmalı Analiz:

| Metrik | Ana Model: M15 Originating Swing | Alternatif Varyant: POI Sınırı (Zone Boundary) |
| :--- | :--- | :--- |
| **Veri Gereksinimi** | Geçmiş 1 yıllık M15 fraktal serisi zorunlu | Yalnızca sinyal kütüğündeki POI sınırları yeterli |
| **USDJPY & USDCAD Kapsamı** | 0 / 10 (%0) - Veri eksikliği nedeniyle reddedildi | 10 / 10 (%100) - Sinyal anında POI sınırları hazır |
| **66 Fırsat Kapsamı** | 49 / 66 (%74.2) | 66 / 66 (%100.0) |
| **32 Dolum Kapsamı** | 25 / 32 (%78.1) | 32 / 32 (%100.0) |
| **Ortalama Risk Mesafesi** | Daha geniş (yapısal dip/tepe korumalı) | Daha dar (yalnızca POI kutusu korumalı) |
| **Wick-out (Fitille Patlama) Riski** | Düşük (yapısal swing daha uzakta) | Yüksek (fitil POI altını süpürüp dönebilir) |

> [!NOTE]
> Alternatif model `USDJPY` ve `USDCAD` veri boşluğunu tamamen baypas edebilme avantajına sahiptir; ancak Aşama 2 çıkış testinde iki modelin R dağılımları ve stop olma oranları **ayrı simülasyon kolları** olarak koşturulmalıdır.

---

## 8. Birim Test Paketi ve Doğrulama

Yeni oluşturulan `Begonya/research/hybrid_replay/test_structural_stop.py` test modülü aşağıdaki 6 senaryoyu başarıyla geçmiştir:

```text
Ran 6 tests in 0.000s
OK
```

1. `test_valid_long_structural_stop`: Long yönünde Stop < Giriş ve teyit zamanı $\le$ sinyal zamanı doğrulaması.
2. `test_valid_short_structural_stop`: Short yönünde Stop > Giriş ve teyit zamanı $\le$ sinyal zamanı doğrulaması.
3. `test_wrong_side_stop_detection`: Girişin yanlış tarafında kalan swing durumunda `INVALID_STRUCTURAL_STOP_DIRECTION` üretimi.
4. `test_lookahead_prevention_unconfirmed_swing`: Sinyal zamanından sonra teyit edilen fraktal swing'lerin kesinlikle sıfır döndürülmesi (Lookahead engeli).
5. `test_insufficient_m15_history`: 5 bardan az veri durumunda `INSUFFICIENT_DATA_STRUCTURAL_STOP` üretimi.
6. `test_alternative_poi_boundary_stop_model`: Alternatif POI sınır modelinin matematiksel mesafe ve yön doğrulaması.

---

## 9. Sonuç ve Aşama 2 (Çıkış Simülasyonu) Önerisi

1. **25 Temiz İşlem Örneklemi Hazır:** Ana M15 yapısal stop modeli ile dolan 32 işlemden 25'i hem giriş teyidi hem de koruyucu yapısal stop açısından **tamamen doğrulanmış** ve nedensel olarak kilitlenmiştir.
2. **Dışarıda Kalan 7 İşlem İçin Karar:** 
   - 5 işlem (2 USDJPY, 3 USDCAD) veri eksikliği nedeniyle ana modelde `INSUFFICIENT_DATA_STRUCTURAL_STOP` olarak dışarıda bırakılmıştır.
   - 2 işlem (1 XAUUSD, 1 GBPUSD) yön uyuşmazlığı nedeniyle `INVALID_STRUCTURAL_STOP_DIRECTION` olarak dışarıda bırakılmıştır.
   - Bu 7 işlem, ancak kullanıcı onay verirse `VARIANT_POI_BOUNDARY_STOP` kapsamında alternatif modelde değerlendirilebilir; ana modele zorla dahil edilmeyecektir.
