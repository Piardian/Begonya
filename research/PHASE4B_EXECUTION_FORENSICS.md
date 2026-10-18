# BEGONYA — AŞAMA 4B: ENTRY EXECUTION VE REPLAY MOTORU ADLİ DOĞRULAMA RAPORU

**Tarih:** 14 Ekim 2026  
**Denetim Kapsamı:** Replay Motoru Giriş Gerçekleşmesi, Mum İçi Fiyat Sıralaması, İşlem Yaşam Döngüsü ve Muhasebe Doğrulaması  
**Çalışma Alanı:** `research/` (Üretim koduna, risk motoruna ve canlı emir altyapısına kesinlikle dokunulmamıştır)  
**Canlı Emir Durumu:** `LIVE_ORDERS = false` (Devre dışı)

---

## 1. Amaç ve Kesin Koruma Sınırları

Bu denetim, Aşama 4A Break-Even testinde tespit edilen Bar 0 (giriş mumu) sızıntısını bağımsız ve deterministik olarak doğrulamak, replay motorundaki mum içi fiyat varsayımlarını adli düzeyde açığa çıkarmak ve simülasyon mekaniğini sentetik testlerle denetlemek amacıyla yürütülmüştür.

### Kesin Koruma İlkeleri:
1. **Parametre Optimizasyonu Yapılmadı:** BE tetikleme eşiği veya hedef çarpanı optimize edilmemiştir.
2. **Üretim Koduna Dokunulmadı:** Üretim stratejisi, macro gate eşikleri ve canlı emir altyapısı değiştirilmemiştir.
3. **Canlı Emirler Kapalı Tutuldu:** `LIVE_ORDERS = false` bayrağı korunmuştur.
4. **Veri Yetersizliği Açıkça Etiketlendi:** 15M mum verisinin ayrıştıramadığı ve 1M verisi bulunmayan tüm mum içi sıralamalar `INSUFFICIENT DATA` olarak sınıflandırılmıştır.
5. **Edge İddiasında Bulunulmadı:** Simülasyon motoru düzeltilse dahi sistemin kârlı olduğu veya bir avantaja (edge) sahip olduğu varsayılmamıştır.

---

## 2. Giriş Gerçekleşmesi Doğrulaması (38 İşlemin Anatomisi)

Tarihsel replay sırasında 1 Nisan – 30 Eylül 2026 döneminde tespit edilen 83 geçerli sinyalden 38'i limit seviyelerine temas ederek dolmuş (`FILLED`), 45'i ise 16 bar içinde dolmayarak süresi dolmuş (`EXPIRED_UNFILLED`) olarak kaydedilmiştir. 38 dolan işlemin adli incelemesi şu bulguları ortaya koymuştur:

### A. Zamanlama ve Mum Zaman Damgası Türü
- **Kanıtlanan Kural:** `replay_1year` altındaki tüm 15M mumlarında `c.timestamp`, ilgili mumun **AÇILIŞ (OPEN)** zaman damgasıdır (Aşama 2 testinde $Match = 20/20$ ile doğrulanmıştır).
- **Sinyal ve Emir Zamanı:** Kırılım mumu `i` kapandığında ($T_{close} = c.timestamp + 15 \times 60 \times 1000$), sinyal üretilmektedir (`sigTs = closeTs`). Limit emir en erken bir sonraki mum olan `i+1` açılışında ($T_{open} = sigTs$) piyasaya iletilmektedir. Sinyal üretiminde ileriye bakma hatası (look-ahead bias) yoktur.

### B. Giriş Mumunun (Bar 0) Fiyat Anatomisi ve Pre-Entry Sızıntı Haritası
Limit emir `entryP` fiyatında beklerken, fiyat bu seviyeye temas ettiği anda emir dolmuş sayılır. Ancak 15M mum verisi yalnızca 4 skaler değer (`open`, `high`, `low`, `close`) içerir; bu değerlerin mum içindeki kronolojik sırasını göstermez.

