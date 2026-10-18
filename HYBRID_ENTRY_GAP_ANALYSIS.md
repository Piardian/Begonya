# HYBRID ENTRY GAP ANALYSIS: BEGONYA & CHECKLISTTRIGGER (CLT)

**Denetim Tarihi:** 2026-10-14  
**Kapsam:** Hibrit Giriş Stratejisi (Makro Kapı + HTF 15M SMC POI + LTF 1M Sniper / Unicorn Doğrulama) Kod Doğrulaması ve Boşluk Analizi (Gap Analysis)  
**İncelenen Bileşenler:**
* `swing-bos-core/src/entryMechanics.ts` → `evaluate1mUnicornSniperEntry()`
* `swing-bos-core/src/signalOutcomeTracker.ts` → `evaluateOutcome()`
* `Begonya/smc_engine/src/executionStateMachine1m.ts` → `LtfExecutionStateMachine`
* `Begonya/benchmark/benchmark_records.json` (44 Gerçekleşmiş / Denetlenmiş Kayıt)
* `swing-bos-core/data/signal_delivery_queue.json` (157 Canlı İletim Kaydı)

---

## 1. Giriş Yöntemi Kontrol Listesi ve Kod Kanıtları

Aşağıdaki tabloda kullanıcının tarif ettiği 9 aşamalı ideal hibrit giriş mantığının kod tabanındaki karşılıkları; **IMPLEMENTED**, **PARTIAL**, **MISSING** veya **UNVERIFIED** etiketleri ve birebir satır numaralarıyla belgelenmiştir.

| No | Kural / Kontrol Maddesi | Durum | Kanıt Dosyası ve Satır | Detaylı Teknik Değerlendirme ve Sapmalar |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Tarihsel HTF yönü ve POI üretimi** | **IMPLEMENTED** | `swing-bos-core/server/pipeline.ts` (Satır 500-750)<br>`signal_delivery_queue.json` (Satır 1-50) | 15M zaman diliminde `detectStructure` (BOS/CHoCH) sonrasında oluşan Order Block (OB) ve Fair Value Gap (FVG) sınırları (`zoneLow`, `zoneHigh`), HTF trend yönü (`bias4H`, `bias1H`) ve Premium/Discount durumu ile birlikte tam olarak üretilmektedir. |
| **2** | **HTF mum kapanışıyla POI geçersizleşme kontrolü** | **PARTIAL** | `swing-bos-core/src/entryMechanics.ts` (Satır 271-292)<br>`Begonya/.../executionStateMachine1m.ts` (Satır 191-201, 213-223) | **Sapma:** `executionStateMachine1m.ts` içinde `invalidationLevel` anlık 1M kapanışıyla test edilmektedir. `evaluate1mUnicornSniperEntry()` içinde ise kural *"15 ardışık 1M mumunun bölge dışında kapanması"* (`slice15.every(c => c.close < zoneLow)`) olarak kurgulanmıştır. Gerçek 15M mumunun kapanış saatiyle (clock-aligned) senkron bir HTF bar kapanış geçersizleşme kontrolü tam uygulanmamış, 15 bar kayan pencere yaklaşımı benimsenmiştir. |
| **3** | **Fiyat POI'ye geldikten sonra inducement (IDM) ve kırılması (Sweep/SFP)** | **IMPLEMENTED** | `swing-bos-core/src/entryMechanics.ts` (Satır 297-306, 341-349)<br>`Begonya/.../executionStateMachine1m.ts` (Satır 444-480) | Fiyat POI içine temas ettikten (`touchIdx`) sonra, önceki yerel 1M uç seviyesi (`localLow`/`localHigh`) taranır; fitille delip gövdeyle geri kapanma (SFP) veya fitil reddi (`wickRatio >= 0.30`) aranır. Fiyat POI'ye gelmeden önce oluşan dış sweep'ler filtrelenir. |
| **4** | **CHOCH, displacement ve devam hareketi (Büyük gövde veya ladder)** | **PARTIAL** | `swing-bos-core/src/entryMechanics.ts` (Satır 308-318, 351-361)<br>`Begonya/.../executionStateMachine1m.ts` (Satır 499-541) | **Sapma:** Tek bir mumun gövde oranı kontrol edilmektedir (`body / range >= 0.40` veya `>= 0.50`). Ancak kullanıcının tarif ettiği **"ladder biçiminde ardışık adımlı gövdelerle (staircase displacement)"** gerçekleşen çok barlı yapısal itkiler tanınmamaktadır. Sadece tek bar dominant gövdeye bakılmaktadır. |
| **5** | **Breaker / CHOCH bölgesindeki FVG tespiti** | **IMPLEMENTED** | `swing-bos-core/src/entryMechanics.ts` (Satır 319-329, 362-370)<br>`Begonya/.../executionStateMachine1m.ts` (Satır 546-605) | Breaker kırılımı anında geriye dönük 12 bar taranarak tersine dönen FVG (`iFVG` - Inversion Fair Value Gap) veya itki mumunun kendi 3 barlık FVG dengesizliği (`c3.low > c1.high` / `c3.high < c1.low`) tespit edilmektedir. |
| **6** | **Hareket uzadıkça Fibonacci uçlarının güncellenmesi ve 0.5 limit seviyesinin taşınması** | **IMPLEMENTED** | `swing-bos-core/src/entryMechanics.ts` (Satır 411-438) | `anchorExtreme` sweep seviyesine sabitlenir. Fiyat geri çekilme (pullback) vermeden yeni zirve/dip yaptıkça `anchorImpulse` güncellenir (`if (mc.high > anchorImpulse) anchorImpulse = mc.high`). Bu sayede 0.5 Fib limit seviyesi dinamik olarak yukarı/aşağı ötelenir. |
| **7** | **Emrin yalnızca seviye belirlendikten sonraki fiyat hareketiyle doldurulması** | **IMPLEMENTED** | `swing-bos-core/src/entryMechanics.ts` (Satır 411-424, 430-435)<br>`Begonya/.../executionStateMachine1m.ts` (Satır 277-302) | Onay mumu oluştuktan sonraki döngüde (`for (let m = unicornIdx + 1; ...)`), seviye belirlendikten sonraki barlar taranır. Aynı veya önceki barların fitilleriyle doldurma yapılmaz (No Look-Ahead Fill). |
| **8** | **Stop seviyesinin yapının oluştuğu zaman diliminin yapısal tepe/dibine dayanması** | **PARTIAL** | `swing-bos-core/src/entryMechanics.ts` (Satır 421, 433)<br>`Begonya/.../executionStateMachine1m.ts` (Satır 618-623) | **Sapma:** Stop seviyesi, 1M yapısının ürettiği sweep uç noktasına (`anchorExtreme ± 1.5 * pip`) konulmaktadır. Eğer kullanıcı "yapının oluştuğu zaman dilimi" derken **HTF (15M) POI'sinin yapısal swing ekstrem noktasını** kastediyorsa, mevcut kod bunu değil, **LTF 1M sweep fitil ucunu** stop almaktadır. Bu durum risk mesafesini küçülterek R çarpanını büyütür ancak erken stop olma riskini artırır. |
| **9** | **Fibonacci 0.5 ile breaker örtüşmesinin zorunlu filtre olmaması (Kalite etiketi olması)** | **PARTIAL** | `swing-bos-core/src/entryMechanics.ts` (Satır 336, 379)<br>`Begonya/.../executionStateMachine1m.ts` (Satır 269, 616) | `input.requireFullUnicorn` bayrağı `false` olduğunda sistem breaker olmasa dahi 0.5 Fib retesti ile işleme girmektedir. Ancak Fibonacci 0.5 seviyesinin bizzat Breaker kutusunun içine denk gelip gelmediğini kontrol eden geometrik bir kesişim puanlaması (confluence scoring) bulunmamaktadır; Fib ve Breaker birbirinden bağımsız kontrol edilmektedir. |

