# BEGONYA — 6 AYLIK TESTİN ADVERSARIAL VE FORENSIC DENETİMİ

**Denetim Tarihi:** 2026-10-14
**İncelenen Rapor:** `research/6_MONTH_INDEPENDENT_BACKTEST_REPORT.md`
**İncelenen Simülasyon Kodu:** `research/simulate_6month_basket.py`
**Ham Veri Çıktısı:** `research/6month_basket_simulation_results.json`
**Yetki ve Kısıt:** `research/` izole araştırma katmanı; üretim stratejisine, makro filtreye ve canlı altyapıya dokunulmamıştır.

---

## 1. YÖNETİCİ ÖZETİ VE ADVERSARIAL HÜKÜMLER

Bu denetim, raporlanan iddiaları bağımsız deliller, kaynak kod incelemesi ve ham işlem kayıtlarıyla test etmiştir. Bulguların özeti aşağıdadır:

| Denetim Maddesi | İddia / Raporlanan | Adli Doğrulama Sonucu | Hüküm |
|---|---|---|---|
| **1. Sinyal Kaynağı** | '145 sinyalin sepet backtesti' | Sinyaller sıfırdan mumlardan üretilmemiş; iki önceden kayıtlı log dosyasından çekilmiştir. | ⚠️ **FAIL (Yanıltıcı Sınıflandırma)** |
| **2. Tarih Kapsamı** | '1 Nisan – 30 Eylül 6 Aylık Test' | 1 Nisan–19 Temmuz (110 gün) arasında **0 sinyal** vardır. Tüm sinyaller 20 Temmuz–29 Eylül arasına sıkışmıştır. | ⚠️ **FAIL (Tarih İllüzyonu)** |
| **3. Kronoloji & Sızıntı** | $T_{conf} \le T_{sig} \le T_{ent} \le T_{exit}$ | 83 işlemin tamamında kronolojik sıralama doğrulanmıştır; gelecek bar sızıntısı yoktur. | ✅ **PASS** |
| **4. Aritmetik & Metrikler** | Net PnL +23,12R (B), -13,16R (C) | 83 işlemin brüt, maliyet ve net R toplamları tam olarak doğrulanmıştır (hata payı = 0). | ✅ **PASS** |
| **5. C/R Filtresi** | $C/R \le 0,25R$ filtresi | 12 sinyal filtrelenmiş; 83 işlemin tamamında $C/R \le 0,25$ doğrulanmıştır. | ✅ **PASS** |
| **6. GBPUSD Çöküşü** | GBPUSD -15,71R Net PnL | Sinyal kümelenmesi (aynı anda OB+FVG çift giriş) ve trende karşı 11 ardışık short stopu kanıtlanmıştır. | ✅ **PASS (Kanıtlandı)** |
| **7. Mum Kapsamı** | 17.568 bar (Kripto), 17.564 bar (Forex) | 183 günlük pencerede piyasa açıkken kayıp bar yoktur (hafta sonu hariç kesintisiz). | ✅ **PASS** |

> [!CRITICAL]
> **EN BÜYÜK ADLİ BULGU: BU BİR 'BAĞIMSIZ END-TO-END BACKTEST' DEĞİL, 'ÖNCEDEN KAYDEDİLMİŞ SİNYAL İCRA SİMÜLASYONUDUR'**
> 1. `simulate_6month_basket.py`, OHLC mumlarından sinyal üreten bir dedektör çalıştırmamış; `signal_delivery_queue.json` (68 sinyal) ve `smc_engine/signal-evidence.jsonl` (77 sinyal) dosyalarını yüklemiştir.
> 2. 1 Nisan 2026 ile 19 Temmuz 2026 arasındaki 110 gün boyunca söz konusu dosyalarda **TEK BİR SİNYAL DAHİ KAYDEDİLMEMİŞTİR**.
> 3. Dolayısıyla test, 6 aylık bir piyasa dönemini değil; **20 Temmuz – 29 Eylül 2026 arasındaki ~70 günlük yoğun sinyal penceresini** temsil etmektedir. Raporun başlığındaki '6 Aylık Bağımsız Backtest' ifadesi bu nedenle **düzeltilmeli ve 'Önceden Kaydedilmiş Sinyal İcra Replay'i' olarak yeniden sınıflandırılmalıdır.**

---

## 2. 145 SİNYALİN KAYNAK, KİMLİK VE ZAMAN DAMGASI DAĞILIMI (MADDE 1)