Aşağıdaki tabloda, önceki naive simülasyonun pre-entry tepe/dip noktalarını haksız yere pozisyona kâr veya BE stop yazdığı kritik işlemler listelenmiştir:

| No | Sembol | Yön | Sinyal Zamanı | Giriş Zamanı | Limit Fiyatı | Açılış (`open`) | Tepe (`high`) | Dip (`low`) | Kapanış (`close`) | 2R TP Seviyesi | 1M Veri Durumu | Naive Hatası & Adli Tespit |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **#2** | BTCUSD | Long | 02.04.26 01:45 | 02.04.26 02:00 | 66.878,43 | **67.359,27** | 67.359,27 | 66.854,50 | 66.860,88 | 67.230,69 | `INSUFFICIENT DATA` | **False TP:** Açılış zaten TP'nin üstündeydi. Fiyat aşağı inip emri doldurdu. Mum tepesi emir dolmadan önceydi. |
| **#7** | ETHUSD | Long | 16.04.26 21:00 | 16.04.26 21:15 | 2.340,24 | **2.351,04** | 2.352,00 | 2.336,25 | 2.340,80 | 2.351,61 | `INSUFFICIENT DATA` | **False TP:** Mum 2.351'de açılıp 2.336'ya çöktü. 2.352 tepesi emirden önceydi. Kapanış 2.340 oldu. |
| **#15** | ETHUSD | Short | 07.06.26 00:45 | 07.06.26 01:00 | 1.582,18 | **1.565,03** | 1.587,68 | 1.564,16 | 1.586,63 | 1.571,05 | `INSUFFICIENT DATA` | **False TP:** Mum hedef fiyatın altında açıldı, yukarı fırlayıp emri aldı ve 1.586'da kapandı. |
| **#32** | BTCUSD | Long | 26.08.26 04:30 | 26.08.26 04:45 | 78.813,82 | **78.965,10** | 78.965,11 | 78.790,68 | 78.826,00 | 78.946,34 | `INSUFFICIENT DATA` | **False TP:** Açılış TP'nin üstündeydi. Mum içi düşüş emri doldurdu, kapanış 78.826 oldu. |
| **#37** | SOLUSD | Long | 26.09.26 02:45 | 26.09.26 03:00 | 120,84 | **121,59** | 121,61 | 120,63 | 120,75 | 121,29 | `PASS (Farklı Feed)` | **False TP:** Açılış doğrudan TP'nin üstündeydi. |

### C. 1M Veri Kapsamı Analizi
- 6 aylık backtest penceresinde (1 Nisan – 30 Eylül 2026) 38 işlemin yalnızca **9 tanesinde (%23,7)** yerel 1M veri dosyası mevcuttur (Temmuz-Eylül arası XAUUSD ve SOLUSD).
- Kalan **29 işlemde (%76,3) hiçbir 1M veri kaynağı bulunmamaktadır (`INSUFFICIENT DATA`)**.
- Ayrıca mevcut 1M veri dosyalarının bir kısmının farklı borsa/fiyat sağlayıcılarına ait olduğu ve `replay_1year` 15M serisiyle kuruş bazında birebir eşleşmediği tespit edilmiştir.
- **Sonuç:** 15M OHLC çubuklarında giriş mumunun iç sıralaması kesin olarak bilinemediğinden, bilimsel dürüstlük gereği giriş mumunda lehte hareket sayılmamalı veya en fazla kapanış fiyatıyla sınırlandırılmalıdır.

---

## 3. İşlem Yaşam Döngüsü ve Muhasebe Doğrulaması

Geliştirilen ve doğrulanan yeni replay motorunda (`research/test_phase4b_execution.js`) aşağıdaki kurallar dondurulmuştur:

1. **Emir Dolmadan Önce Değerlendirme Yok:** Limit emir fiyatı görülmeden önce hiçbir stop, hedef veya MFE/MAE hesaplaması yapılmaz. 16 bar boyunca dolmayan emirler `EXPIRED_UNFILLED` olarak kapanır; kâr/zarar veya komisyon yazılmaz.
2. **Giriş Öncesi Fiyat Hareketleri İptal Edildi:** Giriş mumunun açılışından veya girişten önceki fiyat hareketleri MFE veya MAE değerlerine eklenemez.
3. **Giriş Mumunda BE Zırhı Koruması:** Giriş mumunda (Bar 0), pozisyon açılmadan önceki açılış fiyatı $+1.0R$ veya $+1.5R$ seviyesinde olsa dahi BE zırhı etkinleştirilemez (`beArmed = false`).
4. **Aynı Mumda SL ve TP Çakışması:** Aynı mumun aralığı hem stop hem hedef fiyatını kapsıyorsa, `CONFLICT_SL_FIRST` muhafazakâr kuralı işletilir. İşlem zararla (-1.0R veya BE armed ise 0.0R) sonuçlandırılır; asla iyimser bir TP varsayımı yapılmaz.
5. **Veri Sonu Davranışı (End of Data):** Veri setinin sonuna kadar açık kalan işlemler asla yapay olarak TP, SL veya BE ile kapatılmaz. `OPEN_TIMEOUT` statüsüyle ve son kapanış fiyatına göre işaretlenerek mark-to-market PnL kaydedilir.
6. **Maliyet Muhasebesi:** Maliyetler (spread + komisyon + slippage), pozisyon büyüklüğü ve stop mesafesiyle ters orantılı olarak R cinsine dönüştürülür. Dar stoplarda maliyet R cinsinden katlanarak artar.

---

## 4. Bağımsız Sentetik Test Paketi Sonuçları (`test_phase4b_execution.js`)

Motorun mantıksal doğruluğunu kanıtlamak için hazırlanan 7 sentetik test senaryosu çalıştırılmış ve %100 başarıyla tamamlanmıştır:

```text
================================================================================
BEGONYA - PHASE 4B: RUNNING 7 SYNTHETIC EXECUTION TESTS
================================================================================
✔ PASS Scenario 1: Pre-entry TP excursion does NOT book profit.
✔ PASS Scenario 2: Pre-entry +1R excursion does NOT arm BE on Bar 0.
✔ PASS Scenario 3: Same-bar SL/TP conflict resolves conservatively to SL (-1.0R).
✔ PASS Scenario 4: Unfilled limit order expires without opening trade.
✔ PASS Scenario 5: End-of-data trade marked OPEN_TIMEOUT with exact mark-to-market PnL.
✔ PASS Scenario 6: Partial TP (50% @ +2R) + remainder @ BE correctly yields Gross +1.0R, Net +0.85R.
✔ PASS Scenario 7: Cost in R scales inversely with stop distance (0.055R wide vs 0.22R tight).
================================================================================
ALL 7 / 7 SYNTHETIC SCENARIOS PASSED WITH ZERO LEAKAGE.
================================================================================
```

