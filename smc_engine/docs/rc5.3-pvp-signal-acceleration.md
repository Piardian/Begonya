# RC-5.3 — PVP Signal Acceleration Mode

Feature flag: `ENABLE_PVP_SIGNAL_ACCELERATION` (default `false`).

When enabled temporarily for PVP collection:

- minimum displacement quality is reduced from `1` to `0.5`;
- candidates with score `>= 3` may pass the candidate admission gate even when the normal grade admission flag is false.

No filter is removed completely. Detection, Decision, Risk, Execution and Telegram logic are unchanged. Risk gates remain authoritative before notification. Disabling the flag restores the Production profile.

The mode is temporary and must be recorded in the PVP Change Log. Signals collected under this profile must be tagged as acceleration-profile data and must not be mixed silently with baseline statistics.
