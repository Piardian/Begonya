// Begonya Manual Replay - Client Application Logic
(function() {
  let sessionId = null;
  let activeSymbol = "EURUSD";
  let activeTimeframe = "15m";
  let isPlaying = false;
  let playInterval = null;
  let playbackSpeed = 5;

  let chart = null;
  let candleSeries = null;
  let entryPriceLine = null;
  let slPriceLine = null;
  let tpPriceLine = null;

  let currentDirection = "BUY";
  let currentOrderType = "MARKET";

  // Elements
  const symbolSelect = document.getElementById("symbol-select");
  const clockTimeVal = document.getElementById("clock-time-val");
  const btnNewSession = document.getElementById("btn-new-session");
  const btnSaveSession = document.getElementById("btn-save-session");
  const btnPlayPause = document.getElementById("btn-play-pause");
  const btnStep1 = document.getElementById("btn-step-1");
  const btnStep5 = document.getElementById("btn-step-5");
  const btnStepBack = document.getElementById("btn-step-back");
  const speedSelect = document.getElementById("speed-select");
  const tfButtons = document.querySelectorAll(".tf-btn");

  // Macro HUD
  const macroGateBadge = document.getElementById("macro-gate-badge");
  const macroRegimeVal = document.getElementById("macro-regime-val");
  const macroRiskVal = document.getElementById("macro-risk-val");
  const macroMultVal = document.getElementById("macro-mult-val");

  // Order Elements
  const toggleBuy = document.getElementById("toggle-buy");
  const toggleSell = document.getElementById("toggle-sell");
  const toggleMarket = document.getElementById("toggle-market");
  const toggleLimit = document.getElementById("toggle-limit");
  const limitPriceGroup = document.getElementById("limit-price-group");
  const inputLimitPrice = document.getElementById("input-limit-price");
  const inputSl = document.getElementById("input-sl");
  const inputTp = document.getElementById("input-tp");
  const inputRiskPct = document.getElementById("input-risk-pct");
  const inputLots = document.getElementById("input-lots");
  const inputReason = document.getElementById("input-reason");
  const btnPlaceOrder = document.getElementById("btn-place-order");

  // Active Position
  const activePosPanel = document.getElementById("active-position-panel");
  const posDirBadge = document.getElementById("pos-dir-badge");
  const posLotsVal = document.getElementById("pos-lots-val");
  const posEntryVal = document.getElementById("pos-entry-val");
  const posCurrentVal = document.getElementById("pos-current-val");
  const posPnlVal = document.getElementById("pos-pnl-val");
  const btnClosePosition = document.getElementById("btn-close-position");

  // Metrics
  const metricBal = document.getElementById("metric-bal");
  const metricPnl = document.getElementById("metric-pnl");
  const metricR = document.getElementById("metric-r");
  const metricWr = document.getElementById("metric-wr");
  const metricPf = document.getElementById("metric-pf");
  const metricExp = document.getElementById("metric-exp");
  const metricDd = document.getElementById("metric-dd");
  const metricTrades = document.getElementById("metric-trades");
  const journalTbody = document.getElementById("journal-tbody");

  // Initialize Lightweight Chart
  function initChart() {
    const container = document.getElementById("chart-container");
    chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: 'solid', color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#2b2e3a' },
        horzLines: { color: '#2b2e3a' },
      },
      crosshair: {
        mode: 1,
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    window.addEventListener("resize", () => {
      if (chart && container) {
        chart.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }
    });
  }

  // API Client Calls
  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "API request failed");
    }
    return res.json();
  }

  async function createSession(symbol = activeSymbol) {
    try {
      const data = await api("/api/session/create", {
        method: "POST",
        body: JSON.stringify({ symbol, initial_balance: 10000.0 }),
      });
      sessionId = data.session_id;
      activeSymbol = data.symbol;
      symbolSelect.value = activeSymbol;
      await refreshCandles();
      updateUI(data);
    } catch (err) {
      alert("Failed to initialize replay session: " + err.message);
    }
  }

  async function refreshCandles() {
    if (!sessionId) return;
    try {
      const data = await api(`/api/session/${sessionId}/candles?timeframe=${activeTimeframe}`);
      if (candleSeries && data.candles) {
        candleSeries.setData(data.candles);
      }
    } catch (err) {
      console.error("Error loading candles:", err);
    }
  }

  async function step(count = 1) {
    if (!sessionId) return;
    try {
      const snapshot = await api(`/api/session/${sessionId}/step`, {
        method: "POST",
        body: JSON.stringify({ timeframe: "1m", count }),
      });
      await refreshCandles();
      updateUI(snapshot);
    } catch (err) {
      console.error("Error stepping clock:", err);
    }
  }

  function startPlay() {
    isPlaying = true;
    btnPlayPause.textContent = "⏸ Pause";
    btnPlayPause.className = "ctrl-btn pause-btn";
    const delay = Math.max(50, Math.floor(1000 / playbackSpeed));
    playInterval = setInterval(() => {
      step(1);
    }, delay);
  }

  function pausePlay() {
    isPlaying = false;
    btnPlayPause.textContent = "▶ Play";
    btnPlayPause.className = "ctrl-btn play-btn";
    if (playInterval) {
      clearInterval(playInterval);
      playInterval = null;
    }
  }

  function updatePriceLines(pos, pendingOrders) {
    // Clear lines
    if (entryPriceLine) { candleSeries.removePriceLine(entryPriceLine); entryPriceLine = null; }
    if (slPriceLine) { candleSeries.removePriceLine(slPriceLine); slPriceLine = null; }
    if (tpPriceLine) { candleSeries.removePriceLine(tpPriceLine); tpPriceLine = null; }

    if (pos) {
      entryPriceLine = candleSeries.createPriceLine({
        price: pos.entry_price,
        color: '#2962ff',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: `ENTRY (${pos.direction} ${pos.volume_lots}L)`,
      });
      if (pos.stop_loss) {
        slPriceLine = candleSeries.createPriceLine({
          price: pos.stop_loss,
          color: '#ef5350',
          lineWidth: 2,
          lineStyle: 1,
          axisLabelVisible: true,
          title: 'SL',
        });
      }
      if (pos.take_profit) {
        tpPriceLine = candleSeries.createPriceLine({
          price: pos.take_profit,
          color: '#26a69a',
          lineWidth: 2,
          lineStyle: 1,
          axisLabelVisible: true,
          title: 'TP',
        });
      }
    }
  }

  function updateUI(snapshot) {
    if (!snapshot) return;

    // Clock
    clockTimeVal.textContent = snapshot.clock.current_time_iso.replace("T", " ").replace("+00:00", "");

    // Macro HUD
    const m = snapshot.macro || {};
    macroRegimeVal.textContent = m.primary_regime || "--";
    macroRiskVal.textContent = m.volatility_risk_score !== null ? m.volatility_risk_score : "--";
    macroMultVal.textContent = m.recommended_risk_multiplier !== null ? `${m.recommended_risk_multiplier}x` : "--";

    macroGateBadge.className = "gate-badge " + (
      m.bias_gate === "LONG_ONLY" ? "long" :
      m.bias_gate === "SHORT_ONLY" ? "short" :
      m.bias_gate === "NEUTRAL_RANGE" ? "neutral" : "unavailable"
    );
    macroGateBadge.textContent = m.bias_gate || "UNAVAILABLE";

    // Active Position
    const pos = snapshot.open_position;
    if (pos) {
      activePosPanel.style.display = "block";
      posDirBadge.textContent = pos.direction;
      posDirBadge.className = "gate-badge " + (pos.direction === "BUY" ? "long" : "short");
      posLotsVal.textContent = `${pos.volume_lots} Lot`;
      posEntryVal.textContent = pos.entry_price.toFixed(5);

      const latest = snapshot.clock.latest_price || pos.entry_price;
      posCurrentVal.textContent = latest.toFixed(5);

      const diff = pos.direction === "BUY" ? (latest - pos.entry_price) : (pos.entry_price - latest);
      const estPnl = diff * pos.volume_lots * 100000;
      posPnlVal.textContent = `$${estPnl.toFixed(2)}`;
      posPnlVal.style.color = estPnl >= 0 ? "var(--accent-green)" : "var(--accent-red)";
    } else {
      activePosPanel.style.display = "none";
    }

    updatePriceLines(pos, snapshot.pending_orders);

    // Metrics
    const metrics = snapshot.metrics || {};
    metricBal.textContent = `$${(snapshot.balance || 10000).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    metricPnl.textContent = `$${(metrics.net_pnl_usd || 0).toFixed(2)}`;
    metricPnl.style.color = (metrics.net_pnl_usd || 0) >= 0 ? "var(--accent-green)" : "var(--accent-red)";
    metricR.textContent = `${(metrics.total_r || 0).toFixed(1)}R`;
    metricWr.textContent = `${(metrics.win_rate_pct || 0).toFixed(1)}%`;
    metricPf.textContent = `${metrics.profit_factor || 0}`;
    metricExp.textContent = `${(metrics.expectancy_r || 0).toFixed(2)}R`;
    metricDd.textContent = `$${(metrics.max_drawdown_usd || 0).toFixed(2)}`;
    metricTrades.textContent = metrics.total_trades || 0;

    // Fill SL/TP presets if empty
    const currentPrice = snapshot.clock.latest_price;
    if (currentPrice && !inputSl.value && !inputTp.value) {
      if (currentDirection === "BUY") {
        inputSl.value = (currentPrice - 0.0020).toFixed(5);
        inputTp.value = (currentPrice + 0.0040).toFixed(5);
      } else {
        inputSl.value = (currentPrice + 0.0020).toFixed(5);
        inputTp.value = (currentPrice - 0.0040).toFixed(5);
      }
    }
  }

  // Event Listeners
  symbolSelect.addEventListener("change", (e) => {
    createSession(e.target.value);
  });

  btnNewSession.addEventListener("click", () => {
    if (confirm("Start a new replay session for " + activeSymbol + "?")) {
      createSession(activeSymbol);
    }
  });

  btnSaveSession.addEventListener("click", async () => {
    if (!sessionId) return;
    try {
      const res = await api(`/api/session/${sessionId}/save`, { method: "POST" });
      alert(`Session saved successfully to:\n${res.file_path}`);
    } catch (err) {
      alert("Failed to save session: " + err.message);
    }
  });

  tfButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tfButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeTimeframe = btn.dataset.tf;
      refreshCandles();
    });
  });

  btnStep1.addEventListener("click", () => step(1));
  btnStep5.addEventListener("click", () => step(5));
  btnStepBack.addEventListener("click", () => {
    alert("Stepping back in historical simulation is disabled to preserve chronological event determinism.");
  });

  btnPlayPause.addEventListener("click", () => {
    if (isPlaying) pausePlay();
    else startPlay();
  });

  speedSelect.addEventListener("change", (e) => {
    playbackSpeed = parseInt(e.target.value, 10);
    if (isPlaying) {
      pausePlay();
      startPlay();
    }
  });

  // Order Toggles
  toggleBuy.addEventListener("click", () => {
    currentDirection = "BUY";
    toggleBuy.classList.add("active");
    toggleSell.classList.remove("active");
  });

  toggleSell.addEventListener("click", () => {
    currentDirection = "SELL";
    toggleSell.classList.add("active");
    toggleBuy.classList.remove("active");
  });

  toggleMarket.addEventListener("click", () => {
    currentOrderType = "MARKET";
    toggleMarket.classList.add("active");
    toggleLimit.classList.remove("active");
    limitPriceGroup.style.display = "none";
  });

  toggleLimit.addEventListener("click", () => {
    currentOrderType = "LIMIT";
    toggleLimit.classList.add("active");
    toggleMarket.classList.remove("active");
    limitPriceGroup.style.display = "block";
  });

  // Place Order
  btnPlaceOrder.addEventListener("click", async () => {
    if (!sessionId) return;

    const snap = await api(`/api/session/${sessionId}/snapshot`);
    const currentPrice = snap.clock.latest_price;
    const reqPrice = currentOrderType === "MARKET" ? currentPrice : parseFloat(inputLimitPrice.value);
    const sl = parseFloat(inputSl.value);
    const tp = parseFloat(inputTp.value);
    const riskPct = parseFloat(inputRiskPct.value) || 1.0;
    const lots = inputLots.value ? parseFloat(inputLots.value) : null;
    const reason = inputReason.value || "Manual Replay Entry";

    if (!reqPrice || !sl || !tp) {
      alert("Please provide valid Price, Stop Loss, and Take Profit values.");
      return;
    }

    try {
      const res = await api(`/api/session/${sessionId}/order`, {
        method: "POST",
        body: JSON.stringify({
          order_type: currentOrderType,
          direction: currentDirection,
          price: reqPrice,
          stop_loss: sl,
          take_profit: tp,
          risk_percent: riskPct,
          volume_lots: lots,
          reason_tag: reason,
        }),
      });
      updateUI(res.snapshot);
      addJournalRow(res.order, res.macro_snapshot);
    } catch (err) {
      alert("Order placement failed: " + err.message);
    }
  });

  // Close Position
  btnClosePosition.addEventListener("click", async () => {
    if (!sessionId) return;
    try {
      const res = await api(`/api/session/${sessionId}/close`, { method: "POST" });
      updateUI(res.snapshot);
      updateJournalClosedRow(res.closed_trade);
    } catch (err) {
      alert("Close position failed: " + err.message);
    }
  });

  function addJournalRow(order, macro) {
    const tr = document.createElement("tr");
    tr.id = `tr-order-${order.order_id}`;
    tr.innerHTML = `
      <td>${order.order_id.replace("ord_", "")}</td>
      <td>${order.placed_at_iso.replace("T", " ").replace("+00:00", "")}</td>
      <td style="color:${order.direction === 'BUY' ? 'var(--accent-green)' : 'var(--accent-red)'}; font-weight:700;">${order.direction}</td>
      <td>${order.volume_lots}L</td>
      <td>${order.requested_price.toFixed(5)}</td>
      <td class="exit-price-cell">--</td>
      <td class="exit-reason-cell">OPEN</td>
      <td class="pnl-cell">--</td>
      <td class="r-cell">--</td>
      <td><span class="gate-badge ${macro.bias_gate === 'LONG_ONLY' ? 'long' : macro.bias_gate === 'SHORT_ONLY' ? 'short' : 'unavailable'}">${macro.bias_gate}</span></td>
      <td>${order.reason_tag || '--'}</td>
    `;
    journalTbody.insertBefore(tr, journalTbody.firstChild);
  }

  function updateJournalClosedRow(trade) {
    const tr = document.getElementById(`tr-order-${trade.order_id}`);
    if (tr) {
      tr.querySelector(".exit-price-cell").textContent = trade.exit_price ? trade.exit_price.toFixed(5) : "--";
      tr.querySelector(".exit-reason-cell").textContent = trade.exit_reason || "CLOSED";
      const pnlCell = tr.querySelector(".pnl-cell");
      pnlCell.textContent = `$${trade.net_pnl_usd.toFixed(2)}`;
      pnlCell.style.color = trade.net_pnl_usd >= 0 ? "var(--accent-green)" : "var(--accent-red)";
      pnlCell.style.fontWeight = "700";
      const rCell = tr.querySelector(".r-cell");
      rCell.textContent = `${trade.realized_r.toFixed(2)}R`;
      rCell.style.fontWeight = "700";
    }
  }

  // Bootstrap
  initChart();
  createSession("EURUSD");
})();
