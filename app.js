const MONTH_LABELS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
const SEARCH_ALIASES = {
  "빽립": "탕갈비",
  "백립": "탕갈비",
  "동결": "냉동",
  "목잡": "목살",
  "목잡살": "목살",
  "깐양20kg": "깐양",
  "깐양(20kg)": "깐양",
  "양지off": "양지",
  "티스": "teys",
  "5스타": "showcase",
  "5star": "showcase",
  "미티": "meaty",
  "미니탕갈비": "미니 탕갈비",
  "jns": "유통",
};
const SEARCH_SYNONYMS = {
  "목살": ["목잡"],
  "목잡": ["목살"],
  "깐양": ["깐양(20kg)", "깐양(20kg)"],
  "냉동": ["동결"],
  "동결": ["냉동"],
  "탕갈비": ["빽립", "백립"],
  "빽립": ["탕갈비"],
  "백립": ["탕갈비"],
  "teys": ["티스"],
  "티스": ["teys"],
  "showcase": ["5스타", "5star", "쇼케이스"],
  "쇼케이스": ["5스타", "5star", "showcase"],
  "5스타": ["showcase", "쇼케이스"],
  "5star": ["showcase", "쇼케이스"],
  "미티": ["meaty"],
  "meaty": ["미티"],
  "유통": ["jns"],
  "jns": ["유통"],
};
const DEFAULTS = {
  monthly: { species: "우육", country: "미국", item: "갈비" },
  trend: { species: "우육", country: "미국", item: "갈비" },
};

const state = {
  tab: "overview",
  metadata: null,
  inventory: null,
  analytics: null,
  analyticsLookups: null,
  analyticsLoading: false,
  inventoryUi: {
    query: "",
    onlyInStock: false,
    warehouses: [],
    brands: [],
    selectedId: null,
  },
  analyticsUi: null,
  focusRestore: null,
};

const refs = {
  heroStats: document.getElementById("hero-stats"),
  tabbar: document.getElementById("tabbar"),
  panels: {
    overview: document.getElementById("panel-overview"),
    inventory: document.getElementById("panel-inventory"),
    analytics: document.getElementById("panel-analytics"),
    ops: document.getElementById("panel-ops"),
  },
  toast: document.getElementById("toast"),
};

async function init() {
  try {
    const [metadata, inventory] = await Promise.all([
      fetchJson("./data/metadata.json"),
      fetchJson("./data/inventory.json"),
    ]);
    state.metadata = metadata;
    state.inventory = inventory;
    state.inventoryUi.selectedId = inventory.rows[0]?.id ?? null;
    if (metadata?.defaults?.inventory?.onlyInStock) {
      state.inventoryUi.onlyInStock = true;
    }
    renderHero();
    render();
  } catch (error) {
    renderFatal(error);
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`${url} 요청 실패 (${response.status})`);
  }
  return response.json();
}

function render() {
  renderTabs();
  Object.entries(refs.panels).forEach(([name, panel]) => {
    panel.hidden = name !== state.tab;
  });

  if (state.tab === "overview") {
    renderOverviewPanel();
  } else if (state.tab === "inventory") {
    renderInventoryPanel();
  } else if (state.tab === "analytics") {
    if (!state.analytics && !state.analyticsLoading) {
      void loadAnalytics();
      renderAnalyticsPanel();
    } else {
      renderAnalyticsPanel();
    }
  } else if (state.tab === "ops") {
    renderOpsPanel();
  }
}

async function loadAnalytics() {
  try {
    state.analyticsLoading = true;
    renderAnalyticsPanel();
    state.analytics = await fetchJson("./data/analytics.json");
    state.analyticsLookups = buildAnalyticsLookups(state.analytics);
    state.analyticsUi = createAnalyticsUiState();
    normalizeAnalyticsUi();
  } catch (error) {
    refs.panels.analytics.innerHTML = renderErrorCard("Analytics 데이터를 불러오지 못했습니다.", error.message);
  } finally {
    state.analyticsLoading = false;
    if (state.tab === "analytics") {
      renderAnalyticsPanel();
    }
  }
}

function renderHero() {
  if (!state.metadata) {
    return;
  }
  const generated = formatDateTime(state.metadata.generatedAt);
  const inventoryCounts = state.metadata.inventory?.counts ?? {};
  const analytics = state.metadata.analytics ?? {};

  refs.heroStats.innerHTML = [
    {
      label: "Inventory Rows",
      value: formatNumber(inventoryCounts.rows ?? 0),
      meta: `재고 ${formatNumber(inventoryCounts.rows ?? 0)}건 · 브랜드 ${formatNumber(inventoryCounts.brands ?? 0)}개`,
    },
    {
      label: "Quarantine Records",
      value: formatNumber(analytics.quarantine?.rows ?? 0),
      meta: `국가 ${formatNumber(analytics.quarantine?.countries ?? 0)}개 · 축종 2개`,
    },
    {
      label: "USDA Daily Series",
      value: formatNumber(analytics.usda?.rows ?? 0),
      meta: `카테고리 ${formatNumber(analytics.usda?.groups ?? 0)}개`,
    },
    {
      label: "Snapshot Updated",
      value: escapeHtml(state.metadata.inventory?.updatedAt ?? "n/a"),
      meta: `정적 스냅샷 생성 ${escapeHtml(generated)}`,
    },
  ]
    .map(
      (card) => `
        <article class="stat-card">
          <div class="stat-card__label">${card.label}</div>
          <div class="stat-card__value">${card.value}</div>
          <div class="stat-card__meta">${card.meta}</div>
        </article>
      `,
    )
    .join("");
}

function renderTabs() {
  const buttons = refs.tabbar.querySelectorAll("[data-tab]");
  buttons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === state.tab);
  });
}

function renderOverviewPanel() {
  const meta = state.metadata;
  const generated = formatDateTime(meta.generatedAt);
  refs.panels.overview.innerHTML = `
    <div class="grid overview-grid">
      <section class="stack">
        <article class="card">
          <div class="section-header">
            <div>
              <span class="kicker">Live Snapshot</span>
              <h2>Streamlit에서 쓰던 핵심 기능을 Pages 워크스페이스로 재조립했습니다.</h2>
              <p>
                서버 사이드 Python은 Google Sheets를 정적 JSON으로 스냅샷하고,
                화면은 브라우저에서 검색, 비교, 집계, 차트 렌더링을 바로 수행합니다.
              </p>
            </div>
          </div>
          <div class="metric-grid">
            <article class="metric-card">
              <h3>Inventory</h3>
              <div class="metric-card__value">${formatNumber(meta.inventory?.counts?.rows ?? 0)}</div>
              <p>실시간 조회 대신 최신 스냅샷을 빠르게 탐색합니다.</p>
            </article>
            <article class="metric-card">
              <h3>Quarantine</h3>
              <div class="metric-card__value">${formatNumber(meta.analytics?.quarantine?.rows ?? 0)}</div>
              <p>돈육·우육 검역량 장기 이력을 국가와 품목 단위로 비교합니다.</p>
            </article>
            <article class="metric-card">
              <h3>USDA</h3>
              <div class="metric-card__value">${formatNumber(meta.analytics?.usda?.rows ?? 0)}</div>
              <p>일일 시계열을 월평균, 분기, 반기 기준으로 재조합합니다.</p>
            </article>
            <article class="metric-card">
              <h3>Snapshot</h3>
              <div class="metric-card__value">${escapeHtml(meta.inventory?.updatedAt ?? "n/a")}</div>
              <p>Pages 빌드 시점 기준 데이터 스냅샷입니다.</p>
            </article>
          </div>
        </article>

        <article class="card">
          <div class="section-header">
            <div>
              <span class="kicker">Modules</span>
              <h3>운영 흐름 기준으로 화면을 나눴습니다.</h3>
            </div>
          </div>
          <div class="module-grid">
            <article class="module-card">
              <h3>Inventory Studio</h3>
              <p>검색어 문법, 창고/브랜드 필터, 재고만 보기, 상세 패널, 관리코드 복사까지 포함합니다.</p>
              <button class="button button--primary" type="button" data-action="set-tab" data-tab="inventory">열기</button>
            </article>
            <article class="module-card">
              <h3>Market Atlas</h3>
              <p>연도별 월별 비교와 추이 그래프를 모두 지원하고, 이중축 비교도 가능합니다.</p>
              <button class="button button--secondary" type="button" data-action="set-tab" data-tab="analytics">열기</button>
            </article>
            <article class="module-card">
              <h3>Data Ops</h3>
              <p>스냅샷 재생성 명령, 소스 설명, 배포 루틴을 같이 둬서 운영 전환이 쉽습니다.</p>
              <button class="button button--ghost" type="button" data-action="set-tab" data-tab="ops">열기</button>
            </article>
          </div>
        </article>
      </section>

      <section class="stack">
        <article class="card">
          <div class="section-header">
            <div>
              <span class="kicker">Architecture</span>
              <h3>GitHub Pages 제약을 우회한 구조</h3>
            </div>
          </div>
          <div class="source-list">
            <div class="source-item">
              <strong>1. Google Sheets Snapshot</strong>
              <span>서비스 계정으로 비공개 시트를 읽고 정적 JSON으로 변환합니다.</span>
            </div>
            <div class="source-item">
              <strong>2. Client-Side Analytics</strong>
              <span>브라우저에서 필터, 검색, 집계, Plotly 차트 생성을 처리합니다.</span>
            </div>
            <div class="source-item">
              <strong>3. Static Deployment</strong>
              <span>별도 서버 없이 ${escapeHtml(generated)} 기준 스냅샷을 GitHub Pages로 배포합니다.</span>
            </div>
          </div>
        </article>

        <article class="card">
          <div class="section-header">
            <div>
              <span class="kicker">Notes</span>
              <h3>현재 전환에서 유지한 기준</h3>
            </div>
          </div>
          <div class="tag-row">
            <span class="tag">검색 문법 유지</span>
            <span class="tag">이중축 차트 유지</span>
            <span class="tag">월·분기·반기 집계 유지</span>
            <span class="tag">정적 배포 대응</span>
          </div>
          <p class="list-note" style="margin-top: 16px;">
            브라우저에서 비밀키를 직접 사용할 수 없기 때문에, 데이터는 스냅샷 방식으로 공급됩니다.
            따라서 “현재 시점”이 아니라 “가장 최근 export 시점” 기준입니다.
          </p>
        </article>
      </section>
    </div>
  `;
}

