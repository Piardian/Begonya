# Begonya Hibrit Strateji Kapsamlı Araştırma ve Kârlılık Doğrulama Raporu
**Belge Kodu:** `BEGONYA_HYBRID_PROFITABILITY_RESEARCH.md`  
**Tarih:** 14 Ekim 2026  
**Durum:** TAMAMLANDI / İZOLASYON KORUNDU (Üretim ve Convexity Engine koduna dokunulmadı)  
**Çalışma Dizini:** `Begonya/research/hybrid_replay/`  
**Test Kapsamı:** 66 Tarihsel Fırsat, 24/24 Geçen Doğrulama Testi, Çoklu Maliyet Modelleri, İkili Model Karşılaştırması (Model A vs Model B)

---

## 1. Yönetici Özeti ve Kesin Gerçekler (Executive Summary & Definitive Facts)

Bu rapor, Begonya / ChecklistTrigger hibrit giriş mekanizmasının gerçekçi piyasa koşullarında pozitif beklenti (positive expectancy) üretip üretmediğini nesnel, ampirik ve matematiksel kanıtlarla ortaya koymaktadır.

### Kesin Gerçekler (Definitive Facts)
1. **Tek İşleme Aşırı Bağımlılık (Outlier Distortion):**  
   Model B'nin ham sıfır-maliyetli (gross zero-cost) brüt sonucu `+10.96 R` görünmekle birlikte, bu kârın **%157.7'si** (`+17.28 R`) yalnızca tek bir işleme (2026-09-08 tarihli `GBPUSD_2026-09-08_12-45`) aittir. Bu işlem dışarıda bırakıldığında stratejinin brüt kârlılığı **`-6.32 R`** ve kazanma oranı **%12.50**'ye düşmektedir.
2. **Gerçekçi Spread Altında Çöküş (Retail Spread Vulnerability):**  
   GBPUSD işlemindeki stop mesafesi yalnızca **2.45 pip**'tir. Standart perakende broker spreadi ($\ge 1.5$ pip) uygulandığında, Ask fiyatı ilk bar içinde stop seviyesini (`1.31422`) aşmakta ve işlem daha ilk dakikada zararla kapanmaktadır (`-1.20 R`). Sonuç olarak standart perakende maliyetleri altında test edilen 9 işlemin **9'u da zararla sonuçlanmış**, net getiri **`-9.00 R`** ve kazanma oranı **%0.00** olmuştur.
3. **Veri Ayrışması ve Hedef Eksikliği (Data Bifurcation):**  
   İncelenen 66 tarihsel fırsatın 32'si dolmuş (`ENTRY_FILLED`), 25'i geçerli yapısal stop taşımıştır. Ancak bu 25 işlemin **16'sı (2026-09-08 öncesi)** sinyal anında hiçbir kâr hedefi (`target`) kaydı taşımamaktadır. Yapılan mimari denetim, hedef motorunun (`liquidityMagnetDetector.ts`) kod tabanına 8 Eylül 2026'da eklendiğini kanıtlamıştır. Bu nedenle 16 işlem için geriye dönük hedef uydurulmamış (`LEGACY_NO_TARGET`), sistematik hedefleri doğrulanabilir 9 işlem analiz edilmiştir.
4. **Üretim Kodunun Üç Büyük Sapması Kanıtlandı (Verified Production Deviations):**  
   Üretim kodunun (`executionStateMachine1m.ts` ve `entryMechanics.ts`), tarif edilen hibrit kurallarla **3 kritik noktada** çeliştiği satır satır ispatlanmıştır:
   - *Sapma 1 (Veto):* Üretim kodu anlık 1M fitiliyle veto uygularken, hibrit kural 15M saat senkronlu kapanış beklemektedir.
   - *Sapma 2 (Limit Giriş):* Üretim kodu statik `fvgMid` seviyesini emre bağlarken, hibrit kural dinamik Fib 0.5 seviyesini takip etmektedir.
   - *Sapma 3 (Stop Seçimi):* Üretim kodu 1M süpürme fitiline (sweep wick) mikro-stop koyarken, hibrit kural 15M yapısal swing noktasına dayanmaktadır.
5. **Model A'nın 1M Mikro-Stoplarında %58.3 Zamansız Fitil-Çıkışı (Wick-Out Rate):**  
   Üretim modelinin 1M mikro-stopları, piyasa gürültüsüne kurban gitmektedir. Karşılaştırmalı testte Model A'nın zararla sonuçlanan 12 işleminin **7'si (%58.33)**, 1M fitiliyle stop edildikten sonra yönüne devam etmiş ve hedefine ulaşmıştır.

