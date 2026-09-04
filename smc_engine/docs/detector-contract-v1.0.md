# Detector Contract v1.0

## Mission

This document defines the formal production contract for the detector and scoring components used by Swing BOS Core.

The purpose of this contract is to make future audits compare:

```text
Contract
↓
Implementation
↓
Tests
```

instead of comparing implementation directly against subjective Smart Money Concepts interpretations.

This contract defines intended behavior only. It does not introduce new detector logic, trading calibration, profitability optimization, or production code changes.

## Contract Classification Legend

Every behavior in this document is classified as one of:

- Required Behavior: must be implemented and tested.
- Optional Behavior: allowed, but not required by v1.0.
- Intentional Design Choice: a deliberate behavior of v1.0.
- Known Limitation: accepted limitation; not a defect unless this contract is revised.

---

## 1. Sweep Detector

### Purpose

Detect deterministic liquidity sweep events against a predefined range boundary.

In v1.0, the Sweep Detector answers:

```text
Did price wick beyond the active range high or range low by at least the configured minimum penetration?
```

It does not attempt to classify every possible liquidity concept.

---

### Inputs

- Ordered OHLC candles.
- RangeState for each candle.
- Pair.
- Timeframe.
- Pair/timeframe-specific minimum sweep penetration.

Required candle fields:

- timestamp
- open
- high
- low
- close

Required RangeState fields:

- isRange
- rangeHigh
- rangeLow
- regimeStartIndex

---

### Outputs

The detector outputs zero or more SweepEvent objects.

Each SweepEvent must contain:

- type:
  - `sweep_low`
  - `sweep_high`
- sweptLevel
- penetrationDistance
- candleIndex
- timestamp
- wickPrice

Confidence is not produced in v1.0.

Score is not produced by the Sweep Detector directly. Sweep score is assigned later by the Grade Engine through model state.

---

### Algorithm

Deterministic pseudocode:

```text
events = []

for each candle index:
    rangeState = rangeStates[index]

    if rangeState is not active:
        reset swept range levels
        continue

    if range regime changed:
        reset swept range levels

    minPenetration = pair/timeframe threshold

    if candle.low < rangeLow - minPenetration:
        if this exact rangeLow has not already been swept:
            emit sweep_low
            mark rangeLow as swept

    if candle.high > rangeHigh + minPenetration:
        if this exact rangeHigh has not already been swept:
            emit sweep_high
            mark rangeHigh as swept

return events
```

---

### Required Behaviors

- Uses only candle data and RangeState available at the evaluated index.
- Detects wick penetration beyond range boundaries.
- Applies pair/timeframe minimum penetration.
- Prevents duplicate sweep events for the same active range boundary.
- Resets duplicate tracking when range regime changes.
- Emits deterministic event metadata.
- Produces identical output for identical inputs.

---

### Non-Goals

The Sweep Detector does not:

- detect every liquidity concept;
- infer institutional intent;
- classify market manipulation;
- detect Equal High / Equal Low liquidity in v1.0;
- detect Swing High / Swing Low liquidity in v1.0;
- distinguish internal and external liquidity in v1.0;
- require candle close beyond a level.

---

### Known Limitations

- Range-only sweep is the v1.0 supported behavior.
- Equal High and Equal Low sweeps are outside v1.0 scope.
- Close sweep is outside v1.0 scope.
- Swing liquidity sweep is outside v1.0 scope.
- Thresholds are pair/timeframe specific and must be reviewed before adding non-forex or JPY symbols.

---

### Determinism Guarantees

The detector is deterministic because:

- it iterates candles in fixed order;
- thresholds are fixed by pair/timeframe;
- duplicate prevention is based on exact range level and regime start;
- it uses no random values, external time, provider calls, or mutable external state.

---

### Acceptance Criteria

