# HYBRID REPLAY VARIANTS & EMPIRICAL COVERAGE SPECIFICATION
## İzole Parametrik Araştırma Tasarımı, Varyant Matrisi ve Veri Kapsama Raporu

**Belge Versiyonu:** 1.0.0-PARAMETRIC  
**Tarih:** 2026-10-14  
**Durum:** Salt Parametrik Araştırma Tasarımı (No Backtest Execution / No Code Changes / No Commit)  
**Temel İlke:** 
* Eşik değerler "kullanıcı tarafından onaylanmış strateji kuralı" olarak sunulmaz; açık araştırma varyantları olarak etiketlenir.
* Varsayımsal çıkış hedefleri (sabit 3R veya keyfi bar süresi) varsayılan kural yapılmaz.
* Sinyal anında bilinmeyen hedefler ve eksik veriler açıkça `UNVERIFIED` / `INSUFFICIENT_DATA` olarak işaretlenir.

---

## 1. Parametrik Araştırma Varyantları Matrisi

Stratejinin hassasiyetini ve kırılganlığını ölçmek amacıyla parametreler tek bir kesin kural olarak değil, 3 eksende varyantlar halinde tanımlanmıştır:

```
                          ┌── G1: %40 Gövde Oranı (Genişletilmiş Filtre)
                          ├── G2: %50 Gövde Oranı (Dengeli Araştırma Eşiği)
1. Giriş İtki Ekseni ─────┼── G3: %60 Gövde Oranı (Katı / Konservatif Eşik)
                          └── G4: Merdiven (Ladder) Displacement [MANUAL_REVIEW_REQUIRED]
                                  (Otomatik başarılı/başarısız sayılmaz)

                          ┌── Ç1: Tarihsel Gerçekleşen Sonuçlar (Yalnızca Benchmark Kohortu)
2. Çıkış Yönetim Ekseni ──┼── Ç2: +1R BE Koruması + Yapısal Likidite Hedefi / İhlal Çıkışı
                          └── Ç3: +1R'da %50 Kısmi Kapama + Kalan Pozisyon BE Koruma

                          ┌── S1: HTF 15M Yapısal Çapa Noktası (Swing High/Low) [Kullanıcı Kuralı]
3. Stop Loss Ekseni ──────┴── S2: 1M Sweep Ekstrem Noktası [Yalnızca Karşılaştırma Amaçlı Alt-Varyant]
```

---

### A. Giriş Varyantları (Gövde Oranı & Merdiven Sınıflaması)

> [!IMPORTANT]
> Aşağıdaki %40, %50 ve %60 gövde eşikleri kullanıcı tarafından kesinleştirilmiş bir strateji kuralı **değildir**; duyarlılık (sensitivity) analizi için oluşturulmuş **araştırma varyantlarıdır**.

* **Varyant G1 (%40 Gövde Oranı - Genişletilmiş İtki):**
  * Kriter: $\frac{|\text{close} - \text{open}|}{\text{high} - \text{low}} \ge 0.40$ ve yönlü kapanış.
  * Amaç: Fitil oranı yüksek ancak momentumu koruyan erken reaksiyonları yakalamak.
* **Varyant G2 (%50 Gövde Oranı - Standart Araştırma Eşiği):**
  * Kriter: $\frac{|\text{close} - \text{open}|}{\text{high} - \text{low}} \ge 0.50$ ve yönlü kapanış.
  * Amaç: Gövdenin mum aralığına tam hakim olduğu klasik kurumsal itkiyi test etmek.
* **Varyant G3 (%60 Gövde Oranı - Katı Filtre):**
  * Kriter: $\frac{|\text{close} - \text{open}|}{\text{high} - \text{low}} \ge 0.60$ ve yönlü kapanış.
  * Amaç: Fitilsiz marubozu tipi çok güçlü itkilerin başarı ve işlem sıklığı etkisini ölçmek.
* **Sınıf G4 (Merdiven / Ladder Displacement - Otomatik Olmayan Sınıf):**
  * Tanım: Tek bir devasa bar yerine ardışık 2-3 bar boyunca küçük gövdelerle basamaklı ilerleyen yapısal kırılımlar.
  * **İşlem Kuralı:** Kesin matematiksel formülü kullanıcı tarafından onaylanmadığı için **otomatik başarılı (WIN) veya başarısız (LOSS) kabul edilmez**. Replay motoru bu durumları `DISPLACEMENT_LADDER_UNVERIFIED` koduyla izole bir havuza ayırır ve `MANUAL_REVIEW_REQUIRED` bayrağı koyar.

---

### B. Çıkış Yönetimi Senaryoları (Exit Scenarios)

> [!WARNING]
> Sabit 3R hedefi veya keyfi bir 120 bar zaman aşımı varsayılan kural **yapılamaz**. Gerçek piyasa defterinde bu sabit kurallar yer almamaktadır.

