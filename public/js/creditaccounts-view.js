window.addEventListener('DOMContentLoaded', async () => {
  const accountId = window.__creditAccountId;
  const tenantHeaders = { 'X-Tenant-Id': '1' };

  const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Manual string parsing, not `new Date(dateStr).toLocaleDateString()` —
  // see public/js/creditaccounts.js for why that reintroduces the pg
  // DATE-column timezone-shift bug fixed in db.js.
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}/${year}`;
  };
  const formatDateTime = (isoStr) => {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    return d.toLocaleString('en-US');
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
  const dueStatusBadge = (status) => {
    const colors = {
      upcoming: 'bg-gray-100 text-gray-600',
      due: 'bg-yellow-100 text-yellow-700',
      partial: 'bg-yellow-100 text-yellow-700',
      overdue: 'bg-red-100 text-red-700',
      paid: 'bg-green-100 text-green-700',
      waived: 'bg-gray-100 text-gray-500',
    };
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}">${status}</span>`;
  };

  const loadError = document.getElementById('loadError');
  const showError = (message) => {
    loadError.innerText = message;
    loadError.classList.remove('hidden');
  };

  const eventLabel = (event) => {
    switch (event.event_type) {
      case 'ACCOUNT_OPENED':
        return `Account opened — financed ${money(event.event_data.financedAmount)}, markup ${money(event.event_data.markupAmount)}`;
      case 'STATUS_CHANGED':
        return `Status changed from ${event.event_data.from} to ${event.event_data.to}`;
      case 'PAYMENT_POSTED':
        return `Payment ${event.event_data.paymentNumber} posted — ${money(event.event_data.amount)}`;
      default:
        return event.event_type;
    }
  };

  try {
    const [accountRes, eventsRes, paymentsRes] = await Promise.all([
      fetch(`/api/v1/credit-accounts/${accountId}`, { headers: tenantHeaders }),
      fetch(`/api/v1/credit-accounts/${accountId}/events`, { headers: tenantHeaders }),
      fetch(`/api/v1/credit-accounts/${accountId}/repayments`, { headers: tenantHeaders }),
    ]);

    if (accountRes.status === 404) {
      showError('Credit account not found.');
      return;
    }
    const account = await accountRes.json();
    const events = eventsRes.ok ? await eventsRes.json() : [];
    const payments = paymentsRes.ok ? await paymentsRes.json() : [];

    document.getElementById('recordRepaymentBtn').href = `/repayments/create?creditAccountId=${account.id}`;
    document.getElementById('accountNumber').innerText = account.account_number;
    document.getElementById('statusBadge').innerHTML = statusBadge(account.status);
    document.getElementById('customerName').innerText = account.customer_name || '-';

    const outstanding = Number(account.outstanding_principal) + Number(account.outstanding_markup) + Number(account.outstanding_penalty);
    document.getElementById('outstandingBalance').innerText = money(outstanding);
    document.getElementById('financedTotal').innerText = `${money(account.financed_amount)} / ${money(account.total_payable_amount)}`;

    const schedule = account.repaymentSchedule || [];
    const nextOpen = schedule.find(s => !['paid', 'waived'].includes(s.due_status));
    document.getElementById('nextDue').innerText = nextOpen ? formatDate(nextOpen.due_date) : '-';
    const daysOverdue = nextOpen ? Number(nextOpen.days_overdue) || 0 : 0;
    const daysOverdueEl = document.getElementById('daysOverdue');
    daysOverdueEl.innerText = daysOverdue > 0 ? daysOverdue : '-';
    if (daysOverdue > 0) daysOverdueEl.classList.add('text-red-600');

    const scheduleBody = document.getElementById('scheduleBody');
    scheduleBody.innerHTML = '';
    schedule.forEach(line => {
      const paid = Number(line.principal_paid) + Number(line.markup_paid) + Number(line.penalty_paid);
      const due = Number(line.principal_due) + Number(line.markup_due) + Number(line.penalty_due);
      const remaining = Math.max(0, due - paid);
      const row = scheduleBody.insertRow();
      const PAD = 'px-4 py-2';
      row.insertCell(0).innerText = line.installment_number; row.cells[0].className = PAD;
      row.insertCell(1).innerText = formatDate(line.due_date); row.cells[1].className = PAD;
      row.insertCell(2).innerText = money(line.principal_due); row.cells[2].className = `${PAD} text-right`;
      row.insertCell(3).innerText = money(line.markup_due); row.cells[3].className = `${PAD} text-right`;
      row.insertCell(4).innerText = money(line.penalty_due); row.cells[4].className = `${PAD} text-right`;
      row.insertCell(5).innerText = money(paid); row.cells[5].className = `${PAD} text-right`;
      row.insertCell(6).innerText = money(remaining); row.cells[6].className = `${PAD} text-right`;
      const statusCell = row.insertCell(7); statusCell.innerHTML = dueStatusBadge(line.due_status); statusCell.className = PAD;
    });

    const paymentsList = document.getElementById('paymentsList');
    paymentsList.innerHTML = '';
    if (payments.length === 0) {
      paymentsList.innerHTML = '<div class="text-gray-400 py-4">No payments recorded yet.</div>';
    } else {
      const seen = new Set();
      payments.forEach(p => {
        if (seen.has(p.id)) return;
        seen.add(p.id);
        const row = document.createElement('div');
        row.className = 'py-3 flex justify-between';
        row.innerHTML = `<span>${p.payment_number} <span class="text-gray-400">(${formatDate(p.payment_date)})</span></span><span class="font-medium">${money(p.amount)}</span>`;
        paymentsList.appendChild(row);
      });
    }

    const activityFeed = document.getElementById('activityFeed');
    activityFeed.innerHTML = '';
    if (events.length === 0) {
      activityFeed.innerHTML = '<div class="text-gray-400 py-4">No activity yet.</div>';
    } else {
      events.forEach(e => {
        const row = document.createElement('div');
        row.className = 'py-3';
        row.innerHTML = `<div>${eventLabel(e)}</div><div class="text-xs text-gray-400">${formatDateTime(e.created_at)}</div>`;
        activityFeed.appendChild(row);
      });
    }
  } catch (err) {
    console.error('Error loading credit account:', err);
    showError('Could not load credit account.');
  }
});