- Given identical candles, RangeState, pair, and timeframe, output must be identical.
- A candle with low below `rangeLow - threshold` must emit exactly one `sweep_low` for that range level.
- A candle with high above `rangeHigh + threshold` must emit exactly one `sweep_high` for that range level.
- A second candle sweeping the same unchanged level must not emit a duplicate event.
- A new range regime may emit new sweep events.
- Non-range candles must not emit sweep events.

---

### Contract Classification

| Behavior | Classification |
|---|---|
| Range boundary sweep detection | Required Behavior |
| Wick-based sweep | Required Behavior |
| Duplicate prevention per range boundary | Required Behavior |
| Pair/timeframe threshold | Required Behavior |
| Equal High / Equal Low detection | Known Limitation |
| Close sweep detection | Known Limitation |
| Swing liquidity sweep | Known Limitation |
| Internal/external liquidity distinction | Known Limitation |

---

## 2. BOS Detector

### Purpose

Detect deterministic Break of Structure events when a directional market structure continues by closing beyond the latest confirmed swing in the trend direction.

In v1.0, BOS answers:

```text
Did price close beyond the latest confirmed trend-side swing while the current structure trend is directional?
```

---

### Inputs

- Ordered OHLC candles.
- Confirmed SwingPoint list.
- Current structure trend as derived by the structure state machine.

Required SwingPoint fields:

- type
- price
- formedAtIndex
- confirmedAtIndex
- timestamp

---

### Outputs

BOS events are emitted as StructureEvent objects.

Each BOS event must contain:

- type: `BOS`
- direction:
  - `bullish`
  - `bearish`
- brokenSwing
- breakCandleIndex
- breakTimestamp
- breakClosePrice

Confidence is not produced in v1.0.

Score is not produced directly by BOS. BOS contributes indirectly through model state, structure presence, displacement, and grade.

---

### Algorithm

Deterministic pseudocode:

```text
events = []
currentTrend = undefined
brokenSwings = empty set

for each candle index:
    confirmedSwings = swings where confirmedAtIndex <= index
    confirmedHighs = confirmed swing highs
    confirmedLows = confirmed swing lows

    if currentTrend is undefined or range:
        if at least 2 highs and 2 lows:
            if latest two highs rise and latest two lows rise:
                currentTrend = bullish
            else if latest two highs fall and latest two lows fall:
                currentTrend = bearish
            else:
                currentTrend = range

    if currentTrend is bullish:
        lastHigh = latest confirmed high
        if candle.close > lastHigh.price and lastHigh not already broken:
            emit bullish BOS
            mark lastHigh as broken

    if currentTrend is bearish:
        lastLow = latest confirmed low
        if candle.close < lastLow.price and lastLow not already broken:
            emit bearish BOS
            mark lastLow as broken

return structure events
```

---

### Required Behaviors

- Uses confirmed swings only.
- Uses close break only.
- Emits BOS only in a directional trend.
- Prevents duplicate BOS for the same broken swing in the same regime.
- Maintains chronological event order.
- Produces deterministic metadata for the broken swing and break candle.

---

### Non-Goals

The BOS Detector does not:

- accept wick-only breaks in v1.0;
- classify internal vs external BOS in v1.0;
- infer subjective structure strength;
- produce a trading decision;
- produce a grade directly.

---

### Known Limitations

- Close-only BOS is the v1.0 rule.
- Internal/external structure separation is not part of v1.0.
- Range breakout does not automatically become BOS unless the state machine has resolved into a directional trend.
- Latest confirmed swing selection can be affected by micro swings because v1.0 has no internal/external swing hierarchy.

---

### Determinism Guarantees

BOS detection is deterministic because:

- confirmed swings are filtered by index;
- break condition uses explicit close comparison;
- duplicate prevention uses stable swing keys;
- no external state, randomness, or current clock is used.

---

### Acceptance Criteria

- Given identical candles and confirmed swings, BOS output must be identical.
- In bullish trend, close above latest confirmed swing high must emit bullish BOS.
- In bearish trend, close below latest confirmed swing low must emit bearish BOS.
- Wick-only break must not emit BOS.
- Same swing must not emit duplicate BOS in the same regime.
- BOS must reference the exact broken swing and break candle.