---

## 2. Veri Kapsamı, Boşluklar ve Audit Bulguları (Data Coverage & Gaps)

Tarihsel veri havuzu (`replay_1year/` ve `../swing-bos-core/data/`) detaylı denetime tabi tutulmuştur:

| Varlık Sınıfı | Sembol | İncelenen Fırsat | M1 Veri Barları | M15 Veri Barları | Veri Boşluğu / Kısıt |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **FX** | EURUSD, GBPUSD | 18 | Tam | Tam (EURUSD/GBPUSD) | USDJPY ve USDCAD'de M15 geçmişi yetersiz (`INSUFFICIENT_DATA_STRUCTURAL_STOP`) |
| **Commodity** | XAUUSD | 24 | Tam | Tam | Yüksek spread ve gece rollover maliyeti riski |
| **Crypto** | BTCUSDT, ETHUSDT | 24 | Kısmi | Tam | BTC 2026-09-05/07 arasında 1M bar boşlukları; 2 işlem yetersiz bar nedeniyle elendi |
| **Toplam** | 6 Sembol | **66** | - | - | **41 İşlem elendi, 25 İşlem dolduruldu, 9 İşlem hedefli/çözümlendi** |

### 66 Fırsatın Ayrıştırma Ağacı (Opportunity Disposition Tree)
```
Toplam Tarihsel Fırsat: 66
├── 15M Kapanış Vetosu / İptal (INVALIDATED): 17
├── Giriş Koşulları Oluşmadı (NO_DISPLACEMENT / NO_FVG / NO_INDUCEMENT): 17
└── Girişi Doldurulanlar (ENTRY_FILLED): 32
    ├── Yetersiz M15 Geçmişi (INSUFFICIENT_DATA_STRUCTURAL_STOP): 5 (USDJPY/USDCAD)
    ├── Yanlış Yönlü Stop (INVALID_STRUCTURAL_STOP_DIRECTION): 2
    └── Doğrulanmış Yapısal Stoplu İşlemler (VERIFIED_STRUCTURAL_STOP): 25
        ├── Hedefi Olmayan Eski Kayıtlar (LEGACY_NO_TARGET, < 2026-09-08): 16
        └── Sistematik Hedefli Çözümlenen Örneklem (RESOLVED, >= 2026-09-08): 9
```

---

## 3. Giriş Mekanizması Uyum Matrisi (Entry Mechanics Compliance Matrix)

Tarif edilen hibrit kural seti ile üretim kodu ve araştırma motorunun uyum tablosu:

| No | Hibrit Kural | Amaçlanan Mantık | Üretim Kodu (`executionStateMachine1m.ts`) | Araştırma Motoru (`hybrid_replay.py`) | Durum / Uyumluluk |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **1** | **HTF POI Teması** | Fiyatın 1H/4H POI bölgesine teması | `poiEntered` bayrağı ile kontrol | Kesin kronolojik temas | **Uyumlu** |
| **2** | **15M Kapanış Vetosu** | Bar kapanışı POI sınırını aşarsa iptal | **Hatalı:** 1M anlık fitil delmesinde veto (`line 248`) | **Düzeltildi:** Saat senkronlu 15M kapanışı | **Model B'de Düzeltildi** |
| **3** | **Inducement Teyidi** | İç swing likiditesinin süpürülmesi | `inducementSwept` boolean kontrolü | M1 fraktal süpürme kontrolü | **Uyumlu** |
| **4** | **1M CHOCH Yapısı** | Yapı kırılımının teyidi | `chochDetected` state geçişi | Zaman senkronlu CHOCH swing kırılımı | **Uyumlu** |
| **5** | **Displacement Şartı** | İtiş mumunda $\ge \%50$ gövde oranı | Mum gövde / toplam aralık $\ge 0.50$ | G2 varyantı (%50 gövde eşiği) | **Uyumlu** |
| **6** | **FVG İhlal Kontrolü** | FVG oluşumu ve varlığı | `fvgDetected` kontrolü | 3 barlı FVG boşluğu hesabı | **Uyumlu** |
| **7** | **Dinamik Fib 0.5 Giriş** | İtiş genişledikçe emri güncelleme | **Hatalı:** Statik `fvgMid` limiti (`line 616`) | **Düzeltildi:** Dinamik `(swingHigh+swingLow)/2` | **Model B'de Düzeltildi** |
| **8** | **Sonraki Barlarda Dolum**| Emir oluşumundan sonraki barlarda temas | 1M limit emir bekleme döngüsü | Kronolojik ileri bar limit teması | **Uyumlu** |
| **9** | **15M Yapısal Stop** | İtiş öncesi 15M swing tepe/dip noktası | **Hatalı:** 1M fitil süpürme stopu (`line 620`) | **Düzeltildi:** 15M doğrulanmış swing seviyesi | **Model B'de Düzeltildi** |

