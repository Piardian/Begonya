# SMC İnceleme Günlüğü

## Amaç

Bu günlük, Telegram bildirimleri ve ekran görüntülerinden yapılan **yalnızca gözlemsel SMC incelemelerini** kaydeder.

- İnceleme odağı: piyasa yapısı, likidite, displacement, BOS/CHoCH, order block, FVG, premium/discount, zamanlama, giriş–SL–TP mantığı ve işlem yönetimi.
- Her kayıtta, varsa yanlış varsayım, ihlal edilen SMC bağlamı ve bundan çıkarılacak ders not edilir.
- Bu günlük hiçbir sinyalin, strateji kuralının, botun veya kodun değiştirilmesi için kullanılmaz; yalnızca kayıt tutar.

## Kayıt Şablonu

### [Tarih/Saat] — [Enstrüman / Zaman Dilimi]

- Kaynak: Telegram mesajı / ekran görüntüsü
- Gözlem: 
- SMC bağlamı: 
- Hata veya zayıflık: 
- Neden hatalı: 
- Sonuç: 
- Tekrarlanabilir ders: 

---

## 🏛️ Tarihsel Arşiv (20 — 21 Ağustos 2026 SMC Otopsisi)

Bu bölüm, sistemin erken döneminde üretilen ve loglardan çıkarılan işlemlerin **baştan tek tek SMC yapısı, P/D, Likidite, Trend ve Kırılım kalitesi açısından incelenip analiz edilmiş kayıtlarını** içerir.

### H1. [2026-08-20 13:15 TSİ / 10:15 UTC] — GBPJPY (15M OB & FVG - AL)
- **Kaynak:** Telegram Sinyali (`GBPJPY_15m_OB_1787209200000_1787211000000` & `FVG_...`)
- **Bot Puanı:** Grade A+ (8/9)
- **Giriş Bölgesi:** 215.570 — 215.794 | **Anlık Fiyat:** 216.142 | **Stop:** 215.570 altı
- **Durum:** ⏳ **BEKLEMEDE / UNTESTED** — Fiyat yukarı trendini sürdürdü, 215.57 bölgesine geri dönmedi.
- **SMC Analizi & Notu:**
  - **P/D Durumu:** `4H: Pahalı (Premium) | 1H: Denge | 15M: Ucuz`
  - **Likidite:** `Likidite: Nötr` (Öncesinde sweep yok).
  - **Ders:** 4H Pahalı bölgedeyken oluşan iç yapı OB'leri, agresif trend devamında re-test vermeden uzaklaşabilir.

### H2. [2026-08-20 23:24 TSİ / 20:24 UTC] — AUDCHF (15M OB - SAT)
- **Kaynak:** Telegram Sinyali (`AUDCHF_15m_OB_1787144400000_1787146200000`)
- **Bot Puanı:** Grade A (7/9)
- **Giriş Bölgesi:** 0.57279 — 0.57359 | **Anlık Fiyat:** 0.56948 | **Stop:** 0.57359 üstü
- **Durum:** ❌ **STOP / GEÇERSİZ** — Bölgeden 0.69R zayıf bir reaksiyon verdikten sonra ana yükseliş trendi bölgeyi yukarı delip geçti.
- **SMC Otopsisi & Kritik Hata:**
  - **Ölümcül Hata (Counter-Trend):** 4H ve 1H trendi **BULLISH (Yukarı)** iken bot SAT (Short) sinyali üretti!
  - **Neden Stop Oldu:** Ana HTF trendi yukarıyken açılan karşı trend short işlemi, akıllı paranın alıcı dalgasına ezildi.
  - **Ders:** 4H ana trendiyle zıt hiçbir işleme Grade A/A+ verilemez (4H Trend Kilidi hayati önemdedir).

### H3. [2026-08-21 09:15 TSİ / 06:15 UTC] — AUDUSD (15M OB & FVG - AL) [5 Sinyal Spamı]
- **Kaynak:** Telegram Sinyali (`AUDUSD_15m_OB_...` 5 adet farklı geçmiş seviye)
- **Bot Puanı:** Grade A+ (8/9) ve Grade A (6/9)
- **Giriş Bölgesi:** 0.70696 — 0.71409 (5 Ayrı Bölge) | **Anlık Fiyat:** 0.71434
- **Durum:** ❌ **STOP / GEÇERSİZ** — En üstteki 0.71388 OB'si 1.52R tepki verdi ancak ana düşüş dalgası tüm bölgeleri süpürdü.
- **SMC Otopsisi & Kritik Hata:**
  - **Ölümcül Hata (Counter-Trend):** 4H ve 1H trendi **BEARISH (Düşüş)** iken bot AL (Long) sinyalleri fırlattı!
  - **Neden Stop Oldu:** 4H düşüş trendindeki paritede iç yapı AL sinyalleri sadece küçük bir "düzeltme tepkisi" (1.5R) verdi, ardından ana trende yenilerek delindi.

### H4. [2026-08-21 10:45 TSİ / 07:45 UTC] — USDJPY (15M OB & FVG - SAT)
- **Kaynak:** Telegram Sinyali (`USDJPY_15m_OB_...` & `FVG_...`)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 158.922 — 159.032 | **Anlık Fiyat:** 158.778
- **Durum:** ❌ **STOP / GEÇERSİZ** — Bölgeden **2.87R muazzam tepki** verdi ancak ana trend yukarı olduğu için nihai olarak stop oldu.
- **SMC Otopsisi:** 4H Bullish trendine karşı açılan işlem 15M'de harika bir tepki (2.87R) sağlasa da HTF uyumu olmadığı için swing devamı gelmedi.

### H5. [2026-08-21 13:45 TSİ / 10:45 UTC] — EURGBP (15M OB - AL)
- **Kaynak:** Telegram Sinyali (`EURGBP_15m_OB_1787297400000_1787299200000`)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 0.85641 — 0.85685 | **Anlık Fiyat:** 0.85704
- **Durum:** ❌ **STOP / GEÇERSİZ** — 0.8564 bölgesinden **2.70R tepki** verdi, ardından ana 4H düşüş trendi bölgeyi deldi.
- **SMC Otopsisi:** 4H Bearish trendine karşı Long açılması sebebiyle işlem sınırlı tepki (2.7R) verip stop oldu.

---

## 📝 Canlı Takip Kayıtları (24 — 28 Ağustos 2026)

### 1. [2026-08-26 01:45 TSİ / 22:45 UTC] — XAUUSD (15M OB - AL)

- **Kaynak:** Telegram Sinyali (`signalId: XAUUSD_15m_OB_1787694300000_1787697000000`) & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A+ (8/9)
- **Giriş Bölgesi:** 4656.98 - 4658.90 | **Anlık Fiyat:** 4669.45 | **Stop:** 4656.98 altı
- **Gözlem:**
  - Fiyat 4610 dip seviyesinden yükselip 4660 üzerine çıktıktan sonra 4656.98-4658.90 aralığında 15M OB tespit edilip 4669.45 seviyesinde yukarı BOS ile AL sinyali üretildi.
  - Fiyat giriş bölgesine (retest) geri çekildiğinde 1M üzerinde hiçbir LTF CHoCH/onay vermeden bölgeyi aşağı kırarak geçersiz (invalid) oldu.
- **SMC Bağlamı:**
  - **P/D Durumu:** Sinyal çıktısında `4H: Ucuz | 1H: Pahalı | 15M: Pahalı`. 1H ve 15M Premium (Pahalı) bölgede.
  - **Likidite:** Sinyal çıktısında `Likidite: Nötr`. Öncesinde SSL/Inducement alımı yok.
  - **1H HTF Yapısı:** 4656-4658 seviyesi daha önce 25 Ağustos sabahında çok sert kırılmış eski talep / yeni direnç (Breaker/Supply) alanı.
- **Hata veya Zayıflık (Botun Gevşekliği):**
  1. **P/D Filtresi Gevşekliği:** Hem 1H hem de 15M "Pahalı" (Premium) bölgesindeyken botun AL işlemine **A+ (8/9)** puanı vermesi.
  2. **Likidite Filtresi Gevşekliği:** Likidite sweep/inducement olmadan (`Likidite: Nötr`) A+ grade verilmesi.
  3. **Killzone / Seans Saati:** TSİ 01:45 (UTC 22:45), New York seansı sonrası likiditenin en sığ olduğu Dead Zone zamanı.
- **Neden Hatalı:**
  - SMC'nin temel kanununa göre: **"Discount'tan AL, Premium'dan SAT."** 1H ve 15M'de tepe/pahalı bölgede oluşan iç yapı (internal) OB'leri çoğunlukla tuzaktır ve alt likiditeyi almak için kırılır.
- **Durum:** 🛡️ **İPTAL / KORUNDU (1M LTF Onayı Vermeden Delindi — İşleme Girilmedi)** — Fiyat POI'yi tutamadı, 1M LTF onayı vermeden delip geçti. Manuel onay filtresi kullanıcıyı korudu.
- **Sonuç:** 🛡️ **İşlem Alınmadı (Sermaye Korundu)**
- **Tekrarlanabilir Ders & Sıkılaştırma Önerisi:**
  - 🎯 **Kural 1 (P/D Sıkılaştırması):** 1H veya 15M `Pahalı (Premium)` iken AL sinyallerine asla A veya A+ verilemez (Max Grade B veya doğrudan Red).
  - 🎯 **Kural 2 (Likidite Zorunluluğu):** Likidite durumu `Nötr` olan sinyaller A+ olamaz. A+ için net SSL/Inducement Sweep şartı aranmalı.

### 2. [2026-08-26 04:54 TSİ / 01:54 UTC] — AUDCAD (15M OB - AL)

- **Kaynak:** Telegram Sinyali (`signalId: AUDCAD_15m_OB_1787706900000_1787707800000`) & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 0.99151 - 0.99190 | **Anlık Fiyat:** 0.99403 | **Stop:** 0.99151 altı
- **Durum:** Beklemede (Fiyat giriş bölgesinin 21.3 pip üstünde, re-test bekleniyor)
- **Gözlem:**
  - Fiyat 24-25 Ağustos boyunca 0.9880 - 0.9920 yatay bandında (Range) sıkışmışken, 26 Ağustos 01:30'da (Asya seansı) çok sert ve dikey bir mumla 0.9920 Equal Highs (EQH) bölgesini yukarı kırıp 0.99403'e fırladı.
  - Bot bu dikey kırılımın tabanındaki 0.99151 - 0.99190 aralığını 15M OB olarak işaretleyip Grade A ile AL sinyali üretti.
- **SMC Bağlamı:**
  - **P/D Durumu:** Sinyal çıktısında `4H: Ucuz | 1H: Pahalı | 15M: Pahalı`.
  - **Likidite:** `Likidite: Nötr`. Alt likidite (SSL) veya Inducement temizliği yok; aksine fiyat 0.9920'deki Buy-Side Liquidity (BSL / EQH) havuzunu yeni süpürmüş (Sweep) durumda.
  - **HTF Bağlamı:** Fiyat çok uzun süredir devam eden bir Range'in en tepesinden (Range High / Premium) yukarı fırlamış durumda.
- **Hata veya Zayıflık (Botun Gevşekliği):**
  1. **BSL Sweep Sonrası Tepe Girişi (Turtle Soup Tuzağı):** 0.9920 gibi belirgin bir EQH/Direnç süpürüldükten sonra akıllı para (Smart Money) genelde alıcıları içeri çekip fiyatı Range içine veya Discount bölgesine (0.9880-0.9900) basar. Zirvede oluşan bu OB bir tuzak (Inducement) olabilir.
  2. **P/D Gevşekliği:** 1H ve 15M "Pahalı" iken Grade A verilmesi (1. işlemdeki hatanın aynısı).
  3. **Aşırı Fiyat Mesafesi (21.3 Pip):** Fiyat POI'den 21.3 pip yukarı fırladıktan sonra sinyal üretiliyor. Eğer fiyat oradan tekrar 21 pip düşerse, bu momentumun çöktüğünü gösterir ve OB'nin delinme ihtimali çok yüksektir.
- **Neden Dikkat Edilmeli:**
  - SMC'de Range High kırılımlarında doğrudan agresif Long aranmaz; önce kırılımın sahte (Sweep) olup olmadığı veya re-testte gerçek bir Discount yapısı oluşup oluşmadığı izlenir.
- **Tekrarlanabilir Ders & Sıkılaştırma Önerisi:**
  - 🎯 **Kural 3 (EQH / BSL Sweep Koruması):** Fiyat majör bir HTF EQH/Direnç seviyesini henüz yeni süpürdüyse ve 1H/15M Pahalı ise, tepedeki ani OB'lere Grade A verilmemelidir.

### 3. [2026-08-26 06:09 TSİ / 01:54 UTC] — NZDCHF (15M OB - SAT)

- **Kaynak:** Telegram Sinyali (`signalId: NZDCHF_15m_OB_1787706900000_1787708700000`) & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 0.47897 - 0.47914 | **Anlık Fiyat:** 0.47831 | **Stop:** 0.47914 üstü
- **Durum:** Beklemede (Fiyat giriş bölgesinin 6.6 pip altında, re-test bekleniyor)
- **Gözlem:**
  - Fiyat 25 Ağustos boyunca 0.4790 - 0.4800 aralığında yatay gittikten sonra, 26 Ağustos 01:30'da aşağı sert kırılarak 0.47831'e indi.
  - Bot kırılım bölgesinde (0.47897 - 0.47914) 15M Bearish OB tespit edip SAT yönünde Grade A sinyali üretti.
  - **Görsel / Çizim Hatası:** Kullanıcının haklı tespitiyle 1H grafikteki mavi Giriş Bölgesi 0.4800 tepe wick'lerine kaymışken, 15M ve 1M'de doğru seviye olan 0.4789-0.4791 aralığına oturmuştur (1H overlay koordinat kayması).
- **SMC Bağlamı:**
  - **P/D Durumu:** Sinyal çıktısında `4H: Pahalı | 1H: Ucuz | 15M: Ucuz`.
  - **Likidite:** `Likidite: Nötr`. Üst likidite süpürülmeden (BSL sweep olmadan) doğrudan dökülme.
  - **HTF Bağlamı:** Fiyat 1H ve 15M zaman dilimlerinde **UCUZ (Discount)** bölgesinde.
- **Hata veya Zayıflık (Botun Gevşekliği):**
  1. **3. Kez Tekrarlanan P/D Çelişkisi:** SAT işlemi aranırken fiyatın 1H ve 15M'de "Ucuz" (Discount) bölgesinde olması. SMC temel kuralı: **"Pahalıdan (Premium) SAT, Ucuzdan (Discount) AL."** Dibe vurmuş fiyattan Short açmak dipte yakalanma (liquidity injection) riskini doğurur.
  2. **Likidite Filtresi Yokluğu:** `Likidite: Nötr` iken yine Grade A verilmesi.
- **Neden Hatalı:**
  - 1H ve 15M seviyesinde Discount bölgesine inmiş bir fiyatta Bearish OB aramak, akıllı paranın alttaki Sell-Side Likiditeyi alıp yukarı dönme ihtimalini (Reversal) yok saymaktır.
- **Tekrarlanabilir Ders & Sıkılaştırma Önerisi:**
  - 🎯 **Kural 4 (P/D SAT Sıkılaştırması):** 1H veya 15M `Ucuz (Discount)` iken SAT sinyallerine asla A veya A+ verilemez (Max Grade B veya doğrudan Red).
  - 🎯 **Görsel Düzeltme:** 1H grafik çizicisindeki (chart overlay renderer) POI koordinat eşleme fonksiyonu kontrol edilmeli.

### 4. [2026-08-26 12:01 TSİ / 09:01 UTC] — BTCUSD (15M FVG - AL)

- **Kaynak:** Telegram Sinyali (`signalId: BTCUSD_15m_FVG_1787565600000_1787565600000`) & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 77602.80 - 77774.94 | **Anlık Fiyat:** 78707.59 | **Stop:** 77602.80 altı
- **Durum:** 🎯 **TP / BAŞARILI (FVG Re-test Sonrası Tepki)** — Fiyat 77602 - 77774 FVG bölgesine geri çekilip re-test verdikten sonra yukarı fırlayarak TP oldu.
- **Gözlem:**
  - 12:01 TSİ'de fiyat 78,707 seviyesindeyken 24 Ağustos'taki yükseliş kırılımına ait 77602 - 77774 aralığındaki 15M Bullish FVG tespit edilerek AL sinyali üretildi.
  - Sinyal anında fiyat FVG'nin 932.6 USD (%1.20) yukarısındaydı.
  - Fiyat sonrasında beklenen geri çekilmeyi (retest) yaparak FVG bölgesine temas etti; 1 dakikalık onay sonrası yukarı güçlü bir tepki vererek TP hedefine ulaştı.
- **SMC Bağlamı:**
  - **P/D Durumu:** `4H: Ucuz | 1H: Denge | 15M: Ucuz` (SMC uyumu başarılı: 4H ve 15M Ucuz / Discount bölgesinde).
  - **Bölge Türü:** FVG (Dengesizlik). Fiyat FVG'yi doldurup alıcı bularak yukarı devam etti.
- **Güçlü Yönler & Çıkarılan Ders:**
  1. **FVG Gücü:** Dengesizlik (FVG) alanları, trend yönündeki geri çekilmelerde çok güçlü birer talep mıknatısıdır.
  2. **Sabırlı Re-test:** Fiyat 930 dolar yukarıdayken aceleyle işleme girilmeyip "bölgeye geri çekilme bekle" uyarısına sadık kalınması başarılı bir giriş sağladı.
- **Tekrarlanabilir Ders & Motor Geliştirme Notu:**
  - 🎯 **Mesafe Filtresi İnce Ayarı:** Fiyat POI'den %1 civarı uzakta olsa dahi eğer HTF ve 15M P/D konumu "Ucuz (Discount)" ise bu FVG'ler yüksek potansiyelli işlem fırsatı sunmaktadır.

### 5. [2026-08-26 12:01 TSİ / 09:01 UTC] — BTCUSD (15M OB - AL)

- **Kaynak:** Telegram Sinyali (`signalId: BTCUSD_15m_OB_1787548500000_1787551200000`) & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 76946.01 - 77226.93 | **Anlık Fiyat:** 78707.59 | **Stop:** 76946.01 altı
- **Durum:** Beklemede (Fiyat giriş bölgesinin 1480.7 USD / %1.92 üstünde)
- **Gözlem:**
  - 4. sinyalden tam 51 saniye sonra fırlatılan 2. BTC sinyali.
  - Bu kez işaretlenen OB bölgesi (76946 - 77226), tam **2.5 gün öncesine (24 Ağustos sabah 06:00)** ait!
  - 1H ve 15M grafiklerindeki CHoCH etiketi 2.5 gün önceki kırılıma ait. Fiyat o tarihten sonra 81,500 zirvesine çıkıp geri dönmüşken, bot hala bu eski dip OB'sini aktif tutuyor.
- **SMC Bağlamı:**
  - **P/D Durumu:** `4H: Ucuz | 1H: Denge | 15M: Ucuz`
  - **POI Durumu:** Kesinlikle Bayat (Stale / Historical Ghost POI).
  - **Piyasa Yapısı:** Güncel piyasa 81,500'den düşüş (Bearish flow) halindedir. 2.5 gün önceki 15M OB'si güncel likidite havuzlarının tamamen dışındadır.
- **Hata veya Zayıflık (Botun Gevşekliği):**
  1. **Aynı Hatanın 2. Kanıtı (POI Yaş Limiti Yokluğu):** 15 dakikalık grafikte 240+ bar geride kalmış bir OB'nin hafızada tutulup sinyale dönüştürülmesi.
  2. **Aşırı Fiyat Mesafesi (%1.92 / 1480 USD):** Fiyatın 1500 dolar aşağı düşmesi halinde güncel piyasa yapısı zaten çökmüş olacaktır.
  3. **Kullanıcı Deneyimi & Gürültü:** Dakikalar içinde kullanıcının telefonuna düşen gereksiz zombi sinyaller.
- **Tekrarlanabilir Ders & Sıkılaştırma Önerisi:**
  - 🎯 **Kural 7 (Eski CHoCH/BOS Geçerlilik Süresi):** CHoCH veya BOS kırılımları oluştuktan sonra üzerinden belirli bir periyot/mum geçtikten sonra yeni bir swing yapısı oluşmuşsa eski yapı iptal edilmelidir.

### 6. [2026-08-26 12:01 TSİ / 09:01 UTC] — BTCUSD (15M OB - AL)

- **Kaynak:** Telegram Sinyali (`signalId: BTCUSD_15m_OB_1787298300000_1787300100000`) & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 76199.48 - 76640.06 | **Anlık Fiyat:** 78707.59 | **Stop:** 76199.48 altı
- **Durum:** Beklemede (Fiyat giriş bölgesinin **2067.5 USD / %2.70** üstünde)
- **Gözlem:**
  - 12:01'deki BTC spam dalgasının 3. sinyali.
  - İşaretlenen OB bölgesi (76199 - 76640) tam **4-5 GÜN ÖNCESİNE (21-22 Ağustos)** ait!
  - Grafikteki BOS ve OB tam 4 gün önceki ilk yükseliş kırılımına referans veriyor.
- **SMC Bağlamı:**
  - **POI Yaşı:** 4-5 gün (yüzlerce saatlik ve 15M mumu). Tamamen geçersiz / ölü bölge.
  - **Piyasa Yapısı:** 4 gün içinde fiyat 81,500'e kadar çıkıp birden fazla majör swing ve likidite döngüsü tamamlamıştır.
- **Hata veya Zayıflık (Botun Gevşekliği):**
  1. **Tarihi (Historical) POI Sızıntısı:** Botun hafızasındaki POI listesi temizlenmediği (TTL/Expiration mekanizması olmadığı) için günler öncesine ait test edilmemiş seviyeler Grade A olarak gönderiliyor.
  2. **Aşırı Mesafe (%2.70 / 2067 USD):** Fiyat 2000+ dolar uzaktayken "manuel onay bekle" uyarısı üretilmesi.
- **Tekrarlanabilir Ders & Sıkılaştırma Önerisi:**
  - 🎯 **Kural 8 (POI TTL / Memory Garbage Collection):** 15M POI havuzu sadece son 24 saatin (veya max 50 barın) POI'lerini tutmalıdır; test edilmeyen veya üzerinden yeni swing geçen tüm eski POI'ler hafızadan ve kuyruktan kalıcı olarak silinmelidir.

### 7. [2026-08-26 12:01 TSİ / 09:01 UTC] — BTCUSD (15M FVG - AL)

- **Kaynak:** Telegram Sinyali (`signalId: BTCUSD_15m_FVG_1787270400000_1787270400000`) & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 73155.37 - 73356.00 | **Anlık Fiyat:** 78707.59 | **Stop:** 73155.37 altı
- **Durum:** Beklemede (Fiyat giriş bölgesinin **5351.6 USD / %7.30** üstünde!)
- **Gözlem:**
  - 12:01'deki BTC fırtınasının 4. ve en uçuk sinyali.
  - İşaretlenen FVG bölgesi (73155 - 73356) tam **5 GÜN ÖNCESİNE (21 Ağustos)** ait!
  - 1H ve 15M grafiklerinde FVG alanı grafiğin en sol alt köşesinde (tarih öncesi bölgede) kalmış. Fiyat 5350 dolar yukarıdayken bot Telegram'a Grade A AL sinyali üretmiştir.
- **SMC Bağlamı:**
  - **POI Yaşı:** 5 gün / yüzlerce bar. Kesinlikle geçersiz.
  - **Piyasa Bağlamı:** 73,000 seviyesindeki bir 15M FVG'si güncel 78,000-81,000 piyasa yapısı için tamamen hükümsüzdür. Fiyatın oraya düşmesi %7'lik bir çöküş anlamına gelir ve 15M yükseliş yapısı çoktan yok olmuş olur.
- **Hata veya Zayıflık (Botun Gevşekliği):**
  1. **Aşırı Fiyat Mesafesi (%7.30 / 5351 USD):** Böylesi bir mesafedeki POI için sinyal üretilmesi sistemin mesafe filtresinin çalışmadığını gösterir.
  2. **POI Yaş Kontrolünün Sıfır Olması:** 5 günlük 15M FVG'sinin hala bellekte Grade A olarak puanlanabilmesi.
- **Tekrarlanabilir Ders & Sıkılaştırma Önerisi:**
  - 🎯 **Kural 9 (Hard Distance Cap):** Anlık fiyattan %1.0'den (veya ATR * 3'ten) daha uzakta kalan hiçbir POI Telegram bildirim kuyruğuna alınmamalıdır.

### 8. [2026-08-27 11:03 TSİ / 08:03 UTC] — ETHUSD (15M OB - AL)