* **Senaryo Ç1 (Tarihsel Gerçekleşen Sonuçlar - Yalnızca Benchmark Kohortu):**
  * Kural: `benchmark_records.json` içindeki 28 icra edilmiş işlemin operatör tarafından kaydedilen gerçek `realized_r` ve PnL USD değerleri aynen muhafaza edilir.
  * Bu senaryo yeni bir simülasyon değil, tarihsel taban çizgisidir (Ground Truth).
* **Senaryo Ç2 (+1.0R'da Başabaş / BE Koruması):**
  * Kural: Fiyat giriş seviyesinden itibaren $+1.0 \times \text{RiskDistance}$ seviyesine ulaştığında stop derhal giriş fiyatına taşınır (`entryPrice`).
  * Çıkış: Fiyat karşı yapısal likidite hedefine (HTF EQH/EQL veya Swing uç) ulaşana kadar taşınır. Karşı hedef bilinmiyorsa (`UNVERIFIED`) ve fiyatta tersine 15M CHoCH oluşursa işlem piyasa fiyatından kapatılır. Geri çekilirse $0.0\text{R}$ (BE) ile kapanır.
* **Senaryo Ç3 (+1.0R'da %50 Kısmi Kapama + Kalan Pozisyonda BE):**
  * Kural: Fiyat $+1.0\text{R}$ gördüğünde pozisyonun %50'si realize edilir ($+0.5\text{R}$ kâr cebe alınır).
  * Kalan %50 pozisyonun stopu başabaşa çekilir. Kalan lot hedef POI'ye kadar taşınır veya BE ile kapanır (Net getiri: $+0.5\text{R}$ ile hedef R ortalaması).

---

### C. Tarihsel Karşı Likidite Hedeflerinin Bilinirlik Denetimi

Canlı sinyal anında hedef seviyelerin bilinip bilinmediği denetlenmiştir:

* **Bulgu:** `signal_delivery_queue.json` içindeki 66 doğrulanmış fırsatın yalnızca **18 tanesinde (%27.2)** sinyal anında aktif bir likidite mıknatısı (`liquidityMagnet`: EQH/EQL veya BSL/SSL) bulunmaktadır.
* **6 tanesinde (%9.1)** karşı engel (`opposingObstacle`) tespit edilmiştir.
* **Geriye kalan 48 fırsatta (%72.7)** sinyal anında önceden tanımlanmış bir sayısal hedef fiyat **bulunmamaktadır**.
* **Karar:** Karşı hedefi veri tabanında bulunmayan fırsatlar için sabit 3R gibi yapay bir hedef uydurulmayacak; çıkış hedefi alanı **`UNVERIFIED_TARGET_LEVEL`** olarak işaretlenecektir.

---

## 2. Kohort Ayrımı ve Bağımsız Fırsat Doğrulaması

Veriler kesin sınırlarla 3 bağımsız kohortta tutulur:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TÜM VERİ HAVUZU                                 │
└────────────────────────────────────────────────────────────────────────┘
       │                                         │
       ▼                                         ▼
┌──────────────────────────────┐        ┌────────────────────────────────┐
│   BENCHMARK VERİ SETİ        │        │   CLT SEVK EDİLMİŞ KUYRUK      │
│  (benchmark_records.json)    │        │  (signal_delivery_queue.json)  │
└──────────────────────────────┘        └────────────────────────────────┘
       │              │                                  │
       ▼              ▼                                  ▼
┌─────────────┐ ┌─────────────┐                 ┌────────────────┐
│  KOHORT A   │ │  KOHORT B   │                 │    KOHORT C    │
│ 28 Gerçek   │ │ 16 İptal /  │                 │ 66 Doğrulanmış │
│ İcra Edilen │ │ Doldurul-   │                 │ Tekil Fırsat   │
│   İşlem     │ │ mayan POI   │                 │  (3 Aylık M1)  │
└─────────────┘ └─────────────┘                 └────────────────┘
```

1. **Kohort A (Gerçekleşmiş Benchmark İşlemleri - 28 Kayıt):**
   * Eylül – Ekim 2026 döneminde operatör ve bot tarafından piyasada icra edilmiş, makro kapısı dondurulmuş gerçek işlemler.
2. **Kohort B (Doldurulmayan / İptal Olan Benchmark Kayıtları - 16 Kayıt):**
   * Retest vermediği, 1M teyidi gelmediği veya fitil çarpmadığı için açılmamış, sahte kırılımlardan koruyan adaylar.
3. **Kohort C (Doğrulanmış Bağımsız CLT Fırsatları - 66 Fırsat):**
   * CLT kuyruğundaki 156 sevk kaydı incelenmiş; aynı yapısal dalganın birden fazla kaydı (aynı anda OB + FVG) tekil `dedupeKey` ile birleştirilmiş ve M1 zaman penceresine tam denk gelen **net 66 bağımsız fırsat** doğrulanmıştır.

---

## 3. Sembol Bazında Veri Kapsama Tablosu (Empirical Coverage Table)

Aşağıdaki tablo; 66 bağımsız fırsatın sembol bazında M1 bar aralığını, HTF sinyal zamanını, yapısal stop verisini ve maliyet kapsamını eksiksiz olarak doğrulamaktadır:

| Sembol | Bağımsız Tekil Fırsat | M1 Bar Sayısı | M1 Başlangıç – Bitiş Tarihi | HTF Sinyal Tarih Aralığı | Yapısal Stop Verisi (`brokenSwing`) | Karşı Hedef Verisi (`liquidityMagnet`) | Maliyet Kapsamı (Spread / Komisyon) | Replay Uygunluk Durumu |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **EURUSD** | **3** | 95,000 | 2026-07-13 03:13 → 2026-10-13 13:32 | 2026-08-21 → 2026-09-02 | 3 / 3 Mevcut (%100) | 0 / 3 (`UNVERIFIED`) | 1.1 pip spread / 0.3 bps slip | **TAM KAPSAM (M1 Uygun)** |
| **GBPUSD** | **4** | 95,000 | 2026-07-13 03:13 → 2026-10-13 13:32 | 2026-09-04 → 2026-10-08 | 4 / 4 Mevcut (%100) | 3 / 4 Mevcut (%75) | 1.4 pip spread / 0.4 bps slip | **TAM KAPSAM (M1 Uygun)** |
| **USDJPY** | **6** | 95,000 | 2026-07-13 03:13 → 2026-10-13 13:32 | 2026-08-21 → 2026-09-21 | 6 / 6 Mevcut (%100) | 2 / 6 Mevcut (%33) | 1.3 pip spread / 0.4 bps slip | **TAM KAPSAM (M1 Uygun)** |
| **USDCAD** | **4** | 95,000 | 2026-07-13 03:13 → 2026-10-13 13:32 | 2026-08-21 → 2026-09-21 | 4 / 4 Mevcut (%100) | 1 / 4 Mevcut (%25) | 1.5 pip spread / 0.5 bps slip | **TAM KAPSAM (M1 Uygun)** |
| **XAUUSD** | **25** | 95,000 | 2026-07-07 20:24 → 2026-10-13 13:32 | 2026-08-19 → 2026-10-06 | 25 / 25 Mevcut (%100) | 4 / 25 Mevcut (%16) | 25 cent spread / 15 cent slip | **TAM KAPSAM (M1 Uygun)** |
| **ETHUSD** | **12** | 95,000 | 2026-08-07 15:05 → 2026-10-13 13:32 | 2026-08-19 → 2026-10-08 | 12 / 12 Mevcut (%100) | 4 / 12 Mevcut (%33) | 3.50$ zone tampon / 1.5 bps slip | **TAM KAPSAM (M1 Uygun)** |
| **SOLUSD** | **12** | 95,000 | 2026-08-07 03:07 → 2026-10-13 13:32 | 2026-08-19 → 2026-10-08 | 12 / 12 Mevcut (%100) | 4 / 12 Mevcut (%33) | 0.35$ zone tampon / 2.0 bps slip | **TAM KAPSAM (M1 Uygun)** |
| **TOPLAM** | **66** | **-** | **Temmuz – Ekim 2026 (3 Ay)** | **Ağustos – Ekim 2026** | **66 / 66 (%100)** | **18 / 66 (%27.2)** | **Dinamik Model Bağlı** | **66 FIRSAT DOĞRULANDI** |

---

### ⚠️ Kapsam Dışı Bırakılan Enstrümanlar (`INSUFFICIENT_DATA`)

* **BTCUSD (23 Sinyal Kaydı):** M1 veri dosyasında sadece 500 bar (~13 saatlik veri, 13 Ekim 2026) bulunmaktadır. Ağustosa ve Eylüle ait M1 barları bulunmadığı için 23 fırsat **`INSUFFICIENT_DATA_M1_MISSING`** olarak işaretlenmiş ve araştırmadan izole edilmiştir.
* **Diğer 18 Çift (AUDUSD, GBPJPY, NZDUSD, vb. - Toplam 23 Fırsat):** M1 verileri yalnızca 200 - 500 bar (2-4 gün) ile sınırlıdır; sinyallerin oluştuğu tarihleri kapsamamaktadır (`INSUFFICIENT_DATA_M1_MISSING`).

---

## 4. Araştırma Yürütme Protokolü

1. **Hiçbir kod değişikliği yapılmamıştır.**
2. **Performans backtesti çalıştırılmamıştır.**
3. **Canlı bot süreçlerine dokunulmamıştır.**
4. İzole araştırma kodu yazılacağı zaman, bu spesifikasyondaki $3 \times 3$ varyant matrisi (G1/G2/G3 $\times$ Ç1/Ç2/Ç3) ve G4/Manuel İnceleme sınıfı üzerinden sonuç üretilmeli; kesin kural gibi gösterilmemelidir.

---
*Rapor tamamlanmıştır.*