---

## 2. Çıkış Kuralları, Süre Aşımı ve İşlem Maliyeti (Cost) Analizi

| Mekanizma | swing-bos-core (`signalOutcomeTracker.ts` & `entryMechanics.ts`) | Begonya smc_engine (`paperOutcomeTracker.ts`) | Eksiklik / Boşluk Değerlendirmesi |
| :--- | :--- | :--- | :--- |
| **Take Profit (TP)** | 3.0R TP2 hedefi (`entryPrice ± 3.0 * riskDistance`). | 2.0R veya 3.0R tek TP. Kısmi TP (`partialTpAtR: 1.2`, %50 kapatma) opsiyonel. | `signalOutcomeTracker.ts` içinde kısmi kâr alma (partial TP) kodu kapalıdır; tekil TP2 hedeflenmektedir. |
| **Stop Loss (SL)** | 1.5 pip tamponlu Sweep ekstrem seviyesi. Giriş mumunda aynı anda iki seviye görülürse muhafazakar olarak `STOP_LOSS_FIRST`. | 2.0 pip tamponlu sweep veya POI ucu. Aynı mum çelişkisinde `STOP_LOSS_FIRST`. | **Tam Uygulanmış (Conservative Standard).** |
| **Break-Even (BE)** | +1.0R kâra ulaşıldığında stop seviyesi giriş fiyatına (`entryPrice`) çekilir. | +1.0R kâr görüldüğünde `beArmed = true` olur; geri çekilirse 0.0R ile kapatılır. | **Tam Uygulanmış.** |
| **Zaman Aşımı (Timeout)** | Giriş için: 60 bar (1M) veya 16 bar (15M). Taşıma için: 48 bar (15M). | Giriş için: 60 bar (1M). Taşıma için: 120 bar (1M) / 32 bar (15M). | **Tam Uygulanmış.** Süre aşımında `EXPIRED` ile sonlandırılır. |
| **Spread Tamponu** | `getPipSize(symbol)` üzerinden sadece statik pip bazlı stop payı var. | `touchesZoneWithSpread()` fonksiyonu var. Ask/Bid ayrımı için 1 pip spread tamponu eklenir. | Replay simülasyonunda dinamik spread genişlemesi (örneğin gece seansı/rollover spread açılması) simüle edilmemektedir. |
| **Komisyon & Slippage** | **YOK (MISSING).** Saf fiyata göre brüt R hesaplanır. | `estimateDynamicTransactionCost()` mevcuttur (Forex için 0.3-0.5 bps kayma, 0.05 pip komisyon; Altın için 25 cent spread, 15 cent kayma). | CLT 1M Sniper fonksiyonuna (`entryMechanics.ts`) bu dinamik maliyet modeli **bağlanmamıştır**. |