---

### Contract Classification

| Behavior | Classification |
|---|---|
| Confirmed swing only | Required Behavior |
| Close-only break | Required Behavior |
| Duplicate BOS prevention | Required Behavior |
| BOS only in directional trend | Required Behavior |
| Wick BOS | Known Limitation |
| Internal/external BOS | Known Limitation |
| Range breakout as BOS | Known Limitation |

---

## 3. CHoCH Detector

### Purpose

Detect deterministic Change of Character events when price closes beyond the latest confirmed opposite-side swing of the current directional trend.

In v1.0, CHoCH answers:

```text
Did price close through the latest confirmed swing that invalidates the current directional structure?
```

---

### Inputs

- Ordered OHLC candles.
- Confirmed SwingPoint list.
- Current structure trend.
- Broken swing tracking for the active regime.

---

### Outputs

CHoCH events are emitted as StructureEvent objects.

Each CHoCH event must contain:

- type: `CHoCH`
- direction:
  - `bullish`
  - `bearish`
- brokenSwing
- breakCandleIndex
- breakTimestamp
- breakClosePrice

Confidence is not produced in v1.0.

Score is not produced directly by CHoCH. CHoCH contributes indirectly through structure, displacement, POI, model state, and grade.

---

### Algorithm

Deterministic pseudocode:

```text
for each candle index:
    confirmedHighs = confirmed highs up to index
    confirmedLows = confirmed lows up to index

    if currentTrend is bullish:
        lastLow = latest confirmed low
        if candle.close < lastLow.price and lastLow not already broken:
            emit bearish CHoCH
            currentTrend = bearish
            reset broken swing tracking
            mark lastLow as broken

    if currentTrend is bearish:
        lastHigh = latest confirmed high
        if candle.close > lastHigh.price and lastHigh not already broken:
            emit bullish CHoCH
            currentTrend = bullish
            reset broken swing tracking
            mark lastHigh as broken
```

---

### Required Behaviors

- Uses confirmed swings only.
- Uses close break only.
- Emits CHoCH only from an existing directional trend.
- CHoCH changes the current trend immediately.
- CHoCH resets broken swing tracking for the new regime.
- Emits deterministic event metadata.

---

### Non-Goals

The CHoCH Detector does not:

- classify weak vs strong CHoCH;
- distinguish internal vs external CHoCH in v1.0;
- use wick-only breaks;
- produce a trade decision;
- produce a score directly.

---

### Known Limitations

- Close-only CHoCH is the v1.0 rule.
- Internal/external CHoCH is outside v1.0 scope.
- CHoCH may reuse a previously broken swing after regime transition; this is intentional in v1.0.
- Micro swing hierarchy is not modeled.

---

### Determinism Guarantees

CHoCH detection is deterministic because:

- trend state is updated in fixed candle order;
- confirmed swings are index-gated;
- close comparisons are explicit;
- regime reset behavior is deterministic.

---

### Acceptance Criteria

- Given identical candles and confirmed swings, CHoCH output must be identical.
- In bullish trend, close below latest confirmed low must emit bearish CHoCH.
- In bearish trend, close above latest confirmed high must emit bullish CHoCH.
- Wick-only break must not emit CHoCH.
- CHoCH must update current trend.
- CHoCH must include broken swing and break candle metadata.

---

### Contract Classification

| Behavior | Classification |
|---|---|
| Confirmed swing only | Required Behavior |
| Close-only CHoCH | Required Behavior |
| Immediate trend transition | Required Behavior |
| Broken swing reset after CHoCH | Intentional Design Choice |
| Swing reuse after regime transition | Intentional Design Choice |
| Wick CHoCH | Known Limitation |
| Internal/external CHoCH | Known Limitation |

---

## 4. Order Block Detector