### Sentetik Senaryo Ayrıntıları:
1. **Senaryo 1 (Giriş Öncesi TP):** Mum açılışı 105 (TP 104'ün ötesinde), dip 99 (100 girişini dolduruyor), kapanış 99.5. Sonraki mum TP'ye ulaşmıyor. Motor işlemi TP yapmadı, açık tuttu (`PASS`).
2. **Senaryo 2 (Giriş Öncesi +1R):** Mum açılışı 103 (+1.5R), dip 99.5 (100 girişini dolduruyor), kapanış 100. Motor Bar 0'da BE zırhını aktif etmedi (`beArmed = false`) (`PASS`).
3. **Senaryo 3 (Aynı Mumda SL/TP):** Giriş dolduktan sonra Bar 1'de hem 98 stopu hem 104 hedefi görülüyor. Motor işlemi muhafazakâr biçimde SL (-1.0R, `CONFLICT_SL_FIRST`) olarak kapattı (`PASS`).
4. **Senaryo 4 (Dolmayan Emir):** 16 bar boyunca fiyat limit seviyesine inmedi. Motor işlemi `EXPIRED_UNFILLED` ilan etti, sıfır maliyet ve sıfır PnL yazdı (`PASS`).
5. **Senaryo 5 (Veri Sonu):** 3 bar sonra veri bitti, pozisyon açık. Motor işlemi yapay olarak kapatmadı; `OPEN_TIMEOUT` statüsünde +0.5R mark-to-market ile kaydetti (`PASS`).
6. **Senaryo 6 (Kısmi TP ve BE):** %50 pozisyon +2R'da kapandı (+1.0R), kalan %50 BE'ye çekildi ve 0R'da stop oldu. Toplam Brüt: +1.0R, Maliyet: 0.15R, Net: +0.85R eksiksiz hesaplandı (`PASS`).
7. **Senaryo 7 (Maliyet Ölçeklemesi):** 60.000$ BTC fiyatında 600$ geniş stopta maliyet 0.055R iken, 150$ dar stopta maliyet 0.22R olarak hesaplandı (tam 4 kat artış) (`PASS`).

---

## 5. Üretim Paritesi Matrisi

| Doğrulanan Mekanizma | Replay Motoru Davranışı | Üretim (Canlı) Eşdeğeri | Parite Durumu | Açıklama ve Kanıt |
| :--- | :--- | :--- | :---: | :--- |
| **Kırılım ve Sinyal Zamanı** | Mum kapanışında (`closeTs`) | Mum kapanışında WebSocket | **PASS** | Kırılım mumu tamamlanmadan sinyal üretilmez. |
| **Emir Aktifleşme Zamanı** | Sinyal mumundan sonraki ilk mum (`sigTs`) | Sinyal sonrası ilk emir iletimi | **PASS** | Sinyal mumu içinde geriye dönük dolum yapılmaz. |
| **Limit Emir Dolum Şartı** | `low <= entryP` (long) / `high >= entryP` (short) | Borsa emir defteri eşleşmesi | **PASS** | Fiyat temas etmeden emir dolmaz. |
| **Mum İçi Fiyat Sıralaması (15M)** | 1M verisi yoksa Bar 0'da tepe/dip ayrıştırılamaz | Gerçek zamanlı tick akışı | **INSUFFICIENT DATA** | 29/38 işlemde 1M verisi yoktur; basitleştirilmiş OHLC varsayımı zorunludur. |
| **Giriş Öncesi Fiyat Sızıntısı** | Eski: Sızıntılı (FAIL) / Yeni: Tamamen engellendi | Borsa emir dolum zamanı | **PASS** (Yeni Motor) | Girişten önceki tepe/dip değerleri pozisyona kâr yazamaz. |
| **Aynı Mumda SL/TP Çakışması** | `CONFLICT_SL_FIRST` (Zarar öncelikli) | OCO (One-Cancels-Other) borsa emri | **PASS** | En kötü durum senaryosu muhafazakâr biçimde işletilir. |
| **Maliyet ve Sürtünme Muhasebesi** | Komisyon + spread + slippage (Stop mesafesine göre ölçekli) | Gerçek borsa kesintisi | **PASS** | Dar stoplarda maliyet R cinsinden büyütülerek yansıtılır. |
| **Örneklem Yeterliliği** | 38 işlem (6 ay, 6 sembol) | Minimum 50-200 işlem | **INSUFFICIENT DATA** | İstatistiksel genelleme için veri hacmi yetersizdir. |

---

## 6. 38 İşlemin Karşılaştırmalı Değişim Tablosu

Aşağıdaki özet tablo, önceki naive simülasyon ile düzeltilmiş sızıntısız motor arasındaki farkı ortaya koymaktadır:

### 15M Üretim Stopu Altında Senaryo Karşılaştırması (38 İşlem)

| Senaryo | Motor Modeli | TP Adedi | SL Adedi | BE Adedi | Brüt PnL | Toplam Maliyet | Net PnL | Net Beklenti | Maks. Drawdown |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **A: +1.0R BE** | *Önceki Hatalı (Naive)* | 6 | 3 | 29 | -3,00R | 10,92R | -13,92R | -0,366R | 14,24R |
| **A: +1.0R BE** | **Düzeltilmiş (Sızıntısız)** | **6** | **26** | **6** | **-14,00R** | **10,92R** | **-24,92R** | **-0,656R** | **25,20R** |
| **B: BE Yok** | *Önceki Hatalı (Naive)* | 12 | 26 | 0 | +4,00R | 10,92R | -6,92R | -0,182R | 16,96R |
| **B: BE Yok** | **Düzeltilmiş (Sızıntısız)** | **9** | **29** | **0** | **-11,00R** | **10,92R** | **-21,92R** | **-0,577R** | **25,96R** |
| **C: +1.5R BE** | *Önceki Hatalı (Naive)* | 7 | 26 | 5 | -5,00R | 10,92R | -15,92R | -0,419R | 17,24R |
| **C: +1.5R BE** | **Düzeltilmiş (Sızıntısız)** | **7** | **27** | **4** | **-13,00R** | **10,92R** | **-23,92R** | **-0,629R** | **26,20R** |

### 1H Yapısal Araştırma Stopu Altında Senaryo Karşılaştırması (38 İşlem)

| Senaryo | Motor Modeli | TP Adedi | SL Adedi | BE Adedi | Brüt PnL | Toplam Maliyet | Net PnL | Net Beklenti | Maks. Drawdown |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **A: +1.0R BE** | **Düzeltilmiş (Sızıntısız)** | 9 | 26 | 3 | -8,00R | 7,89R | **-15,89R** | -0,418R | 18,96R |
| **B: BE Yok** | **Düzeltilmiş (Sızıntısız)** | 10 | 28 | 0 | -8,00R | 7,89R | **-15,89R** | -0,418R | 18,61R |
| **C: +1.5R BE** | **Düzeltilmiş (Sızıntısız)** | 10 | 27 | 1 | -7,00R | 7,89R | **-14,89R** | -0,392R | 17,61R |

*Not: Detaylı 38 işlemin işlem bazında tam dökümü [`research/phase4b_execution_audit.json`](file:///c:/Users/piard/.gemini/antigravity/scratch/Begonya/research/phase4b_execution_audit.json) dosyasında mevcuttur.*

---

## 7. Nihai Karar ve Stratejik Sonuç

1. **Simülasyon Hatası Çözülmüştür:** Replay motorunun Bar 0 üzerinde yarattığı yanılsama izole edilmiş, sentetik testlerle doğrulanmış ve bağımsız test paketiyle kilitlenmiştir.
2. **BE Kuralı Bir Edge Sağlamamaktadır:** Break-even kuralının kaldırılması (No-BE), önceki raporda göründüğü gibi brüt PnL'i kâra geçirmemektedir. Gerçekte No-BE senaryosu **-11,00R brüt** ve **-21,92R net** zararla sonuçlanmaktadır.
3. **Temel Strateji Problemi:** Sistem 15M dar stoplarda aşırı sürtünme maliyetine maruz kalmakta (10,92R maliyet drag), 1H geniş stoplarda ise maliyet düşse bile kazanma oranı (%26-%28) 2R hedefin kârlı olması için gereken minimum eşiği (%33+) yakalayamamaktadır.
4. **Kesin Karar:**
   - Hiçbir BE kuralı veya stop türü üretime aktarılmayacaktır.
   - Üretim stratejisinde hiçbir değişiklik yapılmamıştır.
   - Canlı emir motoru kapalı kalmaya devam etmektedir (`LIVE_ORDERS = false`).
   - Stratejide pozitif bir avantaj (edge) olduğunu iddia etmek bilimsel olarak geçersizdir.