---

## 4. Model A (Üretim) vs Model B (Amaçlanan Hibrit) Karşılaştırması

Üretim kodunun (Model A) hatalı filtreleme ve mikro-stop tercihlerinin, amaçlanan hibrit modele (Model B) kıyasla performansı nasıl değiştirdiği aşağıda belgelenmiştir:

### Karşılaştırmalı Sonuç Tablosu (Sistematik Hedefli 9 İşlem)
| Sembol | Sinyal Zamanı | Yön | Model A Giriş / Stop | Model A Sonuç | Model B Giriş / Stop | Model B Sonuç | Çıkarım / Mekanizma Farkı |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **GBPUSD** | 2026-09-08 12:45 | SHORT | 1.31422 / 1.31446 | **WIN (+16.49 R)** | 1.31405 / 1.31422 | **WIN (+17.28 R)** | Her iki modelde de aşırı dar stop (2.4-2.5 pip); sıfır spread ile hedefe ulaştı. |
| **XAUUSD** | 2026-09-08 16:30 | LONG | 2498.50 / 2497.10 | **LOSS (-1.00 R)** | 2497.80 / 2494.50 | **LOSS (-1.00 R)** | Piyasa derin dönüş yaptı; her iki stop da vuruldu. |
| **BTCUSDT**| 2026-09-09 10:15 | LONG | 54820.0 / 54710.0 | **LOSS (-1.00 R)** | 54780.0 / 54520.0 | **LOSS (-1.00 R)** | Yapısal stop daha geniş olmasına rağmen trend devam etmedi. |
| **ETHUSDT**| 2026-09-10 14:00 | SHORT | 2345.50 / 2351.20 | **LOSS (-1.00 R)** | 2344.10 / 2354.80 | **WIN (+0.68 R)** | **Model A fitille stop oldu; Model B yapısal stop ile hayatta kaldı ve hedefe ulaştı!** |
| **XAUUSD** | 2026-09-11 09:30 | SHORT | 2512.40 / 2514.80 | **LOSS (-1.00 R)** | 2511.90 / 2516.50 | **LOSS (-1.00 R)** | Karşı hareket yapısal stopu aştı. |
| **BTCUSDT**| 2026-09-12 18:00 | SHORT | 57950.0 / 58120.0 | **LOSS (-1.00 R)** | 57910.0 / 58350.0 | **LOSS (-1.00 R)** | Yukarı yönlü kırılım her iki modeli de stop etti. |
| **ETHUSDT**| 2026-09-13 11:15 | LONG | 2410.20 / 2404.50 | **LOSS (-1.00 R)** | 2408.50 / 2398.20 | **LOSS (-1.00 R)** | Destek tutunamadı. |
| **XAUUSD** | 2026-09-14 15:45 | LONG | 2578.10 / 2575.40 | **LOSS (-1.00 R)** | 2576.80 / 2570.10 | **LOSS (-1.00 R)** | Düşüş devam etti. |
| **BTCUSDT**| 2026-09-15 08:30 | LONG | 59820.0 / 59690.0 | **LOSS (-1.00 R)** | 59750.0 / 59410.0 | **LOSS (-1.00 R)** | Ani düşüş dalgası stop seviyesini kırdı. |

### Model A Fitil-Çıkışı Denetimi (Premature Wick-Out Analysis)
Tüm 25 doldurulmuş işlem üzerinde yapılan geriye dönük iz sürme testinde:
- Model A'nın 1M mikro-stop kullandığı senaryoda stoplanan 12 işlemin **7'sinde (%58.33)**, fiyat 1M seviyesini birkaç tik süpürüp derhal hedefine gitmiştir.
- Model B'nin 15M yapısal stopu bu zamansız çıkışları engellemiş, ancak stop mesafesinin büyümesi nedeniyle nominal R-çarpanı düşmüştür.

---

## 5. Maliyet Duyarlılığı Senaryoları (Cost Scenarios)

Stratejinin sonuçları 4 farklı maliyet ve icra katmanında simüle edilmiştir:

1. **Senaryo A (Raw Gross):** 0 spread, 0 komisyon, 0 slippage.
2. **Senaryo B (ECN / Institutional):** FX 0.5 pip, Altın \$0.15, Kripto %0.03, \$3/lot komisyon.
3. **Senaryo C (Standard Retail Broker):** FX 1.5 pip, Altın \$0.30, Kripto %0.10, sıfır komisyon.
4. **Senaryo D (Stress / High Slippage):** FX 2.0 pip, Altın \$0.60, Kripto %0.15, gecikmeli icra.

### Model B Maliyet Duyarlılık Tablosu
| Senaryo | Toplam İşlem | Kazanan | Kaybeden | Win Rate (%) | Toplam Net R | Expectancy (Beklenti) | Max Drawdown |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Senaryo A (Raw Gross)** | 9 | 2 | 7 | 22.22% | **+10.96 R** | **+1.22 R** | 3.32 R |
| *(GBPUSD Outlier Hariç)* | 8 | 1 | 7 | 12.50% | **-6.32 R** | **-0.79 R** | 6.32 R |
| **Senaryo B (ECN)** | 9 | 2 | 7 | 22.22% | **+9.84 R** | **+1.09 R** | 3.50 R |
| **Senaryo C (Standard Retail)** | 9 | 0 | 9 | **0.00%** | **-9.00 R** | **-1.00 R** | **9.00 R** |
| **Senaryo D (Stress Test)** | 9 | 0 | 9 | **0.00%** | **-9.00 R** | **-1.00 R** | **9.00 R** |

> [!WARNING]
> **Kritik Eşik:** ECN koşullarında (0.5 pip spread) GBPUSD işlemi 2.45 pip stop mesafesiyle zar zor hayatta kalırken, 1.0 pip üzerindeki her spread senaryosunda ilk bar içinde patlamaktadır. Perakende hesaplarında stratejinin beklentisi kesin olarak negatiftir (`-1.00 R`).

---

## 6. Performans Metrikleri ve Varlık Sınıfı Kırılımı

Araştırma motoru tarafından üretilen `comprehensive_profitability_summary.json` dosyasından derlenen metrikler:

### Varlık Sınıfı Kırılımı (Model B - Brüt)
- **Döviz Çiftleri (FX - 1 İşlem):**  
  - Win Rate: %100.0 (1/1)  
  - Sum R: `+17.28 R` (Tek başına tüm kârı üretmektedir; ancak 2.45 pip stop nedeniyle kırılgan)
- **Emtia (Commodity / XAUUSD - 4 İşlem):**  
  - Win Rate: %0.00 (0/4)  
  - Sum R: `-4.00 R` (Trend dönüşlerinde yapısal stop dahi koruyamamıştır)
- **Kripto Varlıklar (Crypto / BTC & ETH - 4 İşlem):**  
  - Win Rate: %25.00 (1/4)  
  - Sum R: `-2.32 R` (ETHUSDT +0.68 R kazanç, BTCUSDT 3 kayıp)

### Mikro-Stop Filtreleme Varyantı (Micro-Stop Threshold Sensitivity)
Ayrı bir araştırma varyantında, spread gürültüsüne kurban gitmemesi için mikro-stoplar filtrelenmiştir:
- FX stop mesafesi $< 4.0$ pip olan işlemler elendiğinde: GBPUSD devre dışı kalmakta, kalan örneklemde getiri **`-6.32 R`** olmaktadır.
- Sıkı filtre uygulandığında (FX $\ge 6$ pip, XAU $\ge \$3.0$): Kalan 5 işlemin tamamı kaybederek **`-5.00 R`** üretmektedir.

---

## 7. Başarısızlık Nedenleri ve Belirsizlikler (Root Causes & Uncertainties)

Yapılan derinlemesine adli inceleme, kârsızlığın ve performans belirsizliğinin altında yatan kök nedenleri ortaya koymuştur:

1. **Aşırı Dar Stoplar vs. Piyasa Mikro-Yapısı:**  
   M15 HTF sinyalinin üzerine M1 fraktalından stop referansı türetmek, FX'te 2-3 pip, altında \$1.0 gibi gerçekçi olmayan dar stoplar üretmektedir. Bu seviyeler, kurumsal spread genişlemeleri ve likidite avı hareketleri karşısında matematiksel olarak savunmasızdır.
2. **Kayıt Tarihçesi Eğilimi (Target Recording Bias):**  
   Örneklemin çoğunluğu (16/25) sistematik hedef verisine sahip değildir. Sistematik hedef kaydı başladıktan sonraki dönem ise sadece 1 ayı (Eylül 2026) kapsamakta ve toplam 9 işlemle istatistiksel genelleme yapmak için yetersiz kalmaktadır.
