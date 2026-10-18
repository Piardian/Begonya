# BEGONYA — %100 ÜRETİM EŞDEĞERLİĞİ TARİHSEL REPLAY VE DELTA DENETİM RAPORU

**Belge Kodu:** `research/PRODUCTION_PARITY_REPLAY_REPORT.md`  
**Tarih:** 14 Ekim 2026 22:50 UTC+3  
**Dönem:** 1 Nisan 2026 – 30 Eylül 2026 (6 Ay, 17.568 Adet 15M Mumu)  
**Kapsam:** BTCUSD, ETHUSD, SOLUSD, EURUSD, GBPUSD, XAUUSD  
**Temel Hedef:** Replay motorunun üretim (`poller.ts`) mimarisiyle %100 eşdeğer hale getirilmesi, eski 23 işlemle farkların (delta) ortaya konması ve 15M Invalidation vs. 1H Yapısal Stop senaryolarının tarafsız ölçümü.

---

## 1. YÖNETİCİ ÖZETİ VE KARAR TABLOSU

> [!IMPORTANT]
> **Canlıya Geçiş Kararı: KESİNLİKLE KAPALI (STRICTLY OFF)**  
> Üretim kuralları dondurulmuş (`FROZEN`) durumdadır. Bu denetim, geçmişteki metodolojik kusurları (mum açılışında değerlendirme, ara barları atlama, tekilleştirme eksikliği) tamamen ortadan kaldırmış ve sistemin **gerçek üretim kurallarıyla** nasıl performans gösterdiğini ilk kez objektif olarak ortaya koymuştur.

| Denetim Boyutu | Eski Replay (`run_true_historical_replay.js`) | Yeni Üretim Eşdeğer Replay (`run_production_parity_replay.js`) | Sonuç ve Etki |
| :--- | :---: | :---: | :--- |
| **Zamanlama Semantiği** | $idx$ açılış zamanı (`curTime = T_open`) | $idx$ kapanış zamanı (`closeTs = T_open + 15m`) | **PASS:** Kırılım mumu kapandıktan sonra değerlendirilir; look-ahead fiziksel olarak sıfırdır. |
| **Tarama Adımı** | Yalnızca `breakIndices` (kırılım barları) | Her 15M mum kapanışı (Bar-by-Bar 17.568 adım) | **PASS:** Üretim poller'ı gibi tüm barlar taranır. Ara barlarda oluşan 24 yeni işlem tespit edilmiştir. |
| **Tekilleştirme (Dedup)** | Basit in-memory Map | `SetupFamilyGuard` (45 dk cooldown + impulse guard) | **PASS:** Üretim ile birebir aynı tekilleştirme anlık olarak işletilmiştir. |
| **Tespit Edilen Sinyal** | 94 Sinyal | **154 Sinyal** | Ara barların taranmasıyla sinyal yakalama oranı %63,8 artmıştır. |
| **Dolan İşlem (Filled)** | 23 İşlem | **38 İşlem** | 10 tam eşleşme, 4 zaman kayması, 9 hatalı işlem elendi, 24 yeni işlem eklendi. |
| **Senaryo 1 (15M Stop)** | Hesaplanmamıştı (Yalnızca 1H stop vardı) | **Net -13,92R** (Brüt -3,00R, Maliyet 10,92R) | **FAIL (Negatif Beklenti):** %76,3 BE oranı ve yüksek maliyet nedeniyle sermaye erimesi. |
| **Senaryo 2 (1H Stop)** | Net -0,93R (Eski 23 işlemde) | **Net -9,89R** (Brüt -2,00R, Maliyet 7,89R) | **FAIL (Negatif Beklenti):** Üretim eşdeğerliğinde 1H stop da negatif beklenti üretmiştir. |

---

## 2. ESKİ 23 İŞLEMLE KARŞILAŞTIRMA (DELTA ANALİZİ)

Eski replay'de raporlanan 23 işlemin yeni bar-by-bar üretim-eşdeğer motorundaki iz düşümü incelenmiştir:

### 2.1. Eski İşlemlerin Durumu
1. **Birebir Eşleşen İşlemler (10 Adet):**  
   Hem eski hem yeni motorda aynı gün ve saatte tespit edilmiş, geçerliliğini koruyan işlemlerdir (ör. BTC 11 Nisan 23:00, ETH 16 Nisan 21:15, BTC 29 Haziran 15:30).