---

## 3. Veri Seti Ayrımı: Benchmark (44 Kayıt) vs. Delivery Queue (156 Sinyal)

Replay ve analiz aşamasında bu iki veri setinin birbirine karıştırılmaması zorunludur:

### A. Gerçekleşmiş / Denetlenmiş İşlem Günlüğü (`benchmark_records.json` - 44 Kayıt)
* **Kapsam:** 05 Eylül 2026 – 06 Ekim 2026 (31 gün).
* **Doğası:** Bu kayıtlar yalnızca "sinyal" değil, botun Telegram'a attığı, operatör/bot tarafından piyasada izlenmiş ve sonuçlandırılmış **canlı operasyon kayıtlarıdır**.
* **Dağılım:**
  * **28 Doldurulan İşlem (Executed):** 7 Win (+2.0R ile +2.9R arası), 4 Win-Partial/BE (+0.43R), 1 BE (+0.43R), 15 Loss (-1.0R veya -0.75R), 1 Aktif.
  * **16 Doldurulmayan / İptal Olan (Invalid/No Entry):** POI test edilmeden kırılmış veya 1M teyidi gelmemiştir.
* **Makro Entegrasyonu:** Her kayıtta sinyal anındaki makro rejim (`primary_regime`) ve makro kapısı dondurulmuştur (`macro_bias_gate`).

### B. Sevk Edilmiş Canlı Sinyal Kuyruğu (`signal_delivery_queue.json` - 156 Kayıt)
* **Kapsam:** 17 Ağustos 2026 – 12 Ekim 2026 (56 gün).
* **Doğası:** CLT motorunun Telegram'a gönderdiği ham sinyal adayı bildirimleridir.
* **Mükerrerlik (Deduplication):** 156 kaydın içinde aynı yapısal dalganın hem Order Block hem de Fair Value Gap için ayrı bildirim açtığı görülmektedir. Tekil `dedupeKey` filtrelemesi yapıldığında bağımsız fırsat sayısı **~112 tekildir**.
* **Makro Durumu:** Bu dosya CLT tarafından üretildiği için `candidate.macroContext` alanı boştur (Makro filtresi Begonya katmanında işletilmektedir).

---

## 4. Araştırma Replay'i İçin Asgari Değişiklikler ve Belirsizlikler

Mevcut çalışan üretim kodlarına dokunmadan, bağımsız bir araştırma replay betiği (`research_hybrid_replay.ts`) oluşturmak için gereken asgari adaptasyonlar:

### A. Asgari Kod Gereksinimleri:
1. **İki Katmanlı Stop Seçeneği (HTF vs LTF Stop):**
   * `evaluate1mUnicornSniperEntry()` içinde stop seviyesi seçimli parametreye bağlanmalıdır: `stopMode: '1M_SWEEP' | '15M_POI_EXTREME'`. (Kullanıcının 8. maddedeki yapısal stop beklentisini netleştirmek için).
2. **Çok Barlı (Ladder / Staircase) İtki Tespiti:**
   * 4. maddedeki sapmayı gidermek için tek bar yerine son 3 barın kümülatif yönlü gövde oranını (`sum(body) / sum(range) >= 0.55`) değerlendiren ek bir ladder displacement kontrolü eklenmelidir.
3. **Maliyet Entegrasyonu:**
   * Begonya'daki `estimateDynamicTransactionCost()` fonksiyonu simülasyon sonucuna net R kesintisi olarak yansıtılmalıdır.

### B. Çözülemeyen Kritik Belirsizlikler:
1. **1 Yıllık M1 Veri İmkansızlığı (`INSUFFICIENT_DATA`):**
   * MT5 terminali geriye dönük en fazla 95,000 M1 barı (3 ay) sağlamaktadır. 1 yıllık 1M replay yapılamaz; 1 yıllık test zorunlu olarak 15M barları üzerinden yürütülmelidir.
2. **BTCUSD M1 Veri Eksikliği (`INSUFFICIENT_DATA`):**
   * `BTCUSD_1m.json` dosyasında yalnızca 13 saatlik veri vardır; BTCUSD 1M replay testine dahil edilemez.
3. **Tarihsel Makro Zaman Serisi Yokluğu:**
   * Canlı `macro_bias_gate.json` dosyası geçmişe uygulanamaz. Geçmişe dönük makro filtreli replay yalnızca `benchmark_records.json`'daki 44 kayıt veya `historical_event_research.json`'daki olay saatleri üzerinden deterministik olarak çalıştırılabilir.

---
*Rapor tamamlanmıştır. Hiçbir strateji kodu değiştirilmemiş, emir gönderilmemiş veya commit yapılmamıştır.*