### Purpose

Detect a deterministic Order Block zone associated with a displacement leg that produced a structure event.

In v1.0, the Order Block Detector answers:

```text
Which opposite-color candle immediately precedes the displacement leg that caused the BOS or CHoCH?
```

---

### Inputs

- Ordered OHLC candles.
- DisplacementLeg.
- Related StructureEvent.

Required DisplacementLeg fields:

- startIndex
- endIndex
- direction

Required StructureEvent fields:

- type
- direction
- brokenSwing
- breakCandleIndex
- breakTimestamp
- breakClosePrice

---

### Outputs

The detector outputs either:

- one OrderBlock object; or
- null.

Each OrderBlock must contain:

- direction
- candleIndex
- high
- low
- formedAtIndex
- relatedEvent

Confidence is not produced in v1.0.

Score is not produced directly by the Order Block Detector.

---

### Algorithm

Deterministic pseudocode:

```text
obIndex = displacementLeg.startIndex - 1

if obIndex < 0:
    return null

obCandle = candles[obIndex]

if displacement direction is bullish:
    require obCandle.close < obCandle.open

if displacement direction is bearish:
    require obCandle.close > obCandle.open

if candle color requirement fails:
    return null

return order block:
    direction = displacement direction
    high = obCandle.high
    low = obCandle.low
    formedAtIndex = obIndex
    relatedEvent = structure event
```

---

### Required Behaviors

- Selects the candle immediately before the displacement leg.
- Requires opposite candle color.
- Rejects doji candles.
- Preserves relation to the source structure event.
- Produces deterministic zone high and low.
- Produces identical output for identical inputs.

---

### Non-Goals

The Order Block Detector does not:

- search multiple possible origin candles in v1.0;
- rank multiple OB candidates;
- classify breaker blocks;
- infer institutional order flow;
- calculate trade entry, stop loss, or take profit.

---

### Known Limitations

- Mitigation handling is not part of v1.0 detector output.
- Invalidation handling is not part of v1.0 detector output.
- Fresh vs tested OB classification is handled outside the detector through POI test counting.
- The detector selects exactly one origin-candle rule: `leg.startIndex - 1`.

---

### Determinism Guarantees

The detector is deterministic because:

- origin index is calculated from a fixed displacement leg;
- candle color validation uses explicit open/close comparison;
- zone high/low are copied directly from one candle;
- no external state or randomness is used.

---

### Acceptance Criteria

- Given identical candles, leg, and structure event, output must be identical.
- Bullish displacement must require bearish preceding candle.
- Bearish displacement must require bullish preceding candle.
- Missing preceding candle must return null.
- Doji preceding candle must return null.
- Output zone must equal the selected candle high/low.

---

### Contract Classification

| Behavior | Classification |
|---|---|
| `leg.startIndex - 1` origin selection | Required Behavior |
| Opposite-color validation | Required Behavior |
| Doji rejection | Required Behavior |
| Related structure event preservation | Required Behavior |
| Multi-candle OB search | Known Limitation |
| Mitigation status | Known Limitation |
| Invalidation status | Known Limitation |
| Fresh/tested classification | Optional Behavior outside detector |

---

## 5. Premium / Discount Calculator

### Purpose

Classify the current close price as premium, discount, equilibrium, or undefined relative to a deterministic range defined by the latest confirmed swing high and latest confirmed swing low.

In v1.0, Premium / Discount answers:

```text
Where is current close located between the latest confirmed swing low and latest confirmed swing high?
```

---

### Inputs

- Ordered OHLC candles.
- Confirmed SwingPoint list.
- currentIndex.

Required inputs:

- candle close at currentIndex
- latest confirmed swing high
- latest confirmed swing low

---

### Outputs

PremiumDiscountState:

- status:
  - `premium`
  - `discount`
  - `eq`
  - `undefined`
- fibValue
- rangeHigh
- rangeLow

Confidence is not produced in v1.0.

