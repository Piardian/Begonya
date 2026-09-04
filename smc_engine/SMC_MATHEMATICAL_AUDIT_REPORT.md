# SMC Matematiksel Denetim Raporu

Bu rapor, Smart Money Concepts (SMC) algoritmik modelinin matematiksel tutarlılığını ve yapısal bütünlüğünü denetlemek amacıyla hazırlanmıştır.

## 1. Likidite ve Sweep (Süpürme) Mekanizması
Likidite süpürme olayları, `SwingPoint` verileri üzerinden `price` ve `timestamp` karşılaştırması ile doğrulanır. Matematiksel olarak, bir `SweepEvent`, `SwingPoint` fiyatının `t` anındaki mumun `high` veya `low` değerini geçmesi ancak `close` fiyatının bu seviyenin içinde kalması (veya tersi) durumu olarak tanımlanır. Denetim, `breakCandleIndex` ile `formedAtIndex` arasındaki farkın `n` bar sınırını aşmadığını doğrular.

## 2. Market Structure (Piyasa Yapısı) ve BOS/CHoCH
Piyasa yapısı kırılımları (BOS/CHoCH), `breakClosePrice` değerinin `brokenSwing` fiyatı ile olan ilişkisine dayanır. Algoritma, `breakClosePrice > brokenSwing.price` (bullish) veya `breakClosePrice < brokenSwing.price` (bearish) koşulunu `isClosingConfirmed` bayrağı ile doğrular. Bu, sahte kırılımları (fakeouts) filtrelemek için kritik bir eşik değeridir.

## 3. Premium/Discount (PD) Array Hesaplamaları
PD Array durumu, `rangeHigh` ve `rangeLow` arasındaki Fibonacci seviyeleri ile hesaplanır. `fibValue` şu formülle türetilir:
`fibValue = (currentPrice - rangeLow) / (rangeHigh - rangeLow)`
`fibValue > 0.5` ise 'premium', `< 0.5` ise 'discount' olarak sınıflandırılır. Bu hesaplama, işlem girişlerinin optimal bölgelerde olup olmadığını belirleyen temel metriktir.

## 4. Order Block (OB) ve FVG Validasyonu
Order Block'lar, `displacement` (hızlı fiyat hareketi) ve `imbalance` (dengesizlik) verileriyle doğrulanır. FVG (Fair Value Gap) hesaplaması, `candle[n-1].low` ile `candle[n+1].high` arasındaki boşluk miktarının `min_threshold` değerinden büyük olması şartına bağlıdır.

## 5. Sinyal Kalitesi ve Grade (Derecelendirme) Algoritması
Sinyal derecelendirme (`A+`'dan `C`'ye), `htfBiasPD`, `displacement`, `structure` ve `sweep` bileşenlerinin ağırlıklı toplamıdır.
`TotalScore = (w1 * HTF_Bias) + (w2 * Displacement) + (w3 * Structure) + (w4 * Sweep)`
Bu skor, `entryAllowed` boolean değerini belirlemek için `threshold` değeri ile karşılaştırılır.