2. **Kapanış Zamanına Kayan İşlemler (4 Adet):**  
   Eski motorda açılış zamanında ($idx-1$) tetiklenen, ancak gerçekte kırılım mumu tamamlandığında ($idx$) tespit edilen işlemlerdir (ör. ETH 6 Haziran, SOL 25 Haziran, BTC 13 Ağustos).
3. **Tamamen Elenen İşlemler (9 Adet):**  
   Eski motorun kırılım tamamlanmadan ara fiyattan sinyal üretmesi veya `SetupFamilyGuard`'ın aynı impulse'tan gelen mükerrer sinyalleri engellemesi sonucu elenen işlemlerdir (ör. ETH 9 Nisan +1,95R, ETH 25 Haziran +1,97R, BTC 9 Ağustos +1,85R).
4. **Yeni Keşfedilen İşlemler (24 Adet):**  
   Eski replay yalnızca kırılım olan barlarda çalıştığı için, kırılım sonrası oluşan ve sonraki barlarda aktifleşen POI'leri tamamen kaçırmıştı. Bar-by-bar tarama ile 24 adet daha önce görülmemiş geçerli işlem sisteme dahil olmuştur.

---

## 3. PERFORMANS SENARYOLARININ KARŞILAŞTIRMASI (38 İŞLEM)

1 Nisan – 30 Eylül 2026 arasındaki 38 dolan işlem üzerinde iki ana stop senaryosu eşzamanlı olarak simüle edilmiştir:

### 3.1. Senaryo 1 — Üretim 15M POI Invalidation Stopu
*(Giriş: FVG proximal / OB %50 CE, Stop: Zone dışı $\pm 1$ pip, TP: +2.0R, BE: +1.0R'da başabaşa çekme)*

| Sembol | İşlem Sayısı | TP | SL | BE | Brüt PnL (R) | Toplam Maliyet (R) | Net PnL (R) | Kâr Faktörü (PF) | Max DD (R) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **BTCUSD** | 9 | 1 | 1 | 7 | +1,00R | 4,92R | **-3,92R** | 2,00 | 3,92R |
| **ETHUSD** | 5 | 0 | 0 | 5 | +0,00R | 1,41R | **-1,41R** | — | 1,41R |
| **SOLUSD** | 6 | 0 | 0 | 6 | +0,00R | 2,69R | **-2,69R** | — | 2,69R |
| **EURUSD** | 0 | 0 | 0 | 0 | 0,00R | 0,00R | **0,00R** | — | 0,00R |
| **GBPUSD** | 2 | 0 | 1 | 1 | -1,00R | 0,58R | **-1,58R** | 0,00 | 1,58R |
| **XAUUSD** | 16 | 1 | 5 | 10 | -3,00R | 1,31R | **-4,31R** | 0,40 | 4,87R |
| **TOPLAM PORTFÖY** | **38** | **2 (%5,3)** | **7 (%18,4)** | **29 (%76,3)** | **-3,00R** | **10,92R** | **-13,92R** | **0,57** | **13,92R** |

---

### 3.2. Senaryo 2 — Araştırma 1H Yapısal Swing Stopu
*(Giriş: FVG proximal / OB %50 CE, Stop: Teyitli 1H Swing High/Low $\pm$ Buffer, TP: +2.0R Yapısal, BE: +1.0R'da başabaşa)*

| Sembol | İşlem Sayısı | TP | SL | BE | Brüt PnL (R) | Toplam Maliyet (R) | Net PnL (R) | Kâr Faktörü (PF) | Max DD (R) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **BTCUSD** | 9 | 1 | 1 | 7 | +1,00R | 2,20R | **-1,20R** | 2,00 | 2,11R |
| **ETHUSD** | 5 | 1 | 0 | 4 | +2,00R | 0,87R | **+1,13R** | — | 0,52R |
| **SOLUSD** | 6 | 0 | 4 | 2 | -4,00R | 1,79R | **-5,79R** | 0,00 | 5,79R |
| **EURUSD** | 0 | 0 | 0 | 0 | 0,00R | 0,00R | **0,00R** | — | 0,00R |
| **GBPUSD** | 2 | 1 | 0 | 1 | +2,00R | 0,65R | **+1,35R** | — | 0,51R |
| **XAUUSD** | 16 | 1 | 5 | 10 | -3,00R | 2,38R | **-5,38R** | 0,40 | 5,38R |
| **TOPLAM PORTFÖY** | **38** | **4 (%10,5)** | **10 (%26,3)** | **24 (%63,2)** | **-2,00R** | **7,89R** | **-9,89R** | **0,80** | **12,07R** |

---

## 4. KRİTİK ADVERSARIAL BULGU: "BREAK-EVEN (BE) ERİMESİ"

Bu denetimin en çarpıcı nicel bulgusu, **Break-Even (BE) mekanizmasının yarattığı işlem erimesi** olmuştur:

1. **İşlemlerin Ezici Çoğunluğu BE Kapanmaktadır:**  
   - Senaryo 1'de 38 işlemin **29'u (%76,3)** başabaş kapanmıştır.  
   - Senaryo 2'de 38 işlemin **24'ü (%63,2)** başabaş kapanmıştır.
2. **Brüt 0R, Net Zarar Mekaniği:**  
   Fiyat +1.0R kâra ulaştığında stop maliyete çekilmektedir. Fiyat ardından giriş seviyesini test ettiğinde işlem `0,00R` brüt PnL ile kapanır. Ancak gidiş-dönüş komisyonu, spread ve kayma ödendiği için, **her BE kapanışı yatırımcıya net `-0,15R` ile `-0,55R` arasında doğrudan zarar yazar.**
3. **Erken BE Kuralı Olmasaydı Ne Olurdu? (No-BE Deneyi):**  
   Aynı 38 işlem üzerinde stop maliyete çekilmeksizin (sadece saf Stop vs TP) simülasyon çalıştırıldığında:
   - **Senaryo 1 (15M Stop):** TP sayısı 2'den **14'e** fırlamakta, Brüt PnL -3,00R'dan **+4,00R'a** yükselmektedir!  
   - Bu durum, BE mekanizmasının SMC piyasa yapısına aykırı olarak normal geri çekilmeleri (retest) "erken stop" ile cezalandırdığını ve hedefe gidecek 12 işlemi erken öldürdüğünü kanıtlamaktadır.

---

## 5. MALİYET DUYARLILIK VE $C_R$ ANALİZİ

### 5.1. Maliyet Çarpanı Duyarlılığı (38 İşlem)
| Senaryo / Çarpan | 1.00x (Ham ECN) | 1.25x | 1.50x | 2.00x (Perakende) |
| :--- | :---: | :---: | :---: | :---: |
| **Senaryo 1 (15M Stop)** | **-13,92R** | -16,64R | -19,37R | -24,83R |
| **Senaryo 2 (1H Stop)** | **-9,89R** | -11,86R | -13,84R | -17,78R |

### 5.2. $C_R \le 0.25$ Filtresi Uygulandığında
- **Senaryo 1:** 38 işlemin 15'i ($%39,5$) elenir, geriye 23 işlem kalır. Net getiri `-13,92R`'dan `-6,83R`'a toparlanır.
- **Senaryo 2:** 38 işlemin 7'si ($%18,4$) elenir, geriye 31 işlem kalır. Net getiri `-9,89R`'dan `-3,74R`'a toparlanır.

---

## 6. NİHAİ KARAR VE YOL HARİTASI

1. **Replay Güvenilirliği Sağlanmıştır:**  
   Replay motoru artık üretimle %100 aynı tetikleme, zamanlama ve tekilleştirme mekanizmasına sahiptir. Ölçüm sistemindeki soru işaretleri giderilmiştir.
2. **Strateji Canlıya Uygun Değildir:**  
   Ne 15M dar stop ne de 1H yapısal stop mevcut kurallarla pozitif beklenti sunmamaktadır. Canlı bot kesinlikle başlatılmamalıdır.
3. **Aşama 4 Araştırma Yolu:**  
   Sorunun temeli sinyal girişinden ziyade **+1.0R agresif Break-Even kuralı** ve **dar stop kaynaklı maliyet patlamasıdır**. Bir sonraki aşamada tekil değişken deneyleri (Ablation) olarak:
   - Break-Even kuralının esnetilmesi veya kaldırılması,
   - $C_R \le 0.20$ maliyet filtresinin test edilmesi,
   - XAUUSD ve SOLUSD gibi negatif sapan enstrümanların portföyden izole edilmesi araştırılmalıdır.
