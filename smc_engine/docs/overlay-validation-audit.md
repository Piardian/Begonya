# Overlay Validation Audit

## Render Contract Sources

| Field | Source | Estimated? |
| --- | --- | --- |
| `firstVisibleLogical` | `chart.timeScale().getVisibleLogicalRange().from` | No |
| `lastVisibleLogical` | `chart.timeScale().getVisibleLogicalRange().to` | No |
| `visiblePriceRange.min` | `series.coordinateToPrice(paneSize.height - 1)` and min/max normalization | No |
| `visiblePriceRange.max` | `series.coordinateToPrice(0)` and min/max normalization | No |
| `plotLeft` | `chartWidth - rightPriceScaleWidth - chart.paneSize(0).width` | No |
| `plotTop` | first pane coordinate origin | No |
| `plotWidth` | `chart.paneSize(0).width` | No |
| `plotHeight` | `chart.paneSize(0).height` | No |
| `devicePixelRatio` | `window.devicePixelRatio` | No |
| `rightPriceScaleWidth` | `chartWidth - chart.paneSize(0).width` | No |
| `barSpacing` | `chart.timeScale().options().barSpacing` | No |
| `timeScaleWidth` | `chart.timeScale().width()` | No |

The audit uses the controlled Lightweight Charts template, not the external TradingView iframe widget. This is intentional: the external widget does not expose the render contract. The controlled template provides screenshot and metadata from the same chart instance.

## Generated Artifacts

The audit harness is available at:

```text
server/overlayAudit.ts
```

It generates:

- raw chart screenshot
- overlay screenshot
- metadata JSON
- manual QA checklist fields

Current scenario matrix:

- 80 visible bars, 1280x720, DPR 1
- 100 visible bars, 1280x720, DPR 1
- 150 visible bars, 1280x720, DPR 1
- 100 visible bars, 1920x1080, DPR 1
- 100 visible bars, 1920x1080, DPR 2

The generated `metadata.json` files include pending manual QA fields for:

- OB candle alignment
- BOS break alignment
- FVG zone alignment
- label ownership
- systematic X shift
- systematic Y shift
