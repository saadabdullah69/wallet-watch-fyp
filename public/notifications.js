/**
 * ==============================================================================
 * Wallet Watch - Notifications & Live Alert Drawer Component
 * ==============================================================================
 * Features:
 *  1. Interactive sliding side-drawer opened by clicking "Unread Signals" badge.
 *  2. Displays all alerts/notifications in chronological order (newest first).
 *  3. Each alert displays:
 *     - Event message
 *     - Event timestamp
 *     - Short transaction ID (e.g. 0x1a17...3efd)
 *     - Glowing dot indicator on unread alerts
 *     - Token and wallet tags with direct market chart shortcut
 *  4. Clicking an alert marks it as read via POST /api/notifications/read,
 *     and automatically decrements the unread badge count.
 *  5. Includes "Mark all read" button (POST /api/notifications/read-all) and
 *     an "Unread only" filter checkbox.
 *  6. Displays "No alerts yet." when there are no alerts present.
 *  7. Closes on click outside the panel, pressing the Esc key, or clicking the close button.
 *  8. Receives real-time live events via Server-Sent Events (GET /api/stream),
 *     automatically prepending new alerts and incrementing the badge counter.
 * ==============================================================================
 */

// Drawer state
export const notifState = {
  drawerAlerts: [],
  currentFilter: "ALL",
  unreadOnly: false,
  isOpen: false
};

/**
 * Format a dollar amount to USD standard
 * @param {number} n
 * @returns {string}
 */
export function formatMoney(n) {
  if (typeof n !== "number" || isNaN(n)) return "$0";
  return "$" + Math.round(n).toLocaleString("en-US");
}

/**
 * Shorten transaction hash for sleek UI display
 * @param {string} tx
 * @returns {string}
 */
export function formatShortTx(tx) {
  if (!tx) return "N/A";
  return tx.length > 12 ? `${tx.slice(0, 6)}…${tx.slice(-4)}` : tx;
}

/**
 * Synchronize notifications from the backend
 * Uses GET /api/notifications
 * @returns {Promise<{items: Array, unread: number}>}
 */
export async function syncNotifications() {
  try {
    const res = await fetch("/api/notifications?limit=200");
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    notifState.drawerAlerts = (data.items || []).sort(
      (a, b) => (b.eventTime || b.createdAt || 0) - (a.eventTime || a.createdAt || 0)
    );
    updateBadge(data.unread ?? 0);
    return data;
  } catch (err) {
    console.error("[Notifications] Fetch failed:", err);
    return { items: notifState.drawerAlerts, unread: 0 };
  }
}

/**
 * Update the header badge counter
 * @param {number} n
 */
export function updateBadge(n) {
  const badge = document.getElementById("badge");
  if (badge) {
    badge.textContent = n;
    badge.classList.toggle("zero", n === 0);
  }
  const kpiSub = document.getElementById("kpiUnreadSub");
  if (kpiSub) {
    kpiSub.textContent = `Unread signals: ${n}`;
  }
}

/**
 * Open the notification drawer panel
 */
export async function openNotificationDrawer() {
  const overlay = document.getElementById("notifDrawerOverlay");
  if (overlay) overlay.classList.add("open");
  notifState.isOpen = true;

  // Bell animation
  const bell = document.querySelector(".bell-icon");
  if (bell) {
    bell.style.animation = "none";
    bell.offsetHeight; // trigger reflow
    bell.style.animation = "bellShake 0.5s ease";
  }

  await syncNotifications();
  renderNotificationDrawer();
}

/**
 * Close the notification drawer panel
 */
export function closeNotificationDrawer() {
  const overlay = document.getElementById("notifDrawerOverlay");
  if (overlay) overlay.classList.remove("open");
  notifState.isOpen = false;
}

/**
 * Set event category filter (ALL, swap, transfer, pool_interaction)
 * @param {string} type
 */
export function setTypeFilter(type) {
  notifState.currentFilter = type;
  document.querySelectorAll("#ndTypePills .notif-type-pill").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.type === type);
  });
  renderNotificationDrawer();
}

/**
 * Render notification items inside the drawer
 */