Score is not produced directly by the calculator. Score is assigned by the Grade Engine.

---

### Algorithm

Deterministic pseudocode:

```text
if currentIndex is invalid:
    return undefined state

confirmedSwings = swings where confirmedAtIndex <= currentIndex
confirmedHighs = confirmed swing highs
confirmedLows = confirmed swing lows

if no confirmed high or no confirmed low:
    return undefined state

latestHigh = latest confirmed high
latestLow = latest confirmed low

if latestHigh.price == latestLow.price:
    return undefined state

rangeHigh = latestHigh.price
rangeLow = latestLow.price
currentPrice = candles[currentIndex].close

fibValue = (currentPrice - rangeLow) / (rangeHigh - rangeLow)

if fibValue > 0.55:
    status = premium
else if fibValue < 0.45:
    status = discount
else:
    status = eq

return PremiumDiscountState
```

---

### Required Behaviors

- Uses confirmed swings only.
- Uses current candle close.
- Uses latest confirmed high and latest confirmed low.
- Guards invalid currentIndex.
- Guards missing high/low.
- Guards zero division.
- Classifies 0.45–0.55 inclusive as equilibrium.
- Produces deterministic output.

---

### Non-Goals

The Premium / Discount Calculator does not:

- infer subjective dealing range;
- validate that high and low belong to the same impulse leg;
- classify premium/discount from visual chart zones;
- use wick position instead of close in v1.0;
- produce a trading decision.

---

### Known Limitations

- Latest confirmed high and latest confirmed low are the v1.0 anchors.
- Same dealing-range validation is outside v1.0 scope.
- Current close may be outside `[rangeLow, rangeHigh]`; fibValue may be below 0 or above 1.
- Equilibrium is a band, not a single midpoint: 0.45 through 0.55 inclusive.

---

### Determinism Guarantees

The calculator is deterministic because:

- swing filtering is index-based;
- anchor selection is latest confirmed high/low;
- fib formula is fixed;
- thresholds are fixed;
- no external state, randomness, or current clock is used.

---

### Acceptance Criteria

- Identical candles, swings, and currentIndex must produce identical output.
- Missing confirmed high or low must produce undefined.
- Equal rangeHigh/rangeLow must produce undefined.
- fibValue greater than 0.55 must produce premium.
- fibValue less than 0.45 must produce discount.
- fibValue from 0.45 to 0.55 inclusive must produce eq.

---

### Contract Classification

| Behavior | Classification |
|---|---|
| Latest confirmed swing anchors | Required Behavior |
| Close-based fib position | Required Behavior |
| 0.45–0.55 EQ band | Required Behavior |
| Invalid/missing/zero division undefined state | Required Behavior |
| Same dealing-range validation | Known Limitation |
| Wick-based P/D | Known Limitation |
| Subjective visual range selection | Non-goal |

---

## 6. Grade Engine

### Purpose

Convert deterministic detector outputs and context inputs into a transparent production grade and entryAllowed flag.

In v1.0, the Grade Engine answers:

```text
Given detector evidence and context, what score, grade, breakdown, and grade-level admission result should this setup receive?
```

It does not decide final runtime notification delivery by itself.

---

### Inputs

GradeInput:

- tradeDirection
- bias4H
- pd4H
- bias1H
- has15mEvent
- displacementQuality15m
- modelState
- poiTestResultForSweep
- poiTimeframe
- poiTestCount
- pd1H

Input sources may include:

- Structure events.
- HTF bias.
- Premium / Discount state.
- Displacement quality.
- Sweep/model state.
- POI test count.

---

### Outputs

GradeResult:

- totalScore
- grade:
  - `A+`
  - `A`
  - `B+`
  - `B`
  - `C`
- entryAllowed
- blockReasons
- breakdown:
  - htfBiasPD
  - displacement
  - structure
  - sweep
  - poiQuality

Confidence is not produced in v1.0.

---

### Algorithm

