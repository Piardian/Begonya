# Begonya & ChecklistTrigger Hibrit Replay — Aşama 2 Sonuç Test Raporu

**Belge Kimliği:** `HYBRID_REPLAY_STAGE2_RESULTS.md`  
**Test Tarihi:** 14 Ekim 2026  
**Test Kapsamı:** 66 Tarihsel Fırsat Üzerinde Kronolojik M1 Çıkış Simülasyonu, Brüt R Hesabı ve Model Karşılaştırması  
**Mod:** Salt Araştırma / Sonuç Değerlendirmesi (Üretim stratejisine, Convexity Engine'e ve canlı emir altyapısına dokunulmadı; canlı emir gönderilmedi, commit ve push yapılmadı)

---

## 1. Yönetici Özeti ve Temel Çıkarımlar

Bu test, Begonya ve ChecklistTrigger (CLT) hibrit giriş modelinin tarihsel veriler üzerindeki çıkış (exit) dinamiklerini ve R-çarpanı dağılımlarını katı nedensellik ilkeleriyle (sıfır sızıntı / zero-lookahead) ölçmüştür.

### Ana Bulgular:
1. **Ana Model (`MAIN_STRUCTURAL_STOP`):**
   * **Örneklem:** Aşama 1'de dolan ve Aşama 1b'de yapısal stopu doğrulanan **25 işlem**.
   * **Hedef Durumu:** Sinyal anında doğrulanabilir karşı likidite hedefi bulunan işlem sayısı **9**; hedefi bulunmayan ve kural gereği keyfî hedef atanmayan işlem sayısı **16** (`INSUFFICIENT_DATA_TARGET`).
   * **Sonuçlanan 9 İşlem:** 2 Hedef Dolumu (`TARGET_HIT`), 7 Stop Dolumu (`STOP_HIT`), 0 Çakışma (`AMBIGUOUS_BAR`), 0 Veri Sonu (`DATA_END_UNRESOLVED`).
   * **Kazanma Oranı:** **%22.22** (2 / 9).
   * **Toplam Brüt R:** **+10.96 R** (İşlem başına ortalama **+1.22 R**).
   * **KRİTİK UYARI — İstatistiksel Güvenilmezlik ve Outlier Etkisi:**  
     Toplam +10.96 R kârın **+17.28 R'ı tek bir işlemden** (`GBPUSD_15m_FVG_...`, 2.4 piplik çok dar yapısal stop) kaynaklanmaktadır. Bu tekil uç örnek (outlier) hariç tutulduğunda geriye kalan 8 işlemin toplam R'ı **-6.32 R**'dır. 9 işlemlik örneklem istatistiksel genelleme yapmak veya gelecekte kârlılık iddia etmek için kesinlikle yetersizdir.

2. **Alternatif Model (`VARIANT_POI_BOUNDARY_STOP`):**
   * **Örneklem:** POI sınırını stop kabul eden tüm doldurulmuş **32 işlem**.
   * **Sonuçlanan 10 İşlem:** 1 Hedef Dolumu (`TARGET_HIT`), 9 Stop Dolumu (`STOP_HIT`), 22 `INSUFFICIENT_DATA_TARGET`.
   * **Kazanma Oranı:** **%10.00** (1 / 10).
   * **Toplam Brüt R:** **+4.02 R** (İşlem başına ortalama **+0.40 R**).
   * **Fitille Patlama (Wick-out) Zafiyeti:**  
     Ana modelde kazanan `SOLUSD` short işlemi (+0.68 R, stop 121.69), POI sınır modelinde (stop 120.93) henüz 8. dakikada fitille stop olmuş ve ardından hedefe gitmiştir. POI sınır stopları ortalama risk mesafesini daraltırken fitille patlama oranını ciddi biçimde artırmaktadır.

3. **Maliyet Açığı (Slippage, Spread & Commission):**
   * Ham veri kütüklerinde anlık tick spreadi ve komisyon bulunmamaktadır. Özellikle 2-3 piplik dar stoplu işlemlerde 1.2 piplik spread ve kayma (slippage), R getirisinin %30-%50'sini yok edebilecek büyüklüktedir. Bu nedenle **net kârlılık iddiasında bulunulamaz**.

---

## 2. Metodoloji ve Çıkış Kuralları

Simülasyon motoru (`simulate_stage2_outcomes.py`) şu değişmez kurallarla işletilmiştir:

1. **Katı Kronolojik İlerleme:**  
   Emir dolum anından (`filled_timestamp`) sonraki M1 mumları sırayla taranmıştır. Giriş anından önceki veya sinyal anındaki veriler geriye dönük değiştirilmemiştir.
2. **Keyfî Hedef Yasağı:**  
   Sinyal anında kayıtlı bir karşı likidite magneti (`target_known=True` ve `target_price > 0`) bulunmayan hiçbir işleme sabit 3R, 5R veya varsayımsal bir hedef verilmemiştir; bu işlemler `INSUFFICIENT_DATA_TARGET` olarak izole edilmiştir.
3. **Mum İçi Çakışma Koruması (`AMBIGUOUS_BAR`):**  
   Aynı M1 mumu içinde hem stop hem hedef seviyesi test edilirse, alt zaman dilimi (tick) sıralaması bilinmediğinden işlem kesinlikle kârlı sayılmamış, `AMBIGUOUS_BAR` olarak işaretlenmiştir (Bu testte 0 adet çakışma yaşanmıştır).
4. **Tanımsız Kural Ekleme Yasağı:**  
   Mevcut sistemde tanımlı olmayan breakeven (+1R'da BE alma), kısmi kâr alma (partial close) veya iz süren stop (trailing stop) varsayımları analize dahil edilmemiştir.

---

## 3. Ana Model Sonuçları (`MAIN_STRUCTURAL_STOP`)

### A. Genel Özet Tablosu

| Metrik | Değer | Açıklama |
| :--- | :---: | :--- |
| **Toplam Tarihsel Aday** | 66 | Değerlendirilen tüm bağımsız fırsatlar |
| **Dışlanan Aday Sayısı** | 41 | Giriş dolumu olmayan veya yapısal stopu doğrulanamayanlar |
| **Geçerli İşlem Örneklemi** | 25 | `ENTRY_FILLED` + `VERIFIED_STRUCTURAL_STOP` |
| **Hedefi Doğrulanmış İşlem** | 9 | Sinyal anında aktif magnet hedefi kayıtlı olanlar |
| **Hedefi Olmayan İşlem** | 16 | `INSUFFICIENT_DATA_TARGET` olarak raporlananlar |
| **Hedefe Ulaşan (`TARGET_HIT`)** | 2 | %22.22 (Sonuçlananlar içinde) |
| **Stoba Ulaşan (`STOP_HIT`)** | 7 | %77.78 (Sonuçlananlar içinde) |
| **Belirsiz Mum (`AMBIGUOUS_BAR`)**| 0 | Aynı M1 mumunda TP/SL çakışması |
| **Veri Sonu Çözümsüz (`DATA_END`)** | 0 | Veri bitene kadar açık kalan işlem |
| **Toplam Brüt R** | **+10.9557 R** | 2 TP (+17.96 R) - 7 SL (-7.00 R) |
| **İşlem Başı Ortalama R** | **+1.2173 R** | Çözümlenen 9 işlem bazında |
| **Outlier Hariç Brüt R** | **-6.3219 R** | `GBPUSD` (+17.28 R) çıkarıldığında kalan 8 işlem |

### B. Dışlanan 41 Kaydın Gerekçe Dağılımı:
* **Aşama 1'de POI İptali (`STAGE1_INVALIDATED`):** 32 Fırsat (15M bar kapanışında POI ihlali)
* **Aşama 1'de Süre Aşımı (`STAGE1_EXPIRED`):** 1 Fırsat (24 saatte POI teması gelmedi)
* **Aşama 1'de Giriş Yok (`STAGE1_NO_ENTRY`):** 1 Fırsat (Tepki mumu CHOCH seviyesini aşamadı)
* **M15 Veri Eksikliği (`INSUFFICIENT_DATA_STRUCTURAL_STOP`):** 5 İşlem (2 USDJPY, 3 USDCAD)
* **Yapısal Stop Yön Hatası (`INVALID_STRUCTURAL_STOP_DIRECTION`):** 2 İşlem (1 XAUUSD, 1 GBPUSD)

---

## 4. Ana Modelde Çözümlenen 9 İşlemin Detaylı Listesi

| Fırsat / Sinyal Kimliği | Sembol | Yön | Giriş Fiyatı | Stop Fiyatı | Hedef Fiyatı | Risk ($) | Çıkış Sonucu | Brüt R | Tutma Süresi |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `XAUUSD_15m_FVG_1789023600000` | XAUUSD | Short | 4418.075 | 4430.464 | 4368.725 | 12.389 | **STOP_HIT** | **-1.0000** | 31 dk |
| `ETHUSD_15m_OB_1789022700000` | ETHUSD | Short | 2476.265 | 2483.830 | 2379.903 | 7.565 | **STOP_HIT** | **-1.0000** | 1894 dk |
| `SOLUSD_15m_OB_1789349400000` | SOLUSD | Long | 99.780 | 99.000 | 105.125 | 0.780 | **STOP_HIT** | **-1.0000** | 84 dk |
| `SOLUSD_15m_OB_1790692200000` | SOLUSD | Short | 120.205 | 121.690 | 119.198 | 1.485 | **TARGET_HIT** | **+0.6781** | 163 dk |
| `ETHUSD_15m_OB_1790873100000` | ETHUSD | Long | 2696.090 | 2673.420 | 2712.825 | 22.670 | **STOP_HIT** | **-1.0000** | 63 dk |
| `GBPUSD_15m_FVG_1791174600000` | GBPUSD | Short | 1.323525 | 1.323770 | 1.319292 | 0.00024 | **TARGET_HIT** | **+17.2776** | 62 dk |
| `XAUUSD_15m_OB_1791219600000` | XAUUSD | Long | 4137.805 | 4126.475 | 4141.756 | 11.330 | **STOP_HIT** | **-1.0000** | 30 dk |
| `XAUUSD_15m_OB_1791246600000` | XAUUSD | Long | 4143.745 | 4133.337 | 4152.867 | 10.408 | **STOP_HIT** | **-1.0000** | 65 dk |
| `XAUUSD_15m_OB_1791265500000` | XAUUSD | Long | 4128.820 | 4124.562 | 4139.773 | 4.258 | **STOP_HIT** | **-1.0000** | 38 dk |

---

## 5. Hedefi Bulunmayan 16 İşlem (`INSUFFICIENT_DATA_TARGET`)

Aşağıdaki 16 işlemde 1M sniper teyidi gelmiş, limit dolmuş ve M15 yapısal stopu doğrulanmıştır; ancak sinyal anında karşı likidite magnet hedefi (`target_price`) atanmadığı için çıkış simülasyonuna keyfî hedef sokulmamış, tarafsızlık korunmuştur:

1. `XAUUSD_15m_OB_1787095800000_1787097600000` (Long, Giriş: 4334.39, Stop: 4331.90)
2. `XAUUSD_15m_OB_1787102100000_1787103000000` (Long, Giriş: 4334.39, Stop: 4327.51)
3. `XAUUSD_15m_FVG_1787103000000_1787103000000` (Long, Giriş: 4334.39, Stop: 4327.51)
4. `ETHUSD_15m_OB_1787119200000_1787121900000` (Long, Giriş: 1910.595, Stop: 1887.35)
5. `ETHUSD_15m_FVG_1787119200000_1787121900000` (Long, Giriş: 1910.595, Stop: 1887.35)
6. `SOLUSD_15m_OB_1787158800000_1787160600000` (Long, Giriş: 88.58, Stop: 87.21)
7. `SOLUSD_15m_FVG_1787159700000_1787160600000` (Long, Giriş: 88.58, Stop: 87.21)
8. `XAUUSD_15m_OB_1787679000000_1787680800000` (Long, Giriş: 4516.48, Stop: 4506.70)
9. `XAUUSD_15m_OB_1787680800000_1787683500000` (Long, Giriş: 4514.86, Stop: 4506.70)
10. `XAUUSD_15m_FVG_1787683500000_1787683500000` (Long, Giriş: 4514.86, Stop: 4506.70)
11. `GBPUSD_15m_OB_1788523200000_1788524100000` (Long, Giriş: 1.35338, Stop: 1.35105)
12. `GBPUSD_15m_FVG_1788523200000_1788524100000` (Long, Giriş: 1.35338, Stop: 1.35105)
13. `XAUUSD_15m_OB_1788960300000_1788963000000` (Long, Giriş: 4339.29, Stop: 4314.92)
14. `XAUUSD_15m_OB_1789123200000_1789124100000` (Long, Giriş: 4336.565, Stop: 4318.53)
15. `XAUUSD_15m_FVG_1789124100000_1789124100000` (Long, Giriş: 4336.565, Stop: 4318.53)
16. `XAUUSD_15m_OB_1790159400000_1790161200000` (Long, Giriş: 4257.655, Stop: 4243.68)

---

## 6. Alternatif Model Sonuçları (`VARIANT_POI_BOUNDARY_STOP`)

Bu varyantta stop seviyesi olarak M15 fraktal swing'i yerine doğrudan POI sınır kutusu (Long için `zone_low`, Short için `zone_high`) kullanılmıştır.

### A. Karşılaştırma Tablosu

| Metrik | Ana Model (`MAIN_STRUCTURAL_STOP`) | Alternatif Varyant (`VARIANT_POI_BOUNDARY_STOP`) |
| :--- | :---: | :---: |
| **Toplam Test Edilen İşlem** | 25 | **32** (+7 işlem, USDJPY & USDCAD dahil) |
| **Hedefi Doğrulanmış İşlem** | 9 | **10** (+1 işlem, GBPUSD OB dahil) |
| **Hedefsiz İşlem Sayısı** | 16 | 22 |
| **Hedefe Ulaşan (`TARGET_HIT`)** | **2** (%22.2) | **1** (%10.0) |
| **Stoba Ulaşan (`STOP_HIT`)** | **7** (%77.8) | **9** (%90.0) |
| **Toplam Brüt R** | **+10.9557 R** | **+4.0246 R** |
| **İşlem Başı Ortalama R** | **+1.2173 R** | **+0.4025 R** |
| **Kritik Davranış Farkı** | Yapısal swing dış dalgalanmayı tolere etti | POI sınırı dar olduğu için fitille elendi |

### B. POI Sınır Modelinde Çözümlenen 10 İşlem:

| Fırsat Kimliği | Sembol | Yön | Giriş | POI Stop | Hedef | Çıkış | Brüt R | Süre |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `XAUUSD_15m_FVG_1789023600000` | XAUUSD | Short | 4418.075 | 4423.517 | 4368.725 | **STOP_HIT** | -1.0000 | 4 dk |
| `ETHUSD_15m_OB_1789022700000` | ETHUSD | Short | 2476.265 | 2484.760 | 2379.903 | **STOP_HIT** | -1.0000 | 1894 dk |
| `SOLUSD_15m_OB_1789349400000` | SOLUSD | Long | 99.780 | 99.180 | 105.125 | **STOP_HIT** | -1.0000 | 52 dk |
| `GBPUSD_15m_OB_1789641900000` | GBPUSD | Short | 1.340285 | 1.340580 | 1.337440 | **STOP_HIT** | -1.0000 | 23 dk |
| `SOLUSD_15m_OB_1790692200000` | SOLUSD | Short | 120.205 | 120.930 | 119.198 | **STOP_HIT** | **-1.0000** *(Ana modelde WIN)* | 8 dk |
| `ETHUSD_15m_OB_1790873100000` | ETHUSD | Long | 2696.090 | 2676.350 | 2712.825 | **STOP_HIT** | -1.0000 | 63 dk |
| `GBPUSD_15m_FVG_1791174600000` | GBPUSD | Short | 1.323525 | 1.323850 | 1.319292 | **TARGET_HIT** | **+13.0246** | 62 dk |
| `XAUUSD_15m_OB_1791219600000` | XAUUSD | Long | 4137.805 | 4125.611 | 4141.756 | **STOP_HIT** | -1.0000 | 74 dk |
| `XAUUSD_15m_OB_1791246600000` | XAUUSD | Long | 4143.745 | 4135.859 | 4152.867 | **STOP_HIT** | -1.0000 | 62 dk |
| `XAUUSD_15m_OB_1791265500000` | XAUUSD | Long | 4128.820 | 4116.360 | 4139.773 | **STOP_HIT** | -1.0000 | 121 dk |

---

## 7. Maliyet Analizi ve Eksik Sürtünme Raporu

Ham veri setlerinde gerçek zamanlı broker komisyonu, dinamik spread ve kayma (slippage) bulunmamaktadır. Aşağıdaki analiz, ortalama broker maliyetlerinin R üzerindeki tahribatını modellemektedir:

1. **`GBPUSD` Uç Örneği Üzerinde Maliyet Etkisi:**
   * Giriş: `1.323525`, Stop: `1.323770` $\rightarrow$ Risk: **0.000245 (2.45 pip)**.
   * Standart broker spreadi + yürütme kayması: **~1.2 pip**.
   * Yalnızca spread maliyeti, tanımlanan risk mesafesinin **%49.0'ını** tek başına tüketmektedir.
   * Brüt +17.28 R görünen kâr, gerçek broker koşullarında spread ve komisyon düşüldüğünde yaklaşık **+8.5 R ile +9.0 R arasına gerileyecektir**.
2. **Kripto ve Altın İşlemleri:**
   * `ETHUSD` ve `SOLUSD` işlemlerinde borsa takas komisyonu (Maker %0.02, Taker %0.05) ve hafta sonu taşıma maliyetleri (swap) net R getirisini negatif yönde baskılamaktadır.
3. **Sonuç:**
   * Ham veride bu maliyetler bulunmadığı için rapor edilen **+10.96 R brüt bir teorik tavan rakamıdır**; gerçek piyasada net kârlılık olarak yorumlanamaz.

---

## 8. Birim Test Paketi ve Doğrulama Durumu

Tüm araştırma paketi (`Begonya/research/hybrid_replay/`) altında 3 ayrı modülde toplam **18 birim test** çalıştırılmış ve tamamı başarıyla geçmiştir:

```text
Ran 18 tests in 0.002s
OK
```

### Test Modülleri:
1. `test_hybrid_replay.py` (6 Test): Nedensellik, saat senkronlu HTF veto, dinamik Fib 0.5 genişlemesi, sonraki barlarla dolum, yetersiz veri reddi ve G4 ladder izolasyonu.
2. `test_structural_stop.py` (6 Test): M15 fraktal swing doğrulaması, yönsel kural denetimi, geleceğe bakış engeli ve POI sınır modeli testi.
3. `test_stage2_simulation.py` (6 Test): Stop önce, hedef önce, aynı mumda çakışma (`AMBIGUOUS_BAR`), veri sonu (`DATA_END_UNRESOLVED`), eksik hedef (`INSUFFICIENT_DATA_TARGET`) ve yön kontrolü.

---

## 9. Genel Değerlendirme ve Tavsiyeler

1. **Replay Altyapısı Kanıtlandı:**  
   Giriş teyidi, yapısal stop tespiti ve M1 çıkış simülasyonunu içeren uçtan uca araştırma motoru, geleceğe bakış sızıntısı olmadan ve tam deterministik olarak çalışmaktadır.
2. **Küçük Örneklem Uyarısı:**  
   Çözümlenen işlem sayısının (9 adet) çok düşük olması ve sonucun büyük oranda tek bir 2.4 piplik `GBPUSD` işlemine bağımlı kalması nedeniyle, bu sonuçlar stratejinin canlı performansının göstergesi kabul edilemez.
3. **Hedef Eksikliği Giderilmeli:**  
   Sinyallerin %64'ünde (16/25) karşı likidite hedefinin kaydedilmemiş olması en büyük veri açığıdır. CLT/Begonya sinyal üretim motorunda sinyal anında karşı likidite magneti (`liquidityMagnet`) üretiminin zorunlu kılınması gerekmektedir.
4. **Strateji Kodu Korundu:**  
   Üretim koduna dokunulmamış, Convexity Engine yamaları korunmuş ve hiçbir canlı emir veya git işlemi yapılmamıştır.
