document.addEventListener('DOMContentLoaded', async () => {
  // TEMPORARY: hardcoded tenant header until real login/session exists.
  // Once auth is added, drop this — the server should resolve tenant from
  // the authenticated session instead of trusting a client-sent header.
  const tenantHeaders = { 'X-Tenant-Id': '1' };

  const money = (n) =>
    'SAR ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Both sides anchored to UTC-midnight-of-the-calendar-day, not local wall
  // clock time, so this can't be off by one depending on the viewer's
  // timezone — same class of bug as the pg DATE-column fix in db.js.
  const daysBetween = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const due = Date.UTC(y, m - 1, d);
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor((today - due) / (1000 * 60 * 60 * 24));
  };

  let activeBucket = 'overdue';
  let needsAttention = [];

  const renderTabs = () => {
    document.querySelectorAll('.attention-tab').forEach((btn) => {
      const isActive = btn.dataset.bucket === activeBucket;
      btn.className = `attention-tab px-3 py-1.5 text-sm rounded-md border ${
        isActive ? 'bg-gray-900 text-white border-gray-900' : 'text-gray-600 border-gray-300 hover:bg-gray-50'
      }`;
    });
  };

  const renderTable = () => {
    const tbody = document.getElementById('overdue-table');
    const rows = needsAttention.filter((acc) => acc.due_bucket === activeBucket);
    if (rows.length === 0) {
      tbody.innerHTML =
        `<tr><td colspan="5" class="py-6 text-center text-gray-400">Nothing ${activeBucket === 'overdue' ? 'overdue' : activeBucket.replace('_', ' ')} right now</td></tr>`;
      return;
    }
    tbody.innerHTML = rows
      .map((acc) => {
        const late = daysBetween(acc.due_date);
        const lateColor = late > 7 ? 'text-red-600' : 'text-amber-600';
        return `
          <tr class="border-b border-gray-100 hover:bg-gray-50">
            <td class="py-3 text-gray-500">${acc.account_number}</td>
            <td class="py-3">${acc.customer_name || '—'}</td>
            <td class="py-3 text-right">${money(acc.total_due - acc.total_paid)}</td>
            <td class="py-3 text-right ${late > 0 ? lateColor : 'text-gray-400'}">${late > 0 ? late + ' days' : '—'}</td>
            <td class="py-3 text-right space-x-3">
              <a href="/repayments/create?creditAccountId=${acc.credit_account_id}" class="text-blue-600 hover:underline">Record repayment</a>
              <a href="/credit-accounts/${acc.credit_account_id}/view" class="text-gray-500 hover:underline">View schedule</a>
            </td>
          </tr>`;
      })
      .join('');
  };

  document.querySelectorAll('.attention-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeBucket = btn.dataset.bucket;
      renderTabs();
      renderTable();
    });
  });

  try {
    const res = await fetch('/api/v1/dashboard/summary', { headers: tenantHeaders });
    if (!res.ok) throw new Error('Failed to load dashboard summary');
    const data = await res.json();

    document.getElementById('stat-outstanding').textContent = money(data.totalOutstanding);
    document.getElementById('stat-due-today').textContent = money(data.dueToday);
    document.getElementById('stat-overdue').textContent = money(data.overdueAmount);
    document.getElementById('stat-active').textContent = data.activeAccounts ?? 0;

    needsAttention = data.needsAttention || [];
    const overdueCount = needsAttention.filter((acc) => acc.due_bucket === 'overdue').length;

    const badge = document.getElementById('overdue-badge');
    badge.textContent = overdueCount > 0 ? `${overdueCount} overdue` : 'All current';
    if (overdueCount === 0) {
      badge.className = 'text-xs text-green-700 bg-green-50 px-3 py-1 rounded-md';
    }

    renderTabs();
    renderTable();

    const recent = document.getElementById('recent-payments');
    if (!data.recentPayments || data.recentPayments.length === 0) {
      recent.innerHTML = '<p class="text-sm text-gray-400">No repayments recorded yet</p>';
    } else {
      recent.innerHTML = data.recentPayments
        .map(
          (p) => `
          <div class="flex justify-between text-sm py-1.5">
            <span class="text-gray-500">${p.payment_number}</span>
            <span class="text-gray-900">${money(p.amount)}</span>
          </div>`
        )
        .join('');
    }
  } catch (err) {
    console.error('Dashboard load error:', err);
    document.getElementById('overdue-table').innerHTML =
      '<tr><td colspan="5" class="py-4 text-center text-red-500">Couldn\'t load dashboard data</td></tr>';
  }
});