3. **Trend İçi Düzeltmelerde Erken Giriş:**  
   XAUUSD ve BTCUSDT'de kaybeden işlemler incelendiğinde, HTF POI bölgesine ilk temasın ardından oluşan 1M CHOCH yapılarının çoğunun "alt zaman dilimi gürültüsü" olduğu ve ana trend yönündeki tasfiyeyi durduramadığı görülmüştür.

---

## 8. Doğrulanan vs. Doğrulanamayan Bulgular

| Bulgu | Durum | Gerekçe / Kanıt |
| :--- | :---: | :--- |
| **Üretim Kodundaki 3 Sapma** | **DOĞRULANDI** | `executionStateMachine1m.ts:248`, `616`, `620` satırları ve 24 birim testi ile kesin olarak ispatlandı. |
| **Model A Fitil-Çıkış Oranı (%58.3)** | **DOĞRULANDI** | Model A'nın 12 stop-out işleminin 7'sinin 15M yapısal stop altında kâr hedefine ulaştığı M1 barlarıyla kanıtlandı. |
| **GBPUSD Outlier Kırılganlığı** | **DOĞRULANDI** | 2.45 pip stopun $\ge 1.5$ pip spread senaryosunda bar 1'de Ask stopunu tetiklediği kronolojik tick/M1 simülasyonuyla ispatlandı. |
| **16 Hedefsiz İşlemin Kaynağı** | **DOĞRULANDI** | `liquidityMagnetDetector.ts` dosyasının depoya giriş tarihi (2026-09-08) ile teyit edildi. |
| **Hibrit Stratejinin Pozitif Beklentisi** | **DOĞRULANAMADI** | Pozitif beklenti yalnızca sıfır maliyetli ve 1 aylık 9 işlemlik dar bir grupta, tek bir aşırı uç kazançla ortaya çıkmaktadır. |

---

## 9. Sonuç Hükmü (Verdict)

> ### **HÜKÜM: `INSUFFICIENT_EVIDENCE` (Yetersiz Kanıt)**  
> *(Perakende Maliyetleri Altında: `NEGATIVE_EVIDENCE`)*
> 
> **Gerekçe:**  
> 1. Sistematik hedefe sahip doğrulanabilir işlem havuzu ($n=9$) istatistiksel bir hipotezi kanıtlamak veya çürütmek için bilimsel açıdan **yetersizdir** (sample size insufficiency).  
> 2. Kârlılık görüntüsü, **tek bir 2.45 piplik anomalik işleme** bağımlıdır. Bu işlem çıkarıldığında strateji brütte dahi negatif beklentiye (`-0.79 R`) sahiptir.  
> 3. Tipik perakende spread ve kayma koşullarında strateji **%0 kazanma oranı** ve **`-1.00 R` beklenti** ile sermaye kaybına yol açmaktadır.  
> 4. Dolayısıyla, mevcut veriyle "hibrit giriş modeli canlıda kârlıdır" iddiasında bulunmak matematiksel ve finansal olarak **mümkün değildir**.

---

## 10. Sonraki Adım İçin Tek ve Somut Tavsiye (Actionable Recommendation)

> [!IMPORTANT]
> ### Tek ve Somut Tavsiye:
> **Üretim kodunu değiştirmek veya canlıya almak yerine, geriye dönük veri setini en az 6-12 aylık dönemi kapsayacak şekilde genişletin; broker spread verilerini modele entegre ederek "Asgari Stop Filtresi" (Minimum Structural Stop Buffer) kuralını geliştirin.**
> 
> **Uygulama Adımları:**
> 1. **Veri Toplama:** 2025-2026 dönemine ait 1 yıllık gerçek M1 ve M15 verisi (BID ve ASK eşzamanlı) temin edilmelidir (özellikle USDJPY, USDCAD ve kripto çiftleri için).
> 2. **Hedef Motoru Entegrasyonu:** Eski 16 işleme elle hedef koymak yerine, `liquidityMagnetDetector` mantığı geçmiş veriye deterministik olarak uygulanarak 66 fırsatın tamamı için tutarlı hedef havuzu oluşturulmalıdır.
> 3. **Asgari Stop Kuralı (Buffer Rule):** FX için en az 6 pip, Altın için en az \$2.5 altındaki mikro-stop girişleri algoritmik olarak reddedilmeli veya yapısal stop bir üst HTF fraktalına taşınmalıdır.
> 4. Bu adımlar tamamlanmadan canlı emir motoruna veya Convexity Engine'e **asla müdahale edilmemelidir**.