- **Kaynak:** Telegram Sinyali (`signalId: ETHUSD_15m_OB_1787776200000_1787778000000`) & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A+ (9/9)
- **Giriş Bölgesi:** 2464.29 - 2469.75 | **Anlık Fiyat:** 2497.87 | **Stop:** 2464.29 altı
- **Durum:** ❌ **STOP / GEÇERSİZ (Bölge Delindi)** — Fiyat bölgeye indikten sonra 2405.97 seviyesine kadar çökerek stop oldu.
- **Gözlem:**
  - Fiyat 26 Ağustos 21:00'de tek bir büyük yükseliş mumuyla 2464 seviyesinden 2515 zirvesine fırladı.
  - Bot, bu hareketin tabanındaki 2464.29 - 2469.75 aralığını 15M Bullish OB olarak işaretledi.
  - Sinyal 14 saat sonra (27 Ağustos 11:03'te) fiyat 2515'ten 2497'ye geri çekilirken fırlatıldı ve **A+ (9/9)** puanı verildi.
  - Fiyat re-test için 2464 bölgesine indiğinde bölge tutunamadı; fiyat doğrudan 2405.97'ye kadar dökülerek OB'yi tamamen delip geçti.
- **SMC Bağlamı:**
  - **P/D Durumu:** Sinyal çıktısında açıkça belirtilmiş: `4H: Ucuz | 1H: Ucuz | 15M: Pahalı`.
  - **Likidite:** `Likidite: Nötr`. Hareket öncesinde hiçbir alt likidite (SSL) veya Inducement temizliği yapılmamış.
  - **1H HTF Yapısı:** Fiyat 24-25 Ağustos'ta 2520-2540 aralığında tepe (EQH) oluşturduktan sonra sert bir düşüş trendine girmişti. 2464 seviyesi bu düşüşün içinde zayıf bir "iç yapı (internal)" tepkisinden ibaretti.
- **Hata veya Zayıflık (Botun Yanlış Varsayımları & Neden Stop Oldu?):**
  1. **15M Pahalıda AL Verilmesine Rağmen 9/9 Puan:** Fiyat 15 dakikalık grafikte "Pahalı (Premium)" bölgesindeyken, AL işlemine maksimum puan olan **A+ (9/9)** verilmesi. SMC kanunlarına göre Pahalı bölgeden Long aramak tuzağa düşme riskini katlar.
  2. **Likidite Yakıtı Yokluğu (`Likidite: Nötr`):** Akıllı para (Smart Money) alt likiditeyi süpürmeden (SSL sweep yapmadan) kalıcı bir trend başlatmaz. Fiyatın 2405'e inmesinin asıl sebebi alttaki likidite havuzlarını temizleme arayışıdır.
  3. **Zaman Aşımı / Gecikmeli Sinyal:** 26 Ağustos akşamı oluşan bir hareket için 14 saat sonra fiyat tepeye çıkıp yorulmuşken sinyal üretilmesi.
### 9. [2026-08-24 11:30 TSİ] — ETHUSD (15M FVG - AL)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9)
- **Giriş Bölgesi:** 2473.31 - 2488.00 | **Anlık Fiyat:** 2492.44 | **Stop:** 2473.31 altı
- **Durum:** 🎯 **TP / BAŞARILI (Tam Bölgeden Tepki)** — Fiyat geri çekilmede FVG tavanına (2488) milimetrik temas edip 2510+ hedefine fırlayarak TP oldu.
- **Gözlem:**
  - 1H ve 15M grafiklerinde 1900 seviyelerinden 2500'e uzanan son derece sağlıklı, güçlü bir yükseliş trendi mevcuttu.
  - 24 Ağustos 11:30'da fiyat 2460 dip bölgesinden güçlü hacimli mumlarla yukarı BOS kırılımı yaptı ve arkasında 2473.31 - 2488.00 aralığında net bir 15M Bullish FVG bıraktı.
  - Fiyat 2492.44 seviyesindeyken (POI'nin yalnızca 4.4 USD / %0.18 üzerinde) sinyal üretildi.
  - Fiyat 2510 tepe seviyesini gördükten sonra 2488 FVG tavanına mükemmel bir re-test verdi ve buradan aldığı güçle yükselişine devam ederek TP aldı.
- **SMC Bağlamı:**
  - **P/D Durumu:** `4H: Denge | 1H: Pahalı | 15M: Pahalı`
  - **Displacement:** Güçlü, ardışık gövdeli mumlar ve arkasında temiz dengesizlik (Imbalance).
  - **Mesafe ve Zamanlama:** Fiyat FVG bölgesine son derece yakınken (%0.18) sinyal üretildi; bu sayede kullanıcı hızlı ve net bir aksiyon alabildi.
- **Neden Başarılı Oldu? (Güçlü Yönler):**
  1. **Taze ve Net FVG:** Bölge henüz hiç test edilmemiş (0 test), taze ve hacimli bir kurumsal dengesizlik alanıydı.
  2. **Yüksek Momentum:** Kırılım mumu arkasında boşluk bırakarak akıllı paranın agresif alış yaptığını doğruladı.
  3. **Milimetrik Re-test:** Fiyat FVG'nin içine dalıp stopu zorlamadan tam üst sınırından (2488) sekti.
### 10. [2026-08-31 10:00 TSİ / 07:00 UTC] — EURUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9)
- **Giriş Bölgesi:** 1.16029 - 1.16226 | **Anlık Fiyat:** 1.15873 | **Stop:** 1.16226 üstü
- **Durum:** 🎯 **TP / BAŞARILI** — Fiyat 1.1587 seviyesinden 1.16029 OB giriş bölgesine girdi, 1.16206 tepe seviyesine kadar re-test verdi ve 1.16226 stopunu milimetrik koruyarak ana düşüş trendiyle hedefine ulaştı (TP).
- **Gözlem:**
  - 28 Ağustos'ta 1.1650 tepe seviyesinden başlayan sert düşüş dalgasında 1.16029 - 1.16226 aralığında 15M Bearish OB oluştu.
  - Fiyat 30 Ağustos'ta 1.1500 dip seviyesine kadar sert bir fitil atarak alt likiditeyi (Sell-Side Liquidity) süpürdü ve ardından yukarı düzeltme (pullback) başlattı.
  - Sinyal 31 Ağustos 10:00'da fiyat 1.15873 seviyesindeyken (POI'nin 15.6 pip altında) fırlatıldı.
  - Fiyat beklenen re-testi vererek 1.16029 OB tabanını geçti, 1.16206'ya kadar çıktı ve stop sınırını (1.16226) aşmadan kurumsal satıcı baskısıyla hedefine indi.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı (Bearish) | 1H: Aşağı (Bearish)` — Kusursuz çift zaman dilimi uyumu (Yeni motordaki 4H+1H kuralı devrede).
  - **P/D Durumu:** `4H: Pahalı (Premium) | 1H: Pahalı (Premium) | 15M: Ucuz (Discount)`. SAT işlemi için 4H ve 1H'nin Pahalı (Premium) bölgede olması SMC açısından en ideal satıcı konfigürasyonudur.
  - **Bölge Türü:** 15M Bearish Order Block (Düşüş Kırılım Tabanı).
- **Güçlü Yönler & SMC Değerlendirmesi:**
  1. **Tam Trend Hizalaması:** 4H ve 1H yönünün her ikisinin de düşüş olması, karşı-trend tuzaklarını engelledi.
  2. **İdeal Premium P/D Konumu:** Satış işlemi ararken fiyatın HTF'de Pahalı (Premium) bölgede bulunması kurumsal satış baskısını arkasına aldı.
  3. **Milimetrik Stop Koruması:** Fiyat 1.16206'ya kadar yükselmesine rağmen 1.16226 stop seviyesini milimetrik olarak kırmadı ve kusursuz bir OB satıcı tepkisi üreterek TP aldı.


### 11. [2026-08-31 10:01 TSİ / 07:01 UTC] — EURJPY (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş) + 4 Eylül TradingView İncelemesi
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 185.799 - 185.928 | **Anlık Fiyat:** 185.187 | **Stop:** 185.928 üstü
- **Durum:** 🛡️ **İPTAL / KORUNDU (LTF Onayı Vermeden 400 Pip Düştü — İşleme Girilmedi / Kaçan Fırsat)** — Fiyat 185.18 seviyesinden yukarı tırmanıp 185.772 seviyesine kadar (OB tabanının 2.6 pip yakınına) geldi; ancak 1M LTF grafiğinde net bir satıcı CHoCH onayı üretmeden doğrudan aşağı dönerek **181.78 seviyesine kadar tam 400 piplik devasa bir çöküş yaşadı**.
- **Gözlem:**
  - 28 Ağustos'ta 186.00 tepe seviyesinden sert düşüşle 15M CHoCH kırılımı gerçekleşti ve 185.799 - 185.928 aralığında 15M Bearish OB oluştu.
  - Sinyal 31 Ağustos 10:01'de fiyat 185.187 seviyesindeyken üretildi.
  - Fiyat 185.77 seviyesine kadar re-test verdi fakat 1M onayı vermediği için manuel kural gereği işleme girilmedi; ardından fiyat 181.78 dibine kadar 400 pip aktı.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı (Bearish) | 1H: Aşağı (Bearish)` — Tam HTF düşüş trendi uyumu.
  - **P/D Durumu:** `4H: Pahalı (Premium) | 1H: Pahalı (Premium) | 15M: Ucuz (Discount)`.
  - **Bölge Türü:** 15M Bearish Order Block (Düşüş Kırılım Tabanı).
- **SMC Analizi & Değerlendirme:**
  1. **Kusursuz Analiz ve Yön Doğruluğu:** Botun tespit ettiği 185.79 OB seviyesi ve SAT yönü kurumsal düşüş dalgasının milimetrik başlangıç noktası oldu (400 pip düşüş).
  2. **LTF Onayı ve Sığ Test (Kaçan Fırsat):** Fiyat OB'nin 2.6 pip altına kadar gelip LTF onayını tam netleştirmeden döndüğü için işlem kaçmış oldu. Disiplin korundu ancak yön doğruluğu %100 kanıtlandı.


### 12. [2026-08-31 10:01 TSİ / 07:01 UTC] — LTCUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9)
- **Giriş Bölgesi:** 49.71 - 49.79 | **Anlık Fiyat:** 48.66 | **Stop:** 49.79 üstü
- **Durum:** ❌ **STOP / GEÇERSİZ** — Fiyat 48.66'dan yukarı çekilip 49.71 OB bölgesine re-test verdi ve işleme girildi; ancak alıcılar 50.00 tepe likiditesine (BSL Sweep) ulaşmak için fiyatı 49.99'a kadar sürdü ve 49.79 stopu patladı.
- **Gözlem:**
  - 30 Ağustos akşamı 21:00'de fiyat 50.00 tepe seviyesinden sert bir düşüşle 47.40 dibine inerek 15M BOS gerçekleştirdi.
  - Bu düşüşün başladığı 49.71 - 49.79 aralığı 15M Bearish OB olarak işaretlendi.
  - Sinyal 31 Ağustos 10:01'de fiyat 48.66 seviyesindeyken (bölgenin 1.1 USD / %2.11 altında) fırlatıldı.
  - Fiyat geri çekilme (pullback) yaparak 49.71 giriş bölgesine ulaştı; ancak üst tepe likiditesinin çekimiyle bölge delindi.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı`
  - **P/D Durumu:** `4H: Denge | 1H: Denge | 15M: Pahalı`
  - **Bölge Türü:** 15M Decisional Bearish Order Block.
- **Hata veya Zayıflık (Neden Stop Oldu? / SMC Otopsisi):**
  1. **Mikro Stop Alanı (8 Cent / %0.16 Risk):** 49.71 - 49.79 bölgesi sadece 8 cent genişliğindeydi. Kripto piyasasında bu kadar dar bir OB stopu kolayca fitille patlatılır.
  2. **Üst Tepe Likiditesi (50.00 BSL Sweep):** 50.00 seviyesindeki Equal Highs likiditesi fiyatı yukarı çekti ve ara Decisional OB'yi süpürdü.

### 13. [2026-08-31 10:15 TSİ / 07:15 UTC] — LTCUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (8/9)
- **Giriş Bölgesi:** 50.06 - 50.42 | **Anlık Fiyat:** 48.62 | **Stop:** 50.42 üstü
- **Durum:** 🛡️ **İPTAL / KORUNDU (1M Onay Vermedi - İşleme Girilmedi)** — Fiyat 49.99 seviyesine kadar yükselerek alt Decisional OB'yi süpürdü ancak bu Extreme OB bölgesinde 1M grafiğinde kurumsal bir satıcı dönüş teyidi (LTF CHoCH) üretmedi. Kullanıcı onay görmediği için işleme girmedi ve sermaye korundu.
- **Gözlem:**
  - 12. işlemdeki 49.71 seviyesi iç yapı (Decisional) OB'si iken, bu sinyal en tepedeki asıl kurumsal satış kaynağı olan **Extreme Order Block (50.06 - 50.42)** seviyesidir.
  - Sinyal 31 Ağustos 10:15'te fiyat 48.62 seviyesindeyken üretildi.
  - Fiyat 49.99'a kadar çıkarak ara likiditeleri temizledi fakat 1M onayı vermediği için manuel filtre pozisyon açılmasını engelledi.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı` — Düşüş trendi tam uyumlu.
  - **P/D Durumu:** `4H: Denge | 1H: Pahalı (Premium) | 15M: Pahalı (Premium)`.
  - **Bölge Türü:** Extreme Bearish Order Block (Ana Tepe Satıcı Bloğu).
- **SMC Analizi & Filtre Gücü:**
  1. **1M Manuel Onayının Başarısı:** Fiyat bölge tabanına yaklaştığında dönüş mumu üretmediği için işlem açılmadı ve kullanıcı şüpheli piyasa hareketlerinden korundu.


### 14. [2026-08-31 10:30 TSİ / 07:30 UTC] — EURJPY (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9)
- **Giriş Bölgesi:** 185.237 - 185.322 | **Anlık Fiyat:** 185.035 | **Stop:** 185.322 üstü
- **Durum:** 🛡️ **İPTAL / KORUNDU (1M Onay Vermeden Delindi - İşleme Girilmedi)** — Fiyat 185.03'ten yükselerek 185.73 seviyesine kadar çıktı ve bu ara OB'yi yukarı delip geçti. Ancak 1 dakikalık onay mekanizması onay üretmediği için işleme girilmedi ve kullanıcı stop olmaktan korundu.
- **Gözlem:**
  - 31 Ağustos sabahında 185.30 seviyesinden aşağı yeni bir 15M BOS kırılımı oluştu ve tabanda 185.237 - 185.322 aralığında 15M Decisional OB tespit edildi.
  - Sinyal saat 10:30'da fiyat 185.035 seviyesindeyken üretildi.
  - Fiyat geri çekilme sırasında 185.322 bölgesine girdi; ancak 1M grafiğinde hiçbir satıcı CHoCH / tepe kırılımı vermeden doğrudan 185.73 Extreme bölgesine doğru yükselişini sürdürdü.
- **SMC Bağlamı:**
  - **HTF Trend:** `4H: Aşağı | 1H: Aşağı`
  - **P/D Durumu:** `4H: Pahalı | 1H: Pahalı | 15M: Ucuz`
  - **Bölge Türü:** 15M Decisional Bearish Order Block (Ara Yapı Kırılım Bloğu).
- **SMC Analizi & Başarılı Kural (Neden 1M Onay Filtresi Hayatidir?):**
  1. **Decisional OB Süpürülmesi:** Bu bölge ara bir Decisional OB olduğu için, akıllı para fiyatı daha yukarıdaki Extreme OB'ye (185.799) taşırken bu ara bölgeyi likidite olarak kullandı.
  2. **Manuel 1M Onay Disiplininin Gücü:** Sinyaldeki "1 dakikalık manuel onay bekle, onay yoksa işlem yok" kuralı sayesinde körü körüne limit emir atılmadı ve delip geçen muma karşı sermaye %100 korundu.
- **Tekrarlanabilir Ders & Sıkılaştırma Önerisi:**
  - 🎯 **Decisional OB'lerde Onay Şartı:** Extreme OB'ler limit emir için daha güvenliyken, Decisional (ara) OB'lerde mutlaka 1M/LTF CHoCH onayı görülmeden kesinlikle pozisyon açılmamalıdır.

### 15. [2026-08-31 11:15 TSİ / 08:15 UTC] — BTCUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9)
- **Giriş Bölgesi:** 80692.00 - 81175.94 | **Anlık Fiyat:** 78215.36 | **Stop:** 81175.94 üstü
- **Durum:** 🎯 **TP / BAŞARILI (Sinyal 22 ile Birleşik / Aynı Setup @ +2.3R)** — Operatör notu: *"hemen hemen 20.45 ile aynı işlem ikisini bir sayabiliriz"*. 80.6k Extreme bölgesinden başlayan düşüş dalgası 76.4k hedefine akarak kârla realize edildi.
- **Gözlem:**
  - 24-25 Ağustos'ta 81.500 tepe seviyesinden başlayan düşüş trendinde 80692 - 81175 aralığında 15M Bearish OB (Extreme Supply) oluştu.
  - Sinyal 31 Ağustos 11:15'te fiyat 78.215 seviyesindeyken üretildi.
  - Fiyat 20:45'teki Sinyal 22 ile birlikte 80.5k bölgesinden tetiklenip 76.4k dip likiditesine aktı.
- **SMC Bağlamı:**
  - **HTF Trend:** `4H: Aşağı | 1H: Aşağı` — Düşüş trendi tam uyumlu.
  - **P/D Durumu:** `4H: Denge | 1H: Ucuz | 15M: Pahalı`.
  - **Bölge Türü:** Extreme Bearish Order Block (81k Tepesi).
### 16. [2026-08-31 11:15 TSİ / 08:15 UTC] — LTCUSD (15M FVG - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 48.90 - 49.01 | **Anlık Fiyat:** 48.60 | **Stop:** 49.01 üstü
- **Durum:** ❌ **STOP / GEÇERSİZ (-750$)** — Fiyat 48.60'tan yukarı hareket ederek 48.90 FVG'sine girdi; ancak yukarıdaki asıl tepe likiditesine (50.00 EQH) ulaşmak isteyen alıcılar bölgeyi hiç dinlemeden 49.99'a kadar sürdü ve stop oldu.
- **Gözlem:**
  - 30 Ağustos akşamındaki 49.70 -> 47.40 çöküş mumu arkasında 48.90 - 49.01 aralığında 15M Bearish FVG bıraktı.
  - Sinyal 31 Ağustos 11:15'te fiyat 48.60 seviyesindeyken üretildi.
  - Fiyat toparlanma sırasında bu dar FVG'yi hızla deldi ve daha yukarıdaki 49.71 OB'si ile 50.06 Extreme seviyesine doğru yükselişine devam etti.
- **SMC Bağlamı:**
  - **HTF Trend:** `4H: Aşağı | 1H: Aşağı`
  - **P/D Durumu:** `4H: Pahalı | 1H: Pahalı | 15M: Pahalı`
  - **Bölge Türü:** 15M Decisional Bearish FVG (Düşüş Dengesizliği).
- **Hata veya Zayıflık (Neden Stop Oldu? / SMC Otopsisi):**
  1. **Inducement (Erken Satıcı Tuzağı):** 48.90 FVG'si, 50.00 ana tepe likiditesinin çok altında kalan bir "erken giriş tuzağı (Inducement)" idi. Akıllı para bu seviyeden satış açan perakendecilerin stoplarını patlatarak yukarıdaki 50.00 seviyesine kadar likidite topladı.
  2. **Aşırı Dar Risk Alanı (11 Cent / %0.22):** 48.90 - 49.01 bölgesi sadece 11 cent genişliğindeydi. Kriptoda bu tür mikro FVG'ler kolayca süpürülür.
  3. **Aynı Paritede 3 Farklı Seviye Çelişkisi:** Bot 31 Ağustos sabahı LTCUSD için 48.90 (FVG), 49.71 (OB) ve 50.06 (Extreme OB) olmak üzere 3 farklı seviye fırlattı. En alttaki seviye (48.90) ilk likidite süpürülen kurban oldu.
### 17. [2026-08-31 13:15 TSİ / 10:15 UTC] — BTCUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali (`signalId: BTCUSD_15m_OB_...`) & Telegram Bildirimi
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 78838.02 - 78918.01 | **Anlık Fiyat:** 78519.99 | **Stop:** 78918.01 üstü
- **Durum:** 🎯 **TP / BAŞARILI (+1400$)** — Fiyat 78.519 seviyesinden 78.838 OB giriş bölgesine geri çekilip re-test verdikten sonra ana düşüş trendine katılarak **76.420 seviyesine kadar 2.000+ dolarlık sert bir çöküş yaşadı** ve devasa bir kârla (+1400$) TP aldı.
- **Gözlem:**
  - 31 Ağustos öğle saatlerinde 78.900 seviyesindeki kırılım tabanında 78838.02 - 78918.01 aralığında 15M Bearish OB oluştu.
  - Sinyal saat 13:15'te fiyat 78.519 seviyesindeyken (POI'nin sadece 318 USD / %0.40 altında) fırlatıldı.
  - Fiyat kısa bir re-test ile bölgeye girip satıcı bularak doğrudan 76.420 dip likidite hedefine aktı.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı (Bearish) | 1H: Aşağı (Bearish)` — Tam trend desteği.
  - **P/D Durumu:** `4H: Denge | 1H: Pahalı (Premium) | 15M: Pahalı (Premium)`. Satış için 1H ve 15M'in Pahalı bölgede bulunması kurumsal satış akışını başlattı.
  - **Bölge Türü:** 15M Bearish Order Block.
### 18. [2026-08-31 14:15 TSİ / 11:15 UTC] — GBPCHF (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A+ (8/9)
- **Giriş Bölgesi:** 1.09624 - 1.09668 | **Anlık Fiyat:** 1.09472 | **Stop:** 1.09668 üstü
- **Durum:** ❌ **STOP / GEÇERSİZ (-1.000 $)** — Fiyat 1.09472'den yukarı tırmanarak 1.09624 giriş bölgesine girdi ve durmayarak 1.09961 tepe seviyesine kadar fırlayarak stopu patlattı.
- **Gözlem:**
  - 31 Ağustos sabahında 1.0965 tepe seviyesinden sert düşüşle 15M CHoCH kırılımı yapıldı ve tabanda 1.09624 - 1.09668 aralığında 15M Bearish OB oluştu.
  - Sinyal 14:15'te fiyat 1.09472 seviyesindeyken üretildi ve **A+ (8/9)** puanı verildi.
  - Fiyat geri çekilme sırasında bu dar OB'yi yukarı kırarak 1.09961'deki ana Buy-Side Liquidity (BSL) havuzunu temizlemeye gitti.
- **SMC Bağlamı:**
  - **HTF Trend:** `4H: Aşağı | 1H: Aşağı`
  - **P/D Durumu:** Sinyal çıktısında açıkça yazıyor: `4H: Pahalı | 1H: Ucuz | 15M: Ucuz`.
  - **Bölge Türü:** 15M Bearish Order Block.
- **Hata veya Zayıflık (Neden Stop Oldu? / SMC Açığı):**
  1. **Ölümcül P/D İhlali (`1H: Ucuz | 15M: Ucuz` iken SAT Verilmesi):** SMC'nin altın kuralı: **"Ucuzdan (Discount) SATILMAZ!"** Fiyat 1H ve 15M'de dip/ucuz bölgesindeyken akıllı para fiyatı yukarı (Premium/Pahalı) sürmek için alıcı toplar. Bu durumda SAT sinyaline **A+ (8/9)** verilmesi affedilemez bir P/D filtresi hatasıdır.
  2. **Mikro Stop Tuzağı (Sadece 4.4 Pip):** 1.09624 - 1.09668 aralığı sadece 4.4 pip genişliğindedir. GBPCHF gibi volatil bir çapraz paritede 4.4 piplik bir stop, normal piyasa spread ve fitil gürültüsünde doğrudan patlar.
  3. **Sol Tepe Likiditesi Çekimi (1.0990+ BSL Sweep):** 1.0990 üzerinde bekleyen alıcı likiditesi, fiyatı yukarı çeken bir mıknatıs oldu.
### 19. [2026-08-31 15:15 TSİ / 12:15 UTC] — XAUUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9)
- **Giriş Bölgesi:** 4555.39 - 4568.09 | **Anlık Fiyat:** 4459.61 | **Stop:** 4568.09 üstü
- **Durum:** 🎯 **TP / BAŞARILI (+2.0R / +1.500 $ @ %0.75 Risk)** — Operatör bildirimi: *"1-3 Eylül döneminde gelen 4551-4555 OB içindi o işlem, xau işlemide tp oldu 2 R aldık"*. Düşüş trendi yönünde taşınan işlem hedefine ulaşarak +2.0R kârla realize edildi.
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [A] Sakin / kademeli düzeltme (4551-4555 bölgesine retest)
  - **Soru 2 (1M Formasyonu):** [A] 1M CHoCH/BOS kırılımı teyidi
  - **Soru 3 (Giriş Kararı):** [A] 1M onayı sonrası limit emirle giriş
  - **Soru 4 (Sonuç):** [A] TP (+2.0R / +1.500 $)
  - **Soru 5 (Stop/İptal Nedeni):** [D] Yok (2R hedefi başarıyla alındı)
- **Gözlem:**
  - 29 Ağustos'ta 4640 tepe seviyesinden başlayan düşüş dalgasında 4555.39 - 4568.09 aralığında 15M Bearish OB oluştu.
  - Sinyal 31 Ağustos 15:15'te fiyat 4459.61 seviyesindeyken üretildi.
  - Fiyat en fazla 4462 seviyesine kadar hafif bir tepki verip 4555 Extreme OB'ye ulaşamadan doğrudan alt hedeflere aktı.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı (Bearish) | 1H: Aşağı (Bearish)` — Kusursuz düşüş trendi.
  - **P/D Durumu:** `4H: Pahalı | 1H: Pahalı | 15M: Pahalı`.
  - **Bölge Türü:** Extreme Bearish Order Block.
- **SMC Analizi & Ders:**
  1. **Aşırı Mesafe (%2.10 / 95.78 USD):** Fiyat POI'den 96 dolar uzaktayken sinyal üretilmesi, fiyatın o bölgeye dönmeme olasılığını artırmaktadır.
  2. **Güçlü Trendde Düzeltmesiz Düşüş:** 4H ve 1H düşüş trendi o kadar güçlüydü ki akıllı para fiyatın 4555 seviyesine çıkmasına izin vermeden doğrudan 4323 dip likiditesini süpürdü.