export function renderNotificationDrawer() {
  const body = document.getElementById("ndBody");
  if (!body) return;
  body.replaceChildren();

  const unreadOnlyCheckbox = document.getElementById("ndUnreadOnly");
  const unreadOnly = unreadOnlyCheckbox ? unreadOnlyCheckbox.checked : false;

  let alerts = [...notifState.drawerAlerts];

  // Ensure sorted newest first
  alerts.sort((a, b) => (b.eventTime || b.createdAt || 0) - (a.eventTime || a.createdAt || 0));

  // Filter by event type
  if (notifState.currentFilter !== "ALL") {
    alerts = alerts.filter(n => n.type === notifState.currentFilter);
  }

  // Filter by unread
  if (unreadOnly) {
    alerts = alerts.filter(n => !n.read);
  }

  // Update header counters
  const unreadCount = notifState.drawerAlerts.filter(n => !n.read).length;
  const unreadBadge = document.getElementById("ndUnreadBadge");
  if (unreadBadge) {
    if (unreadCount > 0) {
      unreadBadge.textContent = `${unreadCount} Unread`;
      unreadBadge.style.display = "";
    } else {
      unreadBadge.style.display = "none";
    }
  }

  const subtitle = document.getElementById("ndSubtitle");
  if (subtitle) {
    subtitle.textContent = `${notifState.drawerAlerts.length} total signals · ${unreadCount} unread`;
  }
  const countLabel = document.getElementById("ndCountLabel");
  if (countLabel) {
    countLabel.textContent = `Showing ${alerts.length} of ${notifState.drawerAlerts.length} signals`;
  }

  // Empty state requirement: "If there are no alerts, show the text 'No alerts yet.'"
  if (!alerts.length) {
    body.innerHTML = `
      <div class="notif-drawer-empty" id="ndEmptyState">
        <div class="nd-empty-icon">🔔</div>
        <p class="nd-empty-text">No alerts yet.</p>
      </div>
    `;
    return;
  }

  // Render alerts list
  alerts.forEach(n => {
    const row = document.createElement("div");
    row.className = "nd-row" + (n.read ? "" : " unread");
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `${n.read ? "Read" : "Unread"} alert: ${n.message}`);

    const typeEmoji = n.type === "swap" ? "⚡" : n.type === "transfer" ? "💸" : "💧";
    const amtClass = n.type === "swap" ? "green" : (n.type === "transfer" ? "blue" : "gold");
    const amtSign = n.type === "swap" ? "+" : "";

    const d = new Date(n.eventTime || n.createdAt || Date.now());
    const timeStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " "
                  + d.toTimeString().slice(0, 8);

    const rawTx = n.txHash || (n.id ? n.id.split(":").pop() : "");
    const shortTx = formatShortTx(rawTx);

    row.innerHTML = `
      <div class="nd-type-icon ${n.type}">${typeEmoji}</div>
      <div class="nd-content">
        <div class="nd-msg-line" style="display:flex;align-items:flex-start;gap:8px">
          ${!n.read ? '<span class="nd-unread-dot" title="Unread alert"></span>' : ''}
          <div class="nd-msg" style="flex:1">${n.message}</div>
        </div>
        <div class="nd-meta">
          <span class="nd-amount ${amtClass}">${amtSign}${formatMoney(n.amountUsd)}</span>
          <span class="nd-token-chip">${n.token || "Asset"}</span>
          <span class="nd-wallet-chip">[${n.label}]</span>
          <span class="nd-time">${timeStr}</span>
          <span class="nd-tx-id" title="Transaction ID: ${rawTx}">Tx: ${shortTx}</span>
        </div>
        <div class="nd-actions">
          <button type="button" class="nd-btn-chart" onclick="event.stopPropagation(); window.openMarketChart && window.openMarketChart('${n.token || "WETH"}');">
            📈 View ${n.token || "Chart"}
          </button>
          ${rawTx ? `<a class="nd-btn-tx" href="https://etherscan.io/tx/${rawTx}" target="_blank" rel="noreferrer" onclick="event.stopPropagation()" title="Open on Etherscan">Tx: ${shortTx} ↗</a>` : ''}
          ${!n.read ? `<button type="button" class="nd-btn-chart" style="background:rgba(16,185,129,0.12);border-color:rgba(16,185,129,0.35);color:var(--trade-green)" onclick="event.stopPropagation(); window.markSingleAlertRead('${n.id}', this.closest('.nd-row'))">✓ Mark Read</button>` : ''}
        </div>
      </div>
    `;

    // Click alert row marks it as read
    const onRowClick = async () => {
      if (!n.read) {
        await markSingleAlertRead(n.id, row);
      }
    };
    row.addEventListener("click", onRowClick);
    row.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onRowClick();
      }
    });

    body.append(row);
  });
}

/**
 * Mark a single alert as read
 * POST /api/notifications/read
 * @param {string} id
 * @param {HTMLElement} [rowEl]
 */
export async function markSingleAlertRead(id, rowEl) {
  try {
    const res = await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    const item = notifState.drawerAlerts.find(a => a.id === id);
    if (item) item.read = true;
    updateBadge(data.unread);

    if (rowEl) {
      rowEl.classList.remove("unread");
      const dot = rowEl.querySelector(".nd-unread-dot");
      if (dot) dot.remove();
    }
    renderNotificationDrawer();
  } catch (err) {
    console.error("[Notifications] Mark read failed:", err);
  }
}

/**
 * Mark all alerts as read
 * POST /api/notifications/read-all
 */
export async function markAllAlertsRead() {
  try {
    const res = await fetch("/api/notifications/read-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    const data = await res.json();
    notifState.drawerAlerts.forEach(a => { a.read = true; });
    updateBadge(data.unread ?? 0);
    renderNotificationDrawer();
  } catch (err) {
    console.error("[Notifications] Mark all read failed:", err);
  }
}

/**
 * Handle new live notification from Server-Sent Events (SSE)
 * @param {object} notif
 */
export function handleLiveNotification(notif) {
  // Prepend to alerts list (newest first)
  if (!notifState.drawerAlerts.some(a => a.id === notif.id)) {
    notifState.drawerAlerts.unshift(notif);
  }
  // Increment unread badge
  const unreadCount = notifState.drawerAlerts.filter(a => !a.read).length;
  updateBadge(unreadCount);

  // If drawer is open, re-render immediately
  if (notifState.isOpen) {
    renderNotificationDrawer();
  }
}

// Global exposure for non-module contexts
if (typeof window !== "undefined") {
  window.openNotificationDrawer = openNotificationDrawer;
  window.closeNotificationDrawer = closeNotificationDrawer;
  window.markSingleAlertRead = markSingleAlertRead;
  window.markAllAlertsRead = markAllAlertsRead;
  window.setTypeFilter = setTypeFilter;
  window.renderNotificationDrawer = renderNotificationDrawer;

  // Convenient aliases matching inline script conventions
  window.openNotifDrawer = openNotificationDrawer;
  window.closeNotifDrawer = closeNotificationDrawer;
  window.ndMarkOneRead = markSingleAlertRead;
  window.ndMarkAllRead = markAllAlertsRead;
  window.setNdFilter = setTypeFilter;
  window.renderNotifDrawer = renderNotificationDrawer;
}