Deterministic pseudocode:

```text
htfBiasPD = scoreHTFBiasPD(bias4H, pd4H, bias1H, tradeDirection)
displacement = scoreDisplacement(displacementQuality15m)
structure = scoreStructure(has15mEvent, displacementQuality15m)
sweep = scoreSweep(modelState, poiTestResultForSweep)
poiQuality = scorePOIQuality(poiTimeframe, poiTestCount, pd1H, tradeDirection)

totalScore = htfBiasPD + displacement + structure + sweep + poiQuality

if totalScore >= 7:
    grade = A+
else if totalScore >= 5:
    grade = A
else if totalScore >= 3:
    grade = B+
else if totalScore >= 1:
    grade = B
else:
    grade = C

blockReasons = []

if 4H P/D is EQ:
    add 4H EQ block

if POI test count >= 3:
    add POI over-tested block

entryAllowed = no block reasons and grade in [A+, A, B+]

return GradeResult
```

---

### Required Behaviors

- Produces a full score breakdown.
- Produces deterministic totalScore.
- Maps score to grade using fixed grade bands.
- Applies explicit block reasons.
- Sets entryAllowed false when block reasons exist.
- Allows A+, A, and B+ at grade level when no block exists.
- Does not hide negative scoring.
- Does not mutate input detector outputs.

---

### Non-Goals

The Grade Engine does not:

- optimize profitability;
- perform final Decision Engine filtering;
- perform Risk Engine evaluation;
- send notifications;
- calculate position size;
- calculate stop loss or take profit;
- learn from outcomes in v1.0.

---

### Known Limitations

- Displacement quality contributes to both displacement score and structure score in v1.0.
- B+ can be entryAllowed at grade level in v1.0.
- 4H EQ and POI 3+ are hard blocks.
- Grade Engine does not know later runtime, decision, or risk filtering results.
- Grade Engine score is deterministic evidence score, not profitability probability.

---

### Determinism Guarantees

The Grade Engine is deterministic because:

- every score branch is explicit;
- thresholds are fixed;
- no random values are used;
- no provider calls are made;
- no current clock is read;
- same GradeInput always produces the same GradeResult.

---

### Acceptance Criteria

- Identical GradeInput must produce identical GradeResult.
- Every score must appear in breakdown.
- totalScore must equal sum of breakdown values.
- Score >= 7 must produce A+.
- Score >= 5 and < 7 must produce A.
- Score >= 3 and < 5 must produce B+.
- Score >= 1 and < 3 must produce B.
- Score < 1 must produce C.
- 4H EQ must add a block reason and set entryAllowed false.
- POI test count >= 3 must add a block reason and set entryAllowed false.
- With no block reason, A+, A, and B+ must set entryAllowed true.
- B and C must set entryAllowed false.

---

### Contract Classification

| Behavior | Classification |
|---|---|
| Full score breakdown | Required Behavior |
| Fixed score-to-grade mapping | Required Behavior |
| 4H EQ block | Required Behavior |
| POI 3+ block | Required Behavior |
| A+/A/B+ grade-level entryAllowed | Required Behavior |
| Displacement affecting displacement and structure score | Intentional Design Choice |
| Profitability prediction | Non-goal |
| Risk decision | Non-goal |
| Runtime notification decision | Non-goal |

---

## Contract-Level Acceptance Criteria

Detector Contract v1.0 is accepted only if:

- every detector has a defined purpose;
- every detector input is explicit;
- every detector output is explicit;
- every algorithm is deterministic and testable;
- every required behavior is measurable;
- every non-goal is explicit;
- known limitations are not treated as defects;
- future audits can classify findings as:
  - implementation bug;
  - contract gap;
  - calibration issue;
  - design choice.

## Contract Freeze Rule

Once approved, implementation audits must compare production code against this document.

Implementation gaps may only be classified as confirmed defects when the behavior is required by this contract.

Contract revisions must be versioned before implementation changes are proposed.
