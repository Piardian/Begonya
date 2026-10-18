# HYBRID REPLAY RUN REPORT: AŞAMA 1 (GİRİŞ DEĞERLENDİRMESİ)
## İzole Hibrit Replay Motoru Doğrulama ve Giriş Uygunluk Raporu

**Rapor Tarihi:** 2026-10-14  
**Kapsam:** Aşama 1 — Replay Altyapısı, Birim Testler ve 66 Fırsatın Giriş Değerlendirmesi  
**Motor Modülü:** `Begonya/research/hybrid_replay/hybrid_replay.py`  
**Test Dosyası:** `Begonya/research/hybrid_replay/test_hybrid_replay.py`  
**Karar Kütüğü (Audit Log):** `Begonya/research/hybrid_replay/hybrid_replay_evaluation_log.json`  
**İlke & Kısıtlar:** 
* Kesinlikle net R, kârlılık veya performans sıralaması hesaplanmamıştır.
* Üretim (production) kodlarına, orkestratöre ve Convexity Engine'e dokunulmamıştır.
* Canlı emir gönderilmemiş, commit/push yapılmamıştır.

---

## 1. Birim Testlerin (Unit Tests) Doğrulanması

Replay motoru çalıştırılmadan önce `test_hybrid_replay.py` çalıştırılmış ve 5 kritik senaryonun tamamı **%100 başarıyla (PASSED)** doğrulanmıştır:

| Test Senaryosu | Test Edilen Kural | Sonuç |
| :--- | :--- | :---: |
| `test_htf_clock_aligned_close_veto` | Saat senkronlu (:14, :29, :44, :59) 15M mum kapanışı POI sınırını deldiğinde `INVALIDATED` üretimi. | **OK** |
| `test_dynamic_fib_expansion_and_subsequent_fill` | İtki genişledikçe 0.5 Fib'in dinamik yukarı taşınması ve yalnızca $k+1$ ve sonraki barlarda dolum. | **OK** |
| `test_missing_structural_anchor_rejects` | Sinyal kütüğünde 15M yapısal tepe/dip çapa fiyatı eksikse `INSUFFICIENT_DATA_STRUCTURAL_STOP` üretimi. | **OK** |
| `test_insufficient_m1_bars_rejects` | Sinyal sonrası M1 mum sayısı yetersizse (<15 bar) `INSUFFICIENT_DATA_M1_MISSING` üretimi. | **OK** |
| `test_ladder_displacement_classified_manual_review` | Merdiven tipi gövdeli ilerleyişin otomatik işleme sokulmayıp `MANUAL_REVIEW_REQUIRED` havuzuna ayrılması. | **OK** |

---

## 2. 66 Doğrulanmış Fırsatın Giriş Değerlendirme Sonuçları

`signal_delivery_queue.json` içindeki 156 sinyal kaydı incelenmiş, mükerrer POI'ler elenerek M1 zaman penceresine denk gelen **66 bağımsız yapısal fırsat** yüklenmiştir.

Araştırma motoru 66 fırsatı 4 farklı parametrik varyant altında ayrı ayrı değerlendirmiştir:

| Parametrik Varyant | Toplam Fırsat | Doldurulan Giriş (`ENTRY_FILLED`) | HTF Kapanış İptali (`INVALIDATED`) | Kurulum Gelmedi (`NO_ENTRY`) | Süre Aşımı (`EXPIRED`) | Manuel İnceleme (`MANUAL_REVIEW`) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Varyant G1 (%40 Gövde)** | **66** | **34 (%51.5)** | **30 (%45.5)** | **1 (%1.5)** | **1 (%1.5)** | 0 |
| **Varyant G2 (%50 Gövde)** | **66** | **32 (%48.5)** | **32 (%48.5)** | **1 (%1.5)** | **1 (%1.5)** | 0 |
| **Varyant G3 (%60 Gövde)** | **66** | **30 (%45.5)** | **32 (%48.5)** | **3 (%4.5)** | **1 (%1.5)** | 0 |
| **Varyant G4 (Ladder Review)**| **66** | **32 (%48.5)** | **32 (%48.5)** | **1 (%1.5)** | **1 (%1.5)** | 0 |

> [!NOTE]
> 66 fırsatın tamamında tekil büyük gövdeli displacement barları tespit edildiği için Varyant G4'te manuel incelemeye takılan sahipsiz bir ladder vakası kalmamış; itkiler doğrudan G1-G3 eşikleriyle sınıflandırılmıştır.

---

## 3. Sembol Bazında Dağılım ve Geçersizleşme Analizi (Varyant G2 - %50 Eşik)