function renderInventoryPanel() {
  const inventory = state.inventory;
  const rows = getFilteredInventoryRows();
  const counts = {
    visible: rows.length,
    total: inventory.rows.length,
    stock: rows.reduce((sum, row) => sum + Number(row["재고"] || 0), 0),
    expiring: rows.filter((row) => getExpirationInfo(row).warn).length,
    brands: new Set(rows.map((row) => row["브랜드"]).filter(Boolean)).size,
  };
  if (!rows.find((row) => row.id === state.inventoryUi.selectedId)) {
    state.inventoryUi.selectedId = rows[0]?.id ?? null;
  }
  const selectedRow = rows.find((row) => row.id === state.inventoryUi.selectedId) ?? null;
  const activeTags = [
    state.inventoryUi.query ? `검색: ${state.inventoryUi.query}` : null,
    state.inventoryUi.onlyInStock ? "재고만" : null,
    ...state.inventoryUi.warehouses.map((value) => `창고: ${value}`),
    ...state.inventoryUi.brands.map((value) => `브랜드: ${value}`),
  ].filter(Boolean);

  refs.panels.inventory.innerHTML = `
    <div class="section-header">
      <div>
        <span class="kicker">Inventory Studio</span>
        <h2>재고 검색과 상세 확인을 한 화면에서 처리합니다.</h2>
        <p>검색 문법: 공백은 AND, 쉼표는 OR, <code>!단어</code>는 제외입니다.</p>
      </div>
      <div class="kicker"><strong>최신</strong> ${escapeHtml(inventory.updatedAt ?? "n/a")}</div>
    </div>

    <div class="inventory-shell">
      <aside class="control-card">
        <div class="field">
          <label class="field__label" for="inventory-query">검색</label>
          <input
            id="inventory-query"
            type="text"
            data-action="set-value"
            data-path="inventoryUi.query"
            value="${escapeAttribute(state.inventoryUi.query)}"
            placeholder="품명 브랜드 BL번호 창고, !제외"
          >
          <p class="field__help">예: <code>갈비 미국</code>, <code>목살, 탕갈비</code>, <code>!냉동</code></p>
        </div>

        <label class="toggle">
          <span>
            <strong>재고만 보기</strong><br>
            <span class="field__help">현재 수량이 0보다 큰 항목만 노출합니다.</span>
          </span>
          <input
            type="checkbox"
            data-action="set-bool"
            data-path="inventoryUi.onlyInStock"
            ${state.inventoryUi.onlyInStock ? "checked" : ""}
          >
        </label>

        ${renderChecklist({
          title: "창고",
          path: "inventoryUi.warehouses",
          options: inventory.filters.warehouses,
          selected: state.inventoryUi.warehouses,
        })}

        ${renderChecklist({
          title: "브랜드",
          path: "inventoryUi.brands",
          options: inventory.filters.brands.map((item) => ({ value: item.value, label: item.label })),
          selected: state.inventoryUi.brands,
          compact: true,
        })}

        <div class="action-row">
          <button class="button button--tertiary" type="button" data-action="reset-inventory">필터 초기화</button>
          ${
            selectedRow
              ? `<button class="button button--primary" type="button" data-action="copy-text" data-text="${encodeURIComponent(selectedRow["관리 코드"] ?? "")}">관리코드 복사</button>`
              : ""
          }
        </div>
      </aside>

      <div class="inventory-main">
        <section class="workspace-card">
          <div class="result-summary">
            <div class="summary-title">
              <strong>${formatNumber(counts.visible)}</strong>
              <span class="field__help">전체 ${formatNumber(counts.total)}건 중 현재 조건 결과</span>
            </div>
            <div class="pill-row">
              <span class="pill">재고 합계 ${formatNumber(counts.stock)}</span>
              <span class="pill">브랜드 ${formatNumber(counts.brands)}개</span>
              <span class="pill">30일 내 유통기한 ${formatNumber(counts.expiring)}건</span>
            </div>
          </div>
          ${activeTags.length ? `<div class="tag-row" style="margin-top: 14px;">${activeTags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        </section>

        ${
          rows.length
            ? `
              <div class="inventory-layout">
                <section class="workspace-card">
                  <div class="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>복사</th>
                          ${inventory.displayColumns.filter((column) => column !== "관리 코드").map((column) => `<th>${escapeHtml(column)}</th>`).join("")}
                        </tr>
                      </thead>
                      <tbody>
                        ${rows.map((row) => renderInventoryRow(row)).join("")}
                      </tbody>
                    </table>
                  </div>
                </section>
                <aside class="detail-card">
                  ${selectedRow ? renderInventoryDetail(selectedRow, inventory.detailGroups) : '<div class="empty-state">항목을 선택해 상세 정보를 확인하세요.</div>'}
                </aside>
              </div>
            `
            : `
              <section class="workspace-card">
                <div class="empty-state">
                  현재 조건에 맞는 재고가 없습니다.<br>검색어 또는 필터를 조정해 보세요.
                </div>
              </section>
            `
        }
      </div>
    </div>
  `;
  restoreFocusIfNeeded();
}

function renderInventoryRow(row) {
  const exp = getExpirationInfo(row);
  const columns = state.inventory.displayColumns.filter((column) => column !== "관리 코드");
  return `
    <tr class="${row.id === state.inventoryUi.selectedId ? "is-selected" : ""}" data-action="select-inventory-row" data-row-id="${row.id}">
      <td>
        <button
          class="table-button"
          type="button"
          data-action="copy-text"
          data-text="${encodeURIComponent(row["관리 코드"] ?? "")}"
        >
          복사
        </button>
      </td>
      ${columns
        .map((column) => {
          if (column === "재고") {
            return `<td>${formatNumber(row[column] ?? 0)}</td>`;
          }
          if (column === "단가") {
            return `<td>${row[column] ? formatNumber(row[column]) : "-"}</td>`;
          }
          if (column === "유통기한") {
            return `<td>${exp.warn ? "⚠️ " : ""}${escapeHtml(exp.label || "-")}</td>`;
          }
          return `<td>${escapeHtml(row[column] ?? "-")}</td>`;
        })
        .join("")}
    </tr>
  `;
}

function renderInventoryDetail(row, detailGroups) {
  const exp = getExpirationInfo(row);
  return `
    <div class="detail-top">
      <div class="detail-title">
        <h3>${escapeHtml(row["품명"] ?? "항목 미상")}</h3>
        <p>${escapeHtml([row["브랜드"], row["브랜드_한글"]].filter(Boolean).join(" · ") || row["원산지"] || "")}</p>
      </div>
      <div class="tag-row">
        ${row["등급"] ? `<span class="tag">${escapeHtml(row["등급"])}</span>` : ""}
        ${row["EST"] ? `<span class="tag">${escapeHtml(row["EST"])}</span>` : ""}
        ${row["창고"] ? `<span class="tag">${escapeHtml(row["창고"])}</span>` : ""}
        ${exp.label ? `<span class="tag ${exp.warn ? "is-warn" : ""}">${exp.warn ? "⚠ " : ""}${escapeHtml(exp.label)}</span>` : ""}
      </div>
    </div>

    <div class="detail-metrics">
      <div class="detail-metric">
        <span class="detail-item__label">재고</span>
        <strong>${formatNumber(row["재고"] ?? 0)}</strong>
      </div>
      <div class="detail-metric">
        <span class="detail-item__label">당일매출</span>
        <strong>${formatNumber(row["당일매출"] ?? 0)}</strong>
      </div>
      <div class="detail-metric">
        <span class="detail-item__label">예약</span>
        <strong>${formatNumber(row["예약"] ?? 0)}</strong>
      </div>
    </div>

    ${detailGroups
      .map(([title, fields]) => {
        const items = fields
          .map((field) => renderDetailItem(row, field))
          .filter(Boolean)
          .join("");
        if (!items) {
          return "";
        }
        return `
          <section class="detail-group">
            <h4>${escapeHtml(title)}</h4>
            <div class="detail-grid">${items}</div>
          </section>
        `;
      })
      .join("")}
  `;
}

function renderDetailItem(row, field) {
  const { text, warn } = formatInventoryField(row, field);
  if (text == null || text === "") {
    return "";
  }
  return `
    <article class="detail-item">
      <div class="detail-item__label">${escapeHtml(field)}</div>
      <div class="detail-item__value ${warn ? "is-warn" : ""}">${escapeHtml(text)}</div>
    </article>
  `;
}

function renderAnalyticsPanel() {
  const panel = refs.panels.analytics;
  if (state.analyticsLoading && !state.analytics) {
    panel.innerHTML = `
      <div class="loading-state">
        분석용 정적 데이터를 불러오는 중입니다.<br>대용량 검역량 시계열을 먼저 적재합니다.
      </div>
    `;
    return;
  }
  if (!state.analytics || !state.analyticsUi) {
    panel.innerHTML = renderErrorCard("Analytics 데이터를 아직 준비하지 못했습니다.", "잠시 후 다시 시도하세요.");
    return;
  }

  panel.innerHTML = `
    <div class="analytics-stack">
      <section class="chart-card">
        <div class="section-header">
          <div>
            <span class="kicker">Monthly Comparison</span>
            <h2>연도별 월별 비교</h2>
            <p>검역량, USDA, 국가별 축산 지표를 연도와 항목 조합으로 비교합니다.</p>
          </div>
          <div class="segmented">
            <button class="segmented__button ${state.analyticsUi.monthly.mode === "multi" ? "is-active" : ""}" type="button" data-action="set-value" data-path="analyticsUi.monthly.mode" data-value="multi">멀티 비교</button>
            <button class="segmented__button ${state.analyticsUi.monthly.mode === "dual" ? "is-active" : ""}" type="button" data-action="set-value" data-path="analyticsUi.monthly.mode" data-value="dual">이중축 비교</button>
          </div>
        </div>

        ${
          state.analyticsUi.monthly.mode === "multi"
            ? `
              <div class="analytics-grid">
                <div class="control-grid">${renderMonthlyMultiControls()}</div>
                <div>
                  <div class="chart-stage" id="monthly-chart-stage"><div id="monthly-chart"></div></div>
                  <div class="chart-note">최신 연도 라인에는 월별 수치를 직접 표기하고, 전체 평균선을 함께 표시합니다.</div>
                </div>
              </div>
            `
            : `
              <div class="analytics-grid analytics-grid--dual">
                <div class="control-grid">${renderMonthlySingleControls("left", "좌축 · Inventory/Quarantine 측", "analyticsUi.monthly.left")}</div>
                <div class="control-grid">${renderMonthlySingleControls("right", "우축 · USDA/Livestock 측", "analyticsUi.monthly.right")}</div>
              </div>
              <div style="margin-top: 16px;">
                <div class="chart-stage" id="monthly-chart-stage"><div id="monthly-chart"></div></div>
                <div class="chart-note">좌측은 네이비, 우측은 오렌지 축으로 렌더링합니다.</div>
              </div>
            `
        }
      </section>

      <section class="chart-card">
        <div class="section-header">
          <div>
            <span class="kicker">Trend Engine</span>
            <h2>추이 그래프</h2>
            <p>최근 3개월, 1년, 5년 또는 직접 설정 기간으로 집계 추이를 비교합니다.</p>
          </div>
          <div class="segmented">
            ${["최근 3개월", "최근 1년", "최근 5년", "직접 설정"]
              .map(
                (period) => `
                  <button
                    class="segmented__button ${state.analyticsUi.trend.period === period ? "is-active" : ""}"
                    type="button"
                    data-action="set-value"
                    data-path="analyticsUi.trend.period"
                    data-value="${escapeAttribute(period)}"
                  >
                    ${escapeHtml(period)}
                  </button>
                `,
              )
              .join("")}
          </div>
        </div>

        <div class="control-grid" style="margin-bottom: 16px;">
          ${
            state.analyticsUi.trend.period === "직접 설정"
              ? `
                <div class="inline-field">
                  ${renderDateField("시작일", "analyticsUi.trend.customStart", state.analyticsUi.trend.customStart)}
                  ${renderDateField("종료일", "analyticsUi.trend.customEnd", state.analyticsUi.trend.customEnd)}
                </div>
              `
              : ""
          }
          <div class="analytics-grid">
            <div class="control-grid">
              <label class="toggle">
                <span>
                  <strong>이중축 비교</strong><br>
                  <span class="field__help">두 데이터셋을 좌우 축으로 동시에 표시합니다.</span>
                </span>
                <input type="checkbox" data-action="set-bool" data-path="analyticsUi.trend.dual" ${state.analyticsUi.trend.dual ? "checked" : ""}>
              </label>

              <div class="field">
                <span class="field__label">집계 단위</span>
                <div class="segmented">
                  ${getAllowedTrendAggs()
                    .map(
                      (agg) => `
                        <button
                          class="segmented__button ${state.analyticsUi.trend.agg === agg ? "is-active" : ""}"
                          type="button"
                          data-action="set-value"
                          data-path="analyticsUi.trend.agg"
                          data-value="${escapeAttribute(agg)}"
                        >
                          ${escapeHtml(agg)}
                        </button>
                      `,
                    )
                    .join("")}
                </div>
              </div>

              ${
                state.analyticsUi.trend.agg === "일일"
                  ? `
                    <label class="toggle">
                      <span>
                        <strong>주말 제거</strong><br>
                        <span class="field__help">USDA 일일 데이터에서 토·일을 제외합니다.</span>
                      </span>
                      <input type="checkbox" data-action="set-bool" data-path="analyticsUi.trend.removeWeekends" ${state.analyticsUi.trend.removeWeekends ? "checked" : ""}>
                    </label>
                  `
                  : `
                    <div class="inline-field">
                      ${renderMethodField("좌축 집계 방식", "analyticsUi.trend.leftMethod", state.analyticsUi.trend.leftMethod)}
                      ${state.analyticsUi.trend.dual ? renderMethodField("우축 집계 방식", "analyticsUi.trend.rightMethod", state.analyticsUi.trend.rightMethod) : ""}
                    </div>
                  `
              }
            </div>
            <div class="control-grid">
              ${renderTrendControls("left", "좌축 데이터셋", "analyticsUi.trend.left")}
              ${state.analyticsUi.trend.dual ? renderTrendControls("right", "우축 데이터셋", "analyticsUi.trend.right") : ""}
            </div>
          </div>
        </div>

        <div class="chart-stage" id="trend-chart-stage"><div id="trend-chart"></div></div>
        <div class="chart-note">일일 집계는 USDA-only 조합에서만 허용됩니다. 그 외 조합은 월평균 이상으로 자동 제한합니다.</div>
      </section>
    </div>
  `;

  renderMonthlyChart();
  renderTrendChart();
}

function renderOpsPanel() {
  const generated = formatDateTime(state.metadata.generatedAt);
  const exportCommand = `/home/goodnews/바탕화면/ZM_DX_PROJECTS/venv/bin/python /home/goodnews/바탕화면/ZM_DX_PROJECTS/03_깃헙_페이지/scripts/export_streamlit_data.py`;
  refs.panels.ops.innerHTML = `
    <div class="section-header">
      <div>
        <span class="kicker">Data Ops</span>
        <h2>정적 데이터 스냅샷 운영 절차</h2>
        <p>이 페이지는 export 스크립트로 Google Sheets를 JSON으로 고정한 뒤 GitHub Pages로 배포합니다.</p>
      </div>
      <div class="kicker"><strong>Generated</strong> ${escapeHtml(generated)}</div>
    </div>

    <div class="ops-grid">
      <section class="ops-card">
        <h3>Refresh Snapshot</h3>
        <p>시트 최신값을 다시 끌어와 정적 JSON을 갱신할 때 사용하는 명령입니다.</p>
        <div class="command-block">${escapeHtml(exportCommand)}</div>
        <div class="action-row" style="margin-top: 14px;">
          <button class="button button--primary" type="button" data-action="copy-text" data-text="${encodeURIComponent(exportCommand)}">명령 복사</button>
          <button class="button button--tertiary" type="button" data-action="set-tab" data-tab="analytics">Analytics 열기</button>
        </div>
        <div class="command-block" style="margin-top: 16px;">cd /home/goodnews/바탕화면/ZM_DX_PROJECTS/03_깃헙_페이지
git add .
git commit -m "Refresh pages snapshot"
git push</div>
      </section>

      <section class="ops-card">
        <h3>Source Inventory</h3>
        <div class="source-list">
          <div class="source-item">
            <strong>검색창_관리부 / 데이터</strong>
            <span>재고 검색 메인 데이터. 현재 ${formatNumber(state.metadata.inventory?.counts?.rows ?? 0)}건 스냅샷.</span>
          </div>
          <div class="source-item">
            <strong>2026년 품목리스트(영업사원) / 단가</strong>
            <span>복합키 기준 단가를 재고 데이터에 병합합니다.</span>
          </div>
          <div class="source-item">
            <strong>검역량 / 돈육·우육 요약</strong>
            <span>월별 검역량 long-format 42K+ 레코드로 적재됩니다.</span>
          </div>
          <div class="source-item">
            <strong>미국,호주,국내 도축두수 및 내수가격</strong>
            <span>USDA 일일 시계열과 국가별 축산 월간 지표를 함께 포함합니다.</span>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderMonthlyMultiControls() {
  const config = state.analyticsUi.monthly.primary;
  const sourceOptions = [
    { value: "quarantine", label: "검역량" },
    { value: "usda", label: "미국내수(USDA)" },
    { value: "livestock", label: "국가별 축산" },
  ];

  if (config.source === "quarantine") {
    const speciesLookup = state.analyticsLookups.quarantine.bySpecies[config.quarantine.species];
    return `
      ${renderSelectField("데이터", "analyticsUi.monthly.primary.source", config.source, sourceOptions)}
      ${renderSelectField("구분", "analyticsUi.monthly.primary.quarantine.species", config.quarantine.species, state.analyticsLookups.quarantine.species)}
      ${renderChecklist({ title: "연도", path: "analyticsUi.monthly.primary.quarantine.years", options: speciesLookup.years.map(String), selected: config.quarantine.years, compact: true })}
      <label class="toggle">
        <span><strong>국가 합산</strong><br><span class="field__help">선택 국가를 하나의 시리즈로 합칩니다.</span></span>
        <input type="checkbox" data-action="set-bool" data-path="analyticsUi.monthly.primary.quarantine.mergeCountries" ${config.quarantine.mergeCountries ? "checked" : ""}>
      </label>
      ${renderChecklist({ title: "국가", path: "analyticsUi.monthly.primary.quarantine.countries", options: speciesLookup.countries, selected: config.quarantine.countries })}
      <label class="toggle">
        <span><strong>품목 합산</strong><br><span class="field__help">선택 품목을 하나의 시리즈로 합칩니다.</span></span>
        <input type="checkbox" data-action="set-bool" data-path="analyticsUi.monthly.primary.quarantine.mergeItems" ${config.quarantine.mergeItems ? "checked" : ""}>
      </label>
      ${renderChecklist({ title: "품목", path: "analyticsUi.monthly.primary.quarantine.items", options: speciesLookup.items, selected: config.quarantine.items, compact: true })}
    `;
  }

  if (config.source === "usda") {
    const groupItems = state.analytics.usda.groups[config.usda.group] ?? [];
    const mergeable = state.analytics.usda.mergeableGroups.includes(config.usda.group);
    return `
      ${renderSelectField("데이터", "analyticsUi.monthly.primary.source", config.source, sourceOptions)}
      ${renderSelectField("카테고리", "analyticsUi.monthly.primary.usda.group", config.usda.group, Object.keys(state.analytics.usda.groups))}
      ${renderChecklist({ title: "연도", path: "analyticsUi.monthly.primary.usda.years", options: state.analyticsLookups.usda.years.map(String), selected: config.usda.years, compact: true })}
      ${
        mergeable
          ? `
            <label class="toggle">
              <span><strong>항목 합산</strong><br><span class="field__help">도축두수 항목만 합산 지원합니다.</span></span>
              <input type="checkbox" data-action="set-bool" data-path="analyticsUi.monthly.primary.usda.mergeItems" ${config.usda.mergeItems ? "checked" : ""}>
            </label>
          `
          : ""
      }
      ${renderChecklist({ title: "항목", path: "analyticsUi.monthly.primary.usda.items", options: groupItems, selected: config.usda.items })}
    `;
  }

  const livestockLookup = state.analyticsLookups.livestock.byMetricSpecies[`${config.livestock.metric}|${config.livestock.species}`];
  const mergeable = state.analytics.livestock.mergeableMetrics.includes(config.livestock.metric);
  return `
    ${renderSelectField("데이터", "analyticsUi.monthly.primary.source", config.source, sourceOptions)}
    ${renderSelectField("지표", "analyticsUi.monthly.primary.livestock.metric", config.livestock.metric, state.analytics.livestock.metrics)}
    ${renderSelectField("축종", "analyticsUi.monthly.primary.livestock.species", config.livestock.species, state.analytics.livestock.species)}
    ${renderChecklist({ title: "연도", path: "analyticsUi.monthly.primary.livestock.years", options: livestockLookup.years.map(String), selected: config.livestock.years, compact: true })}
    ${
      mergeable
        ? `
          <label class="toggle">
            <span><strong>국가 합산</strong><br><span class="field__help">선택 국가를 하나의 시리즈로 합칩니다.</span></span>
            <input type="checkbox" data-action="set-bool" data-path="analyticsUi.monthly.primary.livestock.mergeCountries" ${config.livestock.mergeCountries ? "checked" : ""}>
          </label>
        `
        : ""
    }
    ${renderChecklist({ title: "국가", path: "analyticsUi.monthly.primary.livestock.countries", options: livestockLookup.countries, selected: config.livestock.countries })}
  `;
}

function renderMonthlySingleControls(side, title, path) {
  const config = getByPath(state, path);
  const sourceOptions = [
    { value: "quarantine", label: "검역량" },
    { value: "usda", label: "미국내수(USDA)" },
    { value: "livestock", label: "국가별 축산" },
  ];

  let detail = "";
  if (config.source === "quarantine") {
    const speciesLookup = state.analyticsLookups.quarantine.bySpecies[config.quarantine.species];
    detail = `
      ${renderSelectField("구분", `${path}.quarantine.species`, config.quarantine.species, state.analyticsLookups.quarantine.species)}
      ${renderSelectField("국가", `${path}.quarantine.country`, config.quarantine.country, speciesLookup.countries)}
      ${renderSelectField("품목", `${path}.quarantine.item`, config.quarantine.item, speciesLookup.items)}
      ${renderSelectField("연도", `${path}.quarantine.year`, config.quarantine.year, speciesLookup.years.map(String))}
    `;
  } else if (config.source === "usda") {
    const groupItems = state.analytics.usda.groups[config.usda.group] ?? [];
    const mergeable = state.analytics.usda.mergeableGroups.includes(config.usda.group);
    detail = `
      ${renderSelectField("카테고리", `${path}.usda.group`, config.usda.group, Object.keys(state.analytics.usda.groups))}
      ${renderSelectField("연도", `${path}.usda.year`, config.usda.year, state.analyticsLookups.usda.years.map(String))}
      ${
        mergeable
          ? `
            <label class="toggle">
              <span><strong>항목 합산</strong><br><span class="field__help">복수 항목을 월 합계로 묶습니다.</span></span>
              <input type="checkbox" data-action="set-bool" data-path="${path}.usda.mergeItems" ${config.usda.mergeItems ? "checked" : ""}>
            </label>
            ${renderChecklist({ title: "합산 항목", path: `${path}.usda.items`, options: groupItems, selected: config.usda.items, compact: true })}
          `
          : renderSelectField("항목", `${path}.usda.item`, config.usda.item, groupItems)
      }
    `;
  } else {
    const livestockLookup = state.analyticsLookups.livestock.byMetricSpecies[`${config.livestock.metric}|${config.livestock.species}`];
    const mergeable = state.analytics.livestock.mergeableMetrics.includes(config.livestock.metric);
    detail = `
      ${renderSelectField("지표", `${path}.livestock.metric`, config.livestock.metric, state.analytics.livestock.metrics)}
      ${renderSelectField("축종", `${path}.livestock.species`, config.livestock.species, state.analytics.livestock.species)}
      ${renderSelectField("연도", `${path}.livestock.year`, config.livestock.year, livestockLookup.years.map(String))}
      ${
        mergeable
          ? `
            <label class="toggle">
              <span><strong>국가 합산</strong><br><span class="field__help">선택 국가를 하나로 표시합니다.</span></span>
              <input type="checkbox" data-action="set-bool" data-path="${path}.livestock.mergeCountries" ${config.livestock.mergeCountries ? "checked" : ""}>
            </label>
            ${
              config.livestock.mergeCountries
                ? renderChecklist({ title: "국가", path: `${path}.livestock.countries`, options: livestockLookup.countries, selected: config.livestock.countries, compact: true })
                : renderSelectField("국가", `${path}.livestock.country`, config.livestock.country, livestockLookup.countries)
            }
          `
          : renderSelectField("국가", `${path}.livestock.country`, config.livestock.country, livestockLookup.countries)
      }
    `;
  }

  return `
    <div class="card">
      <div class="section-header">
        <div>
          <span class="kicker">${side === "left" ? "Left Axis" : "Right Axis"}</span>
          <h3>${escapeHtml(title)}</h3>
        </div>
      </div>
      <div class="control-grid">
        ${renderSelectField("데이터", `${path}.source`, config.source, sourceOptions)}
        ${detail}
      </div>
    </div>
  `;
}

function renderTrendControls(side, title, path) {
  const config = getByPath(state, path);
  const sourceOptions = [
    { value: "quarantine", label: "검역량" },
    { value: "usda", label: "미국내수(USDA)" },
    { value: "livestock", label: "국가별 축산" },
  ];

  let detail = "";
  if (config.source === "quarantine") {
    const lookup = state.analyticsLookups.quarantine.bySpecies[config.quarantine.species];
    detail = `
      ${renderSelectField("구분", `${path}.quarantine.species`, config.quarantine.species, state.analyticsLookups.quarantine.species)}
      ${renderSelectField("국가", `${path}.quarantine.country`, config.quarantine.country, lookup.countries)}
      ${renderSelectField("품목", `${path}.quarantine.item`, config.quarantine.item, lookup.items)}
    `;
  } else if (config.source === "usda") {
    const groupItems = state.analytics.usda.groups[config.usda.group] ?? [];
    const mergeable = state.analytics.usda.mergeableGroups.includes(config.usda.group);
    detail = `
      ${renderSelectField("카테고리", `${path}.usda.group`, config.usda.group, Object.keys(state.analytics.usda.groups))}
      ${
        mergeable
          ? `
            <label class="toggle">
              <span><strong>항목 합산</strong><br><span class="field__help">일별 항목을 합산한 뒤 집계합니다.</span></span>
              <input type="checkbox" data-action="set-bool" data-path="${path}.usda.mergeItems" ${config.usda.mergeItems ? "checked" : ""}>
            </label>
            ${
              config.usda.mergeItems
                ? renderChecklist({ title: "항목", path: `${path}.usda.items`, options: groupItems, selected: config.usda.items, compact: true })
                : renderSelectField("항목", `${path}.usda.item`, config.usda.item, groupItems)
            }
          `
          : renderSelectField("항목", `${path}.usda.item`, config.usda.item, groupItems)
      }
    `;
  } else {
    const lookup = state.analyticsLookups.livestock.byMetricSpecies[`${config.livestock.metric}|${config.livestock.species}`];
    const mergeable = state.analytics.livestock.mergeableMetrics.includes(config.livestock.metric);
    detail = `
      ${renderSelectField("지표", `${path}.livestock.metric`, config.livestock.metric, state.analytics.livestock.metrics)}
      ${renderSelectField("축종", `${path}.livestock.species`, config.livestock.species, state.analytics.livestock.species)}
      ${
        mergeable
          ? `
            <label class="toggle">
              <span><strong>국가 합산</strong><br><span class="field__help">여러 국가를 하나의 시계열로 묶습니다.</span></span>
              <input type="checkbox" data-action="set-bool" data-path="${path}.livestock.mergeCountries" ${config.livestock.mergeCountries ? "checked" : ""}>
            </label>
            ${
              config.livestock.mergeCountries
                ? renderChecklist({ title: "국가", path: `${path}.livestock.countries`, options: lookup.countries, selected: config.livestock.countries, compact: true })
                : renderSelectField("국가", `${path}.livestock.country`, config.livestock.country, lookup.countries)
            }
          `
          : renderSelectField("국가", `${path}.livestock.country`, config.livestock.country, lookup.countries)
      }
    `;
  }

  return `
    <div class="card">
      <div class="section-header">
        <div>
          <span class="kicker">${side === "left" ? "Left Axis" : "Right Axis"}</span>
          <h3>${escapeHtml(title)}</h3>
        </div>
      </div>
      <div class="control-grid">
        ${renderSelectField("데이터", `${path}.source`, config.source, sourceOptions)}
        ${detail}
      </div>
    </div>
  `;
}

function renderMonthlyChart() {
  const stage = document.getElementById("monthly-chart-stage");
  if (!stage) {
    return;
  }
  if (!window.Plotly) {
    stage.innerHTML = '<div class="loading-state">Plotly 라이브러리를 로드하는 중입니다.</div>';
    return;
  }
  if (state.analyticsUi.monthly.mode === "multi") {
    const result = buildMonthlyMultiSeries();
    if (!result.series.length) {
      stage.innerHTML = '<div class="empty-state">현재 조건에 맞는 월별 비교 시리즈가 없습니다.</div>';
      return;
    }
    stage.innerHTML = '<div id="monthly-chart"></div>';
    const traces = buildMonthlyMultiTraces(result.series);
    const layout = buildBaseLayout(result.title);
    layout.height = 460;
    layout.xaxis = {
      tickmode: "array",
      tickvals: MONTH_LABELS,
      ticktext: MONTH_LABELS,
      title: "기간",
      gridcolor: "rgba(255,255,255,0.06)",
      zeroline: false,
      fixedrange: true,
    };
    layout.yaxis = {
      title: result.title,
      gridcolor: "rgba(255,255,255,0.06)",
      zeroline: false,
      fixedrange: true,
    };
    addAverageLine(layout, result.series.flatMap((item) => item.y).filter((value) => value != null), "평균");
    void Plotly.newPlot("monthly-chart", traces, layout, plotlyConfig());
    return;
  }

  const left = buildMonthlySingleSeries(state.analyticsUi.monthly.left);
  const right = buildMonthlySingleSeries(state.analyticsUi.monthly.right);
  if (!left.y.length && !right.y.length) {
    stage.innerHTML = '<div class="empty-state">좌우 축 모두 데이터가 없습니다.</div>';
    return;
  }
  stage.innerHTML = '<div id="monthly-chart"></div>';
  const traces = [];
  if (left.y.length) {
    traces.push({
      x: MONTH_LABELS,
      y: left.y,
      name: left.label,
      mode: "lines+markers",
      line: { color: "#4e8cff", width: 2.8 },
      marker: { size: 6, color: "#4e8cff" },
      hovertemplate: "%{x}월 %{y:,.2f}<extra></extra>",
    });
  }
  if (right.y.length) {
    traces.push({
      x: MONTH_LABELS,
      y: right.y,
      name: right.label,
      mode: "lines+markers",
      line: { color: "#ee6c4d", width: 2.8 },
      marker: { size: 6, color: "#ee6c4d" },
      yaxis: "y2",
      hovertemplate: "%{x}월 %{y:,.2f}<extra></extra>",
    });
  }
  const layout = buildBaseLayout("");
  layout.height = 460;
  layout.xaxis = {
    tickmode: "array",
    tickvals: MONTH_LABELS,
    ticktext: MONTH_LABELS,
    title: "기간",
    gridcolor: "rgba(255,255,255,0.06)",
    zeroline: false,
    fixedrange: true,
  };
  layout.yaxis = {
    title: left.title || "",
    titlefont: { color: "#4e8cff" },
    tickfont: { color: "#4e8cff" },
    gridcolor: "rgba(255,255,255,0.06)",
    fixedrange: true,
  };
  layout.yaxis2 = {
    title: right.title || "",
    titlefont: { color: "#ee6c4d" },
    tickfont: { color: "#ee6c4d" },
    overlaying: "y",
    side: "right",
    fixedrange: true,
  };
  addAverageLine(layout, left.y.filter((value) => value != null), "평균(좌)", { axis: "y", x: 0, xanchor: "left" });
  addAverageLine(layout, right.y.filter((value) => value != null), "평균(우)", { axis: "y2", x: 1, xanchor: "right" });
  void Plotly.newPlot("monthly-chart", traces, layout, plotlyConfig());
}

function renderTrendChart() {
  const stage = document.getElementById("trend-chart-stage");
  if (!stage) {
    return;
  }
  if (!window.Plotly) {
    stage.innerHTML = '<div class="loading-state">Plotly 라이브러리를 로드하는 중입니다.</div>';
    return;
  }

  const leftRaw = buildTrendDataset(state.analyticsUi.trend.left);
  const leftPrepared = prepareTrendSeries(leftRaw, state.analyticsUi.trend.leftMethod);
  if (state.analyticsUi.trend.dual) {
    const rightRaw = buildTrendDataset(state.analyticsUi.trend.right);
    const rightPrepared = prepareTrendSeries(rightRaw, state.analyticsUi.trend.rightMethod);
    if (!leftPrepared.points.length && !rightPrepared.points.length) {
      stage.innerHTML = '<div class="empty-state">현재 조건에 맞는 추이 데이터가 없습니다.</div>';
      return;
    }
    stage.innerHTML = '<div id="trend-chart"></div>';
    const traces = [];
    if (leftPrepared.points.length) {
      traces.push({
        x: leftPrepared.points.map((point) => point.date),
        y: leftPrepared.points.map((point) => point.value),
        name: leftRaw.label,
        mode: "lines+markers",
        line: { color: "#4e8cff", width: 2.6 },
        marker: { size: 5, color: "#4e8cff" },
        hovertemplate: "%{x} %{y:,.2f}<extra></extra>",
      });
    }
    if (rightPrepared.points.length) {
      traces.push({
        x: rightPrepared.points.map((point) => point.date),
        y: rightPrepared.points.map((point) => point.value),
        name: rightRaw.label,
        mode: "lines+markers",
        line: { color: "#ee6c4d", width: 2.6 },
        marker: { size: 5, color: "#ee6c4d" },
        yaxis: "y2",
        hovertemplate: "%{x} %{y:,.2f}<extra></extra>",
      });
    }
    const layout = buildBaseLayout("");
    layout.height = 420;
    layout.xaxis = buildTrendXAxis();
    layout.yaxis = {
      title: leftRaw.title,
      titlefont: { color: "#4e8cff" },
      tickfont: { color: "#4e8cff" },
      gridcolor: "rgba(255,255,255,0.06)",
      fixedrange: true,
    };
    layout.yaxis2 = {
      title: rightRaw.title,
      titlefont: { color: "#ee6c4d" },
      tickfont: { color: "#ee6c4d" },
      overlaying: "y",
      side: "right",
      fixedrange: true,
    };
    addAverageLine(layout, leftPrepared.points.map((point) => point.value), "평균(좌)", { axis: "y", x: 0, xanchor: "left" });
    addAverageLine(layout, rightPrepared.points.map((point) => point.value), "평균(우)", { axis: "y2", x: 1, xanchor: "right" });
    void Plotly.newPlot("trend-chart", traces, layout, plotlyConfig());
    return;
  }

  if (!leftPrepared.points.length) {
    stage.innerHTML = '<div class="empty-state">현재 조건에 맞는 추이 데이터가 없습니다.</div>';
    return;
  }
  stage.innerHTML = '<div id="trend-chart"></div>';
  const layout = buildBaseLayout("");
  layout.height = 400;
  layout.xaxis = buildTrendXAxis();
  layout.yaxis = {
    title: leftRaw.title,
    gridcolor: "rgba(255,255,255,0.06)",
    fixedrange: true,
  };
  addAverageLine(layout, leftPrepared.points.map((point) => point.value), "평균");
  void Plotly.newPlot(
    "trend-chart",
    [
      {
        x: leftPrepared.points.map((point) => point.date),
        y: leftPrepared.points.map((point) => point.value),
        name: leftRaw.label,
        mode: "lines+markers",
        line: { color: "#4e8cff", width: 2.8 },
        marker: { size: 5, color: "#4e8cff" },
        fill: "tozeroy",
        fillcolor: "rgba(78, 140, 255, 0.12)",
        hovertemplate: "%{x} %{y:,.2f}<extra></extra>",
      },
    ],
    layout,
    plotlyConfig(),
  );
}

function buildMonthlyMultiSeries() {
  const config = state.analyticsUi.monthly.primary;
  if (config.source === "quarantine") {
    const years = config.quarantine.years.map(Number).sort((a, b) => a - b);
    const yearSet = new Set(years);
    const countrySet = new Set(config.quarantine.countries);
    const itemSet = new Set(config.quarantine.items);
    const grouped = new Map();

    state.analytics.quarantine.rows.forEach((row) => {
      if (row.species !== config.quarantine.species || !yearSet.has(row.year) || !countrySet.has(row.country) || !itemSet.has(row.item)) {
        return;
      }
      const key = [
        row.year,
        row.month,
        config.quarantine.mergeCountries ? "합산" : row.country,
        config.quarantine.mergeItems ? "합산" : row.item,
      ].join("|");
      grouped.set(key, (grouped.get(key) ?? 0) + Number(row.ton || 0));
    });

    const series = [];
    years.forEach((year) => {
      const countries = config.quarantine.mergeCountries ? ["합산"] : config.quarantine.countries;
      const items = config.quarantine.mergeItems ? ["합산"] : config.quarantine.items;
      countries.forEach((country) => {
        items.forEach((item) => {
          const labelParts = [];
          if (!config.quarantine.mergeCountries) {
            labelParts.push(country);
          }
          if (!config.quarantine.mergeItems) {
            labelParts.push(item);
          }
          labelParts.push(String(year));
          const y = MONTH_LABELS.map((_, monthIndex) => grouped.get([year, monthIndex + 1, country, item].join("|")) ?? null);
          series.push({ label: labelParts.join(" / "), y, year });
        });
      });
    });
    return { series, title: "검역량 (톤)" };
  }

  if (config.source === "usda") {
    const years = config.usda.years.map(Number).sort((a, b) => a - b);
    const yearRows = groupUsdaRowsByYear(years);
    const series = [];

    years.forEach((year) => {
      const rows = yearRows.get(year) ?? [];
      if (config.usda.mergeItems) {
        const monthly = buildUsdaMonthlySeries(rows, config.usda.items, "sum", true);
        series.push({ label: `합산 / ${year}`, y: monthly, year });
      } else {
        config.usda.items.forEach((item) => {
          const mode = isUsdaSumItem(item) ? "sum" : "avg";
          const monthly = buildUsdaMonthlySeries(rows, [item], mode, false);
          series.push({ label: `${item} / ${year}`, y: monthly, year });
        });
      }
    });
    const unit = state.analytics.usda.groupUnits[config.usda.group];
    return { series, title: unit ? `${config.usda.group} (${unit})` : config.usda.group };
  }

  const years = config.livestock.years.map(Number).sort((a, b) => a - b);
  const yearSet = new Set(years);
  const countrySet = new Set(config.livestock.countries);
  const grouped = new Map();
  state.analytics.livestock.rows.forEach((row) => {
    if (row.metric !== config.livestock.metric || row.species !== config.livestock.species || !yearSet.has(getYear(row.date)) || !countrySet.has(row.country)) {
      return;
    }
    const key = [
      getYear(row.date),
      getMonth(row.date),
      config.livestock.mergeCountries ? "합산" : row.country,
    ].join("|");
    grouped.set(key, (grouped.get(key) ?? 0) + Number(row.value || 0));
  });
  const series = [];
  years.forEach((year) => {
    const countries = config.livestock.mergeCountries ? ["합산"] : config.livestock.countries;
    countries.forEach((country) => {
      const y = MONTH_LABELS.map((_, index) => grouped.get([year, index + 1, country].join("|")) ?? null);
      series.push({ label: `${country} / ${year}`, y, year });
    });
  });
  return { series, title: `${config.livestock.metric} (${state.analytics.livestock.units[config.livestock.metric]})` };
}

function buildMonthlySingleSeries(config) {
  if (config.source === "quarantine") {
    const monthly = new Map();
    state.analytics.quarantine.rows.forEach((row) => {
      if (
        row.species === config.quarantine.species &&
        row.country === config.quarantine.country &&
        row.item === config.quarantine.item &&
        String(row.year) === String(config.quarantine.year)
      ) {
        monthly.set(row.month, (monthly.get(row.month) ?? 0) + Number(row.ton || 0));
      }
    });
    return {
      label: `${config.quarantine.species} ${config.quarantine.country} ${config.quarantine.item} ${config.quarantine.year}`,
      y: MONTH_LABELS.map((_, index) => monthly.get(index + 1) ?? null),
      title: "검역량 (톤)",
    };
  }

  if (config.source === "usda") {
    const rows = state.analytics.usda.rows.filter((row) => getYear(row.date) === Number(config.usda.year));
    const unit = state.analytics.usda.groupUnits[config.usda.group];
    if (config.usda.mergeItems) {
      return {
        label: `${config.usda.group} 합산 ${config.usda.year}`,
        y: buildUsdaMonthlySeries(rows, config.usda.items, "sum", true),
        title: unit ? `${config.usda.group} (${unit})` : config.usda.group,
      };
    }
    const mode = isUsdaSumItem(config.usda.item) ? "sum" : "avg";
    return {
      label: `${config.usda.item} ${config.usda.year}`,
      y: buildUsdaMonthlySeries(rows, [config.usda.item], mode, false),
      title: unit ? `${config.usda.group} (${unit})` : config.usda.group,
    };
  }

  const grouped = new Map();
  state.analytics.livestock.rows.forEach((row) => {
    if (
      row.metric !== config.livestock.metric ||
      row.species !== config.livestock.species ||
      String(getYear(row.date)) !== String(config.livestock.year)
    ) {
      return;
    }
    if (config.livestock.mergeCountries) {
      if (!config.livestock.countries.includes(row.country)) {
        return;
      }
      grouped.set(getMonth(row.date), (grouped.get(getMonth(row.date)) ?? 0) + Number(row.value || 0));
    } else if (row.country === config.livestock.country) {
      grouped.set(getMonth(row.date), Number(row.value || 0));
    }
  });
  return {
    label: config.livestock.mergeCountries
      ? `${config.livestock.species} ${config.livestock.metric} 합산 ${config.livestock.year}`
      : `${config.livestock.country} ${config.livestock.metric} ${config.livestock.year}`,
    y: MONTH_LABELS.map((_, index) => grouped.get(index + 1) ?? null),
    title: `${config.livestock.metric} (${state.analytics.livestock.units[config.livestock.metric]})`,
  };
}

function buildTrendDataset(config) {
  if (config.source === "quarantine") {
    const points = state.analytics.quarantine.rows
      .filter(
        (row) =>
          row.species === config.quarantine.species &&
          row.country === config.quarantine.country &&
          row.item === config.quarantine.item,
      )
      .map((row) => ({ date: row.period, value: Number(row.ton || 0) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return {
      source: "quarantine",
      itemName: config.quarantine.item,
      title: "검역량 (톤)",
      label: `${config.quarantine.species} ${config.quarantine.country} ${config.quarantine.item}`,
      points,
    };
  }

  if (config.source === "usda") {
    if (config.usda.mergeItems) {
      const points = state.analytics.usda.rows
        .map((row) => {
          const values = config.usda.items.map((item) => row[item]).filter((value) => value != null);
          if (!values.length) {
            return null;
          }
          return {
            date: row.date,
            value: values.reduce((sum, value) => sum + Number(value), 0),
          };
        })
        .filter(Boolean);
      return {
        source: "usda",
        itemName: "__usda_sum__",
        title: `${config.usda.group} (${state.analytics.usda.groupUnits[config.usda.group]})`,
        label: `${config.usda.group} 합산`,
        points,
      };
    }
    const points = state.analytics.usda.rows
      .filter((row) => row[config.usda.item] != null)
      .map((row) => ({ date: row.date, value: Number(row[config.usda.item]) }));
    return {
      source: "usda",
      itemName: config.usda.item,
      title: `${config.usda.group} (${state.analytics.usda.groupUnits[config.usda.group]})`,
      label: config.usda.item,
      points,
    };
  }

  const pointsMap = new Map();
  state.analytics.livestock.rows.forEach((row) => {
    if (row.metric !== config.livestock.metric || row.species !== config.livestock.species) {
      return;
    }
    if (config.livestock.mergeCountries) {
      if (!config.livestock.countries.includes(row.country)) {
        return;
      }
      pointsMap.set(row.date, (pointsMap.get(row.date) ?? 0) + Number(row.value || 0));
    } else if (row.country === config.livestock.country) {
      pointsMap.set(row.date, Number(row.value || 0));
    }
  });
  const points = [...pointsMap.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    source: "livestock",
    itemName: config.livestock.metric,
    title: `${config.livestock.metric} (${state.analytics.livestock.units[config.livestock.metric]})`,
    label: config.livestock.mergeCountries
      ? `${config.livestock.species} ${config.livestock.metric} 합산`
      : `${config.livestock.country} ${config.livestock.species} ${config.livestock.metric}`,
    points,
  };
}

function prepareTrendSeries(dataset, method) {
  const filtered = filterPointsByPeriod(dataset.points);
  if (state.analyticsUi.trend.agg === "일일") {
    const points = state.analyticsUi.trend.removeWeekends
      ? filtered.filter((point) => {
          const day = parseIsoDate(point.date).getUTCDay();
          return day !== 0 && day !== 6;
        })
      : filtered;
    return { points };
  }
  const points = aggregatePoints(filtered, state.analyticsUi.trend.agg, method);
  return { points };
}

function filterPointsByPeriod(points) {
  const [startDate, endDate] = getTrendDateRange();
  return points.filter((point) => {
    const time = parseIsoDate(point.date).getTime();
    return time >= startDate.getTime() && time <= endDate.getTime();
  });
}

function aggregatePoints(points, agg, method) {
  const buckets = new Map();
  points.forEach((point) => {
    const key = bucketKey(point.date, agg);
    const bucket = buckets.get(key) ?? { sum: 0, count: 0 };
    bucket.sum += Number(point.value);
    bucket.count += 1;
    buckets.set(key, bucket);
  });
  return [...buckets.entries()]
    .map(([date, bucket]) => ({
      date,
      value: method === "평균" ? bucket.sum / bucket.count : bucket.sum,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getTrendDateRange() {
  const endDate = parseIsoDate((state.metadata.generatedAt || new Date().toISOString()).slice(0, 10));
  if (state.analyticsUi.trend.period === "직접 설정") {
    return [parseIsoDate(state.analyticsUi.trend.customStart), parseIsoDate(state.analyticsUi.trend.customEnd)];
  }
  const months = {
    "최근 3개월": 3,
    "최근 1년": 12,
    "최근 5년": 60,
  }[state.analyticsUi.trend.period];
  const start = shiftMonthStart(endDate, months - 1);
  return [start, endDate];
}

function buildUsdaMonthlySeries(rows, items, mode, merged) {
  const months = new Map();
  rows.forEach((row) => {
    const month = getMonth(row.date);
    const stats = months.get(month) ?? { sum: 0, count: 0 };
    if (merged) {
      const values = items.map((item) => row[item]).filter((value) => value != null);
      if (!values.length) {
        return;
      }
      stats.sum += values.reduce((sum, value) => sum + Number(value), 0);
      stats.count += 1;
    } else {
      const value = row[items[0]];
      if (value == null) {
        return;
      }
      stats.sum += Number(value);
      stats.count += 1;
    }
    months.set(month, stats);
  });
  return MONTH_LABELS.map((_, index) => {
    const bucket = months.get(index + 1);
    if (!bucket) {
      return null;
    }
    return mode === "avg" ? bucket.sum / bucket.count : bucket.sum;
  });
}

function buildMonthlyMultiTraces(series) {
  const years = [...new Set(series.map((item) => item.year))].sort((a, b) => a - b);
  const labels = [...new Set(series.map((item) => item.label.replace(/ \/ \d+$/, "")))];
  const colorByYear = buildYearColorMap(years);
  const colorByLabel = Object.fromEntries(labels.map((label, index) => [label, palette(index)]));
  const useLabelColor = labels.length > 1;
  const traces = [];

  series.forEach((item, index) => {
    const label = item.label.replace(/ \/ \d+$/, "");
    const color = useLabelColor ? colorByLabel[label] : colorByYear[item.year];
    const width = item.year === Math.max(...years) ? 3 : item.year === Math.max(...years) - 1 ? 2.4 : 1.8;
    const opacity = item.year === Math.max(...years) ? 1 : item.year === Math.max(...years) - 1 ? 0.82 : 0.52;
    traces.push({
      x: MONTH_LABELS,
      y: item.y,
      name: item.label,
      mode: item.year === Math.max(...years) ? "lines+markers+text" : "lines+markers",
      text: item.year === Math.max(...years) ? item.y.map((value) => (value != null ? formatCompact(value) : "")) : [],
      textposition: "top center",
      textfont: { size: 10, color },
      line: { color, width, dash: useLabelColor ? dashByYear(item.year, years) : "solid" },
      marker: { size: item.year === Math.max(...years) ? 6 : 4, color },
      opacity,
      hovertemplate: "%{x}월 %{y:,.2f}<extra></extra>",
    });
  });
  return traces;
}

function buildBaseLayout(yTitle) {
  return {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(255,255,255,0.015)",
    hovermode: "x unified",
    font: { family: '"Noto Sans KR", sans-serif', color: "#e7edf6", size: 12 },
    margin: { l: 56, r: 32, t: 26, b: 58 },
    legend: {
      orientation: "h",
      y: 1.18,
      x: 0,
      font: { size: 11 },
    },
    title: { text: yTitle ? `<b>${escapeHtml(yTitle)}</b>` : "" },
    shapes: [],
    annotations: [],
  };
}

function buildTrendXAxis() {
  const axis = {
    type: "date",
    title: state.analyticsUi.trend.agg === "일일" ? "날짜 (YY.MM.DD)" : "날짜 (YY.MM)",
    tickformat: state.analyticsUi.trend.agg === "일일" ? "%y.%m.%d" : "%y.%m",
    gridcolor: "rgba(255,255,255,0.06)",
    zeroline: false,
    fixedrange: true,
  };
  if (state.analyticsUi.trend.agg === "일일" && state.analyticsUi.trend.removeWeekends) {
    axis.rangebreaks = [{ bounds: ["sat", "mon"] }];
  }
  return axis;
}

function addAverageLine(layout, values, label, options = {}) {
  if (!values.length) {
    return;
  }
  const avg = values.reduce((sum, value) => sum + Number(value), 0) / values.length;
  const axis = options.axis ?? "y";
  const x = options.x ?? 1;
  const xanchor = options.xanchor ?? "right";
  layout.shapes.push({
    type: "line",
    xref: "paper",
    x0: 0,
    x1: 1,
    yref: axis,
    y0: avg,
    y1: avg,
    line: {
      color: "rgba(255,255,255,0.35)",
      width: 1.4,
      dash: axis === "y2" ? "dot" : "dash",
    },
  });
  layout.annotations.push({
    xref: "paper",
    x,
    xanchor,
    yref: axis,
    y: avg,
    yshift: -8,
    showarrow: false,
    font: { size: 10, color: "#9db0c9" },
    text: `${label} ${formatCompact(avg)}`,
  });
}

function renderChecklist({ title, path, options, selected, compact = false }) {
  return `
    <div class="checklist">
      <div class="field__label">${escapeHtml(title)}</div>
      <div class="checklist__panel ${compact ? "checklist__panel--compact" : ""}">
        ${options
          .map((option) => {
            const value = typeof option === "string" ? option : option.value;
            const label = typeof option === "string" ? option : option.label;
            return `
              <label class="checklist__option">
                <input
                  type="checkbox"
                  data-action="toggle-array-item"
                  data-path="${escapeAttribute(path)}"
                  data-value="${escapeAttribute(value)}"
                  ${selected.includes(value) ? "checked" : ""}
                >
                <span>${escapeHtml(label)}</span>
              </label>
            `;
          })
          .join("")}
      </div>
      <div class="checklist__note">${selected.length ? `${selected.length}개 선택` : "전체 선택 상태"}</div>
    </div>
  `;
}

function renderSelectField(title, path, value, options) {
  const mapped = options.map((option) => (typeof option === "string" ? { value: option, label: option } : option));
  return `
    <div class="field">
      <label class="field__label">${escapeHtml(title)}</label>
      <select data-action="set-value" data-path="${escapeAttribute(path)}">
        ${mapped
          .map(
            (option) => `
              <option value="${escapeAttribute(option.value)}" ${String(option.value) === String(value) ? "selected" : ""}>
                ${escapeHtml(option.label)}
              </option>
            `,
          )
          .join("")}
      </select>
    </div>
  `;
}

function renderDateField(title, path, value) {
  return `
    <div class="field">
      <label class="field__label">${escapeHtml(title)}</label>
      <input type="date" data-action="set-value" data-path="${escapeAttribute(path)}" value="${escapeAttribute(value)}">
    </div>
  `;
}

function renderMethodField(title, path, value) {
  return `
    <div class="field">
      <span class="field__label">${escapeHtml(title)}</span>
      <div class="segmented">
        ${["합계", "평균"]
          .map(
            (option) => `
              <button
                class="segmented__button ${value === option ? "is-active" : ""}"
                type="button"
                data-action="set-value"
                data-path="${escapeAttribute(path)}"
                data-value="${escapeAttribute(option)}"
              >
                ${escapeHtml(option)}
              </button>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderErrorCard(title, message) {
  return `
    <div class="empty-state">
      <strong>${escapeHtml(title)}</strong><br>${escapeHtml(message)}
    </div>
  `;
}

function renderFatal(error) {
  refs.panels.overview.innerHTML = renderErrorCard("페이지 초기화 실패", error.message);
}

function handleAction(event) {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) {
    return;
  }

  const { action, path, value, tab, rowId, text } = actionTarget.dataset;

  if (action === "set-tab") {
    state.tab = tab;
    render();
    return;
  }

  if (action === "reset-inventory") {
    state.inventoryUi = {
      query: "",
      onlyInStock: false,
      warehouses: [],
      brands: [],
      selectedId: state.inventory.rows[0]?.id ?? null,
    };
    renderInventoryPanel();
    return;
  }

  if (action === "select-inventory-row") {
    state.inventoryUi.selectedId = Number(rowId);
    renderInventoryPanel();
    return;
  }

  if (action === "copy-text") {
    void copyToClipboard(decodeURIComponent(text || ""));
    return;
  }

  if (action === "set-value" && event.type === "click" && actionTarget.tagName === "BUTTON") {
    setByPath(state, path, value);
    postUpdate(path);
    return;
  }
}

function handleInputChange(event) {
  const target = event.target;
  if (!target.matches("[data-action]")) {
    return;
  }

  const { action, path, value } = target.dataset;
  if (action === "set-value") {
    if (target.id) {
      state.focusRestore = {
        id: target.id,
        start: target.selectionStart ?? null,
        end: target.selectionEnd ?? null,
      };
    }
    setByPath(state, path, target.value);
    postUpdate(path);
  } else if (action === "set-bool") {
    state.focusRestore = null;
    setByPath(state, path, target.checked);
    postUpdate(path);
  } else if (action === "toggle-array-item") {
    state.focusRestore = null;
    toggleArrayItem(path, value, target.checked);
    postUpdate(path);
  }
}

function postUpdate(path) {
  if (path.startsWith("analyticsUi")) {
    normalizeAnalyticsUi();
    renderAnalyticsPanel();
    return;
  }
  if (path.startsWith("inventoryUi")) {
    renderInventoryPanel();
  }
}

function createAnalyticsUiState() {
  return {
    monthly: {
      mode: "multi",
      primary: createMonthlyMultiConfig(),
      left: createMonthlySingleConfig("quarantine"),
      right: createMonthlySingleConfig("usda"),
    },
    trend: {
      period: "최근 1년",
      customStart: shiftMonthStart(parseIsoDate((state.metadata.generatedAt || new Date().toISOString()).slice(0, 10)), 24).toISOString().slice(0, 10),
      customEnd: (state.metadata.generatedAt || new Date().toISOString()).slice(0, 10),
      dual: false,
      agg: "월평균",
      removeWeekends: false,
      leftMethod: "합계",
      rightMethod: "평균",
      left: createTrendConfig("quarantine"),
      right: createTrendConfig("usda"),
    },
  };
}

function createMonthlyMultiConfig() {
  const qSpecies = ensureValue(DEFAULTS.monthly.species, state.analyticsLookups.quarantine.species);
  const qLookup = state.analyticsLookups.quarantine.bySpecies[qSpecies];
  const lLookup = state.analyticsLookups.livestock.byMetricSpecies["도축두수|소"];
  return {
    source: "quarantine",
    quarantine: {
      species: qSpecies,
      years: qLookup.years.slice(0, 5).map(String),
      countries: ensureMany([DEFAULTS.monthly.country], qLookup.countries),
      mergeCountries: false,
      items: ensureMany([DEFAULTS.monthly.item], qLookup.items),
      mergeItems: false,
    },
    usda: {
      group: "도축두수",
      years: state.analyticsLookups.usda.years.slice(0, 3).map(String),
      items: ensureMany([state.analytics.usda.groups["도축두수"][0]], state.analytics.usda.groups["도축두수"]),
      mergeItems: false,
    },
    livestock: {
      metric: "도축두수",
      species: "소",
      years: lLookup.years.slice(0, 5).map(String),
      countries: ensureMany(lLookup.countries, lLookup.countries),
      mergeCountries: false,
    },
  };
}

function createMonthlySingleConfig(source) {
  const qSpecies = ensureValue(DEFAULTS.monthly.species, state.analyticsLookups.quarantine.species);
  const qLookup = state.analyticsLookups.quarantine.bySpecies[qSpecies];
  const lLookup = state.analyticsLookups.livestock.byMetricSpecies["도축두수|소"];
  return {
    source,
    quarantine: {
      species: qSpecies,
      country: ensureValue(DEFAULTS.monthly.country, qLookup.countries),
      item: ensureValue(DEFAULTS.monthly.item, qLookup.items),
      year: String(qLookup.years[0] ?? ""),
    },
    usda: {
      group: "도축두수",
      year: String(state.analyticsLookups.usda.years[0] ?? ""),
      item: state.analytics.usda.groups["도축두수"][0],
      mergeItems: false,
      items: state.analytics.usda.groups["도축두수"].slice(0, 2),
    },
    livestock: {
      metric: "도축두수",
      species: "소",
      year: String(lLookup.years[0] ?? ""),
      country: ensureValue("미국", lLookup.countries),
      mergeCountries: false,
      countries: lLookup.countries.slice(),
    },
  };
}

function createTrendConfig(source) {
  const qSpecies = ensureValue(DEFAULTS.trend.species, state.analyticsLookups.quarantine.species);
  const qLookup = state.analyticsLookups.quarantine.bySpecies[qSpecies];
  const lLookup = state.analyticsLookups.livestock.byMetricSpecies["도축두수|소"];
  return {
    source,
    quarantine: {
      species: qSpecies,
      country: ensureValue(DEFAULTS.trend.country, qLookup.countries),
      item: ensureValue(DEFAULTS.trend.item, qLookup.items),
    },
    usda: {
      group: "도축두수",
      item: state.analytics.usda.groups["도축두수"][0],
      mergeItems: false,
      items: state.analytics.usda.groups["도축두수"].slice(),
    },
    livestock: {
      metric: "도축두수",
      species: "소",
      country: ensureValue("미국", lLookup.countries),
      mergeCountries: false,
      countries: lLookup.countries.slice(),
    },
  };
}

function normalizeAnalyticsUi() {
  normalizeMonthlyMultiConfig(state.analyticsUi.monthly.primary);
  normalizeMonthlySingleConfig(state.analyticsUi.monthly.left);
  normalizeMonthlySingleConfig(state.analyticsUi.monthly.right);
  normalizeTrendConfig(state.analyticsUi.trend.left);
  normalizeTrendConfig(state.analyticsUi.trend.right);

  if (!getAllowedTrendAggs().includes(state.analyticsUi.trend.agg)) {
    state.analyticsUi.trend.agg = "월평균";
    state.analyticsUi.trend.removeWeekends = false;
  }
  if (state.analyticsUi.trend.period === "직접 설정") {
    if (!state.analyticsUi.trend.customStart) {
      state.analyticsUi.trend.customStart = shiftMonthStart(parseIsoDate(state.analyticsUi.trend.customEnd), 24).toISOString().slice(0, 10);
    }
    if (!state.analyticsUi.trend.customEnd) {
      state.analyticsUi.trend.customEnd = (state.metadata.generatedAt || new Date().toISOString()).slice(0, 10);
    }
  }
}

function normalizeMonthlyMultiConfig(config) {
  config.source = ensureValue(config.source, ["quarantine", "usda", "livestock"]);

  config.quarantine.species = ensureValue(config.quarantine.species, state.analyticsLookups.quarantine.species);
  const qLookup = state.analyticsLookups.quarantine.bySpecies[config.quarantine.species];
  config.quarantine.years = ensureMany(config.quarantine.years, qLookup.years.map(String), qLookup.years.slice(0, 5).map(String));
  config.quarantine.countries = ensureMany(config.quarantine.countries, qLookup.countries, [ensureValue(DEFAULTS.monthly.country, qLookup.countries)]);
  config.quarantine.items = ensureMany(config.quarantine.items, qLookup.items, [ensureValue(DEFAULTS.monthly.item, qLookup.items)]);

  config.usda.group = ensureValue(config.usda.group, Object.keys(state.analytics.usda.groups));
  const usdaItems = state.analytics.usda.groups[config.usda.group] ?? [];
  config.usda.years = ensureMany(config.usda.years, state.analyticsLookups.usda.years.map(String), state.analyticsLookups.usda.years.slice(0, 3).map(String));
  config.usda.items = ensureMany(config.usda.items, usdaItems, [usdaItems[0]]);
  if (!state.analytics.usda.mergeableGroups.includes(config.usda.group)) {
    config.usda.mergeItems = false;
  }

  config.livestock.metric = ensureValue(config.livestock.metric, state.analytics.livestock.metrics);
  config.livestock.species = ensureValue(config.livestock.species, state.analytics.livestock.species);
  const lLookup = state.analyticsLookups.livestock.byMetricSpecies[`${config.livestock.metric}|${config.livestock.species}`];
  config.livestock.years = ensureMany(config.livestock.years, lLookup.years.map(String), lLookup.years.slice(0, 5).map(String));
  config.livestock.countries = ensureMany(config.livestock.countries, lLookup.countries, lLookup.countries);
  if (!state.analytics.livestock.mergeableMetrics.includes(config.livestock.metric)) {
    config.livestock.mergeCountries = false;
  }
}

function normalizeMonthlySingleConfig(config) {
  config.source = ensureValue(config.source, ["quarantine", "usda", "livestock"]);

  config.quarantine.species = ensureValue(config.quarantine.species, state.analyticsLookups.quarantine.species);
  const qLookup = state.analyticsLookups.quarantine.bySpecies[config.quarantine.species];
  config.quarantine.country = ensureValue(config.quarantine.country, qLookup.countries);
  config.quarantine.item = ensureValue(config.quarantine.item, qLookup.items);
  config.quarantine.year = ensureValue(String(config.quarantine.year), qLookup.years.map(String));

  config.usda.group = ensureValue(config.usda.group, Object.keys(state.analytics.usda.groups));
  const usdaItems = state.analytics.usda.groups[config.usda.group] ?? [];
  config.usda.year = ensureValue(String(config.usda.year), state.analyticsLookups.usda.years.map(String));
  config.usda.item = ensureValue(config.usda.item, usdaItems);
  config.usda.items = ensureMany(config.usda.items, usdaItems, usdaItems);
  if (!state.analytics.usda.mergeableGroups.includes(config.usda.group)) {
    config.usda.mergeItems = false;
  }

  config.livestock.metric = ensureValue(config.livestock.metric, state.analytics.livestock.metrics);
  config.livestock.species = ensureValue(config.livestock.species, state.analytics.livestock.species);
  const lLookup = state.analyticsLookups.livestock.byMetricSpecies[`${config.livestock.metric}|${config.livestock.species}`];
  config.livestock.year = ensureValue(String(config.livestock.year), lLookup.years.map(String));
  config.livestock.country = ensureValue(config.livestock.country, lLookup.countries);
  config.livestock.countries = ensureMany(config.livestock.countries, lLookup.countries, lLookup.countries);
  if (!state.analytics.livestock.mergeableMetrics.includes(config.livestock.metric)) {
    config.livestock.mergeCountries = false;
  }
}

function normalizeTrendConfig(config) {
  config.source = ensureValue(config.source, ["quarantine", "usda", "livestock"]);

  config.quarantine.species = ensureValue(config.quarantine.species, state.analyticsLookups.quarantine.species);
  const qLookup = state.analyticsLookups.quarantine.bySpecies[config.quarantine.species];
  config.quarantine.country = ensureValue(config.quarantine.country, qLookup.countries);
  config.quarantine.item = ensureValue(config.quarantine.item, qLookup.items);

  config.usda.group = ensureValue(config.usda.group, Object.keys(state.analytics.usda.groups));
  const usdaItems = state.analytics.usda.groups[config.usda.group] ?? [];
  config.usda.item = ensureValue(config.usda.item, usdaItems);
  config.usda.items = ensureMany(config.usda.items, usdaItems, usdaItems);
  if (!state.analytics.usda.mergeableGroups.includes(config.usda.group)) {
    config.usda.mergeItems = false;
  }

  config.livestock.metric = ensureValue(config.livestock.metric, state.analytics.livestock.metrics);
  config.livestock.species = ensureValue(config.livestock.species, state.analytics.livestock.species);
  const lLookup = state.analyticsLookups.livestock.byMetricSpecies[`${config.livestock.metric}|${config.livestock.species}`];
  config.livestock.country = ensureValue(config.livestock.country, lLookup.countries);
  config.livestock.countries = ensureMany(config.livestock.countries, lLookup.countries, lLookup.countries);
  if (!state.analytics.livestock.mergeableMetrics.includes(config.livestock.metric)) {
    config.livestock.mergeCountries = false;
  }
}

function buildAnalyticsLookups(data) {
  const quarantine = { species: [], bySpecies: {} };
  const speciesSet = new Set(data.quarantine.rows.map((row) => row.species));
  quarantine.species = [...speciesSet];
  quarantine.species.forEach((species) => {
    const rows = data.quarantine.rows.filter((row) => row.species === species);
    quarantine.bySpecies[species] = {
      years: unique(rows.map((row) => row.year)).sort((a, b) => b - a),
      countries: unique(rows.map((row) => row.country)).sort(koreanSort),
      items: unique(rows.map((row) => row.item)).sort(koreanSort),
    };
  });

  const usda = {
    years: unique(data.usda.rows.map((row) => getYear(row.date))).sort((a, b) => b - a),
  };

  const livestock = { byMetricSpecies: {} };
  data.livestock.metrics.forEach((metric) => {
    data.livestock.species.forEach((species) => {
      const rows = data.livestock.rows.filter((row) => row.metric === metric && row.species === species);
      livestock.byMetricSpecies[`${metric}|${species}`] = {
        years: unique(rows.map((row) => getYear(row.date))).sort((a, b) => b - a),
        countries: unique(rows.map((row) => row.country)).sort(koreanSort),
      };
    });
  });

  return { quarantine, usda, livestock };
}

function getFilteredInventoryRows() {
  const filters = state.inventoryUi;
  const rows = state.inventory.rows.filter((row) => {
    if (filters.onlyInStock && Number(row["재고"] || 0) <= 0) {
      return false;
    }
    if (filters.warehouses.length && !filters.warehouses.includes(row["창고"])) {
      return false;
    }
    if (filters.brands.length && !filters.brands.includes(row["브랜드"])) {
      return false;
    }
    if (filters.query && !matchesInventoryQuery(row.searchText ?? "", filters.query)) {
      return false;
    }
    return true;
  });
  return rows.sort(compareInventoryRows);
}

function matchesInventoryQuery(searchText, query) {
  const text = (searchText || "").toLowerCase();
  const groups = query
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!groups.length) {
    return true;
  }
  return groups.some((group) => {
    const terms = group.split(/\s+/).filter(Boolean);
    return terms.every((term) => {
      if (term.startsWith("!")) {
        return !matchTerm(text, term.slice(1));
      }
      return matchTerm(text, term);
    });
  });
}

function matchTerm(text, term) {
  return expandTerms(term).some((candidate) => {
    if (text.includes(candidate)) {
      return true;
    }
    return /[가-힣]/.test(candidate) && candidate.length >= 4 && text.includes(candidate.slice(0, 2)) && text.includes(candidate.slice(-2));
  });
}

function expandTerms(term) {
  const key = term.toLowerCase().replaceAll(" ", "");
  const normalized = SEARCH_ALIASES[key] ?? term.toLowerCase();
  return [normalized, ...(SEARCH_SYNONYMS[normalized] ?? [])];
}

function compareInventoryRows(left, right) {
  const textColumns = ["품명", "브랜드", "등급", "EST"];
  for (const column of textColumns) {
    const compare = koreanSort(String(left[column] ?? ""), String(right[column] ?? ""));
    if (compare !== 0) {
      return compare;
    }
  }
  const stockDiff = Number(left["재고"] || 0) - Number(right["재고"] || 0);
  if (stockDiff !== 0) {
    return stockDiff;
  }
  const leftDate = left["유통기한_iso"] ? parseIsoDate(left["유통기한_iso"]).getTime() : Number.POSITIVE_INFINITY;
  const rightDate = right["유통기한_iso"] ? parseIsoDate(right["유통기한_iso"]).getTime() : Number.POSITIVE_INFINITY;
  if (leftDate !== rightDate) {
    return leftDate - rightDate;
  }
  return Number(left.id) - Number(right.id);
}

function getExpirationInfo(row) {
  if (row["유통기한_iso"]) {
    const days = dayDiff(parseIsoDate(row["유통기한_iso"]), todayDate());
    const label = formatShortDate(row["유통기한_iso"]);
    return { label, warn: days <= 30, days };
  }
  return { label: row["유통기한"] ?? "", warn: false, days: null };
}

function formatInventoryField(row, field) {
  const value = row[field];
  if (value == null || value === "" || (Number(value) === 0 && !["재고", "당일매출", "예약"].includes(field))) {
    return { text: null, warn: false };
  }
  if (field === "유통기한" || field === "입고일자") {
    const iso = row[`${field}_iso`];
    if (iso) {
      const days = dayDiff(parseIsoDate(iso), todayDate());
      const dateText = formatShortDate(iso);
      const suffix =
        field === "유통기한"
          ? days === 0
            ? " (오늘)"
            : days > 0
              ? ` (${days}일 후)`
              : ` (${Math.abs(days)}일 전 만료)`
          : "";
      return {
        text: `${field === "유통기한" && days <= 30 ? "⚠️ " : ""}${dateText}${suffix}`,
        warn: field === "유통기한" && days <= 30,
      };
    }
  }
  if (typeof value === "number") {
    return { text: formatNumber(value), warn: false };
  }
  return { text: String(value), warn: false };
}

function getAllowedTrendAggs() {
  const sources = [state.analyticsUi.trend.left.source];
  if (state.analyticsUi.trend.dual) {
    sources.push(state.analyticsUi.trend.right.source);
  }
  return sources.every((source) => source === "usda") ? ["일일", "월평균", "분기별", "반기별"] : ["월평균", "분기별", "반기별"];
}

function isUsdaSumItem(item) {
  return item === "__usda_sum__" || state.analytics.usda.groups["도축두수"].includes(item);
}

function groupUsdaRowsByYear(years) {
  const yearSet = new Set(years);
  const grouped = new Map();
  state.analytics.usda.rows.forEach((row) => {
    const year = getYear(row.date);
    if (!yearSet.has(year)) {
      return;
    }
    const list = grouped.get(year) ?? [];
    list.push(row);
    grouped.set(year, list);
  });
  return grouped;
}

function setByPath(root, path, value) {
  const parts = path.split(".");
  let current = root;
  parts.slice(0, -1).forEach((part) => {
    current = current[part];
  });
  current[parts.at(-1)] = value;
}

function getByPath(root, path) {
  return path.split(".").reduce((current, part) => current?.[part], root);
}

function toggleArrayItem(path, value, checked) {
  const list = [...(getByPath(state, path) ?? [])];
  const next = checked ? unique([...list, value]) : list.filter((item) => item !== value);
  setByPath(state, path, next);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast("복사되었습니다.");
}

function showToast(message) {
  refs.toast.textContent = message;
  refs.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => refs.toast.classList.remove("is-visible"), 1800);
}

function restoreFocusIfNeeded() {
  if (!state.focusRestore?.id) {
    return;
  }
  const target = document.getElementById(state.focusRestore.id);
  if (!target) {
    state.focusRestore = null;
    return;
  }
  target.focus();
  if (state.focusRestore.start != null && typeof target.setSelectionRange === "function") {
    target.setSelectionRange(state.focusRestore.start, state.focusRestore.end ?? state.focusRestore.start);
  }
  state.focusRestore = null;
}

function ensureValue(value, options) {
  if (options.includes(value)) {
    return value;
  }
  return options[0] ?? "";
}

function ensureMany(values, options, fallback = []) {
  const filtered = unique(values.filter((value) => options.includes(value)));
  if (filtered.length) {
    return filtered;
  }
  const next = unique(fallback.filter((value) => options.includes(value)));
  return next.length ? next : options.slice(0, Math.min(options.length, 5));
}

function unique(values) {
  return [...new Set(values.filter((value) => value != null && value !== ""))];
}

function palette(index) {
  const colors = ["#5bc0be", "#ee6c4d", "#ffd166", "#4e8cff", "#9c89ff", "#42d392", "#ff8fab", "#8ecae6"];
  return colors[index % colors.length];
}

function buildYearColorMap(years) {
  const maxYear = Math.max(...years);
  const secondYear = [...years].sort((a, b) => b - a)[1];
  const map = {};
  years.forEach((year, index) => {
    if (year === maxYear) {
      map[year] = "#ee6c4d";
    } else if (year === secondYear) {
      map[year] = "#4e8cff";
    } else {
      map[year] = palette(index + 2);
    }
  });
  return map;
}

function dashByYear(year, years) {
  const order = [...years].sort((a, b) => b - a);
  const index = order.indexOf(year);
  return ["solid", "dot", "dash", "dashdot", "longdash"][index] ?? "solid";
}

function plotlyConfig() {
  return {
    responsive: true,
    displayModeBar: false,
  };
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatCompact(value) {
  return Number(value || 0).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

function formatDateTime(value) {
  if (!value) {
    return "n/a";
  }
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatShortDate(isoDate) {
  const date = parseIsoDate(isoDate);
  return `${String(date.getUTCFullYear()).slice(2)}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.${String(date.getUTCDate()).padStart(2, "0")}`;
}

function parseIsoDate(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`);
}

function getYear(isoDate) {
  return parseIsoDate(isoDate).getUTCFullYear();
}

function getMonth(isoDate) {
  return parseIsoDate(isoDate).getUTCMonth() + 1;
}

function bucketKey(isoDate, agg) {
  const date = parseIsoDate(isoDate);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (agg === "월평균") {
    return `${year}-${String(month + 1).padStart(2, "0")}-01`;
  }
  if (agg === "분기별") {
    const quarterMonth = Math.floor(month / 3) * 3;
    return `${year}-${String(quarterMonth + 1).padStart(2, "0")}-01`;
  }
  const halfMonth = month < 6 ? 0 : 6;
  return `${year}-${String(halfMonth + 1).padStart(2, "0")}-01`;
}

function shiftMonthStart(date, monthsBack) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - monthsBack, 1));
}

function todayDate() {
  return parseIsoDate((state.metadata.generatedAt || new Date().toISOString()).slice(0, 10));
}

function dayDiff(later, earlier) {
  return Math.floor((later.getTime() - earlier.getTime()) / 86400000);
}

function koreanSort(left, right) {
  return String(left).localeCompare(String(right), "ko", { sensitivity: "base", numeric: true });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

document.addEventListener("click", handleAction);
document.addEventListener("input", handleInputChange);
document.addEventListener("change", handleInputChange);

void init();