### 20. [2026-08-31 16:00 TSİ / 13:00 UTC] — XAUUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (8/9)
- **Giriş Bölgesi:** 4669.30 - 4673.55 | **Anlık Fiyat:** 4438.65 | **Stop:** 4673.55 üstü
- **Durum:** ⏳ **BEKLEMEDE (Bayat / Hayalet POI — Fiyat 230 USD / %4.94 Uzakta!)** — Sinyal anında fiyat bölgenin 230.64 USD altındaydı. Fiyat 4438 seviyesinden sonra 4323'e kadar düşüşünü sürdürdü ve bu 5 gün önceki eski zirveye hiç dönmedi.
- **Gözlem:**
  - İşaretlenen 4669.30 - 4673.55 aralığı tam **5 GÜN ÖNCESİNE (26 Ağustos zirvesine)** ait bir Bearish OB!
  - 15M ve 1M grafiklerinde giriş bölgesi ekranın en üstünde görünmez halde kalmış; anlık fiyat ise 230 dolar aşağıda tek çizgi gibi seyretmektedir.
  - Botun 5 gün önceki test edilmemiş bir seviyeyi hafızada tutup **Grade A (8/9)** ile Telegram'a fırlatması sistemsel bir POI yaş sınırı açığıdır.
- **SMC Bağlamı:**
  - **POI Yaşı:** 5 gün / 450+ bar geride kalmış. Tamamen geçersiz / ölü bölge.
  - **Mesafe:** %4.94 (230 USD). Bir 15M kurulumu için imkansız geri çekilme mesafesi.
  - **HTF Trend:** `4H: Aşağı | 1H: Aşağı`
- **Hata veya Zayıflık (Botun Gevşekliği):**
  1. **POI TTL / Yaş Sınırı Yokluğu:** 15M zaman diliminde günler öncesine ait POI'lerin aktif tutulması.
  2. **Maksimum Mesafe Filtresinin Çalışmaması:** Anlık fiyattan %5 uzaktaki seviyenin Telegram'a düşmesi.
### 21. [2026-08-31 19:15 TSİ / 16:15 UTC] — ETHUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9)
- **Giriş Bölgesi:** 2502.64 - 2512.56 | **Anlık Fiyat:** 2465.55 | **Stop:** 2512.56 üstü
- **Durum:** 🛡️ **İPTAL / KORUNDU (1M Konfirmasyonu Vermedi — İşleme Girilmedi)** — Operatör bildirimi: *"confirme vermedi"*. Fiyat bölgeye re-test verirken 1M üzerinde kurumsal satıcı teyidi üretmediği için kural gereği işleme girilmedi, sermaye korundu.
- **Gözlem:**
  - 30 Ağustos'ta 2530 tepe seviyesinden başlayan düşüş dalgasında 2502.64 - 2512.56 aralığında 15M Bearish OB oluştu.
  - Sinyal 31 Ağustos 19:15'te fiyat 2465.55 seviyesindeyken üretildi.
  - Düşüş trendi güçlü olduğu için fiyat tepe Extreme OB'ye (2502) kadar çıkamadı ve ara seviyelerden (2490) doğrudan 2383 dip likiditesine aktı.
- **SMC Bağlamı:**
  - **HTF Trend:** `4H: Aşağı | 1H: Aşağı` — Düşüş trendi tam uyumlu.
  - **P/D Durumu:** `4H: Denge | 1H: Ucuz | 15M: Ucuz`.
  - **Bölge Türü:** 15M Extreme Bearish Order Block.
- **SMC Analizi & Ders:**
  1. **Discount'ta SAT Sinyali Üretilmesi:** 1H ve 15M "Ucuz (Discount)" bölgesindeyken üretilen SAT sinyallerinde fiyat genellikle Extreme OB'ye kadar derin düzeltme yapamaz; trend ya doğrudan devam eder ya da alıcı toplayıp ara seviyeden çöker.
### 22. [2026-08-31 20:45 TSİ / 17:45 UTC] — BTCUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 80593.58 - 80848.74 | **Anlık Fiyat:** 78911.33 | **Stop:** 80848.74 üstü
- **Durum:** 🎯 **TP / BAŞARILI (+2.3R @ %0.75 Risk)** — Operatör bildirimi: *"tp %0.75 risk 2.3 RR"*. Sinyal 15 ile aynı düşüş kurulumu olarak çalıştı, bölgeden reaksiyon alarak hedefe aktı ve +2.3R kârla realize edildi.
- **Gözlem:**
  - 28 Ağustos'taki 81.500 zirvesinden başlayan düşüş kırılımı tabanında 80593.58 - 80848.74 aralığında 15M Extreme Bearish OB işaretlendi.
  - Sinyal 31 Ağustos 20:45'te fiyat 78.911 seviyesindeyken üretildi.
  - Düşüş momentumu çok güçlü olduğu için fiyat 80.5k Extreme bölgesine derin bir re-test veremedi ve doğrudan 76.4k dip likiditesini temizledi.
- **SMC Bağlamı:**
  - **HTF Trend:** `4H: Aşağı | 1H: Aşağı` — Düşüş trendi tam uyumlu.
  - **P/D Durumu:** `4H: Pahalı | 1H: Pahalı | 15M: Pahalı`.
  - **Bölge Türü:** Extreme Bearish Order Block (81k Tepesi).
- **SMC Analizi & Ders:**
  1. **Aşırı Mesafe (%2.09 / 1.682 USD):** 15M intra-day sinyalleri için 1.600+ dolarlık mesafe büyüktür; fiyatın o mesafeyi geri çekilmesi agresif trendlerde gerçekleşmez.
### 23. [2026-09-01 04:15 TSİ / 01:15 UTC] — USDCHF (15M OB - AL)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A+ (8/9)
- **Giriş Bölgesi:** 0.80795 - 0.80842 | **Anlık Fiyat:** 0.80893 | **Stop:** 0.80795 altı
- **Durum:** 🎯 **TP / BAŞARILI (+2.000 $)** — Fiyat Asya / Midnight seansında 0.80795 - 0.80842 OB bölgesine geri çekilip taban likiditesini (SSL) süpürdükten sonra 1M üzerinde peş peşe boğa mumlarıyla yukarı patlayarak 0.8115+ hedefine uçtu ve büyük bir kârla (+2000$) TP aldı.
- **Gözlem:**
  - 29 Ağustos'taki devasa yukarı yönlü kırılım sonrası 31 Ağustos boyunca 0.8080 seviyesinde Equal Lows (EQL) likiditesi oluştu.
  - Sinyal 1 Eylül 04:15 TSİ'de fiyat 0.80893 seviyesindeyken (POI'nin sadece 5.1 pip üzerinde) fırlatıldı ve **A+ (8/9)** puanı verildi.
  - Gece seans açılışında fiyat 0.8080 tabanındaki likiditeyi süpürüp (Judas Swing) tam OB içinden muazzam bir alım hacmiyle patladı.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Yukarı | 1H: Yukarı` — Çift zaman dilimi boğa trendi.
  - **P/D Durumu:** `4H: Ucuz | 1H: Pahalı | 15M: Pahalı`.
  - **Bölge Türü:** 15M Bullish Order Block.
- **Neden Başarılı Oldu? (Güçlü Yönler):**
  1. **Kusursuz Mesafe ve Zamanlama:** Fiyat POI'den sadece **5.1 pip** uzaktaydı; bu sayede sinyal gelir gelmez re-test gerçekleşti ve aksiyon alındı.
  2. **1M Likidite Süpürmesi (SSL Sweep / Judas Swing):** 1M grafiğinde fiyat önceki taban fitillerini temizleyip anında gövdeli yeşil mumlarla tepeyi kırdı (LTF CHoCH).
  3. **Trend Yönünde Kurumsal İtme:** 4H ve 1H yükseliş trendi arkasında olduğu için 0.8115+ likiditeleri tertemiz alındı.
### 24. [2026-09-01 05:15 TSİ / 02:15 UTC] — CHFJPY (15M OB - SAT)

- **Kaynak:** Telegram Sinyali (`signalId: CHFJPY_15m_OB_...`) & Telegram Bildirimi
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 197.605 - 197.677 | **Anlık Fiyat:** 197.393 | **Stop:** 197.677 üstü
- **Durum:** 🎯 **TP / BAŞARILI (+750 $)** — Fiyat 197.393 seviyesinden 197.605 OB giriş bölgesine re-test verdikten sonra kurumsal satıcı tepkisiyle **197.072 seviyesine kadar 50+ pip çöküş yaşadı** ve hedefine ulaşarak (+750$) kârla kapandı.
- **Gözlem:**
  - 1 Eylül sabahında Asya seansı sırasında 197.605 - 197.677 aralığında 15M Bearish OB tespit edildi.
  - Sinyal saat 05:15'te fiyat 197.393 seviyesindeyken (21.2 pip mesafede) fırlatıldı.
  - Fiyat bölgeye re-test verdikten sonra 1M üzerinde tepe onayı üreterek güçlü bir satış dalgası başlattı.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı` — Çift zaman dilimi düşüş trendi.
  - **P/D Durumu:** `4H: Pahalı | 1H: Ucuz | 15M: Ucuz`.
  - **Bölge Türü:** 15M Bearish Order Block.
### 25. [2026-09-01 05:45 TSİ / 02:45 UTC] — XAUUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A+ (8/9)
- **Giriş Bölgesi:** 4453.15 - 4462.06 | **Anlık Fiyat:** 4433.44 | **Stop:** 4462.06 üstü (~4463)
- **Durum:** ❌ **STOP / GEÇERSİZ (-1.000 $)** — Fiyat 4453 - 4462 giriş bölgesine re-test verdikten sonra stop seviyesini (4462.06 / ~4463) yukarı kırarak stop oldu (Grade A+ kuralı gereği -1.000 $ zarar).
- **Gözlem:**
  - 1 Eylül gece saatlerinde 4460 seviyesinden aşağı yeni bir 15M CHoCH kırılımı oluştu ve tabanda 4453.15 - 4462.06 aralığında taze bir 15M Bearish OB oluştu.
  - Sinyal 05:45'te fiyat 4433.44 seviyesindeyken fırlatıldı ve **A+ (8/9)** puanı verildi.
  - Fiyat geri çekilme sonrasında OB bölgesini yukarı delerek stopu patlattı.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı` — Kusursuz düşüş trendi.
  - **P/D Durumu:** `4H: Pahalı | 1H: Denge | 15M: Ucuz`.
  - **Bölge Türü:** 15M Taze Bearish Order Block.
- **Hata veya Zayıflık (SMC Otopsisi):**
  1. **Alt Likidite Temizliği Sonrası Sert Reaksiyon:** Fiyat alt dipleri süpürdükten sonra yukarı düzeltmede OB satıcı gücü yetersiz kaldı ve kurumsal alıcılar tepeyi deldi.

### 26. [2026-09-01 06:15 TSİ / 03:15 UTC] — NZDUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A+ (8/9)
- **Giriş Bölgesi:** 0.59254 - 0.59291 | **Anlık Fiyat:** 0.59098 | **Stop:** 0.59291 üstü
- **Durum:** ⏳ **BEKLEMEDE (Fiyat Bölgeye Ulaşmadan 0.5887'ye Düştü)** — Sinyal anında fiyat bölgenin 15.6 pip altındaydı. Fiyat en fazla 0.5914'e kadar yükselebildi ve 0.5925 OB bölgesine ulaşamadan güçlü düşüş trendiyle **0.58871 seviyesine kadar 22+ pip düştü**.
- **Gözlem:**
  - 1 Eylül gece Asya seansı açılışında 0.59254 - 0.59291 aralığında 15M Bearish OB oluştu.
  - Sinyal 06:15'te fiyat 0.59098 seviyesindeyken üretildi ve **A+ (8/9)** puanı verildi.
  - Fiyat tepe 0.5925 Extreme OB'ye kadar derin bir re-test vermeden doğrudan alt hedeflere aktı.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı` — Düşüş trendi tam uyumlu.
  - **P/D Durumu:** `4H: Pahalı | 1H: Ucuz | 15M: Ucuz`.
  - **Bölge Türü:** 15M Bearish Order Block.


### 27. [2026-09-01 07:13 TSİ / 04:13 UTC] — NZDUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 0.59625 - 0.59635 | **Anlık Fiyat:** 0.59080 | **Stop:** 0.59635 üstü
- **Durum:** ⏳ **BEKLEMEDE (Bayat / Hayalet POI — Fiyat 54.5 Pip Uzakta & Grafik Bozuk)** — Sinyal anında fiyat bölgenin tam 54.5 pip altındaydı. Fiyat 0.5908 seviyesinden sonra 0.5887'ye kadar düşüşünü sürdürdü ve 4 gün önceki bu eski tepeye hiç dönmedi.
- **Gözlem & Grafik Çizim Kusuru:**
  - İşaretlenen 0.59625 - 0.59635 aralığı **4 GÜN ÖNCESİNE (28 Ağustos zirvesine)** ait eski bir seviyedir.
  - Mesafe 55 pip olduğu için otomatik grafik çizici (TradingView renderer) Y eksenini aşırı sıkıştırmış; 15M mumları ekranın en altına tek sıra gibi yapışmış, giriş kutusu ise yukarıda anlamsız ince bir çizgiye dönüşmüştür (Görsel çizim hatası).
  - Sinyal 07:13'te üretildiğinde anlık fiyatın 55 pip geride olması sinyali anlamsız kılmıştır.
- **SMC Bağlamı:**
  - **POI Yaşı:** 4 gün / 380+ bar geride kalmış.
  - **Mesafe:** 54.5 pip (NZDUSD'nin günlük toplam hareket alanından / ADR'den fazla).
  - **HTF Trend:** `4H: Aşağı | 1H: Aşağı`
### 28. [2026-09-01 10:01 TSİ / 07:01 UTC] — USDJPY (15M OB - AL)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 159.845 - 159.901 | **Anlık Fiyat:** 159.956 | **Stop:** 159.845 altı
- **Durum:** 🛡️ **İPTAL / KORUNDU (1M LTF Onayı Vermedi - İşleme Girilmedi)** — Fiyat 159.845 tabanına re-test verdiğinde 1M üzerinde kurumsal bir tepe kırılımı (CHoCH onayı) vermediği için manuel kural gereği işleme girilmedi ve gereksiz riskten kaçınıldı.
- **Gözlem:**
  - 1 Eylül sabahında 159.90 seviyesinden yukarı 15M BOS kırılımı tabanında 159.845 - 159.901 aralığında 15M Bullish OB oluştu.
  - Sinyal 10:01'de fiyat 159.956 seviyesindeyken üretildi.
  - 1M grafiğinde fiyat bölgeye indiğinde tabanı fitillerle süpürdü fakat net bir LTF alıcı onay mumu üretmedi. Kullanıcı disiplinli davranarak onaysız pozisyon açmadı.
### 29. [2026-09-01 15:45 TSİ / 12:45 UTC] — ETHUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 2468.74 - 2473.93 | **Anlık Fiyat:** 2446.22 | **Stop:** 2473.93 üstü
- **Durum:** 🛡️ **İPTAL / KORUNDU (1M Onay Vermeden Bölge Üstü Kapanış Yaptı — İşleme Girilmedi)** — Fiyat giriş bölgesine geri çekildiğinde 1M üzerinde hiçbir satıcı teyidi (CHoCH onayı) vermeden doğrudan bölge üstünde mum kapanışı yaptı. Manuel onay kuralı sayesinde işleme girilmedi ve sermaye korundu.
- **Gözlem:**
  - 1 Eylül sabahı 2475 seviyesinden aşağı yeni bir 15M CHoCH kırılımı tabanında 2468.74 - 2473.93 aralığında 15M Bearish OB oluştu.
  - Sinyal 15:45'te fiyat 2446.22 seviyesindeyken üretildi.
  - Fiyat bölgeye re-test verirken 1M onayı üretmedi ve doğrudan bölge üstünde kapandı.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı` — Düşüş trendi tam uyumlu.
  - **P/D Durumu:** `4H: Pahalı | 1H: Ucuz | 15M: Ucuz`.
  - **Bölge Türü:** 15M Bearish Order Block.
### 30. [2026-09-01 15:45 TSİ / 12:45 UTC] — SOLUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9)
- **Giriş Bölgesi:** 105.68 - 106.03 | **Anlık Fiyat:** 101.98 | **Stop:** 106.03 üstü
- **Durum:** 🎯 **TP / BAŞARILI (+4R @ %0.75 Risk)** — Operatör bildirimi: *"4 R tp %0.75 risk"*. Kurulum kusursuz çalıştı ve işlem 4R kazançla TP seviyesine ulaştı.
- **Gözlem:**
  - 30 Ağustos'taki 106.00 tepe seviyesinden başlayan düşüş trendi tabanında 105.68 - 106.03 aralığında 15M Bearish OB oluştu (2 gün öncesine ait).
  - Sinyal 1 Eylül 15:45'te fiyat 101.98 seviyesindeyken üretildi.
  - Düşüş momentumu çok güçlü olduğu için fiyat 105.68 Extreme bölgesine derin bir re-test veremedi ve doğrudan 98.33 dip likiditesini temizledi.
### 31. [2026-09-01 21:00 TSİ / 18:00 UTC] — ETHUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 2432.65 - 2439.53 | **Anlık Fiyat:** 2416.93 | **Stop:** 2439.53 üstü
- **Durum:** 🛡️ **İPTAL / KORUNDU (1M Onay Vermeden Bölge Üstü Kapanış Yaptı — İşleme Girilmedi)** — Fiyat 2432 OB bölgesine çıktığında 1M üzerinde hiçbir dönüş onayı vermeden doğrudan bölge üzerinde mum kapanışı yaptı. Manuel 1M onay kuralı sayesinde işleme girilmedi ve sermaye korundu.
- **Gözlem:**
  - 1 Eylül 17:30 - 17:45 mumuyla 2439 seviyesinden aşağı yeni bir 15M BOS kırılımı oluştu ve tabanda 2432.65 - 2439.53 aralığında taze bir 15M Bearish OB oluştu.
  - Sinyal fiyat 2416.93 seviyesindeyken üretildi.
  - Fiyat bölgeye re-test sırasında 1M onayı vermeden bölgeyi delip üstünde kapandı.
### 32. [2026-09-02 03:15 TSİ / 00:15 UTC] — GBPJPY (15M OB - AL)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 216.203 - 216.234 | **Anlık Fiyat:** 216.439 | **Stop:** 216.203 altı
- **Durum:** 🛡️ **İPTAL / KORUNDU (1M LTF Onayı Vermeden 250 Pip Çöktü - İşleme Girilmedi)** — Fiyat 216.203 tabanına indiğinde 1M üzerinde hiçbir alıcı CHoCH onayı vermeden doğrudan 213.70 seviyesine kadar 250+ pip çöktü. Manuel 1M onay kuralı sayesinde işleme girilmedi ve kullanıcı devasa bir zarardan %100 korundu.
- **Gözlem:**
  - 31 Ağustos öğle saatlerindeki dip seviyesinde 216.203 - 216.234 aralığında 15M Bullish OB tespit edildi.
  - Sinyal 2 Eylül 03:15'te fiyat 216.439 seviyesindeyken üretildi.
  - Fiyat bölgeye geri çekildiğinde alıcı gücü oluşmadı ve piyasa sert bir kurumsal satış dalgasıyla 213.70 seviyesine kadar yuvarlandı.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Yukarı | 1H: Yukarı` (Ancak HTF trendi bu düşüşle birlikte aşağı kırıldı).
  - **P/D Durumu:** `4H: Ucuz | 1H: Denge | 15M: Ucuz`.
  - **Bölge Türü:** 15M Bullish Order Block.
- **SMC Analizi & Başarılı Filtre Dersi:**
  1. **Aşırı Dar Mikro Stop (3.1 Pip):** 216.203 - 216.234 aralığı sadece 3.1 pip genişliğindeydi. GBPJPY gibi ultra volatil bir paritede bu kadar dar OB'lere limit emir konulması intihardır.