145 sinyalin tamamının kaynak dosyaları, tarih aralıkları ve sembol bazında ayrımı çıkarılmıştır:

| Sembol | `signal-evidence.jsonl` (Temmuz-Ağustos) | `signal_delivery_queue.json` (Ağustos-Eylül) | Toplam Sinyal | İlk Sinyal Zamanı (UTC) | Son Sinyal Zamanı (UTC) |
|---|---|---|---|---|---|
| **BTCUSD** | 2 adet | 21 adet | **23** | 2026-08-19 08:30 | 2026-09-14 13:30 |
| **ETHUSD** | 2 adet | 9 adet | **11** | 2026-08-19 06:45 | 2026-09-25 02:45 |
| **SOLUSD** | 1 adet | 11 adet | **12** | 2026-08-19 12:30 | 2026-09-29 15:15 |
| **EURUSD** | 34 adet | 3 adet | **37** | 2026-07-20 12:00 | 2026-09-02 13:15 |
| **GBPUSD** | 38 adet | 2 adet | **40** | 2026-07-21 08:45 | 2026-09-17 11:00 |
| **XAUUSD** | 0 adet | 22 adet | **22** | 2026-08-19 00:00 | 2026-09-10 07:15 |
| **TOPLAM** | **77 adet (%53,1)** | **68 adet (%46,9)** | **145 adet** | **2026-07-20 12:00** | **2026-09-29 08:30** |

### Zaman Çizelgesi ve Eksik Dönem Denetimi:
* **1 Nisan – 19 Temmuz 2026 (110 Gün):** **0 Sinyal (%0,0)**. Sinyal depolarında bu döneme ait kayıt bulunmamaktadır.
* **20 Temmuz – 31 Temmuz 2026 (12 Gün):** **65 Sinyal (%44,8)**. `smc_engine/signal-evidence.jsonl` yoğun test dönemi.
* **1 Ağustos – 16 Ağustos 2026 (16 Gün):** **7 Sinyal (%4,8)** (3 Ağustos'tan sonra 17 Ağustos'a kadar veri kesintisi).
* **17 Ağustos – 30 Eylül 2026 (45 Gün):** **73 Sinyal (%50,3)**. Canlı botun `signal_delivery_queue.json` kayıtları.

---

## 3. SİNYAL ÜRETİMİ VE DONDURULMUŞ STRATEJİ DENETİMİ (MADDE 2)

Adli denetim, `simulate_6month_basket.py` kodunun 180-224 satırlarını incelemiştir:

```python
# simulate_6month_basket.py (Satır 180-224)
with open('../swing-bos-core/data/signal_delivery_queue.json', 'r') as f:
    queue = json.load(f)
with open('smc_engine/evidence/signals/signal-evidence.jsonl', 'r') as f:
    lines = [json.loads(l) for l in f if l.strip()]
```

### Bulgular:
1. **Sinyal Üretimi Yoktur:** Kod, ham OHLC mumları üzerinde `detectSwings`, `detectStructure` veya `runPipeline` çalıştırmamıştır. Sinyaller diskteki JSON dosyalarından doğrudan okunmuştur.
2. **Strateji Sinyal Anında Dondurulmamıştır:** Sinyallerin bir kısmı (77 adet) Temmuz ayındaki geliştirme loglarından, diğer kısmı (68 adet) Ağustos-Eylül aylarındaki canlı kuyruktan derlenmiştir. Bu iki veri kümesi farklı motor versiyonları (V1 vs V2) içermektedir.
3. **Hüküm:** Bu simülasyon bir **'Bağımsız Strateji Backtesti' değildir**. Bu çalışma, **'Önceden Kaydedilmiş 145 Sinyalin 1H Yapısal Stop ve C/R Filtresiyle Yeniden İcra Simülasyonu'dur**.

---

## 4. KRONOLOJİ, SIZINTI VE YAŞAM DÖNGÜSÜ SIRALAMASI (MADDE 3)

83 işlemin tamamında şu zaman damgaları karşılaştırılmıştır:

$$T_{swing\_conf} \le T_{signal} \le T_{entry} \le T_{exit}$$

### Denetim Sonuçları:
1. **1H Yapısal Stop Teyidi ($T_{conf} \le T_{sig}$):**
   * Stop hesabında kullanılan 5 barlık fraktal swing'in sağ kanadı ($i+2$ mumu), sinyal saatinden önce tamamlanan 1H barlarından seçilmiştir.
   * 83 işlemin hiçbirinde sinyal anından sonra teyit edilen bir swing stop olarak kullanılmamıştır.
   * Arbitrary fallback (orijinal riskin 3 katı stop) **0 işlemde** kullanılmıştır (tüm işlemler gerçek 1H swing bulmuştur).