| Sembol | Bağımsız Fırsat | M1 İleri Mum Havuzu | Doldurulan Giriş (`FILLED`) | HTF Kapanış İptali (`INVALIDATED`) | Kurulum Yok (`NO_ENTRY`) | Süre Aşımı (`EXPIRED`) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **EURUSD** | 3 | 59,200 – 76,000 bar | 0 | **3 (%100)** | 0 | 0 |
| **GBPUSD** | 4 | 7,000 – 56,000 bar | **3 (%75)** | 1 (%25) | 0 | 0 |
| **USDJPY** | 6 | 31,000 – 76,000 bar | **2 (%33)** | 4 (%67) | 0 | 0 |
| **USDCAD** | 4 | 31,000 – 76,000 bar | **3 (%75)** | 1 (%25) | 0 | 0 |
| **XAUUSD** | 25 | 10,000 – 78,000 bar | **16 (%64)** | 9 (%36) | 0 | 0 |
| **ETHUSD** | 12 | 7,000 – 78,000 bar | **6 (%50)** | 6 (%50) | 0 | 0 |
| **SOLUSD** | 12 | 7,000 – 78,000 bar | **2 (%17)** | 8 (%67) | 1 | 1 |
| **TOPLAM** | **66** | **-** | **32 (%48.5)** | **32 (%48.5)** | **1 (%1.5)** | **1 (%1.5)** |

### ⚠️ Kritik Geçersizleşme (Veto) Bulgusu:
Geçersiz kılınan 32 fırsatın nedenleri:
* **23 Adet:** Fiyat POI kutusuna hiç dokunmadan veya temas aşamasındayken saat senkronlu tam 15M mum kapanışıyla bölgeyi doğrudan yardı (`POI breached on clock-aligned HTF close before entry`).
* **9 Adet:** Fiyat POI içine girdi, ancak içeride 1M teyidi oluşurken 15M mumu bölgenin tabanı/tavanı dışında kapandı (`POI breached on HTF close while awaiting 1M confirmation`).
* **Sonuç:** Saat senkronlu HTF kapanış denetimi, sahte kırılımların ve testere piyasasının **%48.5'ini hiçbir işleme sokmadan filtrelemeyi başarmıştır**.

---

## 4. Yapısal Stop ve Karşı Hedef (Target) Doğrulaması

1. **HTF Yapısal Çapa (Structural Anchor):**
   * 66 fırsatın **66'sında (%100)** POI'yi oluşturan 15M BOS/CHoCH kırılımının yapısal swing çapa seviyesi (`brokenSwing.price`) doğrulanmış ve stop referansı olarak atanmıştır.
   * Hiçbir fırsatta 1M fitili gizlice stop kabul edilmemiştir.
2. **Karşı Hedef (Target / Liquidity Magnet) Doğrulaması:**
   * 32 doldurulan girişin yalnızca **10 tanesinde (%31.2)** sinyal anında bilinebilir doğrulanmış bir hedef seviye (`liquidityMagnet`: EQH/EQL) mevcuttur.
   * **22 doldurulan işlemde (%68.8)** sinyal anında sayısal bir hedef fiyat bulunmamaktadır (`target_verified: False`).
   * **Karar:** Bu 22 işlem için yapay ve varsayımsal bir 3R hedefi atanmamış; durum şeffaf bir şekilde kütükte bırakılmıştır. Çıkış aşaması (Aşama 2) için bu ayrım temel alınacaktır.
3. **Breaker – Fib 0.5 Örtüşmesi (Confluence Quality Tag):**
   * Doldurulan 32 girişin **18 tanesinde (%56.2)** 1M sweep ve Fib 0.5 seviyesi POI / Breaker kutusunun sınırları içine tam oturmuştur (`PERFECT_OVERLAP`).
   * 14 tanesinde ise retest bölgenin dışındaki 0.5 Fib'e çekilmiştir (`NO_OVERLAP`).

---

## 5. Kohortların İzolasyon Durumu

1. **Kohort A (28 Gerçekleşmiş Benchmark İşlemi):** Tarihsel sonuçlar (`realized_r`, USD PnL) korunmuştur; bu aşamada yeniden değerlendirilmemiştir.
2. **Kohort B (16 Doldurulmamış Benchmark Kaydı):** İcra edilmemiş statüleri korunmuştur; 66 fırsatla birleştirilmemiştir.
3. **Kohort C (66 CLT Fırsatı):** Bu raporda giriş doğrulaması yapılan bağımsız gruptur.

---

## 6. Sıradaki Adım (Aşama 2 İçin Hazırlık)

Aşama 1 (giriş doğrulaması) başarıyla tamamlanmıştır. Aşama 2'ye (çıkış değerlendirmesi) geçilmeden önce:
1. Hedefi sinyal anında bilinen 10 işlem ile hedefi doğrulanamayan 22 işlem için çıkış modelinin (BE, kısmi kâr veya trend ihlal çıkışı) çerçevesi onaylanmalıdır.
2. Dinamik işlem maliyetleri (`estimateDynamicTransactionCost`) net R hesaplamasına entegre edilmelidir.

Tüm detaylı karar kayıtları `Begonya/research/hybrid_replay/hybrid_replay_evaluation_log.json` dosyasında saklanmaktadır.