### 33. [2026-09-02 06:45 TSİ / 03:45 UTC] — NZDCHF (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 0.47890 - 0.47922 | **Anlık Fiyat:** 0.47477 | **Stop:** 0.47922 üstü
- **Durum:** ⏳ **BEKLEMEDE (Fiyat Bölgeye Ulaşmadan 0.473'e Düştü)** — Sinyal anında fiyat bölgenin tam 41.3 pip altındaydı. Fiyat en fazla 0.4757'ye kadar hafif bir düzeltme yapabildi ve 0.4789 OB bölgesine ulaşamadan güçlü düşüş trendiyle **0.473 seviyesine kadar düştü**.
- **Gözlem:**
  - 2 Eylül gece Asya seansında 0.4790 tepe seviyesinden devasa bir kırılımla fiyat 0.4747 seviyesine çöktü ve tabanda 0.47890 - 0.47922 aralığında 15M Bearish OB oluştu.
  - Sinyal 06:45'te fiyat 0.47477 seviyesindeyken (41.3 pip uzakta) üretildi.
  - NZDCHF gibi düşük volatiliteli bir paritede fiyatın 41 pip geri çekilmesi gerçekleşmedi ve trend doğrudan alt hedeflere aktı.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı` — Düşüş trendi tam uyumlu.
  - **P/D Durumu:** `4H: Pahalı | 1H: Ucuz | 15M: Ucuz`.
  - **Bölge Türü:** 15M Bearish Order Block.
### 34. [2026-09-02 23:15 TSİ / 20:15 UTC] — EURUSD (15M OB - AL)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Durum:** ❌ **STOP (-%0.75 Risk / -0.75R / -750 $)** — Operatör bildirimi: *"açık işlemler arasında eur varsa stop oldu"*. Fiyat 1.15759 altındaki stop seviyesini kırarak pozisyon stop ile kapandı.
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [B] Agresif haber / sert düşüş mumuyla daldı
  - **Soru 2 (1M Formasyonu):** [A] 1M CHoCH/BOS alıcı dönüş teyidi verdi
  - **Soru 3 (Giriş Kararı):** [A] 1M teyidi sonrası Fib 0.50 re-test seviyesine limit emir atılarak girildi
  - **Soru 4 (Sonuç):** [B] Stop (-0.75R / -750 $)
  - **Soru 5 (Stop/İptal Nedeni):** [A] 1.15759 taban desteği tutmadı / sert haber ve momentum dalgası alıcı bloğunu delip geçti
- **Gözlem:**
  - 2 Eylül günü öğleden sonra 13:00'te 1.1580 seviyesinden yukarı doğru sert bir kurumsal ralliyle 15M CHoCH kırılımı oluştu ve tabanda 1.15759 - 1.15832 aralığında 15M Bullish OB oluştu.
  - Sinyal gece 23:15'te fiyat 1.15898 seviyesindeyken üretildi.
  - Yükseliş momentumu o kadar güçlüydü ki fiyat OB tavanının 0.9 pip üzerinde alıcı bularak doğrudan hedefe patladı.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Yukarı | 1H: Yukarı` — Kusursuz çift zaman dilimi uyumu.
  - **P/D Durumu:** `4H: Ucuz | 1H: Denge | 15M: Pahalı`.
  - **Bölge Türü:** 15M Bullish Order Block.
### 35. [2026-09-03 03:30 TSİ / 00:30 UTC] — NZDUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 0.58895 - 0.58942 | **Anlık Fiyat:** 0.58564 | **Stop:** 0.58942 üstü
- **Durum:** ✅ **TP (+2,000 $ / Hedef Likidite Alındı)** — Fiyat 0.58895 - 0.58942 OB giriş bölgesine re-test vererek işlemi tetikledikten sonra 4H+1H düşüş trendi doğrultusunda alt hedeflere akarak TP oldu (+2,000 $ kâr realize edildi).
- **Gözlem:**
  - 2 Eylül sabahı 0.5890 tepe seviyesinden aşağı yeni bir 15M BOS kırılımı oluştu ve tabanda 0.58895 - 0.58942 aralığında 15M Bearish OB tespit edildi.
  - Sinyal 33.1 pip uzaktayken üretildi; ardından fiyat düzeltmesini tamamlayıp 0.58895 giriş bölgesine temas ederek işlemi aktif hale getirdi.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Düşüş (Aşağı) | 1H: Düşüş (Aşağı)` — Tam çift zaman dilimi uyumu.
  - **P/D Durumu:** `4H: Denge | 1H: Pahalı (Premium) | 15M: Pahalı (Premium)`.
  - **Bölge Türü:** 15M Bearish Order Block.
- **Sonuç & Kâr Realizasyonu:**
  - 🎯 Kurumsal düşüş yönü kusursuz çalıştı. Hedef likidite bölgesinde işlem başarıyla kapatıldı (+2,000 $).

### 36. [2026-09-03 22:04 TSİ / 19:04 UTC] — EURCHF (15M OB - AL)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 0.94060 - 0.94124 | **Anlık Fiyat:** 0.94161 | **Stop:** 0.94060 altı
- **Durum:** ❌ **STOP / GEÇERSİZ (-750 $)** — Fiyat 0.9416 seviyesinden 0.94060 - 0.94124 OB bölgesine indikten sonra destek bulamayarak 0.94060 stop seviyesini aşağı kırdı (Grade A kuralı gereği -750 $ zarar).
- **Gözlem:**
  - 2 Eylül sabahı 07:00'de 0.9406 seviyesinden yukarı 15M CHoCH kırılımı tabanında 0.94060 - 0.94124 aralığında 15M Bullish OB oluştu (1.5 gün / 38 saat öncesine ait).
  - Sinyal 3 Eylül 22:04'te fiyat 0.94161 seviyesindeyken üretildi.
  - Fiyat 0.9440 zirvesinden sert geri çekilerek bayat OB tabanını delip geçti.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Yukarı | 1H: Yukarı`
  - **P/D Durumu:** `4H: Ucuz | 1H: Denge | 15M: Ucuz`.
  - **Bölge Türü:** 15M Bullish Order Block.
- **Hata veya Zayıflık (Neden Stop Oldu? / SMC Otopsisi):**
### 37. [2026-09-03 05:30 TSİ / 02:30 UTC] — BTCUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A+ (9/9)
- **Giriş Bölgesi:** 78594.00 - 78686.00 | **Anlık Fiyat:** 77598.67 | **Stop:** 78686.00 üstü
- **Durum:** 🛡️ **İPTAL / KORUNDU (1M LTF Onayı Vermedi - İşleme Girilmedi)** — Fiyat 78.5k OB bölgesine yaklaştığında 1M üzerinde hiçbir kurumsal satıcı kırılımı (CHoCH onayı) vermediği için manuel onay kuralı gereği işleme girilmedi ve sermaye korundu.
- **Gözlem:**
  - 1 Eylül öğle saatlerinde 78.6k tepe seviyesinden başlayan düşüş dalgasında 78594.00 - 78686.00 aralığında 15M Bearish OB oluştu (2 gün öncesine ait).
  - Sinyal 3 Eylül 05:30'da fiyat 77598.67 seviyesindeyken (bölgenin 995.3 USD / %1.27 altında) fırlatıldı ve **A+ (9/9)** mükemmel puan verildi.
  - Fiyat bölgeye re-test sırasında 1M onayı üretmedi; kullanıcı disiplinli kalarak pozisyon açmadı.
### 38. [2026-09-03 06:15 TSİ / 03:15 UTC] — AUDUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 0.71700 - 0.71712 | **Anlık Fiyat:** 0.71652 | **Stop:** 0.71712 üstü
- **Durum:** 🛡️ **İPTAL / KORUNDU (1M LTF Onayı Vermedi - İşleme Girilmedi)** — Fiyat bölgeye re-test verdiğinde 1M üzerinde kurumsal satıcı kırılımı (CHoCH onayı) vermediği için manuel kural gereği işleme girilmedi ve sermaye korundu.
- **Gözlem:**
  - 2 Eylül akşamı 21:00'de 0.7171 seviyesinden aşağı yeni bir 15M CHoCH kırılımı gerçekleşti ve 0.71700 - 0.71712 aralığında aşırı dar (sadece 1.2 pip genişliğinde) 15M Bearish OB oluştu.
  - Sinyal 3 Eylül 06:15'te fiyat 0.71652 seviyesindeyken üretildi.
  - 1M grafiğinde fiyat bölgeye yaklaştığında satıcı onayı üretmediği için kullanıcı disiplinli davranarak işlem açmadı.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı` — Çift HTF düşüş uyumu.
  - **P/D Durumu:** `4H: Pahalı | 1H: Ucuz | 15M: Ucuz`.
  - **Bölge Türü:** 15M Bearish Order Block.
- **SMC Analizi & Başarılı Filtre Dersi:**
### 39. [2026-09-03 17:15 TSİ / 14:15 UTC] — NAS100 (15M OB - AL)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 705.18 - 707.36 | **Anlık Fiyat:** 711.80 | **Stop:** 705.18 altı
- **Durum:** 🛡️ **İPTAL / KORUNDU (1M Konfirmasyonu Vermedi — İşleme Girilmedi)** — Fiyat bölgeye geri çekildiğinde 1M üzerinde kurumsal alıcı onayı (CHoCH / Dönüş yapısı) vermediği için kural gereği işleme girilmedi ve sermaye başarıyla korundu.
- **Gözlem:**
  - 2 Eylül sabahı 705.18 seviyesinden yukarı doğru 15M CHoCH kırılımı gerçekleşti ve tabanda 705.18 - 707.36 aralığında 15M Bullish OB oluştu.
  - Sinyal 3 Eylül 17:15'te New York seansı öncesinde fiyat 711.80 seviyesindeyken üretildi.
  - Fiyat henüz bölgeye geri çekilmediği için işlem beklemede tutulmaktadır.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Yukarı | 1H: Yukarı` — Çift zaman dilimi yükseliş trendi.
  - **P/D Durumu:** `4H: Ucuz | 1H: Pahalı | 15M: Pahalı`.
  - **Bölge Türü:** 15M Bullish Order Block.
### 40. [2026-09-03 18:15 TSİ / 15:15 UTC] — NAS100 (15M OB - AL)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 711.47 - 713.48 | **Anlık Fiyat:** 715.96 | **Stop:** 711.47 altı
- **Durum:** ❌ **STOP** — Fiyat 711.47 - 713.48 taze OB bölgesine geri çekildikten sonra alıcı desteği bulamayarak 711.47 stop seviyesinin altına indi ve pozisyon stop oldu.
- **Gözlem:**
  - 3 Eylül günü New York seansı açılışında 713.50 seviyesinden yukarı sert bir 15M BOS kırılımı oluştu ve tabanda 711.47 - 713.48 aralığında taze bir 15M Bullish OB oluştu.
  - Sinyal 18:15'te fiyat 715.96 seviyesindeyken üretildi.
  - Fiyat taze kırılım bölgesine re-test için beklemededir.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Yukarı | 1H: Yukarı` — Tam yükseliş trendi uyumu.
### 41. [2026-09-04 05:15 TSİ / 02:15 UTC] — CADCHF (15M OB - AL)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 0.58379 - 0.58409 | **Anlık Fiyat:** 0.58568 | **Stop:** 0.58379 altı
- **Durum:** ⏳ **BEKLEMEDE (Giriş Bölgesine Geri Çekilme / Re-test Bekleniyor)** — Sinyal anında fiyat bölgenin 15.9 pip üstündeydi. Fiyat 0.5856 seviyesinde yatay seyrediyor; 0.58379 - 0.58409 OB bölgesine re-test ve 1M onayı bekleniyor.
- **Gözlem:**
  - 2 Eylül sabahı 10:00'da 0.5838 seviyesinden yukarı doğru 15M CHoCH kırılımı gerçekleşti ve tabanda 0.58379 - 0.58409 aralığında 15M Bullish OB oluştu (2 gün öncesine ait).
  - Sinyal 4 Eylül 05:15'te fiyat 0.58568 seviyesindeyken üretildi.
  - Fiyat henüz bölgeye geri çekilmediği için işlem beklemede tutulmaktadır.
### 42. [2026-09-04 16:01 TSİ / 13:01 UTC] — GBPUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 1.35281 - 1.35330 | **Anlık Fiyat:** 1.34990 | **Stop:** 1.35330 üstü
- **Durum:** ❌ **STOP / GEÇERSİZ (-0.5R / -%0.5 Risk)** — Operatör tarafından Fib 0.5 seviyesine %0.5 risk ile limit emir atıldı. Fiyat geri çekilmede limit emri tetikledikten sonra 1.35330 stop seviyesini yukarı kırarak stop oldu.
- **Gözlem:**
  - 4 Eylül öğle saatlerinde (12:30 mumu) 1.3530 seviyesinden düşüş mumuyla 15M BOS kırılımı oluştu ve tabanda 1.35281 - 1.35330 aralığında 15M Bearish OB oluştu.
  - Sinyal 16:01'de üretildi, operatör Fib 0.5 seviyesine limit emir kurdu. Fiyat bölgeyi delip geçerek stop oldu.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı` — Çift zaman dilimi düşüş uyumu vardı.
  - **P/D Durumu:** `4H: Pahalı | 1H: Denge | 15M: Ucuz`.
  - **Bölge Türü:** 15M Bearish Order Block.
- **Hata veya Zayıflık / Kritik Ders:**
  - 🎯 **Limit Emir Tuzağı & 1M Onay Zorunluluğu:** Fiyat 15M OB bölgesine geri çekildiğinde 1M üzerinde kurumsal onay (CHoCH / Displacement) beklenmeden salt Fib 0.5'e limit emir atılması, sert gelen alıcı momentumuna karşı savunmasız kalmaya neden oldu.
  - 🎯 **Pozitif Yön:** Operatörün tam risk yerine %0.50 defansif risk alması zararı yarı yarıya sınırlandırmıştır.
### 43. [2026-09-04 19:16 TSİ / 16:16 UTC] — CHFJPY (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 193.336 - 193.458 | **Anlık Fiyat:** 192.852 | **Stop:** 193.458 üstü
- **Durum:** ⏳ **BEKLEMEDE (Giriş Bölgesine Geri Çekilme / Re-test Bekleniyor)** — Sinyal anında fiyat bölgenin 48.4 point (48.4 pip) altındaydı. Fiyat 191.40 dip seviyesinden 192.85'e toparlandı; 193.336 - 193.458 OB bölgesine re-test ve 1M onayı bekleniyor.
- **Gözlem:**
  - 4 Eylül sabahı 193.45 seviyesinden aşağı yeni bir 15M CHoCH kırılımı gerçekleşti ve tabanda 193.336 - 193.458 aralığında 15M Bearish OB oluştu.
  - Sinyal 19:16'da fiyat 192.852 seviyesindeyken üretildi.
  - Fiyat bölgeye geri çekilme aşamasındadır.
### 44. [2026-09-04 20:01 TSİ / 17:01 UTC] — CHFJPY (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 195.434 - 195.574 | **Anlık Fiyat:** 192.884 | **Stop:** 195.574 üstü
- **Durum:** ⏳ **BEKLEMEDE (Bayat / Hayalet POI — Fiyat Tam 255 Pip Uzakta)** — Sinyal anında fiyat bölgenin tam **255.0 point (255.0 pip)** altındaydı. Fiyat 191.40 dibinden 192.88'e toparlanmışken 2 gün önceki bu eski tepeye dönmesi beklenmektedir.
- **Gözlem:**
  - 3 Eylül sabahı 195.50 seviyesindeki eski bir 15M Bearish OB seviyesidir (40+ saat öncesine ait).
  - Fiyat 195.50'den 191.40'a kadar 400+ pip çöktükten sonra sinyal motoru bu eski seviyeyi tekrar tespit ederek sinyal üretmiştir.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı`
### 45. [2026-09-04 20:15 TSİ / 17:15 UTC] — CHFJPY (15M OB - SAT) [Tekrar / Spam]

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9)
- **Giriş Bölgesi:** 195.412 - 195.508 | **Anlık Fiyat:** 192.807 | **Stop:** 195.508 üstü
- **Durum:** ⏳ **BEKLEMEDE (Bayat / Hayalet POI — Fiyat Tam 260 Pip Uzakta)** — 20:01'deki 44. sinyalin 14 dakika sonra hafif revize edilmiş haliyle yeniden fırlatılmış tekrar sinyalidir. Fiyat bölgenin tam **260.4 point (260 pip)** altındadır.
- **Gözlem:**
  - 3 Eylül sabahı 195.50 seviyesindeki eski OB kutusunun 20:01 sinyalinden hemen sonra ikinci kez tetiklenmesidir.
  - Sinyal 20:15'te fiyat 192.807 seviyesindeyken üretilmiştir.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı`
  - **P/D Durumu:** `4H: Denge | 1H: Pahalı | 15M: Pahalı`.
  - **Bölge Türü:** 15M Bayat Bearish Order Block (Spam Bildirim).
### 46. [2026-09-04 23:45 TSİ / 20:45 UTC] — USDJPY (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9)
- **Giriş Bölgesi:** 157.677 - 157.806 | **Anlık Fiyat:** 156.283 | **Stop:** 157.806 üstü
- **Durum:** ⏳ **BEKLEMEDE (Bayat / Hayalet POI — Fiyat 139.4 Pip Uzakta)** — Sinyal anında fiyat bölgenin tam **139.4 point (139.4 pip)** altındaydı. Fiyat 155.20 dibinden 156.28'e toparlanmışken 2 gün önceki 157.80 tepesine dönmesi beklenmektedir.
- **Gözlem:**
  - 3 Eylül sabahı 157.80 seviyesindeki 15M Bearish OB kırılım tabanıdır (40+ saat öncesine ait).
  - Sinyal 4 Eylül 23:45'te fiyat 156.283 seviyesindeyken üretilmiştir.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı` — Çift zaman dilimi düşüş trendi.
  - **P/D Durumu:** `4H: Pahalı | 1H: Pahalı | 15M: Pahalı`.
  - **Bölge Türü:** 15M Bayat Bearish Order Block.
- **Hata veya Zayıflık (Bot Açığı / SMC Otopsisi):**
  1. **Aşırı Mesafe Açığı (139.4 Pip):** 15M intra-day için 140 piplik geri çekilme bekleme sinyalleri elenmelidir.
  2. **POI Yaş Sınırı:** 24 saati geçmiş seviyeler otomatik olarak sistemden kaldırılmalıdır.

### 47. [2026-09-10 TSİ] — LTCUSD (15M OB - AL)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 55.14 - 55.49 | **Anlık Fiyat:** 55.50 | **Stop:** 55.14 altı
- **Durum:** ❌ **PAS / İPTAL (Mitigasyon Tükenmiş / Hedef Alınmış / Bayat Kurulum)** — Kutu ve giriş bölgesi fiyattan önce 2 tam döngü yaşayıp 55.80 EQH hedefine ulaşmıştı. Grafik üzerinde anlık fiyat (55.50) ile giriş tavanı (55.49) neredeyse eşit olduğu için etiket çakışması yaşandı. İşlem alınmadı.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Yukarı | 1H: Denge`
  - **Bölge Türü:** 15M Bullish Order Block (Tükenmiş/Eski).
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [C] Kutuya taze bir yaklaşım yok (Döngü tamamlanmış)
  - **Soru 2 (1M Formasyonu):** [C] Delip geçti / Onay yok (Eski hareket)
  - **Soru 3 (Giriş Kararı):** [C] Girmedim (Pas)
  - **Soru 4 (Sonuç):** [D] İşlem alınmadı (Korundu)
  - **Soru 5 (Stop/İptal Nedeni):** [B] Hedefine gitmiş / Mitigasyon bitmiş

### 48. [2026-09-10 TSİ] — USDJPY (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9)
- **Giriş Bölgesi:** 153.821 - 153.912 | **Anlık Fiyat:** 153.586 | **Stop:** 153.912 üstü
- **Durum:** 🔄 **AKTİF / İŞLEMDE** — Fiyat 153.821 - 153.912 OB kutusuna retest verdi ve operatör tarafından işleme girildi. Pozisyon aktif olarak takip ediliyor.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı` — Çift zaman dilimi güçlü düşüş trendi.
  - **P/D Durumu:** `4H: Pahalı | 1H: Ucuz | 15M: Pahalı`.
  - **Likidite Mıknatısı:** EQL (3 dip @ 153.0949, 49 pip aşağıda açık likidite havuzu).
  - **Karşı Engel:** 28.1 pip aşağıda 15M Bullish OB (`153.3767 — 153.5402`). Fiyatın 153.30 bölgesinden sekip yukarı tepki vermesi bu karşı engelin çalıştığını doğrulamaktadır.
- **Kritik SMC Notu:** Sinyal 42 GBPUSD tecrübesi ışığında körü körüne limit emir atılmamış, disiplinli bir şekilde fiyatın kutuya gelişi ve 1M onayı beklenmektedir.
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [B] Agresif / haber mumuyla daldı
  - **Soru 2 (1M Formasyonu):** [A] 1M CHoCH kırılımı (dönüş yapısı) verdi
  - **Soru 3 (Giriş Kararı):** [Kusursuz SMC Uygulaması] 1M CHoCH mumu kapandıktan sonra Fib EQ (0.50) seviyesine limit emir atıldı ve geri çekilmede dolduruldu
  - **Soru 4 (Sonuç):** 🔄 İşlemde / Pozisyon taşınıyor
  - **Soru 5 (Stop/İptal Nedeni):** ⏳ Pozisyon açık (Ana Hedef: 153.09 EQL likidite mıknatısı)

### 49. [2026-09-10 11:45 TSİ] — GBPCHF (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (8/9) — Çok Yüksek Kalite
- **Giriş Bölgesi:** 1.09913 - 1.09958 | **Anlık Fiyat:** 1.09832 | **Stop:** 1.09958 üstü
- **Durum:** ❌ **STOP** — Fiyat 1.09913 - 1.09958 15M OB kutusuna ulaştıktan sonra 1.09958 stop seviyesini yukarı kırarak stop oldu.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı` — Çift zaman dilimi güçlü düşüş trendi.
  - **P/D Durumu:** `4H: Pahalı | 1H: Pahalı | 15M: Pahalı` — Tüm zaman dilimlerinde Premium (Pahalı) bölge; kurumsal satış için ideal konfigürasyon.
  - **Kutu Genişliği:** 4.5 pip (`1.09913 - 1.09958`) — Oldukça dar ve yüksek R/R sunan bir POI alanı.
  - **Likidite Mıknatısı:** EQL (6 eşit dip @ 1.0969, 14.4 pip aşağıda açık Sell-Side Liquidity havuzu).
  - **Karşı Engel:** 17.1 pip aşağıda 15M Bullish OB (`1.0969 — 1.0974`). Likidite mıknatısı ile karşı alıcı bloğu aynı seviyede kümelenmiştir (TP / Kâr Alma bölgesi).
- **Kritik SMC Notu:** 1M grafiğinde 06:40'tan bu yana kesintisiz bir yükseliş trendi görülmektedir. 4.5 piplik dar kutu alıcı baskısını taşıyamamıştır.
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [A] Sakin / orta hızda düzeltme (Pullback)
  - **Soru 2 (1M Formasyonu):** [A] 1M CHoCH/BOS dönüş kırılımı verdi, ancak displacement (hacimli itiş gövdesi) oldukça zayıftı
  - **Soru 3 (Giriş Kararı):** [A] 1M onayı sonrası Fib 0.50 re-test seviyesine limit emir atılarak girildi
  - **Soru 4 (Sonuç):** [B] Stop (-R)
  - **Soru 5 (Stop/İptal Nedeni):** [A] Kutu tutmadı / delip geçti (4.5 piplik aşırı dar kutu ve zayıf displacement nedeniyle kurumsal alıcı baskısı tutulamadı)

### 50. [2026-09-10 14:45 TSİ] — XAUUSD (15M FVG - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9)
- **Giriş Bölgesi:** 4416.64 - 4423.52 | **Anlık Fiyat:** 4385.84 | **Stop:** 4423.52 üstü
- **Durum:** ⏳ **ZAMAN AŞIMI / İPTAL (Giriş Bölgesine Dönmedi — İşlem Alınmadı)** — Operatör teyidiyle bu işlem alınmamıştır. Fiyat sinyal anında kutunun 30.80 USD altında kalmış ve 4416.64 - 4423.52 FVG taze boşluğuna re-test vermeden doğrudan 4368 EQL likiditesine akmıştır. Kutuya temas gerçekleşmediği için kurulum iptal olmuştur.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı` — Çift zaman dilimi güçlü düşüş trendi.
  - **P/D Durumu:** `4H: Pahalı | 1H: Ucuz | 15M: Denge`.
  - **Bölge Türü:** 15M Bearish FVG (Taze dengesizlik alanı).
  - **Likidite Mıknatısı:** EQL (8 eşit dip @ 4368.72, sinyal anında 17.1 USD / 171 pip aşağıda açık SSL likidite havuzu).
- **Kritik SMC Uyarısı & Tuzağı:**
  - **Mesafe vs. Hedef Çelişkisi:** Fiyat sinyal anında giriş kutusuna $30.80 uzaktayken, ana hedef olan 4368.72 EQL mıknatısına sadece ~$17 mesafedeydi. Fiyat kutuya dönmeden önce hedef dipleri süpürdüğü için kurulum geçersiz (PAS) kalmıştır.
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [C] Kutuya ulaşmadı (30.8 USD uzakta kaldı)
  - **Soru 2 (1M Formasyonu):** [C] Kutuya temas etmedi (Onay aşaması gelmedi)
  - **Soru 3 (Giriş Kararı):** [C] Girmedim (Pas / Disiplinli bekleme)
  - **Soru 4 (Sonuç):** [D] İşlem alınmadı (Zaman aşımı / 0$ Kayıp)
  - **Soru 5 (Stop/İptal Nedeni):** [B] Fiyat bölgeye dönmeden hedefine aktı / Kutuya ulaşmadı

### 51. [2026-09-10 20:15 TSİ] — ETHUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9)
- **Giriş Bölgesi:** 2475.29 - 2484.76 | **Anlık Fiyat:** 2468.39 | **Stop:** 2484.76 üstü
- **Durum:** ❌ **STOP** — Fiyat 2475.29 - 2484.76 15M Bearish OB kutusuna girdikten sonra satıcı tepkisi bulamayarak 2484.76 stop seviyesini yukarı kırıp stop oldu.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı`
  - **P/D Durumu:** `4H: Pahalı | 1H: Pahalı | 15M: Pahalı`
  - **Bölge Türü:** 15M Bearish Order Block (9.47 USD genişliğinde).
  - **Likidite Mıknatısı:** EQL (3 dip @ 2379.90, 88.5 pip aşağıda).
  - **Karşı Engel:** 83.8 pip aşağıda 15M Bullish OB (`2384.69 — 2391.53`).
- **SMC Otopsisi & Hata Nedeni:**
  - 🎯 **V-Şeklinde Agresif Toparlanma & Limit Emir Tuzağı:** Fiyat 2405 dip seviyesine kadar sert çakıldıktan sonra hiçbir dinlenme yapmadan 70+ dolarlık dik bir V-rallisiyle kutuya daldı. 1M üzerinde kurumsal satıcı onayı (CHoCH / Sweep) beklenmeden kutuya limit emir atılması, sert gelen boğa momentumu karşısında pozisyonun doğrudan stop olmasına yol açtı.
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [B] Agresif ralli mumu (V-şeklinde 2405 dibinden dönüş)
  - **Soru 2 (1M Formasyonu):** [C] Delip geçti (1M onayı vermedi)
  - **Soru 3 (Giriş Kararı):** [C] Kutuya Limit Emir atıldı (1M onayı beklenmedi)
  - **Soru 4 (Sonuç):** [B] Stop (-R)
  - **Soru 5 (Stop/İptal Nedeni):** [A] Kutu tutmadı / delip geçti (Limit emir tuzağı)

### 52. [2026-09-11 TSİ] — NZDUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 2 Ekran Görüntüsü (1H HTF, 15M Kurulum)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 0.58333 - 0.58364 | **Anlık Fiyat:** 0.58280 | **Stop:** 0.58364 üstü
- **Durum:** 🎯 **TP / BAŞARILI (+1.050 $ / ~+1.4R)** — Operatör bildirimi: *"nzd işlemi tp oldu 1050 dolara aldık"*. Fiyat 0.58333 - 0.58364 kutusundan reaksiyon alarak hedef olan 0.5797 EQL likidite mıknatısına aktı ve 1.050 $ kârla realize edildi.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı` — Çift zaman dilimi net düşüş trendi.
  - **P/D Durumu:** `4H: Denge | 1H: Denge | 15M: Pahalı`.
  - **Kutu Genişliği:** Sadece 3.1 pip (`0.58333 — 0.58364`) — Aşırı dar stoplu, çok yüksek R/R potansiyelli POI kutusu.
  - **Likidite Mıknatısı:** EQL (2 dip @ 0.5797, 30.9 pip aşağıda açık Sell-Side Liquidity havuzu).
  - **Karşı Engel:** 24.1 pip aşağıda 15M Bullish OB (`0.5806 — 0.5809`).
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [A] Sakin / kademeli düzeltme (Pullback)
  - **Soru 2 (1M Formasyonu):** [A] 1M CHoCH/BOS dönüş teyidi verdi
  - **Soru 3 (Giriş Kararı):** [A] 1M teyidi sonrası Fib 0.50 retest seviyesine limit emir atılarak girildi
  - **Soru 4 (Sonuç):** [A] TP (+1.050 $ / ~+1.4R)
  - **Soru 5 (Stop/İptal Nedeni):** [D] Yok (Hedef EQL likiditesi başarıyla alındı)

### 53. [2026-09-14 23:06 TSİ] — EURJPY (15M FVG - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (9/9) — Kusursuz Teknik Uyum
- **Giriş Bölgesi:** 178.329 - 178.409 | **Anlık Fiyat:** 178.247 (8.1 point altında) | **Stop:** 178.409 üstü
- **Durum:** 🛡️ **İPTAL / KORUNDU (1M Konfirmasyonu Vermedi — İşleme Girilmedi)** — Operatör bildirimi: *"eylül 14 23.06 mesajı, confirme vermedi"*. Fiyat 178.05 dip seviyesinden toparlanıp 178.329 - 178.409 15M Bearish FVG bölgesine doğru yaklaştığında, 1 dakikalık grafikte hiçbir satıcı teyidi (1M CHoCH / Bearish Displacement) üretmedi. Operatör 1M onay filtresine sadık kalarak işleme girmedi; sermaye korundu.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı` — Çift zaman dilimi güçlü düşüş trendi.
  - **P/D Durumu:** `4H: Pahalı | 1H: Ucuz | 15M: Denge`.
  - **Bölge Türü:** 15M Bearish Fair Value Gap (Düşüş FVG'si).
  - **Likidite Mıknatısı:** EQL (17 dip @ 178.0811, 16.6 pip aşağıda açık Sell-Side Liquidity havuzu).
  - **Karşı Engel:** 18.6 pip aşağıda 15M Bullish OB (`178.0414 — 178.1429`).
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [A] Sakin / kademeli toparlanma (178.05'ten yukarı düzeltme)
  - **Soru 2 (1M Formasyonu):** [C] Onay vermedi (Confirme vermedi / dönüş kırılımı oluşmadı)
  - **Soru 3 (Giriş Kararı):** [C] Girmedim (Pas / 1M onay disiplini korundu)
  - **Soru 4 (Sonuç):** [D] İşlem alınmadı (Korundu / 0$ Kayıp)
  - **Soru 5 (Stop/İptal Nedeni):** [D] 1M onay mekanizması korudu / kurala uyuldu

### 54. [2026-09-15 03:30 TSİ] — USDCHF (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (8/9) — Yüksek Kalite
- **Giriş Bölgesi:** 0.81897 - 0.81953 | **Anlık Fiyat:** 0.81767 (13.0 pip altında) | **Stop:** 0.81953 üstü
- **Durum:** 🔄 **AKTİF / İŞLEMDE** — Operatör bildirimi: *"15 eylül 03.30 işlemi, işlemde"*. Fiyat 0.81767 seviyesinden 0.81897 - 0.81953 15M Bearish OB tavanına geri çekilmiş, 1 dakikalık grafikte kurumsal satıcı teyidi (1M CHoCH / Retest) vererek tetiklenmiştir. Pozisyon açık ve kârda taşınmaktadır.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı` — Çift zaman dilimi net düşüş trendi.
  - **P/D Durumu:** `4H: Denge | 1H: Pahalı | 15M: Pahalı` — 1H ve 15M Premium bölgede kurumsal satış.
  - **Bölge Türü:** 15M Bearish Order Block (5.6 pip dar stoplu POI alanı).
  - **Likidite Mıknatısı:** EQL (4 dip @ 0.8110, 66.7 pip aşağıda devasa Sell-Side Liquidity havuzu).
  - **Karşı Engel:** 24.2 pip aşağıda 15M Bullish OB (`0.8164 — 0.8165`).
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [A] Sakin / kontrollü düzeltme (1M grafiğinde basamaklı yukarı retest)
  - **Soru 2 (1M Formasyonu):** [A] 1M CHoCH/BOS dönüş kırılımı verdi
  - **Soru 3 (Giriş Kararı):** [A] 1M teyidi sonrası Fib 0.50 retest seviyesine limit emir atılarak girildi
  - **Soru 4 (Sonuç):** 🔄 İşlemde / Pozisyon taşınıyor
  - **Soru 5 (Stop/İptal Nedeni):** ⏳ Pozisyon açık (Ana Hedef: 0.8110 EQL likidite mıknatısı)

### 55. [2026-09-15 07:15 TSİ] — BTCUSD (15M OB - AL)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9)
- **Giriş Bölgesi:** 77615.06 - 77930.01 | **Anlık Fiyat:** 77678.00 (Kutu içinde / aktif retest) | **Stop:** 77615.06 altı
- **Durum:** 🛡️ **İPTAL / KORUNDU (1M Konfirmasyonu Vermedi — İşleme Girilmedi)** — Operatör bildirimi: *"15 eylül 07.15 işlemi, confirme vermedi"*. Fiyat 79.300 zirvesinden 77.615 - 77.930 OB kutusuna dikey / agresif kırmızı mumlarla inmiş (şelale düşüşü). Kutu içine girilmiş olmasına rağmen 1 dakikalık grafikte hiçbir kurumsal alıcı teyidi (1M CHoCH / Bullish Displacement / Wick Sweep) oluşmamış, fiyat kutu tabanını delip geçmiştir. Operatör kurala harfiyen uyarak teyitsiz işleme girmemiş, sermaye doğrudan korunmuştur (Averted Loss).
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Yukarı | 1H: Yukarı` — Çift zaman dilimi boğa uyumu.
  - **P/D Durumu:** `4H: Ucuz | 1H: Ucuz | 15M: Ucuz` — Tüm zaman dilimlerinde Discount (Ucuz) bölge.
  - **Bölge Türü:** 15M Bullish Order Block (315 pip genişliğinde talep bloğu).
  - **Likidite Mıknatısı:** EQH (4 tepe @ 79346.4100, 1668.4 pip yukarıda açık BSL havuzu).
  - **Karşı Engel:** 478.6 pip yukarıda 15M Bearish OB (`78408.6400 — 78564.3900`).
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [B] Agresif haber mumu / Şelale düşüşü (79300'den dikey iniş)
  - **Soru 2 (1M Formasyonu):** [C] Delip geçti (Confirme vermedi / teyit yok)
  - **Soru 3 (Giriş Kararı):** [C] Girmedim (Pas / 1M onay disiplini korundu)
  - **Soru 4 (Sonuç):** [D] İşlem alınmadı (🛡️ Korundu / 0$ Kayıp)
  - **Soru 5 (Stop/İptal Nedeni):** [D] 1M onay mekanizması korudu / sermaye kurtarıldı

### 56. [2026-09-15 10:58 TSİ] — SOLUSD (15M OB - AL)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (8/9)
- **Giriş Bölgesi:** 99.18 - 99.72 | **Anlık Fiyat:** 100.44 (%0.72 yukarıda) | **Stop:** 99.18 altı
- **Durum:** 🛡️ **İPTAL / KORUNDU (1M Konfirmasyonu Vermedi — İşleme Girilmedi)** — Operatör bildirimi: *"15 eylül 10.58 mesajı, confirme vermedi"*. Fiyat 99.18 - 99.72 yükseliş OB bölgesine doğru geri çekilirken 1 dakikalık grafikte hiçbir alıcı teyidi (CHoCH / Dönüş yapısı) üretmedi. Operatör kurala harfiyen uyarak işleme girmedi ve sermaye korundu.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Yukarı | 1H: Yukarı` — Çift zaman dilimi boğa uyumu.
  - **P/D Durumu:** `4H: Ucuz | 1H: Ucuz | 15M: Ucuz` — Tüm zaman dilimlerinde Discount (Ucuz) bölge.
  - **Bölge Türü:** 15M Bullish Order Block (Yükseliş Bloğu).
  - **Likidite Mıknatısı:** EQH (2 tepe @ 105.1250, 468.5 pip yukarıda açık BSL havuzu).
  - **Karşı Engel:** 499 pip yukarıda 15M Bearish OB (`104.71 — 104.91`).
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [A] Sakin / kademeli düzeltme (100.44'ten süzülüş)
  - **Soru 2 (1M Formasyonu):** [C] Onay vermedi (Confirme vermedi / dönüş kırılımı oluşmadı)
  - **Soru 3 (Giriş Kararı):** [C] Girmedim (Pas / 1M onay disiplini)
  - **Soru 4 (Sonuç):** [D] İşlem alınmadı (Korundu / 0$ Kayıp)
  - **Soru 5 (Stop/İptal Nedeni):** [D] 1M onay mekanizması korudu / sermaye kurtarıldı

### 57. [2026-09-17 21:31 TSİ / 18:31 UTC] — CADJPY (15M OB - AL)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9)
- **Giriş Bölgesi:** 111.200 - 111.242 | **Anlık Fiyat:** 111.557 (31.5 point yukarıda) | **Stop:** 111.200 altı (manuel onay)
- **Durum:** ⏳ **BEKLEMEDE (Kutuya Geri Çekilme Bekleniyor — Henüz Tetiklenmedi)** — Operatör bildirimi: *"bekliyoruz 17 eylül 21.31"*. Fiyat 111.557 seviyesinde seyrediyor, giriş bölgesinin 31.5 point üzerinde. Strateji kuralı gereği: Giriş bölgesine geri çekilme (retest) bekleniyor; bölgeye dönmeden kesinlikle işlem alınmayacak.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Yukarı | 1H: Yukarı` — Çift zaman dilimi boğa uyumu.
  - **P/D Durumu:** `4H: Ucuz | 1H: Pahalı | 15M: Ucuz` — 4H ve 15M Discount bölgesinde, 1H Premium bölgesinde.
  - **Bölge Türü:** 15M Bullish Order Block (Yükseliş Bloğu).
  - **Likidite Mıknatısı:** EQH (Eşit Tepeler - BSL Mıknatısı): 3 tepe @ 111.6613 (10.4 pip yukarıda açık alıcı likiditesi).
  - **Karşı Engel:** 18.9 pip yukarıda 15M Bearish OB mevcut (`111.4310 — 111.5038`).
- **Ekran Görüntüsü Analizi:**
  - **15M Kurulum Grafiği:** Fiyat 111.75'ten 111.10 dibine inerek alt likiditeyi süpürmüş (Wick Sweep), ardından 111.37 üzerinde CHoCH kırılımı vererek 111.200 - 111.242 aralığında Bullish OB oluşturmuş. Anlık fiyat 111.56 seviyesinde karşı engelin hemen üzerinde.
  - **1H HTF Grafiği:** 1H trendi yukarı yönlü; fiyat 1H grafiğinde Pahalı (Premium) bölgede konsolide oluyor.
  - **1M Giriş Grafiği:** Fiyat 111.56 seviyesinde yatay dalgalanıyor; 111.200 - 111.242 giriş kutusuna henüz bir geri çekilme hareketi başlatmamış.
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [C] Kutuya ulaşmadı (Fiyat 31.5 point yukarıda / Beklemede)
  - **Soru 2 (1M Formasyonu):** ⏳ Beklemede (Kutuya henüz temas etmedi)
  - **Soru 3 (Giriş Kararı):** [C] Girmedim (Pas / Retest ve 1M teyidi bekleniyor)
  - **Soru 4 (Sonuç):** ⏳ Beklemede (İşlem henüz açılmadı)
  - **Soru 5 (Stop/İptal Nedeni):** ⏳ Beklemede / Tetiklenmedi

### 58. [2026-09-18 07:15 TSİ / 04:15 UTC] — USDCAD (15M FVG - AL)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9)
- **Giriş Bölgesi:** 1.39465 - 1.39582 | **Anlık Fiyat:** 1.39771 (18.9 pip yukarıda) | **Stop:** 1.39465 altı (manuel onay)
- **Durum:** ⏳ **BEKLEMEDE (Kutuya Geri Çekilme Bekleniyor — Henüz Tetiklenmedi)** — Operatör bildirimi: *"bekliyoruz 18 eylül 07.15"*. Fiyat 1.39771 seviyesinde seyrediyor, giriş bölgesinin 18.9 pip üzerinde. Strateji kuralı: Giriş bölgesine geri çekilme (retest) bekleniyor; bölgeye dönmeden ve 1M teyidi gelmeden kesinlikle işlem alınmayacak.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Yukarı | 1H: Yukarı` — Çift zaman dilimi tam boğa uyumu.
  - **P/D Durumu:** `4H: Ucuz | 1H: Ucuz | 15M: Ucuz` — Tüm zaman dilimlerinde (4H, 1H, 15M) kusursuz üçlü Discount (Ucuz) bölge hizalanması.
  - **Bölge Türü:** 15M Bullish Fair Value Gap (FVG - Dengesizlik Alanı).
  - **Likidite Mıknatısı:** EQH (Eşit Tepeler - BSL Mıknatısı): 9 tepe @ 1.3995 (17.5 pip yukarıda devasa alıcı likidite havuzu).
  - **Karşı Engel:** 24.4 pip yukarıda 15M Bearish OB mevcut (`1.3983 — 1.3989`).
- **Ekran Görüntüsü Analizi:**
  - **15M Kurulum Grafiği:** Fiyat 1.3910'lardan güçlü BOS kırılımı yaparak yukarı fırlamış ve geride 1.39465 - 1.39582 aralığında temiz bir 15M Bullish FVG bırakmış. Fiyat tepede konsolide olduktan sonra 1.3977 seviyelerine doğru süzülmeye başlamış.
  - **1H HTF Grafiği:** 1H grafiğinde net bir yukarı trend ve BOS mevcut; fiyat 1H'de Discount (Ucuz) bölgede kalıyor.
  - **1M Giriş Grafiği:** 1M zaman diliminde 03:00'ten sonra basamaklı bir iniş (pullback) hareketi gözlemleniyor. Anlık fiyat (1.3977) kutunun 18.9 pip yukarısında; henüz FVG tavanına (1.39582) temas gerçekleşmedi.
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [A] Sakin düzeltme (1M grafiğinde basamaklı süzülüş devam ediyor)
  - **Soru 2 (1M Formasyonu):** ⏳ Beklemede (Kutuya henüz temas etmedi / retest bekleniyor)
  - **Soru 3 (Giriş Kararı):** [C] Girmedim (Pas / 1M teyidi ve retest bekleniyor)
  - **Soru 4 (Sonuç):** ⏳ Beklemede (İşlem henüz açılmadı)
  - **Soru 5 (Stop/İptal Nedeni):** ⏳ Beklemede / Tetiklenmedi

### 59. [2026-09-18 14:45 TSİ / 11:45 UTC] — GBPCHF (15M OB - AL)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9)
- **Giriş Bölgesi:** 1.10100 - 1.10157 | **Anlık Fiyat:** 1.10167 (1.0 pip yukarıda) | **Stop:** 1.10100 altı (manuel onay)
- **Durum:** ❌ **STOP / GEÇERSİZ (-1R)** — Operatör bildirimi: *"18 eylül 14.45 stop oldu"*. Fiyat 1.10167 seviyesinden 1.10100 - 1.10157 aralığındaki 15M Bullish OB bölgesine girmiş, ancak 1M grafiğinde alıcı dönüş teyidi (CHoCH / Retest) oluşturamadan bölgeyi aşağı yönlü kırarak stop seviyesini (1.10100 altı) patlatmıştır.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Yukarı | 1H: Yukarı` — Çift zaman dilimi boğa uyumu.
  - **P/D Durumu:** `4H: Ucuz | 1H: Pahalı | 15M: Ucuz` — 1H'de fiyat Premium (Pahalı) bölgedeyken AL aranması satış baskısı yarattı.
  - **Bölge Türü:** 15M Bullish Order Block (5.7 pip dar aralık).
  - **Likidite Mıknatısı:** EQH (Eşit Tepeler - BSL Mıknatısı): 10 tepe @ 1.1047 (30.6 pip yukarıda açık likidite havuzu).
  - **Karşı Engel:** 24.9 pip yukarıda 15M Bearish OB mevcut (`1.1041 — 1.1044`).
- **SMC Otopsisi & Neden Stop Oldu?:**
  1. **1H Pahalı (Premium) Bölgede AL Tuzağı:** Fiyat 1H HTF grafiğinde açıkça "Pahalı" bölgedeydi. 1H satıcıları fiyatı indirmek isterken 15 dakikalık iç yapı bloğu tutunamadı.
  2. **1M Teyidi Olmadan Bölgenin Delinmesi:** 1M grafiğinde fiyat kutuya agresif kırmızı mumlarla indi ve hiçbir mikro alıcı yapısı (1M CHoCH) üretmeden 1.10100 stop tabanını doğrudan delip geçti.
  3. **1H Önceki Fitil Temizliği:** 17 Eylül'de 1.1000 altındaki seviyelere inen sert fitiller, piyasanın daha derindeki likidite havuzlarına inme eğiliminde olduğunu göstermişti.
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [B] Agresif iniş / Kırmızı momentum mumları
  - **Soru 2 (1M Formasyonu):** [C] Delip geçti (1M alıcı teyidi oluşmadı)
  - **Soru 3 (Giriş Kararı):** [B] Market / Limit emri (İşleme girildi)
  - **Soru 4 (Sonuç):** [B] Stop (-1R)
  - **Soru 5 (Stop/İptal Nedeni):** [A] Kutu tutmadı / 1H Pahalı bölgesinde satıcı baskısı

### 60. [2026-09-18 16:25 TSİ / 13:25 UTC] — GBPUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (8/9)
- **Giriş Bölgesi:** 1.34008 - 1.34058 | **Anlık Fiyat:** 1.33774 (23.4 pip bölgenin altında) | **Stop:** 1.34058 üstü (manuel onay)
- **Durum:** 🎯 **TAKE PROFIT (+2.5R)** — Operatör bildirimi: *"tp oldu 2.5 RR 18 eylül"*. Fiyat 1.33774 seviyesinden sakin ve basamaklı bir şekilde 1.34008 - 1.34058 Bearish OB kutusuna geri çekilmiş (retest), 1M zaman diliminde alıcıların tükenmesiyle teyit vererek satış yönlü harekete geçmiş ve 1.3374 seviyesindeki EQL (Eşit Dipler - SSL Mıknatısı) likidite havuzunu süpürerek net **+2.5R** kâra ulaşmıştır.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı` — Çift zaman dilimi güçlü ayı trendi.
  - **P/D Durumu:** `4H: Pahalı | 1H: Pahalı | 15M: Pahalı` — Tüm zaman dilimlerinde (4H, 1H, 15M) kusursuz üçlü Premium (Pahalı) bölge hizalanması. SMC kurallarına göre en yüksek olasılıklı satış kurgusu.
  - **Bölge Türü:** 15M Bearish Order Block (5 pip dar aralık).
  - **Likidite Mıknatısı:** EQL (Eşit Dipler - SSL Mıknatısı): 3 dip @ 1.3374 (3 pip aşağıda bekleyen açık likidite havuzu).
  - **Karşı Engel:** 20.1 pip aşağıda 15M Bullish OB mevcut (`1.3376 — 1.3381`).
- **Ekran Görüntüsü Analizi:**
  - **1H HTF Grafiği:** Net aşağı yönlü akış; 17 Eylül sert düşüşünün ardından gelen düzeltmede fiyat 1H Pahalı (Premium) bölgede Bearish OB ve CHoCH teyidi üretmiş.
  - **15M Kurulum Grafiği:** 18 Eylül boyunca süren düşüşün ardından fiyatta yukarı yönlü bir nefes alma dalgası gelmiş, 1.34008 - 1.34058 Bearish OB kutusuna doğru süzülüş başlamış.
  - **1M Giriş Grafiği:** 14:40'tan 16:25'e kadar sakin, basamaklı (stepped pullback) bir tırmanış; kutuya vardığında sert satış tepkisi ve 1M alıcı yapısının çöküşü.
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [A] Sakin düzeltme (14:40 - 16:25 arası basamaklı süzülüş)
  - **Soru 2 (1M Formasyonu):** [A] 1M CHoCH/BOS kırılımı (Kutudan aşağı yönlü dönüş teyidi)
  - **Soru 3 (Giriş Kararı):** [A] 1M FVG/OB retesti / manuel onay
  - **Soru 4 (Sonuç):** [A] TP (+2.5R)
  - **Soru 5 (Stop/İptal Nedeni):** [D] Yok (Hedefe ulaştı)

### 61. [2026-09-21 10:30 TSİ / 07:30 UTC] — USDCAD (15M FVG - AL)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (6/9)
- **Giriş Bölgesi:** 1.39892 - 1.40030 | **Anlık Fiyat:** 1.40179 (14.9 pip bölgenin üstünde) | **Stop:** 1.39892 altı (manuel onay)
- **Durum:** 🛡️ **İPTAL / KORUNDU (1M Konfirmasyonu Vermedi — İşleme Girilmedi)** — Operatör bildirimi: *"confirme vermedi 21 eylül 10.30 işlemi"*. Fiyat 1.40179 seviyesinden 1.39892 - 1.40030 aralığındaki 15M Bullish FVG bölgesine doğru süzülmüş, ancak 1 dakikalık zaman diliminde beklenen alıcı dönüş yapısı (1M CHoCH / Retest) gerçekleşmemiştir. Operatör sisteme ve kurala sadık kalarak teyit almadan işleme girmemiş, böylece olası stop riski tamamen bertaraf edilerek sermaye korunmuştur.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Yukarı | 1H: Yukarı` — Çift zaman dilimi boğa yapısı.
  - **P/D Durumu:** `4H: Ucuz | 1H: Pahalı | 15M: Ucuz` — 1H'de fiyat Premium (Pahalı) bölgedeyken AL aranması içsel bir zayıflıktır (Kısmi Uyumsuzluk). Tıpkı #57 ve #59'da olduğu gibi 1H satıcı baskısı 1M alıcı teyidinin oluşmasını engellemiştir.
  - **Bölge Türü:** 15M Bullish Fair Value Gap (FVG - Dengesizlik Alanı).
  - **Likidite Mıknatısı:** Belirtilmedi (Doğrudan açık mıknatıs yok).
  - **Karşı Engel:** Yok.
- **Ekran Görüntüsü Analizi:**
  - **1H HTF Grafiği:** 16 Eylül'deki güçlü yükselişin ardından fiyat 1H grafiğinde "Pahalı" bölgede konsolide olmakta. 1H tepeye yakın bölgede yeni bir BOS oluşmuş olsa da fiyatın geniş swing'e göre Pahalıda olması geri çekilme riskini artırmış.
  - **15M Kurulum Grafiği:** Fiyat 19-20 Eylül hafta sonu yataylığının ardından 21 Eylül Asya/Londra seansında yukarı patlamış ve 1.39892 - 1.40030 aralığında 15M FVG bırakmış. Fiyat 1.4018'de duraklamış.
  - **1M Giriş Grafiği:** 05:40'tan 07:25'e kadar dalgalı bir yatay bant görünümü var. Fiyat 1.4018 seviyelerinde seyrederken altındaki giriş kutusuna temas anında net bir alıcı mikro kırılımı vermemiş.
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [A] Sakin düzeltme / Süzülüş
  - **Soru 2 (1M Formasyonu):** [C] Onay vermedi (1M alıcı teyidi / CHoCH oluşmadı)
  - **Soru 3 (Giriş Kararı):** [C] Girmedim (Pas / 1M onay disiplini harfiyen uygulandı)
  - **Soru 4 (Sonuç):** [D] İşlem alınmadı (Korundu / 0$ Kayıp)
  - **Soru 5 (Stop/İptal Nedeni):** [D] 1M onay mekanizması korudu / sermaye kurtarıldı

### 62. [2026-09-21 18:45 TSİ / 15:45 UTC] — USDJPY (15M OB - AL)

- **Kaynak:** Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9)
- **Giriş Bölgesi:** 157.304 - 157.345 | **Anlık Fiyat:** 157.386 (4.0 point bölgenin üstünde) | **Stop:** 157.304 altı (manuel onay)
- **Durum:** ❌ **STOP / GEÇERSİZ (-1.0R)** — Operatör bildirimi: *"21 eylül 18.45 mesajı stop"*. Fiyat 157.386 seviyesinden 157.304 - 157.345 aralığındaki 15M Bullish OB kutusuna girmiş, ancak 1M grafiğinde alıcı dönüş teyidi oluşturamadan bölgeyi aşağı yönlü kırarak stop seviyesini (157.304 altı) patlatmıştır.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Yukarı | 1H: Yukarı` — Çift zaman dilimi boğa uyumu.
  - **P/D Durumu:** `4H: Ucuz | 1H: Pahalı | 15M: Ucuz` — **1H Pahalı (Premium) Bölgede AL Tuzağı!** Tıpkı #59 GBPCHF ve #61 USDCAD gibi, 1H grafiğinde fiyat Premium bölgedeyken 15M iç yapısında AL aranması ana satıcı dalgasına takıldı.
  - **Bölge Türü:** 15M Bullish Order Block (4.1 point aşırı dar aralık).
  - **Likidite Mıknatısı:** EQH (Eşit Tepeler - BSL Mıknatısı): 2 tepe @ 157.9075 (52.2 pip yukarıda açık BSL havuzu).
  - **Karşı Engel:** Yok.
- **SMC Otopsisi & Neden Stop Oldu?:**
  1. **1H Premium Bölgesinde Alıcı Tükenişi:** 1H HTF grafiğinde fiyat bariz biçimde "Pahalı" bölgedeydi. 1H satıcıları fiyatı Denge/Ucuzluk bölgesine çekmek isterken 15M iç yapı bloğu tutunamadı.
  2. **1M Agresif Şelale İnişi:** 1M grafiğinde fiyat 157.48 tepesini gördükten sonra kırmızı momentum mumlarıyla (şelale tarzı) kutuya indi ve kutuda alıcı desteği bulamayarak tabanı deldi.
  3. **Aşırı Dar OB Kutusu (4.1 Point):** 157.304 - 157.345 kutusu yalnızca 4 point genişliğindedir. USDJPY'de bu denli dar kutular piyasanın mikro dalgalanmalarına ve spread genişlemelerine karşı çok kırılgandır.
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [B] Agresif iniş / Kırmızı momentum mumları (157.48'den geri çekilme)
  - **Soru 2 (1M Formasyonu):** [C] Delip geçti (1M alıcı teyidi oluşmadı)
  - **Soru 3 (Giriş Kararı):** [B] Market / Limit emri (İşleme girildi)
  - **Soru 4 (Sonuç):** [B] Stop (-1.0R)
  - **Soru 5 (Stop/İptal Nedeni):** [A] Kutu tutmadı / 1H Pahalı bölgesinde satıcı baskısı

### 63. [2026-09-25 19:17 TSİ / 16:17 UTC] — CADCHF (15M OB - AL) [🌺 BEGONYA]

- **Kaynak:** Begonya Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9) | **Begonya Skoru:** ✅ 82/100 (Tier A) | **Makro Kapı:** LONG (`G_macro: 1`, `CADCHF LONG_ONLY`) | **Önerilen Risk:** `0.56x Lot`
- **Giriş Bölgesi:** 0.58349 - 0.58389 | **Anlık Fiyat:** 0.58524 (13.5 pip bölgenin üstünde) | **Stop:** 0.58349 altı (manuel onay)
- **Durum:** ⏳ **BEKLEMEDE (Kutuya Geri Çekilme Bekleniyor — Henüz Tetiklenmedi)** — Operatör bildirimi: *"25 eylül 19.17 işlemi bekliyoruz"*. Fiyat 0.58524 seviyesinde olup giriş kutusunun 13.5 pip üzerindedir. Kural gereği: Fiyatın 0.58349 - 0.58389 kutusuna geri çekilmesi (retest) ve ardından 1 dakikalık manuel onay beklenmektedir.
- **Makro Rejim & Begonya Analizi:**
  - **Birincil Rejim:** `Reflationary Growth with Tight Liquidity` (Dirençli ABD istihdamı ICSA: 197K, Bakır/Altın sanayi momentumu %10.78).
  - **Makro Durum:** 🌟 A Sentetik Çapraz Makro Onayı (`CADCHF LONG_ONLY` -> `0.56x Lot`).
  - **Haber Kalkanı:** ✅ Güvenli (±15 dk yüksek etkili veri yok).
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Yukarı | 1H: Yukarı` — Çift zaman dilimi boğa uyumu.
  - **P/D Durumu:** `4H: Denge | 1H: Ucuz | 15M: Ucuz` — Önceki stop olan AL işlemlerinin (#59, #62) aksine burada **1H ve 15M her ikisi de Ucuz (Discount)** bölgededir; 1H Pahalı tuzağı yoktur.
  - **Bölge Türü:** 15M Bullish Order Block (4.0 pip dar aralık).
  - **Likidite Mıknatısı:** EQH (Eşit Tepeler - BSL Mıknatısı): 5 tepe @ 0.5876 (23.6 pip yukarıda güçlü alıcı likidite havuzu).
  - **Karşı Engel:** 16.3 pip yukarıda 15M Bearish OB mevcut (`0.5855 — 0.5857`).
- **Ekran Görüntüsü Analizi:**
  - **1H HTF Grafiği:** 24 Eylül'de 0.5835 tabanından gelen devasa yeşil displacement mumu yukarı yönlü CHoCH kırılımı yapmış ve dip bölgede (`0.58349 - 0.58389`) temiz bir kurumsal Bullish OB bırakmış. Fiyat şu an 1H Discount (Ucuz) sınırında.
  - **15M Kurulum Grafiği:** Fiyat 0.5876 tepelerinde 5'li eşit tepe (EQH) bıraktıktan sonra 25 Eylül öğleden sonra sert bir geri çekilme mumuyla 0.5852 seviyesine inmiş; giriş kutusuna 13.5 pip mesafe kalmış.
  - **1M Giriş Grafiği:** 15:50 - 16:05 UTC arasında sert bir düşüş dalgası yaşanmış ve 0.5852'de yataya bağlamış. Giriş kutusuna henüz temas yok; kutuya ulaştığında sakinleşip 1M CHoCH üretmesi beklenecek.
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [C] Kutuya ulaşmadı (Fiyat 13.5 pip yukarıda / Beklemede)
  - **Soru 2 (1M Formasyonu):** ⏳ Beklemede (Kutuya henüz temas etmedi)
  - **Soru 3 (Giriş Kararı):** [C] Girmedim (Pas / Retest ve 1M teyidi bekleniyor)
  - **Soru 4 (Sonuç):** ⏳ Beklemede (İşlem henüz açılmadı)
  - **Soru 5 (Stop/İptal Nedeni):** ⏳ Beklemede / Tetiklenmedi

### 64. [2026-09-25 11:03 TSİ / 08:03 UTC] — BTCUSD (15M OB - SAT) [🌺 BEGONYA]

- **Kaynak:** Begonya Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (9/9 — Tam Puan) | **Begonya Skoru:** 🌟 98/100 (Tier A+) | **Makro Kapı:** `SHORT_ONLY` (`G_macro: 1`) | **Önerilen Risk:** `0.75x Lot`
- **Giriş Bölgesi:** 84572.00 - 84881.55 | **Anlık Fiyat:** 84043.96 (528.0 USD / %0.62 bölgenin altında) | **Stop:** 84881.55 üstü (manuel onay)
- **Durum:** ⏳ **BEKLEMEDE (Kutuya Geri Çekilme Bekleniyor — Henüz Tetiklenmedi)** — Operatör bildirimi: *"25 eylül 11.03 bekliyoruz, sürekli geliyor diye aralarından bir tanesini seçtim"*. Fiyat 84043.96 seviyesinde olup 84572.00 - 84881.55 Bearish OB kutusunun 528 USD altındadır. Kutu henüz test edilmediği (unmitigated) için sistem tarafından aktif tutularak bildirilmektedir; en yüksek puanlı (`9/9` ve `98/100 Tier A+`) ana kurulum referans seçilmiştir.
- **Makro Rejim & Begonya Analizi:**
  - **Birincil Rejim:** `Reflationary Growth with Tight Liquidity` (Sıkı likidite koşulları kripto varlıklarda yükselişleri satış fırsatı olarak destekler).
  - **Makro Durum:** 🌟 A+ Doğru Orantılı Makro İşlem (`SHORT_ONLY`, Skor: 98/100 -> `0.75x Lot`).
  - **Haber Kalkanı:** ✅ Güvenli (±15 dk yüksek etkili veri yok).
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı` — Çift zaman dilimi güçlü ayı trendi.
  - **P/D Durumu (Kritik Teknik Detay):** Sinyal anında anlık fiyat (`84043`) aşağıda olduğu için `4H: Pahalı | 1H: Ucuz | 15M: Denge` görünmektedir; **ancak `84572.00 - 84881.55` giriş kutusu 1H ve 15M grafiklerinde tam olarak PAHALI (Premium) bölgenin içinde yer almaktadır!** Yani fiyat kutuya geri çekildiğinde üç zaman diliminde de (4H, 1H, 15M) **tam Pahalı (Premium)** hizalanması sağlanmış olacaktır.
  - **Bölge Türü:** 15M Bearish Order Block (309.55 USD genişlik).
  - **Likidite Mıknatısı:** EQL (Eşit Dipler - SSL Mıknatısı): **7 dip @ 80308.49** (3735.5 pip aşağıda devasa satıcı likidite havuzu).
  - **Karşı Engel:** `84143.17 — 84275.57` aralığında 15M Bullish OB (Kutu tabanından yaklaşık 300 USD aşağıda ilk ara destek engeli).
- **Ekran Görüntüsü Analizi:**
  - **1H HTF Grafiği:** 23 Eylül'deki 87200 tepesinden gelen sert yıkım sonrasında fiyat 83000-84800 bandında yataylaşmış. `84572 - 84881` Bearish OB kutusu 1H grafiğinde tam Premium (Pahalı) sınırında yer alıyor ve altındaki CHoCH kırılımıyla onaylanmış durumda.
  - **15M Kurulum Grafiği:** 25 Eylül gece 02:30 civarında `84572 - 84881` OB kutusundan başlayan sert kırmızı mumlar `84250` altında CHoCH yaparak düşüşü başlatmış. Fiyat 84043 seviyesinde konsolide oluyor.
  - **1M Giriş Grafiği:** 06:10 - 08:00 UTC arasında fiyat 83800 - 84250 bandında dalgalanıyor; yukarıdaki `84572` giriş sınırına henüz 528 USD mesafe var.
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [C] Kutuya ulaşmadı (Fiyat 528 USD aşağıda / Beklemede)
  - **Soru 2 (1M Formasyonu):** ⏳ Beklemede (Kutuya henüz temas etmedi)
  - **Soru 3 (Giriş Kararı):** [C] Girmedim (Pas / Retest ve 1M teyidi bekleniyor)
  - **Soru 4 (Sonuç):** ⏳ Beklemede (İşlem henüz açılmadı)
  - **Soru 5 (Stop/İptal Nedeni):** ⏳ Beklemede / Tetiklenmedi

### 65. [2026-09-25 05:02 TSİ / 02:02 UTC] — CADJPY (15M OB - AL) [🌺 BEGONYA]

- **Kaynak:** Begonya Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (9/9 — Tam Puan) | **Begonya Skoru:** 🌟 98/100 (Tier A+) | **Makro Kapı:** `LONG` (`G_macro: 1`, `CADJPY LONG_ONLY`) | **Önerilen Risk:** `0.75x Lot`
- **Giriş Bölgesi:** 111.936 - 111.992 | **Anlık Fiyat:** 112.144 (15.2 point bölgenin üstünde) | **Stop:** 111.936 altı (manuel onay)
- **Durum:** ❌ **STOP / GEÇERSİZ (-0.5R Realized / Kör Limit Emir İhlali)** — Operatör bildirimi: *"25 eylül 05.02 işlemi stop oldum GRADE A işlemi, normalde 0.75 risk aldım 1m de 0.5 limit emir attım ve stop oldu"*. Operatör Sinyal Özetindeki *"önce geri çekilme (retest), sonra 1 dakikalık manuel onay"* kuralı yerine kutuya **0.5R riskle doğrudan limit emir** bırakmıştır. Fiyat Asya seansında kutuya sert kırmızı mumlarla inerek 1M dönüş yapısı (CHoCH) üretmeden limit emri doldurup doğrudan `111.936` altındaki stopları patlatmıştır.
- **Makro Rejim & Begonya Analizi:**
  - **Birincil Rejim:** `Reflationary Growth` (ABD late-cycle direnci 197K ICSA, %4.1 işsizlik, +198.2 bps faiz makası).
  - **Makro Durum:** 🌟 A+ Sentetik Çapraz Makro Onayı (`CADJPY LONG_ONLY` -> `0.75x Lot`).
  - **Haber Kalkanı:** ✅ Güvenli (±15 dk yüksek etkili veri yok).
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Yukarı | 1H: Yukarı` — Çift zaman dilimi boğa yapısı.
  - **P/D Durumu:** `4H: Denge | 1H: Ucuz | 15M: Ucuz` — P/D hizalanması uygun.
  - **Bölge Türü:** 15M Bullish Order Block (5.6 point dar kutu).
  - **Likidite Mıknatısı:** EQH (Eşit Tepeler - BSL Mıknatısı): 10 tepe @ 112.4082 (26.4 pip yukarıda).
  - **Karşı Engel:** 16.7 pip yukarıda 15M Bearish OB mevcut (`112.1593 — 112.2097`).
- **SMC Otopsisi & Neden Stop Oldu? (3 Kritik Sebep):**
  1. **Kör Limit Emir Hatası (1M Manuel Onay Beklenmedi):** Bot bildiriminde açıkça *"Bölgeye dönmeden kesinlikle işlem yok; önce retest, sonra 1 dakikalık manuel onay"* uyarısı yer almasına rağmen, gece/Asya seansı (05:02 TSİ) olması nedeniyle kutuya doğrudan **limit emir** bırakıldı. Fiyat 1M'de hiçbir alıcı CHoCH kırılımı vermeden kutuyu delip geçti. 1M teyidi beklenseydi işlem açılmayacak ve 0R kayıpla kurtulacaktı!
  2. **Kutu Altında Biriken EQL (Likidite Tuzağı / Inducement):** 1H (`media_1790433526937.jpg`) ve 15M (`media_1790433530931.jpg`) grafiklerinin sol tarafına bakıldığında, `111.936` OB tabanının hemen altında (`111.85 — 111.92` bandında) çok sayıda eski dip (Sell-Side Liquidity) biriktiği görülmektedir. Fiyat `112.57` tepesinden döndükten sonra bu alt likidite havuzunu süpürmek için iniyordu; 5.6 pointlik dar OB kutusu bizzat **likidite yemine (inducement)** dönüştü.
  3. **16 Saatlik Kesintisiz 15M Düşüş Akışı (Internal Bearish Orderflow):** 15M grafiğinde fiyat 24 Eylül 10:00'daki `112.57` zirvesinden itibaren 16 saat boyunca aralıksız *Lower High / Lower Low* yaparak düşmekteydi ve hemen üstte (`112.1593 — 112.2097`) taze bir 15M Bearish OB karşı engeli fiyatı aşağı itiyordu. Bu düşüş momentumunun önüne 1M CHoCH görmeden limit emirle çıkmak stop getirdi.
  4. **Pozitif Risk Yönetimi Notu:** Operatörün gece limit emri olduğu için riski `0.75x`'ten **`0.5R`'ye düşürmesi** hasarı yarı yarıya sınırlamıştır.
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [B] Agresif iniş / 1M'de ardışık kırmızı mumlarla kutuya süzülüş
  - **Soru 2 (1M Formasyonu):** [C] Delip geçti (1M alıcı CHoCH onayı oluşmadı)
  - **Soru 3 (Giriş Kararı):** [B] Limit emri (1M manuel onay beklenmeden 0.5R limit emir atıldı)
  - **Soru 4 (Sonuç):** [B] Stop (-0.5R)
  - **Soru 5 (Stop/İptal Nedeni):** [A] Kutu tutmadı / Altındaki EQL likidite havuzunu süpürmek için delindi (Limit emir hatası)

### 66. [2026-09-24 21:32 & 22:17 TSİ / 18:32 & 19:17 UTC] — ETHUSD (15M OB + FVG Unicorn - SAT) [🌺 BEGONYA]

- **Kaynak:** Begonya Telegram Sinyali (İkili Küme: OB `2730.00 - 2738.81` + FVG `2725.32 - 2731.33`) & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9) | **Begonya Skoru:** ✅ 82/100 (Tier A) | **Makro Kapı:** `SHORT_ONLY` (`G_macro: 1`) | **Önerilen Risk:** `0.56x Lot`
- **Giriş Bölgesi:** `2725.32 - 2738.81` (OB: `2730.00 - 2738.81` + FVG: `2725.32 - 2731.33` Kesişimi / Unicorn Bölgesi) | **Sinyal Anı Fiyat:** `2691.13 / 2685.56` | **Stop:** `2738.81` üstü (manuel onay)
- **Durum:** 🔥 **AKTİF İŞLEMDE (1M Konfirmasyonu Alındı — Tek İşlem Olarak Açık)** — Operatör bildirimi: *"21.32 ve 22.17 24 eylül işlemleri şuan işlemdeyiz 1m confirmasyon arayıp 1 işlem olarak kurguladım"*. Operatör peş peşe gelen örtüşmeli OB ve FVG sinyallerini çifte risk almak yerine **tek bir Unicorn (OB+FVG) kurumsal bölgesi** olarak birleştirmiş, fiyat bölgeye geri çekildiğinde 1 dakikalık konfirmasyon (1M CHoCH) bularak tek işlem halinde devreye sokmuştur.
- **Makro Rejim & Begonya Analizi:**
  - **Birincil Rejim:** `Reflationary Growth with Bear Steepening` (ABD tahvillerinde Bear Steepening eğilimi kripto varlıklar üzerinde aşağı yönlü baskı kuruyor).
  - **Makro Durum:** 🌟 A Doğru Orantılı Makro İşlem (`SHORT_ONLY`, Skor: 82/100 -> `0.56x Lot`).
  - **Haber Kalkanı:** ✅ Güvenli (±15 dk yüksek etkili veri yok).
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı` — Çift zaman dilimi güçlü ayı trendi.
  - **P/D Durumu:** `4H: Pahalı | 1H: Pahalı | 15M: Pahalı` — **Üçlü Premium (Pahalı) Bölge Hizalanması!** Tüm zaman dilimlerinde kusursuz satış uyumu.
  - **Bölge Türü:** 15M Bearish OB (`2730.00 - 2738.81`) + 15M Bearish FVG (`2725.32 - 2731.33`) Kesişimi (Unicorn Setup).
  - **Likidite Mıknatısı:** EQL (Eşit Dipler - SSL Mıknatısı): **7 dip @ 2630.81** (54.7 - 60.3 pip / ~100 USD aşağıda açık satıcı likidite havuzu).
  - **Karşı Engel:** `2620.34 — 2627.97` aralığında 15M Bullish OB (EQL mıknatısının da altında, yani `2630.81` hedefinin önünde hiçbir engel yok!).
- **Ekran Görüntüsü Analizi:**
  - **1H HTF Grafiği:** 23 Eylül 12:00'de `2730 - 2738` bölgesinden gelen devasa kırmızı displacement mumu BOS kırılımı yaparak fiyatı `2640` seviyelerine indirmiş ve geride 1H/15M Pahalı bölgede kurumsal OB + FVG bırakmış.
  - **15M Kurulum Grafiği:** 24 Eylül sabahı `2600` psikolojik sınırına iğne attıktan sonra kademeli bir düzeltme (pullback) başlatan fiyat `2691` üzerinden `2725 - 2738` kutusuna doğru sakin adımlarla yükselmiş.
  - **1M Giriş Grafiği:** 17:00 - 18:50 UTC arasında basamaklı, sakin bir tırmanış yapısı mevcut. Fiyat kutuya ulaştığında 1M dönüş onayı alınarak tek işlem olarak pozisyona girilmiş.
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [A] Sakin düzeltme (Basamaklı yükseliş / Stepped Pullback)
  - **Soru 2 (1M Formasyonu):** [A] 1M CHoCH/BOS kırılımı (1M konfirmasyon alındı)
  - **Soru 3 (Giriş Kararı):** [A] 1M FVG/OB retesti (İki sinyal birleştirilip 1M onayıyla tek işlem kurgulandı)
  - **Soru 4 (Sonuç):** 🔥 Aktif İşlemde (`ACTIVE` — `2630.81` EQL hedefi bekleniyor)
  - **Soru 5 (Stop/İptal Nedeni):** — (İşlem açık)

### 67. [2026-09-24 16:17 TSİ / 13:17 UTC] — NZDCHF (15M OB - AL) [🌺 BEGONYA]

- **Kaynak:** Begonya Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (9/9 — Tam Puan) | **Begonya Skoru:** 🌟 98/100 (Tier A+) | **Makro Kapı:** `LONG` (`G_macro: 1`, `NZDCHF LONG_ONLY`) | **Önerilen Risk:** `0.75x Lot`
- **Giriş Bölgesi:** 0.46740 - 0.46788 | **Anlık Fiyat:** 0.46954 (16.6 pip bölgenin üstünde) | **Stop:** 0.46740 altı (manuel onay)
- **Durum:** ⏳ **BEKLEMEDE (Kutuya Geri Çekilme Bekleniyor — Henüz Tetiklenmedi)** — Operatör bildirimi: *"24 eylül 16.17 işlemi bekliyoruz"*. Fiyat 0.46954 seviyesinde olup 0.46740 - 0.46788 Bullish OB kutusunun 16.6 pip üzerindedir. Kural gereği: Giriş kutusuna geri çekilme (retest) ve ardından 1 dakikalık manuel onay beklenmektedir.
- **Makro Rejim & Begonya Analizi:**
  - **Birincil Rejim:** `Reflationary Growth with Bear Steepening` (Genişleyen küresel finansal likidite +$89.4B net delta, yüksek-beta emtia kurlarını güvenli liman CHF karşısında destekliyor).
  - **Makro Durum:** 🌟 A+ Sentetik Çapraz Makro Onayı (`NZDCHF LONG_ONLY` -> `0.75x Lot`).
  - **Haber Kalkanı:** ✅ Güvenli (±15 dk yüksek etkili veri yok).
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Yukarı | 1H: Yukarı` — Çift zaman dilimi tam boğa uyumu.
  - **P/D Durumu (Extreme Discount OB Avantajı):** Sinyal anında fiyat yukarıda (`0.46954`) olduğu için `4H: Ucuz | 1H: Ucuz | 15M: Pahalı` görünmektedir; **ancak `0.46740 - 0.46788` giriş kutusu 1H ve 15M grafiklerinde kırılım bacağının en dibinde (Extreme Discount / Aşırı Ucuz) yer almaktadır!** Fiyat bu kutuya geri çekildiğinde 4H + 1H + 15M üçlü Ucuz (Discount) hizalanması kusursuz şekilde gerçekleşmiş olacaktır.
  - **Bölge Türü:** 15M Bullish Order Block (4.8 pip dar aralık, dip likiditesini süpürmüş *Extreme OB*).
  - **Likidite Mıknatısı:** EQH (Eşit Tepeler - BSL Mıknatısı): **5 tepe @ 0.4728** (32.8 pip yukarıda açık likidite havuzu).
  - **Karşı Engel:** `0.4696 — 0.4697` aralığında 15M Bearish OB (Kutu tavanından ~18 pip yukarıda, yaklaşık +3.5R mesafede).
- **Ekran Görüntüsü Analizi:**
  - **1H HTF Grafiği:** 23-24 Eylül'de `0.4674` tabanında dip likiditesini temizledikten sonra kalkan devasa yeşil displacement mumu `0.4700` üzerinde CHoCH kırılımı yapmış. Kutu 1H grafiğinin en ucuz (Extreme Discount) noktasında.
  - **15M Kurulum Grafiği:** 24 Eylül 07:30'daki dev yeşil mumun başlangıç noktası (`0.46740 - 0.46788`) korunuyor; altında süpürülmemiş EQL tuzağı yok (bizzat kendisi sweep yapmış dip).
  - **1M Giriş Grafiği:** Fiyat `0.4695` civarında yatay seyrediyor; giriş kutusuna 16.6 pip mesafe var.
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [C] Kutuya ulaşmadı (Fiyat 16.6 pip yukarıda / Beklemede)
  - **Soru 2 (1M Formasyonu):** ⏳ Beklemede (Kutuya henüz temas etmedi)
  - **Soru 3 (Giriş Kararı):** [C] Girmedim (Pas / Retest ve 1M teyidi bekleniyor)
  - **Soru 4 (Sonuç):** ⏳ Beklemede (İşlem henüz açılmadı)
  - **Soru 5 (Stop/İptal Nedeni):** ⏳ Beklemede / Tetiklenmedi

### 68. [2026-09-24 03:17 TSİ / 00:17 UTC] — LTCUSD (15M OB - SAT) [🌺 BEGONYA]

- **Kaynak:** Begonya Telegram Sinyali & 3 Ekran Görüntüsü (1H HTF, 15M Kurulum, 1M Giriş)
- **Bot Puanı:** Grade A (7/9) | **Begonya Skoru:** ✅ 82/100 (Tier A) | **Makro Kapı:** `SHORT_ONLY` (`G_macro: 1`) | **Önerilen Risk:** `0.56x Lot`
- **Giriş Bölgesi:** 62.63 - 62.98 | **Anlık Fiyat:** 62.12 (0.5 USD / %0.81 bölgenin altında) | **Stop:** 62.98 üstü (manuel onay)
- **Durum:** 🛡️ **İPTAL / KORUNDU (1M LTF Konfirmasyonu Vermedi — İşleme Girilmedi)** — Operatör bildirimi: *"ltf confirmasyon vermedi 24 eylül 03.17 işlemi"*. Fiyat 62.12 seviyesinden 62.63 - 62.98 aralığındaki 15M Bearish OB kutusuna geri çekilirken 1 dakikalık zaman diliminde (LTF) satıcı dönüş teyidi (CHoCH) üretmemiştir. Operatör kurala harfiyen uyarak işleme girmemiş ve **19. kez sermaye %0 kayıpla korunmuştur**.
- **Makro Rejim & Begonya Analizi:**
  - **Birincil Rejim:** `Reflationary Growth with Bear Steepening Yields` (US10Y %5.114, ICSA 196.0K, İşsizlik %4.1).
  - **Makro Durum:** 🌟 A Doğru Orantılı Makro İşlem (`SHORT_ONLY`, Skor: 82/100 -> `0.56x Lot`).
  - **Haber Kalkanı:** ✅ Güvenli (±15 dk yüksek etkili veri yok).
- **SMC Bağlamı & Neden LTF Onayı Vermedi?:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı` — Çift zaman dilimi düşüş trendi.
  - **P/D Durumu:** `4H: Pahalı | 1H: Pahalı | 15M: Pahalı` — Üçlü Pahalı hizalanması.
  - **Bölge Türü:** 15M Bearish Order Block (0.35 USD genişlik).
  - **Likidite Mıknatısı:** EQL (Eşit Dipler - SSL Mıknatısı): 6 dip @ 56.9567 (516.3 pip aşağıda).
  - **Karşı Engel:** 483 pip aşağıda 15M Bullish OB mevcut (`57.6200 — 57.8000`).
  - **Kritik Grafik Gözlemi (Tüketilmiş OB / Mitigated Zone):** 15M grafiğine (`media_1790433927976.jpg`) dikkatle bakıldığında, 23 Eylül 11:00'de oluşan `62.63 - 62.98` OB kutusunun, aynı gün saat 14:00'teki uzun fitilli mum tarafından **zaten bir kez test edilip tüketildiği (mitigated)** ve satış dalgasını `58.80`'e kadar verdiği görülmektedir! İkinci kez aynı kutuya gelen fiyat, kutudaki emirler ilk temasta tüketildiği için LTF'de satıcı tepkisi verememiştir.
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [A] Sakin düzeltme / Yükseliş
  - **Soru 2 (1M Formasyonu):** [C] Onay vermedi (LTF CHoCH kırılımı oluşmadı)
  - **Soru 3 (Giriş Kararı):** [C] Girmedim (Pas / 1M onay disiplini sermayeyi korudu)
  - **Soru 4 (Sonuç):** [D] İşlem alınmadı (Korundu / 0$ Kayıp)
  - **Soru 5 (Stop/İptal Nedeni):** [D] 1M onay mekanizması korudu (Kutu ilk temasta tüketilmişti)

### 69. [2026-09-30 15:15 TSİ / 12:15 UTC] — SOLUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali (`SOLUSD 15M OB SAT`)
- **Bot Puanı:** Grade A+ (9/9 — Tam Puan / Elit) | **Önerilen Risk:** Defansif Risk (%0.5R) | **Uygulanan Risk:** %1.0 Risk (1.0R)
- **Giriş Bölgesi:** 120.34 - 120.93 | **Anlık Fiyat:** 119.69 (0.7 USD / %0.54 bölgenin altında) | **Stop:** 120.93 üstü (manuel onay)
- **Durum:** 🎯 **TAKE PROFIT (+2.0R / +2.000 $ @ %1 Risk)** — Operatör bildirimi: *"30 eylül 15.15 işlemi tp oldu %1 risk 2 rr tp"*. Fiyat 119.69 seviyesinden 120.34 - 120.93 aralığındaki 15M Bearish OB kutusuna geri çekilmiş (retest), 1 dakikalık manuel onay (1M CHoCH) verdikten sonra %1 tam risk ile işleme girilmiş ve aşağıdaki 5'li EQL (`119.1980`) likidite mıknatısını süpürerek net **2 RR (+2.0R)** kârla hedefe ulaşmıştır.
- **SMC Bağlamı & Neden Kusursuz Çalıştı?:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı` — Çift zaman dilimi tam ayı trendi uyumu.
  - **P/D Durumu (Üçlü Premium Hizalanması):** `4H: Pahalı | 1H: Pahalı | 15M: Pahalı` — Tüm zaman dilimlerinde (4H, 1H, 15M) kusursuz **Pahalı (Premium)** dizilimi.
  - **Anlatı Kalitesi (4/4 Güçlü — Elit):** `Bağlam: Güçlü | Likidite: Güçlü | Reaksiyon: Güçlü | Devam: Güçlü | Genel: Elit`.
  - **Bölge Türü:** 15M Bearish Order Block (`0.59 USD` genişlik).
  - **Likidite Mıknatısı:** EQL (Eşit Dipler - SSL Mıknatısı): **5 dip @ 119.1980** (49.2 pip aşağıda güçlü satıcı likidite havuzu).
  - **Karşı Engel:** Yok (Hedef yolunda karşı 15M Bullish OB/FVG engeli bulunmaması fiyatın hedefe engelsiz akmasını sağladı).
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [A] Sakin düzeltme / Kutuya retest (`120.34 - 120.93`)
  - **Soru 2 (1M Formasyonu):** [A] 1M CHoCH/BOS kırılımı (1M manuel onay alındı)
  - **Soru 3 (Giriş Kararı):** [A] 1M FVG/OB retesti (%1 Risk ile giriş)
  - **Soru 4 (Sonuç):** [A] TP (**+2.0R / 2 RR TP**)
  - **Soru 5 (Stop/İptal Nedeni):** [D] Yok (Hedefe ulaştı)

### 70. [2026-09-30 18:01 TSİ / 15:01 UTC] — EURJPY (15M OB - SAT)

- **Kaynak:** Telegram Sinyali (`signalId: EURJPY_15m_OB_1790664300000_1790666100000`) & 1 Ekran Görüntüsü (15M Kurulum)
- **Bot Puanı:** Grade A (7/9) | **Önerilen Risk:** Defansif Risk (%0.5R)
- **Giriş Bölgesi:** 178.846 - 178.920 | **Anlık Fiyat:** 178.460 (38.6 point bölgenin altında) | **Stop:** 178.920 üstü (manuel onay)
- **Durum:** ✅ **+4.0R TAKE PROFIT (Kullanıcı İcraatı)** / ⏳ **EXPIRED (Bot Benchmarkı)** — Operatör bildirimi: *"ben bu işlemden yaklaşık 4 r aldım mesela şimdi nasıl yapıcaz"*. Fiyat bölgeye çekildiğinde (178.792) kullanıcı 1M LTF reaksiyon teyidiyle esnek giriş yaptı; ardından gelen 220 piplik çöküşü sürerek net **+4.0 R** kâr elde edildi. Botun katı simülasyonu ise OB'nin %50 orta noktasını (178.883) beklediği ve fiyat 9 pip kala döndüğü için limiti doldurulamayıp 16 mum sonra iptal edildi (Trader Alpha: +4.0R).
- **Telemetri & Kod Otopsisi (3 Kritik Sorunun Cevabı):**
  1. **Eski Motordan mı Kalma? -> Hayır, Yeni Motordan (`swing-bos-core`), Ancak 24 Saat Önceki POI:**
     - Telemetri kaydı (`EURJPY_15m_OB_1790664300000_1790666100000`), bu OB'nin **29 Eylül 14:45 UTC (17:45 TSİ)** mumunda oluştuğunu ve **29 Eylül 15:15 UTC (18:15 TSİ)** mumunda BOS kırdığını göstermektedir (grafiğin en sol ucundaki sarı kutu).
     - Kutu 30 Eylül boyunca saat `09:45`, `10:00`, `11:00`, `11:15` ve `12:30 UTC` taramalarında `"4H premium/discount context conflicts with the trade"` nedeniyle bloklanmış; ancak saat **15:00 UTC (18:00 TSİ)** kapanışında fiyat `178.460`'a çıkıp `4H Pahalı` bölgesine adım atınca 24 saatlik eski kutu `PASS` alarak bildirim olarak düşmüştür.
  2. **Neden Sadece 15M Çizimi Geldi (`1H` ve `1M` Yok)? -> 30 Saniye MTF Timeout Fallback (✅ GİDERİLDİ):**
     - `delivery-queue.jsonl` ve `screenshot.jsonl` loglarında teslimatın **41.5 saniye (`41574 ms`)** sürdüğü kayıtlıdır. `signalDeliveryProcessor.ts` içinde `1m` mumlarını çeken `loadExecutionCandles1m`, saat başı (`15:00 UTC`) TwelveData rate-limit kuyruğunda **30.0 saniye** beklediği için `30000 ms` MTF timeout sınırına takılmış ve yalnızca **15M grafiğini** göndermiştir.
     - **Uygulanan Kalıcı Çözüm (`signalDeliveryProcessor.ts`):** MTF ekran görüntüsü zaman aşımı **30 saniyeden 90 saniyeye (`90000 ms`)** çıkarıldı; `loadExecutionCandles1m` fonksiyonuna **65 saniye** izole timeout + yerel `candleStore` fallback eklendi ve herhangi bir `1m` gecikmesinde **`1H HTF`** grafiğinin bağımsız olarak yine de çizilip Telegram'a iletilmesi garanti altına alındı.
  3. **Neden `Mıknatıs` Yazılmamış? -> Tekil Swing Havuzu Fallback Eksikliği & Koşullu Gizleme (✅ GİDERİLDİ):**
     - `178.460` altında `3.5 pip` tolerans içindeki eski üçlü dip (`178.4184`) daha önce süpürüldüğü (`status: 'TAKEN'`) ve aktif dipler (`178.0322`, `177.8585`, `177.3411`) tekil kademeli swing dipleri olduğu için `liquidityMagnet.isActive === false` dönmüş ve `communicationLayer.ts` satırı gizlemişti.
     - **Uygulanan Kalıcı Çözüm (`liquidityMagnetDetector.ts`, `pipeline.ts`, `communicationLayer.ts`):** `resolveDisplayLiquidityMagnet` eklendi; 15M'de aktif `EQH`/`EQL` yoksa sırasıyla **1H aktif `EQH`/`EQL`**, **15M aktif tekil Swing Likiditesi (`SSL`/`BSL`)** ve **1H tekil Swing Likiditesi** otomatik çözümleniyor (Grade puanlamasındaki `+1` bonus yalnızca `pointsCount >= 2` olan gerçek `EQH`/`EQL` kümelerine verilmeye devam ediyor). Ayrıca `communicationLayer.ts` içinde `Mıknatıs` satırı her koşulda (`NEDEN?` bloğunda) zorunlu hale getirildi.
- **SMC Bağlamı:**
  - **HTF Trend Uyumu:** `4H: Aşağı | 1H: Aşağı`
  - **P/D Durumu:** `4H: Pahalı | 1H: Pahalı | 15M: Pahalı`
  - **Bölge Türü:** 15M Bearish Order Block (`7.4 point` genişlik, 24 saatlik).
  - **Likidite Mıknatısı (Çözümlenen):** `SSL (Tekil Dip Likiditesi - Hedef Mıknatıs): 1 dip @ 178.0322 (42.8 pip aşağıda) | Ana Dip: 177.3411`
- **1M Benchmark Değerlendirmesi:**
  - **Soru 1 (Kutuya Yaklaşım):** [A] Sakin düzeltme / Kutu retesti
  - **Soru 2 (1M Formasyonu):** [A] 1M CHoCH/BOS kırılımı (Kullanıcı onayı aldı)
  - **Soru 3 (Giriş Kararı):** [A] 1M reaksiyon teyidiyle esnek giriş
  - **Soru 4 (Sonuç):** [A] TP (**+4.0R**)
  - **Soru 5 (Stop/İptal Nedeni):** [D] Yok (Hedefe ulaştı)

### 71. [2026-10-01 10:31 TSİ / 07:31 UTC] — LTCUSD (15M OB - SAT)

- **Kaynak:** Kullanıcı İcraat Bildirimi (Trader Execution) & Telegram Sinyali (`signalId: LTCUSD_15m_OB_1790837100000_1790838900000`)
- **Giriş Bölgesi:** 67.21 - 67.46 | **Midpoint:** 67.335 | **Stop:** 67.47 üstü | **Hedef (2R):** 67.065
- **Kullanıcı Sonucu:** 🛑 **STOP LOSS (-1.0 R)**
  - Fiyat 10:15 mumunda 66.71'e sert düştükten sonra 10:30-11:30 arasında 66.85 - 67.15 yatay bandına (konsolidasyon) sıkıştı. Kullanıcı 10:31'de bu yatay piyasa içinde pozisyon aldı ve 12:00'deki retest fitiliyle stop oldu.
- **Botun Benchmark Takibi:** ✅ **+2.0 R (TAKE PROFIT)**
  - Bot yatay bant içine atlamadı; OB'nin %50 orta noktasına (`67.335`) limit satış emri kurdu.
  - 12:00 TSİ mumunda fiyat `67.43`e iğne atarak botun limitini doldurdu; stopu (`67.47`) 4 cent farkla korundu.
  - 12:45 TSİ mumunda fiyat `66.96`ya inerek botun `67.065` hedefini vurdu ve tam **+2.0 R** net kâr aldı.
- **Çıkarılan Hayati Ders (Trader vs. Bot):**
  - ⚠️ **Konsolidasyonda Kovalama (Chasing) Cezası:** Sert düşüş sonrası oluşan yatay bölgenin ortasından (retest beklemeden) işleme girmek stop mesafesini daraltır veya yanlış yere stop koydurur.
  - 🎯 **POI Retest Sabrı:** Fiyatın gerçek kurumsal POI/OB bölgesine (Premium bölge: 67.335) çekilmesini sabırla beklemek, fakeout ve likidite avı fitillerinden korur. Botun disiplini bu işlemde **+3.0R fark** yarattı (Kullanıcı -1R, Bot +2R).

### 72. [2026-10-01 19:15 TSİ / 16:15 UTC] — ETHUSD (15M OB - AL)

- **Kaynak:** Kullanıcı İcraat Bildirimi (Trader Execution) & Telegram Sinyali (`signalId: ETHUSD_15m_OB_1790848800000_1790851500000`)
- **Giriş Bölgesi:** 2677.00 - 2692.23 | **Midpoint:** 2684.615 | **Stop:** 2676.00 altı | **Hedef (2R):** 2701.845
- **Kullanıcı Sonucu:** ❌ **GİRİLMEDİ (LTF Onayı Vermedi / Fiyat Bölge İçi Yatay)**
  - Mesaj 19:16'da ulaştığında fiyat zaten bölgenin içinde (2686.88) yataya bağlamış durumdaydı. 1M zaman diliminde net bir dönüş (MSS/CHoCH) teyidi oluşmadığı ve belirsizlik sürdüğü için kullanıcı sermayesini koruyarak pozisyona girmedi.
- **Botun Benchmark Takibi:** ✅ **+2.0 R (TAKE PROFIT)**
  - Bot mekanik olarak `2684.615` seviyesine limit alış koydu. 19:45 TSİ mumunda fiyat `2676.35`e sarkarak emri doldurdu.
  - Botun stopu `2676.00` idi; fiyat yalnızca **0.35 dolar (35 cent)** farkla stoptan kurtuldu.
  - Ardından 20:15 TSİ mumunda gelen güçlü hacimli yükselişle (High: 2707.77) fiyat 20:45'te `2701.845` hedefini vurdu ve **+2.0 R TP** aldı.
- **Çıkarılan Ders & Sistemik Zayıflık:**
  - 🛡️ **Trader Disiplini (Doğru Karar):** Fiyat halihazırda bölgenin içindeyken ve 1M LTF teyidi yokken kenarda kalmak doğru bir sermaye koruma davranışıdır. Botun 35 centle stoptan dönmesi aşırı yüksek riskli bir şans faktörüdür (fiyat stop mesafesinin %96'sına kadar aleyhte çekilip dönmüştür).
  - ⚙️ **Bot Sinyal Gecikmesi / Bölge İçi Bildirim:** Sinyalin, fiyat bölgenin dışındayken değil de tam ortasındayken gönderilmesi kullanıcı için analiz karmaşası yaratmaktadır. Sinyal dağıtımına "fiyat bölgeye girmeden önce haber ver" mekanizması eklenmesi teyit almayı kolaylaştıracaktır.

### 73. [2026-10-01 20:30 TSİ / 17:30 UTC] — ETHUSD (15M OB - AL)

- **Kaynak:** Kullanıcı İcraat Bildirimi (Trader Execution) & Telegram Sinyali (`signalId: ETHUSD_15m_OB_1790873100000_1790874900000`)
- **Giriş Bölgesi:** 2676.35 - 2688.04 | **Midpoint:** 2682.195 | **Stop:** 2675.35 altı | **Hedef (2R):** 2695.885
- **Kullanıcı Sonucu:** ❌ **GİRİLMEDİ (Grafik Çizimleri Gelmedi / Pas Geçildi)**
  - Sistemde ekran görüntüsü üretim hatası (`failureReason: one or more screenshots failed`, `state: SCREENSHOT_FAILED`) yaşandı ve Telegram'a yalnızca metin ulaştı. Kullanıcı görsel teyit ve çizimler olmadan körleme işlem almayarak doğru bir kararla sinyali es geçti.
- **Botun Benchmark Takibi:** ⏳ **EXPIRED (0 R)**
  - Sinyal oluştuğunda fiyat zaten 2706 - 2708 seviyelerine fırlamıştı.
  - Botun `2682.195` (OB Midpoint) seviyesindeki limit alış emri 16 bar (4 saat) boyunca hiç tetiklenmedi (`entryTriggered: false`), süre dolumu ile iptal edildi.
- **Çıkarılan Ders & Sistemik Teşhis:**
  - 🛡️ **Trader Kuralı (Kör İşlem Yapmama):** Grafik veya çizim desteği gelmeyen sinyallere girmemek trader sermayesi için hayati bir filtredir.
  - ⚙️ **Bot Altyapı Notu:** `SCREENSHOT_FAILED` durumunda metin sinyalinin kullanıcıya görsel olmadan gitmesi kafa karışıklığı yaratmaktadır. Screenshot kuyruğunun güçlendirilmesi veya görsel olmadan gönderilen mesajlara açıkça uyarı eklenmesi faydalı olacaktır.

### 74. [2026-10-02 00:00 TSİ / 2026-10-01 21:00 UTC] — AUDJPY (15M OB - SAT)

- **Kaynak:** Kullanıcı İcraat Bildirimi (Trader Execution) & Telegram Sinyali (`signalId: AUDJPY_15m_OB_1790862300000_1790864100000`)
- **Giriş Bölgesi:** 109.75304 - 109.82458 | **Midpoint:** 109.78881 | **Stop:** 109.83458 üstü | **Hedef (2R):** 109.69727
- **Kullanıcı Sonucu:** ❌ **GİRİLMEDİ (Retest ve LTF Teyidi Gelmedi / Pas Geçildi)**
  - Sinyal saat 00:02 TSİ'de iletildiğinde sistem 1M verisi hazır olmadığı için yalnızca 15M grafiği gönderdi (`oneMinuteAvailable: false, fifteenMinuteFallback: true`). Kullanıcı bölgeye retest ve 1M LTF dönüş teyidi bekledi; fiyat bölgeye (109.75) dönmeyip doğrudan aşağı aktığı için emir açılmadı.
- **Botun Benchmark Takibi:** ⏳ **EXPIRED (0 R)**
  - Bot `109.78881` seviyesine satış limiti kurdu. Fiyat en yüksek 109.61'i gördü ve bölgeye hiç çekilmeden 109.22'ye kadar çöktü. Limit doldurulamadığı için sinyal 16 bar (4 saat) sonra saat 03:45 TSİ'de zaman aşımına uğradı.
- **Çıkarılan Ders & Sistemik Teşhis:**
  - 🛡️ **Teyitsiz Kovalamama (Disiplin Örneği):** Fiyat retest vermeden doğrudan hedefe doğru aktığında FOMO ile peşinden koşmamak, teyit beklemek iki tarafı da korumuştur.
  - ⚙️ **Görsel Telemetri Doğrulaması:** Ekran görüntüsü telemetrisinde (`telemetry/screenshot.jsonl`), 1M bar verisi henüz hazır olmadığı için sistemin bilinçli olarak 15M fallback'e geçtiği doğrulanmıştır.

### 75. [2026-10-02 19:15 TSİ / 16:15 UTC] — GBPJPY (15M FVG - AL)

- **Kaynak:** Kullanıcı İcraat Bildirimi (Trader Execution) & Telegram Sinyali (`signalId: GBPJPY_15m_FVG_1790947800000_1790947800000`)
- **Giriş Bölgesi:** 208.25163 - 208.37418 | **Midpoint:** 208.3129 | **Stop:** 208.24163 altı | **Hedef (2R):** 208.45545
- **Kullanıcı Sonucu:** ✅ **+2.3 R (TAKE PROFIT - Kademeli Kâr Alımı: 1R'de %50 TP, nihai 2.3R)**
  - Kullanıcı 19:15 sinyali sonrasında LTF momentum onayıyla Long pozisyona girdi. Fiyat yukarı patladıktan sonra 1R seviyesinde pozisyonun %50'si realize edildi; kalan yarısı ise 2.3R seviyesinde kapatılarak işlem net kârla tamamlandı.
- **Botun Benchmark Takibi:** ⏳ **EXPIRED (0 R)**
  - Bot mekanik olarak FVG'nin orta noktası olan `208.3129` seviyesine limit alış emri kurdu.
  - Fiyat 208.80'den gerideki FVG'ye (`208.31` seviyesine) hiç geri çekilmedi; doğrudan yukarı tırmandı. 16 bar (4 saat) boyunca limit dolmadığı için bot benchmarkında 23:00 TSİ'de zaman aşımına uğradı.
- **Çıkarılan Ders & Karşılaştırmalı Gözlem:**
  - 💡 **Kademeli Kâr Alımı & Esnek İcraat (Trader Alpha):** Güçlü yükseliş trendinde fiyat geçmiş FVG'ye geri dönmeden yukarı akarken trader'ın momentumla girmesi ve 1R'de risk alıp %50 kâr alarak pozisyonu 2.3R'ye kadar sürmesi algoritmaya göre **+2.3R net avantaj** sağlamıştır.

### 76. [2026-10-05 10:01 TSİ / 07:01 UTC] — EURJPY (15M OB - SAT)

- **Kaynak:** Telegram Sinyali (`signalId: EURJPY_15m_OB_1791178200000_1791181800000`)
- **Giriş Bölgesi:** 176.745 - 176.824 | **Midpoint:** 176.785 | **Stop:** 176.834 üstü (-1.0R) | **Önerilen Risk:** Defansif Risk (%0.5R)
- **Kullanıcı Sonucu:** 🛑 **STOP LOSS (-1.0 R)**
  - Sinyal 176.428 seviyesindeyken geldi. Fiyat saat 11:15 - 11:30 TSİ mumlarında 176.745 - 176.824 aralığındaki OB bölgesine retest verdiğinde kullanıcı satış pozisyonu aldı. Ancak fiyat bölgede tutunamayarak yukarı patladı (High: 176.900) ve 176.834 stop seviyesini aşarak stop oldu.
- **Botun Benchmark Takibi:** 🛑 **STOP LOSS (-1.0 R)**
  - Bot mekanik olarak `176.785` orta noktasına limit satış kurdu. Saat 11:15 mumunda (High: 176.804) emir tetiklendi, 11:30 mumunda (High: 176.900) stop seviyesi `176.834` aşılarak bot da -1.0R ile stop kaydetti (`exitReason: Stop level was reached`).
- **SMC Otopsisi & Çıkarılan Ders:**
  - ⚠️ **15M Discount (Ucuz) Bölge Tuzağı:** Sinyal detayında `15M: Ucuz` uyarısı mevcuttu. Fiyat 176.20 dip seviyesinden çok agresif bir V-dönüşüyle yükseldi; 11:15 mumundaki alıcı dalgası çok güçlü olduğu için Bearish OB direnç gösteremedi ve likiditeyi süpürerek yukarı aktı.
  - 🛡️ **Risk Disiplini:** Sinyal "Defansif Risk (%0.5R)" önerdiğinden, risk küçültme kuralı sayesinde kasa hasarı sınırlı tutuldu.

### 77. [2026-10-05 19:17 TSİ / 16:17 UTC] — GBPJPY (15M OB - AL)

- **Kaynak:** Telegram Sinyali (`signalId: GBPJPY_15m_OB_1791186300000_1791189000000`)
- **Giriş Bölgesi:** 208.490 - 208.604 | **Midpoint:** 208.547 | **Stop:** 208.480 altı (-1.0R) | **Hedef (2R):** 208.682 | **Mıknatıs:** 208.983 EQH
- **Kullanıcı Sonucu:** ❌ **GİRİLMEDİ (1M LTF Onayı Vermedi / Pas Geçildi)**
  - Sinyal 208.740 seviyesindeyken iletildi. Fiyat gece boyunca 208.80 - 208.95 seviyelerinde yukarıda asılı kaldı; en düşük sadece 208.691'e kadar gevşedi ve aşağıdaki `208.490 - 208.604` giriş bölgesine hiç inmedi. 1M zaman diliminde teyit ve bölgeye retest oluşmadığı için kullanıcı kural gereği işleme girmedi ve pas geçti.
- **Botun Benchmark Takibi:** ⏳ **EXPIRED (0 R)**
  - Bot mekanik olarak `208.547` seviyesine limit alış kurdu. Fiyat 16 bar (4 saat) boyunca bu seviyeye çekilmediği için emir saat 23:15 TSİ'de zaman aşımına uğrayarak iptal edildi.
- **Çıkarılan Ders & Teşhis:**
  - 🛡️ **Teyitsiz Kovalamama:** Fiyat geride kalan OB kutusuna retest vermeden yukarıda konsolide olduğunda sabırla beklemek ve teyitsiz atlamamak disiplini korudu.

### 78. [2026-10-05 21:15 TSİ / 18:15 UTC] — XAUUSD (15M OB - AL)

- **Kaynak:** Telegram Sinyali (`signalId: XAUUSD_15m_OB_1791219600000_1791222300000`)
- **Giriş Bölgesi:** 4125.61 - 4133.16 | **Midpoint:** 4129.39 | **Stop:** 4125.51 altı (-1.0R) | **Hedef (2R):** 4137.13 | **Mıknatıs:** 4141.76 EQH (3.2R)
- **Kullanıcı Sonucu:** ✅ **+2.0 R (TAKE PROFIT - Kademeli Kâr Alımı: 1R'de %50 TP, nihai 2.0R TP)**
  - Sinyal saat 21:15 TSİ'de (fiyat 4136.36) iletildikten hemen sonra saat 21:15 - 21:30 TSİ mumunda fiyat 4131.48 seviyesine iğne atarak 4125.61 - 4133.16 OB kutusunun içine retest verdi. Kullanıcı 1M dönüş teyidiyle esnek giriş yaptı; ardından fiyat 21:45 mumunda 4142.56'ya, 22:30'da ise 4144.04'e fırlayarak hem 2R hedefini (4137.13) hem de yukarıdaki 4141.76 EQH likidite mıknatısını süpürdü. 1R'de %50 kâr alındı, kalan pozisyon 2R hedefinde realize edilerek işlem tamamlandı.
- **Botun Benchmark Takibi:** ⏳ **EXPIRED (0 R)**
  - Bot mekanik olarak tam orta nokta olan `4129.385` seviyesine limit alış kurmuştu. Fiyatın retest fitili `4131.48` seviyesinde kaldı (yaklaşık 2 USD kala döndü). Botun limit emri dolmadı ve 16 bar sonra iptal edildi.
- **Çıkarılan Ders & Karşılaştırmalı Gözlem (Trader Alpha):**
  - 💡 **Esnek Kutu İçi Giriş Üstünlüğü:** Tıpkı EURJPY (#70) ve GBPJPY (#75) işlemlerinde olduğu gibi, botun katı %50 midpoint kuralı kutu sınırından dönen hızlı altın hareketini kaçırırken, kullanıcının 1M reaksiyon teyidiyle kutu içinden esnek girmesi ve kademeli kâr alması algoritmaya göre **+2.0R net avantaj** sağlamıştır.

### 79. [2026-10-06 04:30 TSİ / 01:30 UTC] — XAUUSD (15M OB - AL)

- **Kaynak:** Telegram Sinyali (`signalId: XAUUSD_15m_OB_1791246600000_1791247500000`)
- **Giriş Bölgesi:** 4135.86 - 4144.07 | **Midpoint:** 4139.97 | **Stop:** 4135.76 altı (-1.0R) | **Hedef (2R):** 4148.38 | **Mıknatıs:** 4152.87 EQH
- **Kullanıcı Sonucu:** 🛡️ **GİRİLMEDİ / KORUNDU (1M LTF Onayı Vermedi / Deldi Geçti)**
  - Sinyal 04:30 TSİ'de fiyat 4137.37 seviyesinde (aktif retest içindeyken) geldi. Kullanıcı 1 dakikalık grafikte kurumsal alıcı dönüş onayı aradı; ancak fiyat kutu içinde hiçbir boğa dönüş yapısı (CHoCH) üretmeden 04:30 mumunda 4130.86'ya, ardından 4107.78'e kadar sert kırmızı mumlarla delip geçti. Kullanıcı teyit görmediği için işleme girmeyerek sermayesini korudu.
- **Botun Benchmark Takibi:** ⏳ **EXPIRED (0 R)**
  - Bot mekanik olarak `4139.965` (orta nokta) seviyesine limit alış koymuştu. Sinyal geldiğinde fiyat zaten bu seviyenin altındaydı (`4137.37`); fiyat yukarı dönüp 4139.96'yı doldurmadan doğrudan aşağı çöküşünü sürdürdüğü için botun limit emri hiç tetiklenmedi ve 16 bar sonra zaman aşımına uğradı.
- **Çıkarılan Ders & Sistemik Doğrulama:**
  - 🛡️ **1M Onayının Sermaye Koruma Gücü:** Bu işlem, "Giriş bölgesine girse bile 1M onayı olmadan körleme emir atılmaz" kuralının ders niteliğinde bir örneğidir. Fiyat kutuyu 30 dolar aşağı delip geçerken kullanıcının teyit beklemesi kesin bir **-1.0R zararı engellemiştir**.

### 80. [2026-10-06 09:31 TSİ / 06:31 UTC] — XAUUSD (15M OB - AL)

- **Kaynak:** Telegram Sinyali (`signalId: XAUUSD_15m_OB_1791265500000_1791267300000`)
- **Giriş Bölgesi:** 4116.36 - 4123.97 | **Midpoint:** 4120.17 | **Stop:** 4116.26 altı (-1.0R) | **Hedef (2R):** 4127.98 | **Mıknatıs:** 4139.77 EQH (5.0R)
- **Kullanıcı Sonucu:** ⏳ **GİRİLMEDİ / PAS (Kutuya Değmedi / Retest Gelmedi)**
  - Sinyal 09:31 TSİ'de fiyat 4134.07 seviyesindeyken (bölgenin 10.1 dolar üstünde) iletildi. Sinyal sonrasında fiyat en düşük 4128.02 seviyesine kadar gevşedi; aşağıdaki `4116.36 - 4123.97` OB kutusuna yaklaşık 4 dolar kala yukarı döndü. Kullanıcı teyit ve kutuya temas görmediği için kural gereği işleme girmedi ve pas geçti.
- **Botun Benchmark Takibi:** ⏳ **EXPIRED (0 R)**
  - Bot mekanik olarak `4120.17` seviyesine limit alış emri kurdu. Fiyat geride kalan bu seviyeye hiç çekilmeden 4128'den 4160'a kadar roket gibi yükseldiği için botun emri de hiç tetiklenmedi ve zaman aşımıyla iptal oldu.
- **Çıkarılan Ders & Teşhis:**
  - 🛡️ **FOMO Kontrolü:** Fiyat gerideki OB'ye dönmeden yukarı uçtuğunda arkasından atlamayıp disiplini korumak risksiz kalmayı sağlamıştır.

### 81. [2026-10-06 15:16 TSİ / 12:16 UTC] — LTCUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali (`signalId: LTCUSD_15m_OB_1791213300000_1791214200000`)
- **Giriş Bölgesi:** 71.14 - 71.49 | **Midpoint:** 71.31 | **Stop:** 71.50 üstü (-1.0R) | **Hedef (2R):** 70.94 | **Mıknatıs:** 70.25 EQL (5.8R)
- **Kullanıcı Sonucu:** ⏳ **GİRİLMEDİ / PAS (Kutuya Gelmedi / Retest Yok)**
  - Sinyal 15:16 TSİ'de fiyat 70.43 seviyesindeyken (bölgenin 0.7 USD / %1.0 altında) iletildi. Fiyat yukarıdaki `71.14 - 71.49` OB bölgesine hiç retest vermedi; en fazla 70.50 seviyesini gördükten sonra doğrudan 69.12 seviyesine kadar çöktü. Kullanıcı retest ve 1M teyidi gelmediği için kural gereği işleme girmedi ve pas geçti.
- **Botun Benchmark Takibi:** ⏳ **EXPIRED (0 R)**
  - Bot mekanik olarak `71.315` orta noktasına limit satış kurdu. Fiyat gerideki kutuya hiç dönmeyip doğrudan hedeflere aktığı için botun limiti dolmadı ve 16 bar sonra zaman aşımıyla iptal edildi.
- **Çıkarılan Ders & Teşhis:**
  - 🛡️ **Kovalamama Disiplini:** Fiyat retest vermeden hedefe aksa bile ortadan atlamayarak sermayeyi korumak doğru bir risk refleksi oldu.

### 82. [2026-10-06 19:16 TSİ / 16:16 UTC] — BTCUSD (15M OB - AL)

- **Kaynak:** Telegram Sinyali (`signalId: BTCUSD_15m_OB_1791270900000_1791276300000`)
- **Giriş Bölgesi:** 85296.81 - 85410.00 | **Midpoint:** 85353.40 | **Stop:** 85295.81 altı (-1.0R) | **Hedef (2R):** 85468.60 | **Mıknatıs:** 86712.05 EQH (23.6R)
- **Kullanıcı Sonucu:** 🛡️ **GİRİLMEDİ / KORUNDU (1M LTF Onayı Vermedi / Deldi Geçti)**
  - Sinyal 19:16 TSİ'de fiyat 85800.77 seviyesindeyken iletildi. Fiyat gece boyunca yatay aktıktan sonra gece 04:15 - 04:45 TSİ mumlarında 85296 - 85410 OB kutusuna indi. Kullanıcı 1M dönüş teyidi aradı; ancak fiyat hiçbir kurumsal alıcı onayı vermeden kutuyu ve stop seviyesini (85295.81) aşağı delip geçti, sabah saatlerinde 83577 seviyesine kadar 1700 dolarlık sert bir çöküş yaşadı. Kullanıcı teyit görmediği için işleme girmeyerek sermayesini korudu.
- **Botun Benchmark Takibi:** ⏳ **EXPIRED (0 R)**
  - Bot mekanik olarak `85353.40` seviyesine limit alış emri kurmuştu. Ancak 16 bar (4 saat) penceresi olan 19:16 — 23:15 TSİ arasında fiyat kutuya henüz ulaşmamıştı (fiyat 85500 üzerinde yataydaydı). Bu nedenle botun limit emri 23:15 TSİ'de kural gereği zaman aşımına uğrayarak iptal edildi; geceki çöküşte açık emir bulunmadığı için bot da zarar yazmadı.
- **Çıkarılan Ders & Teşhis:**
  - 🛡️ **1M Filtresinin Gücü:** Tıpkı #79 Altın işleminde olduğu gibi, fiyat kutuya girdiğinde körleme girmeyip 1M teyidi aramak kullanıcıyı geceki 1700 dolarlık Bitcoin çöküşünden ve net -1.0R zarardan kurtarmıştır.

### 83. [2026-10-07 03:31 TSİ / 00:31 UTC] — CHFJPY (15M FVG - AL)

- **Kaynak:** Telegram Sinyali (`signalId: CHFJPY_15m_FVG_1791331200000_1791331200000`)
- **Giriş Bölgesi:** 190.188 - 190.283 | **Midpoint:** 190.236 | **Stop:** 190.178 altı (-1.0R) | **Hedef (2R):** 190.351 | **Mıknatıs:** 190.373 EQH (2.4R) | **Önerilen Risk:** Defansif Risk (%0.5R)
- **Kullanıcı Sonucu:** 🛑 **STOP LOSS (-1.0 R / Disiplin İhlali)**
  - Sinyal 03:31 TSİ'de fiyat 190.314 seviyesindeyken geldi. Saat 04:00 - 04:15 TSİ mumunda fiyat 190.188 - 190.283 FVG kutusunun içine indi ancak kutu içinde 1M LTF boğa onayı vermeden doğrudan delip geçti (Low: 190.087). Kullanıcı kutunun delinmesine aldırmayıp kutu dışında oluşan gecikmeli bir 1M teyidiyle pozisyona girdi; ancak fiyat toparlanamayarak 190.04 seviyesine kadar düşüşünü sürdürdü ve kullanıcı stop oldu.
- **Botun Benchmark Takibi:** 🛑 **STOP LOSS (-1.0 R)**
  - Bot mekanik olarak `190.2358` orta noktasına limit alış kurdu. Saat 04:15 mumunda fiyat kutuyu delerken limit emri doldurdu ve aynı mumda fiyat 190.087'ye kadar çökerek botun stop seviyesini (`190.178`) anında patlattı (-1.0R Stop).
- **SMC Otopsisi & Çıkarılan Ders:**
  - ⚠️ **Kutu Dışında Teyit Arama / Geçersiz POI Tuzağı:** Kutu (FVG / OB) bir kez aşağı delinip geçildikten ve stop seviyesi kırıldıktan sonra artık o POI hükümsüzdür. Kutu dışına taşmış sarkmalarda gecikmeli LTF teyidi aramak "düşen bıçağı tutmaya" benzer. Kutu delindiyse işlem doğrudan iptal edilmeli, yeni setup beklenmelidir.








### 84. [2026-10-07 05:46 TSİ / 02:46 UTC] — EURAUD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali (`signalId: EURAUD_15m_OB_1791333000000_1791335700000`)
- **Giriş Bölgesi:** 1.61154 - 1.61249 | **Midpoint:** 1.61201 | **Stop:** 1.61259 üstü (-1.0R / 5.7 pip risk) | **Hedef (2R):** 1.61086 | **Mıknatıs:** 1.60982 EQL (3.8R) | **Önerilen Risk:** Defansif Risk (%0.5R)
- **Kullanıcı Sonucu:** ⚠️ **KAÇIRILDI (1M LTF Onayı Geldi, +2.0R TP Aldı, Ancak İşleme Girilemedi)**
  - Operatör bildirimi: *"Ltf confirme verdi işlem 2 r tp aldı ama kullanıcı işleme giremedi"*.
  - Sinyal 05:46 TSİ'de fiyat 1.61118 seviyesindeyken iletildi. Fiyat kısa süre sonra geri çekilerek `1.61154 - 1.61249` OB kutusunun içine girdi (en yüksek 1.61194 gördü). 1 dakikalık grafikte düşüş konfirmasyonu (1M CHoCH / teyit) oluştu. Ancak kullanıcı emir iletimi, limit sırası veya anlık gecikme sebebiyle işleme dahil olamadı. Ardından parite öngörüldüğü gibi sert satış yiyerek 1.61063 seviyesine düştü ve +2.0R hedefini (`1.61086`) tam olarak tamamladı; ilerleyen saatlerde 1.60982 EQL mıknatısına kadar satış devam etti.
- **Botun Benchmark Takibi:** ⏳ **EXPIRED (0 R / Tetiklenmedi)**
  - Bot mekanik kuralı gereği tam orta noktaya (`1.612015`) limit satış emri kurmuştu. Fiyat kutu tabanını aşıp `1.61194` seviyesine kadar çıktı; yani botun limit emrine **sadece 0.7 pip (7 mikropip)** kala geri döndü. Kural gereği limit emir dolmadığı için bot pozisyona giremedi ve 16 bar sonunda emir zaman aşımına (`EXPIRED`) uğradı.
- **SMC Otopsisi & Çıkarılan Ders:**
  - 🎯 **Limit (Midpoint) vs 1M Onay (Market/Retest) Farkı:**
    - Kutu derinliğine tam temas etmeden (%40 derinlikten) dönen kaliteli setup'larda, mekanik midpoint limiti 0.7 pip gibi milimetrik bir farkla dışarıda kalabilmektedir.
    - Canlı kullanıcı 1M grafikte dönüşü net olarak teyit etmiş, analiz ve yön %100 kusursuz çalışarak +2.0R kâr üretmiştir. Kaçırılma sebebi analiz değil, uygulama (execution) hızıdır. Bu tip net 1M kırılımlarında hızlı piyasa emri veya kırılan 1M FVG'ye agresif limit koymak hedefin kaçmasını engeller.

### 85. [2026-10-08 18:46 TSİ / 15:46 UTC] — GBPJPY (15M OB - AL)

- **Kaynak:** Telegram Sinyali (`signalId: GBPJPY_15m_OB_1791465300000_1791468900000`)
- **Giriş Bölgesi:** 208.889 - 208.984 | **Midpoint:** 208.936 | **Stop:** 208.879 altı (-1.0R / 5.8 pip risk) | **Hedef (2R):** 209.052 | **Mıknatıs:** 209.536 EQH (10.4R) | **Önerilen Risk:** Defansif Risk (%0.5R)
- **Kullanıcı Sonucu:** 🛡️ **GİRİLMEDİ / KORUNDU (1M Onay Vermedi / Deldi Geçti)**
  - Operatör bildirimi: *"8 ekim ltf confirme vermedi deldi geçti"*.
  - Sinyal 18:46 TSİ'de fiyat 209.037 seviyesindeyken geldi. Fiyat 19:15 - 19:30 TSİ (16:15 - 16:30 UTC) aralığında 208.889 - 208.984 OB bölgesine indi. Ancak 1 dakikalık grafikte hiçbir kurumsal alıcı teyidi (1M CHoCH / alıcı pin barı / displacement) oluşmadı. Aksine fiyat kutu tabanını ve stop seviyesini (208.879) dikey mumlarla kırarak 208.48 seviyesine kadar tam 50 pip aşağı çakıldı. Kullanıcı 1M onay kuralına sadık kalarak işleme girmedi ve net -1.0R zarardan korundu.
- **Botun Benchmark Takibi:** 🛑 **STOP LOSS (-1.0 R)**
  - Bot mekanik kuralı gereği tam orta noktaya (`208.9363`) limit alış emri kurmuştu. Saat 19:30 TSİ mumunda fiyat kutuyu delerken limit emri doldurdu ve aynı 15 dakikalık mumda 208.878'e inerek botun stop seviyesini anında patlattı (-1.0R Stop).
- **SMC Otopsisi & Çıkarılan Ders:**
  - 🛡️ **1M Onay Filtresinin Kurtardığı Sermaye:** Tıpkı #79 (XAUUSD) ve #82 (BTCUSD) işlemlerinde olduğu gibi; kutu retestinde körleme limit emir kurmak şelale düşüşlerinde doğrudan stop write ederken, 1M LTF onayı bekleyen kullanıcı sıfır zararla sermayesini korumuştur.

### 86. [2026-10-08 17:46 TSİ / 14:46 UTC] — EURJPY (15M OB - AL)

- **Kaynak:** Telegram Sinyali (`signalId: EURJPY_15m_OB_1791465300000_1791468900000`)
- **Giriş Bölgesi:** 176.953 - 177.045 | **Midpoint:** 176.999 | **Stop:** 176.943 altı (-1.0R / 5.6 pip risk) | **Hedef (2R):** 177.111 | **Mıknatıs:** 177.800 EQH (14.3R) | **Önerilen Risk:** Defansif Risk (%0.5R)
- **Kullanıcı Sonucu:** 🛡️ **GİRİLMEDİ / KORUNDU (1M Onay Vermedi / Deldi Geçti)**
  - Operatör bildirimi: *"8 ekim ltf confirme vermedi deldi geçti"*.
  - Sinyal 17:46 TSİ'de fiyat 177.340 seviyesindeyken geldi. Fiyat 19:30 - 19:45 TSİ (16:30 - 16:45 UTC) aralığında 176.953 - 177.045 OB bölgesine indi. Ancak 1 dakikalık grafikte hiçbir kurumsal alıcı teyidi (1M CHoCH / alıcı pin barı) oluşmadı; fiyat kutuyu ve 176.943 stop seviyesini kırarak 176.72 seviyesine kadar 22 pip aşağı çakıldı. Kullanıcı teyitsiz işleme girmeyerek sermayesini doğrudan korudu (-1.0R zarardan kurtuldu).
- **Botun Benchmark Takibi:** 🛑 **STOP LOSS (-1.0 R)**
  - Bot mekanik kuralı gereği tam orta noktaya (`176.9989`) limit alış emri kurmuştu. Saat 19:45 TSİ mumunda fiyat kutuyu delerken limit emri doldurdu ve aynı mum içinde 176.902 seviyesine inerek botun stop seviyesini (`176.9429`) patlattı (-1.0R Stop).
- **SMC Otopsisi & Çıkarılan Ders:**
  - 🛡️ **JPY Korelasyonu ve 1M Filtresinin Çifte Zaferi:**
    - 8 Ekim akşamı hem GBPJPY (#85) hem de EURJPY (#86) Japon Yeninin genele yayılan sert değer kazanımıyla satış dalgası yaşadı.
    - Robot mekanik limit emirleriyle her iki paritede de peş peşe stop olup toplam **-2.0R** zarar yazarken; canlı kullanıcı her iki işlemde de 1M dönüş teyidi oluşmadığını görerek kenarda bekledi ve tek bir akşamda toplam **+2.0R** sermaye kurtarmış oldu.

### 87. [2026-10-08 18:32 TSİ / 15:32 UTC] — GBPUSD (15M OB - AL)

- **Kaynak:** Telegram Sinyali (`signalId: GBPUSD_15m_OB_1791459900000_1791460800000`)
- **Giriş Bölgesi:** 1.31935 - 1.32013 | **Midpoint:** 1.31974 | **Stop:** 1.31925 altı (-1.0R / 4.9 pip risk) | **Hedef (2R):** 1.32072 | **Mıknatıs:** 1.32468 EQH (10.1R) | **Önerilen Risk:** Defansif Risk (%0.5R) | **İvme Uyarısı:** ⚠️ Yüksek Kinetik Enerji (2.03x ATR)
- **Kullanıcı Sonucu:** ⏳ **GİRİLMEDİ / PAS (Kutuya Geri Çekilme Olmadı / Retest Gelmedi)**
  - Operatör bildirimi: *"bekliyoruz 8 ekim"*.
  - Sinyal 18:32 TSİ'de fiyat 1.32147 seviyesindeyken geldi. Fiyat en fazla 1.32043 seviyesine kadar gerileyerek giriş kutusunun tavanına (1.32013) 3.0 pip kala yukarı döndü ve kutuya hiç temas etmeden yükselişine devam etti. Kullanıcı "Kutuya dönmeden işlem yok" kuralına harfiyen uyarak takipte kaldı ve pozisyona girmedi (Pas).
- **Botun Benchmark Takibi:** ⏳ **EXPIRED (0 R / Tetiklenmedi)**
  - Bot mekanik olarak `1.31974` orta noktasına limit alış emri kurmuştu. Fiyat kutu sınırına dahi ulaşmadığı için limit emir tetiklenmedi ve 16 bar sonunda zaman aşımına (`EXPIRED`) uğrayarak iptal edildi.
- **SMC Otopsisi & Çıkarılan Ders:**
  - 🧘 **Retest Sabrı ve FOMO Önleme:** Fiyat kutunun 3 pip yakınından döndüğünde piyasayı kovalamamak (FOMO yapmamak) profesyonel risk yönetiminin parçasıdır. Kutuya girmeyen işlemler hem kullanıcı hem bot nezdinde tertemiz 0R ile kapatılmıştır.

### 88. [2026-10-09 15:02 TSİ / 12:02 UTC] — SOLUSD (15M OB - SAT)

- **Kaynak:** Telegram Sinyali (`signalId: SOLUSD_15m_OB_1791470700000_1791471600000`)
- **Giriş Bölgesi:** 112.26 - 112.66 | **Midpoint:** 112.46 | **Stop:** 112.67 üstü (-1.0R / 21 pip risk) | **Hedef (2R):** 112.04 | **Mıknatıs:** 108.80 EQL (17.4R) | **Önerilen Risk:** Defansif Risk (%0.5R) | **İvme Uyarısı:** ⚠️ Yüksek Kinetik Enerji (3.12x ATR)
- **Kullanıcı Sonucu:** ⏳ **GİRİLMEDİ / PAS (Kutuya Geri Çekilme Olmadı / Retest Gelmedi)**
  - Operatör bildirimi: *"9 ekim bekliyoruz"*.
  - Sinyal 15:02 TSİ'de fiyat 111.31 seviyesindeyken geldi. Giriş bölgesi 112.26 - 112.66 seviyesindeydi. Fiyat sinyal sonrası yukarı toparlanma gerçekleştiremedi (en yüksek 111.38 gördü) ve kutuya hiç ulaşamadan 109.17 seviyesine kadar düşüşünü sürdürdü. Kullanıcı "Kutuya dönmeden kesinlikle işlem yok" kuralına uyarak bekledi, kutuya retest gelmediği için işlem açılmadı (Pas).
- **Botun Benchmark Takibi:** ⏳ **EXPIRED (0 R / Tetiklenmedi)**
  - Bot mekanik olarak `112.46` orta noktasına limit satış emri kurmuştu. Fiyat kutuya hiç yaklaşmadığı için emir tetiklenmedi ve 16 bar sonunda zaman aşımına (`EXPIRED`) uğrayarak kapandı.
- **SMC Otopsisi & Çıkarılan Ders:**
  - ⏳ **Trend Şiddeti ve Kaçan Retest:** 3.12x ATR gibi aşırı yüksek kinetik enerjiyle düşen piyasalarda fiyat bazen geride bıraktığı OB'ye hiç dönmeden hedefe (108.80 EQL mıknatısına) doğrudan akabilir. Kural gereği retest olmadan işleme girmemek disiplinli bir tercihtir ve her iki taraf da risksiz (0 R) kalmıştır.

### 89. [2026-10-09 17:31 TSİ / 14:31 UTC] — ETHUSD (15M FVG - SAT)

- **Kaynak:** Telegram Sinyali (`signalId: ETHUSD_15m_FVG_1791471600000_1791472500000`)
- **Giriş Bölgesi:** 2513.33 - 2527.24 | **Midpoint:** 2520.28 | **Stop:** 2528.24 üstü (-1.0R / 8 pip risk) | **Hedef (2R):** 2504.38 | **Mıknatıs:** 2477.43 EQL (5.4R) | **Önerilen Risk:** Defansif Risk (%0.5R)
- **Kullanıcı Sonucu:** ⏳ **GİRİLMEDİ / PAS (Kutuya Geri Çekilme Olmadı / Retest Gelmedi)**
  - Operatör bildirimi: *"9 ekim bekliyoruz"*.
  - Sinyal 17:31 TSİ'de fiyat 2494.50 seviyesindeyken geldi. Giriş bölgesi yukarıda (`2513.33 - 2527.24`) FVG olarak belirlendi. Fiyat sinyal sonrasında en fazla 2499.14 seviyesine kadar yükselebildi ve kutu tabanına (2513.33) 14.2 USD kala tekrar aşağı dönerek 2481.75 seviyesine kadar indi. Kullanıcı "Kutuya dönmeden kesinlikle işlem yok" kuralına harfiyen uyarak takipte kaldı ve pozisyona girmedi (Pas).
- **Botun Benchmark Takibi:** ⏳ **EXPIRED (0 R / Tetiklenmedi)**
  - Bot mekanik olarak `2520.28` orta noktasına limit satış emri kurmuştu. Fiyat kutu sınırına dahi yaklaşmadığı için limit emir tetiklenmedi ve 16 bar sonunda zaman aşımına (`EXPIRED`) uğrayarak kapandı.
- **SMC Otopsisi & Çıkarılan Ders:**
  - 🧘 **Disiplinli Bekleyiş:** Giriş bölgesine dönmeyen setup'larda pozisyona atlamamak (marketten kovalamamak) sermaye korunmasının en önemli kuralıdır. İşlem hem kullanıcı hem bot nezdinde 0 R ile kapatılmıştır.

---

## 📋 STANDART 1M BENCHMARK DOĞRULAMA ANKETİ (HAFTALIK DEĞERLENDİRME ŞABLONU)

Her yeni canlı sinyal hafta sonu incelenirken aşağıdaki 5 standart soru üzerinden kodlanacaktır:
```markdown
### [SİNYAL NO] — [SEMBOL] ([YÖN] - [GRADE])
- **Soru 1 (Kutuya Yaklaşım):** [A] Sakin düzeltme | [B] Agresif haber mumu | [C] Kutuya ulaşmadı
- **Soru 2 (1M Formasyonu):** [A] 1M CHoCH/BOS kırılımı | [B] Sadece iğne (Wick Sweep) | [C] Delip geçti (Onay yok)
- **Soru 3 (Giriş Kararı):** [A] 1M FVG/OB retesti | [B] Market emri | [C] Girmedim (Pas)
- **Soru 4 (Sonuç):** [A] TP (+R) | [B] Stop (-R) | [C] Kâr gördü ama BE/Stop | [D] İşlem alınmadı (Korundu)
- **Soru 5 (Stop/İptal Nedeni):** [A] Kutu tutmadı | [B] Karşı engelden döndü | [C] Haber mumu patlattı | [D] Yok
```

---

## 🧲 YENİ 15M/1H ANALİTİK MOTORLARI (V2.1)

1. **Likidite Mıknatısı (EQH/EQL - Target Magnet):**
   - Fiyatın hedef yönünde bekleyen perakende stop yığınları (Eşit Tepeler / Eşit Dipler) tespit edilir.
   - Mıknatıs tespit edildiğinde sinyale +1 güven puanı verilir ve bildirimde hedefin yakıtı olarak gösterilir.
2. **Hedef Yolunda Karşı Engel (Opposing POI Obstacle):**
   - 2R hedefi öncesinde (özellikle $\le 15$ pip mesafede) taze bir karşı OB veya FVG varsa sinyal uyarılır ve Grade `B+` seviyesine kilitlenerek gereksiz riskler engellenir.