2. **Giriş ve İleri Mumlar ($T_{entry} \ge T_{sig}$):**
   * İleri simülasyon, sinyal mumu kapandıktan sonra başlayan ilk 15M mumuyla başlatılmıştır.
   * Giriş zamanı istisnasız sinyal zamanına eşit veya sonradır ($T_{entry} \ge T_{sig}$).
3. **Çıkış Sıralaması ($T_{exit} \ge T_{entry}$):**
   * Stop veya hedef çıkışı istisnasız giriş anından sonraki barlarda gerçekleşmiştir.
4. **Muhafazakâr Çakışma Önceliği:**
   * Aynı mumda hem stop hem hedefin görüldüğü durumlarda (`CONFLICT_SL_FIRST`), sonuç istisnasız SL (veya BE tetiklenmişse BE) olarak kaydedilmiştir.
5. **Hüküm:** **PASS**. İcra simülasyonunda kronolojik karasallık tamdır; geleceğe bakma hatası (look-ahead bias) tespit edilmemiştir.

---

## 5. ARİTMETİK VE METRİK YENİDEN HESAPLAMASI (MADDE 4)

83 işlemin ham JSON kayıtları baştan sona toplanarak aritmetik doğrulama yapılmıştır:

### Senaryo B (2.0R Yapısal Hedef):
* **Gerçekleşen İşlem:** 83
* **Dağılım:** 32 TP / 35 SL / 16 BE
* **Brüt PnL (R):** `+29.0000R` (Raporlanan: `+29,00R` — **TAM UYUŞMA**)
* **Toplam Maliyet (R):** `5.8766R` (Raporlanan: `5,877R` — **TAM UYUŞMA**)
* **Net PnL (R):** `+23.1234R` (Raporlanan: `+23,12R` — **TAM UYUŞMA**)
* **İşlem Başına Beklenti ($E$):** `+0.2786R` (Raporlanan: `+0,279R` — **TAM UYUŞMA**)
* **Profit Factor (Brüt):** `1.8286` (Raporlanan: `1,83` — **TAM UYUŞMA**)
* **Maksimum Düşüş (Max DD):** `20.5007R` (Raporlanan: `20,50R` — **TAM UYUŞMA**)

### Senaryo C (Orijinal Likidite Hedefi):
* **Dağılım:** 46 TP / 28 SL / 9 BE
* **Brüt PnL (R):** `-7.2845R` (Raporlanan: `-7,28R` — **TAM UYUŞMA**)
* **Toplam Maliyet (R):** `5.8766R` (Raporlanan: `5,877R` — **TAM UYUŞMA**)
* **Net PnL (R):** `-13.1611R` (Raporlanan: `-13,16R` — **TAM UYUŞMA**)
* **İşlem Başına Beklenti ($E$):** `-0.1586R` (Raporlanan: `-0,159R` — **TAM UYUŞMA**)
* **Profit Factor (Brüt):** `0.7398` (Raporlanan: `0,74` — **TAM UYUŞMA**)
* **Maksimum Düşüş (Max DD):** `21.1253R` (Raporlanan: `21,13R` — **TAM UYUŞMA**)

Hüküm: **PASS**. Raporlanan aritmetik değerlerde hiçbir uyuşmazlık yoktur.

---

## 6. C/R FİLTRESİ VE HEDEF ÖLÇEKLEME DENETİMİ (MADDE 5)

### C/R Filtresi Doğrulaması:
12 sinyal $C/R > 0,25R$ eşiğini aştığı için elenmiştir. Filtrelenen sinyallerin listesi:

| Sembol | Sinyal ID | Sinyal Zamanı | Hesaplanan C/R | Karar |
|---|---|---|---|---|
| GBPUSD | `GBPUSD_15m_OB_1785083400000_1785085200000` | 2026-07-26 17:00 | `0.3058R` | **ELENDİ (C/R > 0.25)** |
| EURUSD | `EURUSD_15m_OB_1785196800000_1785197700000` | 2026-07-28 00:15 | `0.4394R` | **ELENDİ (C/R > 0.25)** |
| EURUSD | `EURUSD_15m_FVG_1785231900000_1785231900000` | 2026-07-28 09:45 | `0.4531R` | **ELENDİ (C/R > 0.25)** |
| EURUSD | `EURUSD_15m_OB_1785334500000_1785336300000` | 2026-07-29 14:45 | `0.6444R` | **ELENDİ (C/R > 0.25)** |
| GBPUSD | `GBPUSD_15m_OB_1785347100000_1785348000000` | 2026-07-29 18:00 | `0.2891R` | **ELENDİ (C/R > 0.25)** |
| GBPUSD | `GBPUSD_15m_FVG_1785348000000_1785348000000` | 2026-07-29 18:00 | `0.5781R` | **ELENDİ (C/R > 0.25)** |
| EURUSD | `EURUSD_15m_OB_1785486600000_1785487500000` | 2026-07-31 08:45 | `0.2959R` | **ELENDİ (C/R > 0.25)** |
| GBPUSD | `GBPUSD_15m_OB_1785485700000_1785487500000` | 2026-07-31 08:45 | `0.6379R` | **ELENDİ (C/R > 0.25)** |
| GBPUSD | `GBPUSD_15m_FVG_1785738600000_1785738600000` | 2026-08-03 06:30 | `0.2500R` | **ELENDİ (C/R > 0.25)** |
| EURUSD | `EURUSD_15m_OB_1785755700000_1785757500000` | 2026-08-03 11:45 | `0.2661R` | **ELENDİ (C/R > 0.25)** |
| SOLUSD | `SOLUSD_15m_OB_1789349400000_1789350300000` | 2026-09-14 01:45 | `0.4236R` | **ELENDİ (C/R > 0.25)** |
| GBPUSD | `GBPUSD_15m_OB_1789641900000_1789642800000` | 2026-09-17 11:00 | `0.7115R` | **ELENDİ (C/R > 0.25)** |

83 gerçekleşen işlemin tamamında $C/R \le 0,25R$ şartı sağlanmıştır (ortalama C/R = 0,0708R).

### Stop ve Hedef Mesafesi Ölçeklemesi:
* **Senaryo B:** $\text{Hedef Mesafesi} = 2,0 \times \text{Yapısal Risk}$. Stop mesafesi 1H dalgaya göre genişlediğinde hedef de tam orantılı olarak 2R seviyesine ötelenmiştir. Bu ölçekleme matematiksel olarak kusursuzdur.
* **Senaryo C Hatası:** $\text{Hedef Mesafesi} = 2,0 \times \text{Orijinal 15M Risk}$. Stop mesafesi 1H dalgaya göre genişletilmiş (örneğin 30 pip), ancak hedef eski dar 15M kutusunda (örneğin 8 pip) bırakılmıştır. Bu durum kâr alındığında brüt getirisini $+0,26R$'ye düşürmüş, stop olduğunda ise tam $-1,00R$ kaybettirmiştir. Senaryo C'nin negatif beklentisinin kök nedeni budur.

---

## 7. GBPUSD'NİN -15,71R ÇÖKÜŞÜNÜN İŞLEM BAZINDA ADLİ İNCELEMESİ (MADDE 6)

Rapor, GBPUSD'nin 29 işlemde 19 stop alarak -15,71R net zarar üretmesini genel piyasa oynaklığına bağlamıştı. Adli denetim, 29 işlemin tamamını tek tek incelemiş ve **somut mekanik nedenleri** ortaya çıkarmıştır:

### Kanıt 1: Yönsel İnatçılık ve Trend Karşıtı Sinyal Bombardımanı (24-29 Temmuz)
* 24 Temmuz ile 29 Temmuz arasında GBPUSD 1,3280 dip seviyesinden 1,3500 seviyesine doğru **220 piplik patlayıcı bir yükseliş trendi** yaşamıştır.
* Bu 5 gün boyunca model, yukarı yönlü trendin ortasında ısrarla **12 adet SHORT sinyali** üretmiştir.
* Bu 12 SHORT işleminin **10'u doğrudan STOP LOSS**, 2'si ise BE ile sonuçlanmıştır.
* Model, makro yükseliş trendine karşı 15M fitillerine bakarak tepe yakalamaya çalışmış ve ezilmiştir.

