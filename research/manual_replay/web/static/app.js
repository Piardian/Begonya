// Begonya Manual Replay - Client Application Logic
(function() {
  let sessionId = null;
  let activeSymbol = "EURUSD";
  let activeTimeframe = "15m";
  let isPlaying = false;
  let playInterval = null;
  let stepInFlight = false;
  let currentClockMs = null;
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
  const savedSessionSelect = document.getElementById("saved-session-select");
  const btnLoadSession = document.getElementById("btn-load-session");
  const btnPlayPause = document.getElementById("btn-play-pause");
  const btnStep1 = document.getElementById("btn-step-1");
  const btnStep5 = document.getElementById("btn-step-5");
  const btnStepBack = document.getElementById("btn-step-back");
  const speedSelect = document.getElementById("speed-select");
  const tfButtons = document.querySelectorAll(".tf-btn");

  // Macro HUD
  const macroGateBadge = document.getElementById("macro-gate-badge");
  const macroVerifiedBadge = document.getElementById("macro-verified-badge");
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
  const pendingOrderPanel = document.getElementById("pending-order-panel");
  const pendingOrderInfo = document.getElementById("pending-order-info");
  const btnCancelOrder = document.getElementById("btn-cancel-order");

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
    pausePlay();
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
    if (!sessionId || stepInFlight) return;
    stepInFlight = true;
    try {
      const snapshot = await api(`/api/session/${sessionId}/step`, {
        method: "POST",
        body: JSON.stringify({ timeframe: activeTimeframe, count }),
      });
      await refreshCandles();
      updateUI(snapshot);
    } catch (err) {
      console.error("Error stepping clock:", err);
    } finally {
      stepInFlight = false;
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
    currentClockMs = snapshot.clock.current_time;
    clockTimeVal.textContent = snapshot.clock.current_time_iso.replace("T", " ").replace("+00:00", "");

    // Macro HUD
    const m = snapshot.macro || {};
    macroRegimeVal.textContent = m.primary_regime || "--";
    macroRiskVal.textContent = m.volatility_risk_score ?? "--";
    macroMultVal.textContent = m.recommended_risk_multiplier != null ? `${m.recommended_risk_multiplier}x` : "--";
    const pitVerified = m.status === "AVAILABLE" && m.as_of_verified === true;
    macroVerifiedBadge.textContent = pitVerified ? "● PIT Verified" : "● PIT Unverified / Unavailable";
    macroVerifiedBadge.style.color = pitVerified ? "var(--accent-green)" : "var(--accent-yellow)";

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

      const latest = snapshot.clock.latest_price ?? pos.entry_price;
      posCurrentVal.textContent = latest.toFixed(5);

      const cost = snapshot.cost_profile || {};
      const halfSpread = (Number(cost.spread_pips) || 0) * (Number(cost.pip_size) || 0) / 2;
      const estimatedExit = pos.direction === "BUY" ? latest - halfSpread : latest + halfSpread;
      const diff = pos.direction === "BUY" ? estimatedExit - pos.entry_price : pos.entry_price - estimatedExit;
      const lotSize = Number(cost.lot_size) || 100000;
      const usdConversion = ["USDJPY", "USDCAD"].includes(snapshot.symbol) && estimatedExit > 0 ? 1 / estimatedExit : 1;
      const estPnl = diff * pos.volume_lots * lotSize * usdConversion - (Number(pos.commission_usd) || 0);
      posPnlVal.textContent = `${estPnl.toFixed(2)} est.`;
      posPnlVal.style.color = estPnl >= 0 ? "var(--accent-green)" : "var(--accent-red)";
    } else {
      activePosPanel.style.display = "none";
    }

    const pendingOrders = snapshot.pending_orders || [];
    if (pendingOrders.length > 0) {
      const order = pendingOrders[0];
      pendingOrderPanel.style.display = "block";
      pendingOrderInfo.textContent = `${order.direction} LIMIT @ ${Number(order.requested_price).toFixed(5)} · SL ${Number(order.stop_loss).toFixed(5)} · TP ${Number(order.take_profit).toFixed(5)}`;
      btnCancelOrder.dataset.orderId = order.order_id;
    } else {
      pendingOrderPanel.style.display = "none";
      btnCancelOrder.dataset.orderId = "";
    }

    updatePriceLines(pos, pendingOrders);

    // Metrics
    const metrics = snapshot.metrics || {};
    metricBal.textContent = `${Number(snapshot.balance ?? 10000).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    metricPnl.textContent = `$${(metrics.net_pnl_usd || 0).toFixed(2)}`;
    metricPnl.style.color = (metrics.net_pnl_usd || 0) >= 0 ? "var(--accent-green)" : "var(--accent-red)";
    metricR.textContent = `${(metrics.total_r || 0).toFixed(1)}R`;
    metricWr.textContent = `${(metrics.win_rate_pct || 0).toFixed(1)}%`;
    metricPf.textContent = `${metrics.profit_factor || 0}`;
    metricExp.textContent = `${(metrics.expectancy_r || 0).toFixed(2)}R`;
    metricDd.textContent = `$${(metrics.max_drawdown_usd || 0).toFixed(2)}`;
    metricTrades.textContent = metrics.total_trades || 0;

    // Instrument-aware starter values; these are convenience presets, not a strategy.
    const currentPrice = snapshot.clock.latest_price;
    if (currentPrice && !inputSl.value && !inputTp.value) {
      const cost = snapshot.cost_profile || {};
      const offset = Math.max(Math.abs(currentPrice) * 0.002, (Number(cost.pip_size) || 0.0001) * 20);
      if (currentDirection === "BUY") {
        inputSl.value = (currentPrice - offset).toFixed(5);
        inputTp.value = (currentPrice + offset * 2).toFixed(5);
      } else {
        inputSl.value = (currentPrice + offset).toFixed(5);
        inputTp.value = (currentPrice - offset * 2).toFixed(5);
      }
    }
    renderJournal(snapshot);
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
      alert("Session saved successfully.");
      await refreshSavedSessions();
    } catch (err) {
      alert("Failed to save session: " + err.message);
    }
  });

  btnLoadSession.addEventListener("click", async () => {
    const savedId = savedSessionSelect && savedSessionSelect.value;
    if (!savedId) {
      alert("Select a saved session first.");
      return;
    }
    pausePlay();
    try {
      const snapshot = await api("/api/session/load", {
        method: "POST",
        body: JSON.stringify({ session_id: savedId }),
      });
      sessionId = snapshot.session_id;
      activeSymbol = snapshot.symbol;
      symbolSelect.value = activeSymbol;
      await refreshCandles();
      updateUI(snapshot);
    } catch (err) {
      alert("Could not load saved session: " + err.message);
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
  btnStepBack.addEventListener("click", async () => {
    if (!sessionId || currentClockMs == null) return;
    const intervals = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000 };
    try {
      pausePlay();
      const snapshot = await api(`/api/session/${sessionId}/jump`, {
        method: "POST",
        body: JSON.stringify({ timestamp_ms: currentClockMs - intervals[activeTimeframe] }),
      });
      await refreshCandles();
      updateUI(snapshot);
    } catch (err) {
      alert("Cannot step back: " + err.message);
    }
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
    pausePlay();
    try {
      const snap = await api(`/api/session/${sessionId}/snapshot`);
      const currentPrice = snap.clock.latest_price;
      const reqPrice = currentOrderType === "MARKET" ? currentPrice : Number(inputLimitPrice.value);
      const sl = Number(inputSl.value);
      const tp = Number(inputTp.value);
      const riskPct = Number(inputRiskPct.value);
      const lots = inputLots.value.trim() ? Number(inputLots.value) : null;
      const reason = inputReason.value || "Manual Replay Entry";

      if (![reqPrice, sl, tp, riskPct].every(Number.isFinite) || reqPrice <= 0 || sl <= 0 || tp <= 0 || riskPct <= 0) {
        alert("Enter finite positive entry, SL, TP, and risk values.");
        return;
      }
      if (lots !== null && (!Number.isFinite(lots) || lots <= 0)) {
        alert("Volume must be greater than zero or left empty for automatic sizing.");
        return;
      }

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
    } catch (err) {
      alert("Order placement failed: " + err.message);
    }
  });

  btnCancelOrder.addEventListener("click", async () => {
    if (!sessionId || !btnCancelOrder.dataset.orderId) return;
    try {
      const orderId = btnCancelOrder.dataset.orderId;
      const res = await api(`/api/session/${sessionId}/order/${orderId}/cancel`, { method: "POST" });
      updateUI(res.snapshot);
    } catch (err) {
      alert("Cancel order failed: " + err.message);
    }
  });

  // Close Position
  btnClosePosition.addEventListener("click", async () => {
    if (!sessionId) return;
    try {
      const res = await api(`/api/session/${sessionId}/close`, { method: "POST" });
      updateUI(res.snapshot);
    } catch (err) {
      alert("Close position failed: " + err.message);
    }
  });

  function renderJournal(snapshot) {
    if (!journalTbody || !Array.isArray(snapshot.orders)) return;
    journalTbody.replaceChildren();
    const tradesByOrder = new Map((snapshot.trades || []).map(trade => [trade.order_id, trade]));
    if (snapshot.open_position) tradesByOrder.set(snapshot.open_position.order_id, snapshot.open_position);
    const orders = [...snapshot.orders].sort((a, b) => (b.placed_at_ts || 0) - (a.placed_at_ts || 0));

    for (const order of orders) {
      const trade = tradesByOrder.get(order.order_id);
      const macro = (trade && trade.macro_snapshot) || order.macro_snapshot || {};
      const row = document.createElement("tr");
      row.id = `tr-order-${order.order_id}`;
      const values = [
        (order.order_id || "").replace("ord_", ""),
        (order.placed_at_iso || "").replace("T", " ").replace("+00:00", ""),
        order.direction || "--",
        order.volume_lots != null ? `${order.volume_lots}L` : "--",
        Number.isFinite(Number(order.requested_price)) ? Number(order.requested_price).toFixed(5) : "--",
        trade && trade.status === "CLOSED" && trade.exit_price != null ? Number(trade.exit_price).toFixed(5) : "--",
        trade ? (trade.status === "CLOSED" ? (trade.exit_reason || "CLOSED") : "OPEN") : (order.status || "--"),
        trade && trade.status === "CLOSED" ? `$${Number(trade.net_pnl_usd || 0).toFixed(2)}` : "--",
        trade && trade.status === "CLOSED" ? `${Number(trade.realized_r || 0).toFixed(2)}R` : "--"
      ];
      for (let i = 0; i < values.length; i++) {
        const cell = document.createElement("td");
        cell.textContent = String(values[i]);
        if (i === 2) {
          cell.style.color = order.direction === "BUY" ? "var(--accent-green)" : "var(--accent-red)";
          cell.style.fontWeight = "700";
        }
        if (i === 7 && trade && trade.status === "CLOSED") {
          cell.style.color = Number(trade.net_pnl_usd) >= 0 ? "var(--accent-green)" : "var(--accent-red)";
          cell.style.fontWeight = "700";
        }
        row.appendChild(cell);
      }
      const macroCell = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = "gate-badge " + (
        macro.bias_gate === "LONG_ONLY" ? "long" :
        macro.bias_gate === "SHORT_ONLY" ? "short" :
        macro.bias_gate === "NEUTRAL_RANGE" ? "neutral" : "unavailable"
      );
      badge.textContent = macro.bias_gate || "UNAVAILABLE";
      macroCell.appendChild(badge);
      row.appendChild(macroCell);
      const reasonCell = document.createElement("td");
      reasonCell.textContent = order.reason_tag || "--";
      row.appendChild(reasonCell);
      journalTbody.appendChild(row);
    }
  }

  async function refreshSavedSessions() {
    if (!savedSessionSelect) return;
    try {
      const data = await api("/api/sessions/saved");
      const previous = savedSessionSelect.value;
      savedSessionSelect.replaceChildren();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Saved sessions…";
      savedSessionSelect.appendChild(placeholder);
      for (const item of (data.saved_sessions || [])) {
        const option = document.createElement("option");
        option.value = item.session_id || "";
        option.textContent = `${item.symbol || "?"} · ${item.created_at || "unknown date"} · ${item.total_trades || 0} trades`;
        savedSessionSelect.appendChild(option);
      }
      if (previous) savedSessionSelect.value = previous;
    } catch (err) {
      console.error("Could not list saved sessions:", err);
    }
  }

  // Bootstrap
  initChart();
  refreshSavedSessions();
  createSession("EURUSD");
})();
