window.addEventListener('DOMContentLoaded', async () => {
  const table = document.getElementById('creditAccountsTable');

  // TEMPORARY: hardcoded tenant header until real login/session exists,
  // same as public/js/customers.js.
  const tenantHeaders = { 'X-Tenant-Id': '1' };

  const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Formats a plain 'YYYY-MM-DD' date string (what the API now returns for
  // every DATE column) WITHOUT going through `new Date(...)` —
  // constructing a Date from a date-only string parses it as UTC midnight,
  // and .toLocaleDateString() then converts that to the viewer's local
  // timezone, which can silently shift the displayed day backward in
  // negative-UTC-offset timezones. This never leaves the calendar date.
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}/${year}`;
  };

  const statusBadge = (status) => {
    const colors = {
      active: 'bg-blue-100 text-blue-700',
      draft: 'bg-gray-100 text-gray-600',
      closed: 'bg-green-100 text-green-700',
      overdue: 'bg-red-100 text-red-700',
      defaulted: 'bg-red-100 text-red-700',
      cancelled: 'bg-gray-100 text-gray-500',
    };
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}">${status}</span>`;
  };

  const populateTable = (accounts) => {
    table.innerHTML = '';

    if (!Array.isArray(accounts) || accounts.length === 0) {
      const row = table.insertRow();
      const cell = row.insertCell(0);
      cell.colSpan = 7;
      cell.innerText = 'No credit accounts found';
      cell.className = 'text-center text-gray-500 py-8';
      return;
    }

    accounts.forEach(acc => {
      const row = table.insertRow();
      const outstanding = Number(acc.outstanding_principal) + Number(acc.outstanding_markup) + Number(acc.outstanding_penalty);
      const daysOverdue = Number(acc.days_overdue) || 0;
      const PAD = 'px-6 py-4 whitespace-nowrap';

      const accountCell = row.insertCell(0);
      accountCell.innerText = acc.account_number;
      accountCell.className = `${PAD} font-medium text-gray-800`;

      const customerCell = row.insertCell(1);
      customerCell.innerText = acc.customer_name || '-';
      customerCell.className = PAD;

      const financedCell = row.insertCell(2);
      financedCell.innerText = money(acc.financed_amount);
      financedCell.className = `${PAD} text-right`;

      const outstandingCell = row.insertCell(3);
      outstandingCell.innerText = money(outstanding);
      outstandingCell.className = `${PAD} text-right`;

      const nextDueCell = row.insertCell(4);
      nextDueCell.innerText = formatDate(acc.next_due_date);
      nextDueCell.className = PAD;

      const overdueCell = row.insertCell(5);
      overdueCell.innerText = daysOverdue > 0 ? daysOverdue : '-';
      overdueCell.className = `${PAD} text-right ${daysOverdue > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`;

      const statusCell = row.insertCell(6);
      statusCell.innerHTML = statusBadge(acc.status);
      statusCell.className = PAD;

      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        // PENDING: /credit-accounts/:id/view is built in a later phase —
        // this will 404 until then.
        window.location.href = `/credit-accounts/${acc.id}/view`;
      });
    });
  };

  try {
    const res = await fetch('/api/v1/credit-accounts', { headers: tenantHeaders });
    const accounts = await res.json();
    populateTable(Array.isArray(accounts) ? accounts : []);
  } catch (err) {
    console.error('Error fetching credit accounts:', err);
  }
});