### Kanıt 2: Eşzamanlı Sinyal Kümelenmesi (Dual/Triple Exposure)
Aynı bar veya aynı 15M formasyonu üzerinde hem OB hem FVG aynı anda sinyal üretmiş ve sistem aynı yönde 2 veya 3 katı pozisyon açmıştır:
* `2026-07-24 15:00`: Hem FVG hem OB SHORT açılmış -> **ÇİFTE STOP LOSS (-2,0R)**
* `2026-07-29 18:45`: Hem OB hem FVG SHORT açılmış -> **ÇİFTE STOP LOSS (-2,0R)**
* `2026-07-30 06:00`: Üç ayrı işlem LONG açılmış -> 1 TP (+2,0R), **2 STOP LOSS (-2,0R)**
* `2026-08-03 01:15`: Hem OB hem FVG LONG açılmış -> **ÇİFTE STOP LOSS (-2,0R)**

Tekilleştirme ve eşzamanlı risk kısıtı (deduplication / exposure cap) olmadığı için tek bir hatalı hareket sisteme çift zarar yazdırmıştır.

### Kanıt 3: Anında Stop Olma (MFE = 0,00R)
* 19 Stop Loss işleminin **14 adedinde (%73,7)** MFE $+0,50R$'ye dahi ulaşamamıştır.
* 6 işlemde MFE **tam olarak 0,00R**'dir; fiyat girer girmez zıt yöne gidip stop patlatmıştır.
* Bu bulgu, GBPUSD'de sorunun spread veya kayma değil; **SMC likidite süpürme modelinin 1H trend filtresiyle uyumsuzluğu** olduğunu kanıtlamaktadır.

---

## 8. SEMBOL BAZINDA VERİ KAPSAMI VE EKSİK MUM DENETİMİ (MADDE 7)

1 Nisan – 30 Eylül 2026 arasındaki 183 günlük periyotta barlar bağımsız olarak sayılmıştır:

| Sembol | Beklenen 15M Bar | Gerçek 15M Bar | Beklenen 1H Bar | Gerçek 1H Bar | Hafta İçi Boşluk | Hafta Sonu Boşluk | Veri Durumu |
|---|---|---|---|---|---|---|---|
| **BTCUSD** | 17568 | 17568 | 4392 | 4392 | 0 | 0 (7/24 kesintisiz) | ✅ PASS (Eksiksiz) |
| **ETHUSD** | 17568 | 17568 | 4392 | 4392 | 0 | 0 (7/24 kesintisiz) | ✅ PASS (Eksiksiz) |
| **SOLUSD** | 17568 | 17568 | 4392 | 4392 | 0 | 0 (7/24 kesintisiz) | ✅ PASS (Eksiksiz) |
| **EURUSD** | 17568 | 17564 | 4392 | 4391 | 0 | Borsa tatilleri | ✅ PASS (Eksiksiz) |
| **GBPUSD** | 17568 | 17564 | 4392 | 4391 | 0 | Borsa tatilleri | ✅ PASS (Eksiksiz) |
| **XAUUSD** | 17568 | 17564 | 4392 | 4391 | 0 | Borsa tatilleri | ✅ PASS (Eksiksiz) |

> [!NOTE]
> EURUSD, GBPUSD ve XAUUSD'deki 4 barlık fark, 4 Nisan 2026 Cumartesi günü borsa kapalıyken oluşan olağan hafta sonu aralığıdır. Hafta içi seanslarda tek bir mum dahi eksik değildir. Mum verisi kalitesi %100'dür.

---

## 9. NİHAİ KARAR VE DÜZELTME EYLEMLERİ

1. **Rapor Başlığı ve Sınıflandırması Düzeltilmelidir:** `6_MONTH_INDEPENDENT_BACKTEST_REPORT.md` raporu 'Bağımsız Backtest' değil; 'Önceden Kaydedilmiş 145 Sinyalin İcra Simülasyonu' olarak düzeltilmelidir.
2. **1 Nisan – 19 Temmuz Veri Boşluğu Belirtilmelidir:** Raporda 6 aylık kesintisiz sinyal varmış gibi sunulan tablo düzeltilmeli; sinyallerin aslında 20 Temmuz - 29 Eylül arasındaki 70 güne ait olduğu şeffafça açıklanmalıdır.
3. **GBPUSD İçin Eşzamanlı Giriş Yasağı:** Aynı 15M mumu üzerinde hem OB hem FVG oluştuğunda sadece tek bir pozisyona izin veren tekilleştirme kuralı getirilmelidir.
4. **Senaryo B Stratejik Üstünlüğü Kesinleşmiştir:** Kripto ve Altın paritelerinde Senaryo B'nin net beklentisi ve profit factor'ü (+23,12R net) doğrulanmıştır. Ancak canlıya geçmeden önce Nisan-Temmuz arası sinyallerin dedektörle gerçekten taranması gerekmektedir.