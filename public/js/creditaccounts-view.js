window.addEventListener('DOMContentLoaded', async () => {
  const accountId = window.__creditAccountId;

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
      superseded: 'bg-purple-100 text-purple-700',
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
      case 'PENALTY_WAIVED':
        return `Penalty waived on installment #${event.event_data.installmentNumber} — ${money(event.event_data.amount)} (${event.event_data.reason})`;
      case 'RESCHEDULED':
        return `Account rescheduled — ${event.event_data.before.installmentCount} remaining installment(s) replaced with ${event.event_data.after.installmentCount} new one(s)`;
      default:
        return event.event_type;
    }
  };

  try {
    const [accountRes, eventsRes, paymentsRes] = await Promise.all([
      fetch(`/api/v1/credit-accounts/${accountId}`),
      fetch(`/api/v1/credit-accounts/${accountId}/events`),
      fetch(`/api/v1/credit-accounts/${accountId}/repayments`),
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
    const nextOpen = schedule.find(s => !['paid', 'waived', 'superseded'].includes(s.due_status));
    document.getElementById('nextDue').innerText = nextOpen ? formatDate(nextOpen.due_date) : '-';
    const daysOverdue = nextOpen ? Number(nextOpen.days_overdue) || 0 : 0;
    const daysOverdueEl = document.getElementById('daysOverdue');
    daysOverdueEl.innerText = daysOverdue > 0 ? daysOverdue : '-';
    if (daysOverdue > 0) daysOverdueEl.classList.add('text-red-600');

    // penalty_due is reduced in place when a waiver is applied, so the
    // schedule row alone can't show "how much was waived" -- derive it from
    // the PENALTY_WAIVED events instead, keyed by installment number.
    const waivedByInstallment = {};
    events.filter(e => e.event_type === 'PENALTY_WAIVED').forEach(e => {
      const n = e.event_data.installmentNumber;
      waivedByInstallment[n] = (waivedByInstallment[n] || 0) + Number(e.event_data.amount);
    });

    const scheduleBody = document.getElementById('scheduleBody');
    scheduleBody.innerHTML = '';
    schedule.forEach(line => {
      const paid = Number(line.principal_paid) + Number(line.markup_paid) + Number(line.penalty_paid);
      const due = Number(line.principal_due) + Number(line.markup_due) + Number(line.penalty_due);
      const remaining = Math.max(0, due - paid);
      const outstandingPenalty = Math.max(0, Number(line.penalty_due) - Number(line.penalty_paid));
      const row = scheduleBody.insertRow();
      const PAD = 'px-4 py-2';
      row.insertCell(0).innerText = line.installment_number; row.cells[0].className = PAD;
      row.insertCell(1).innerText = formatDate(line.due_date); row.cells[1].className = PAD;
      row.insertCell(2).innerText = money(line.principal_due); row.cells[2].className = `${PAD} text-right`;
      row.insertCell(3).innerText = money(line.markup_due); row.cells[3].className = `${PAD} text-right`;
      const penaltyCell = row.insertCell(4); penaltyCell.className = `${PAD} text-right`;
      const waivedAmount = waivedByInstallment[line.installment_number];
      penaltyCell.innerHTML = waivedAmount
        ? `${money(line.penalty_due)} <span class="text-xs text-purple-600 block">(${money(waivedAmount)} waived)</span>`
        : money(line.penalty_due);
      row.insertCell(5).innerText = money(paid); row.cells[5].className = `${PAD} text-right`;
      row.insertCell(6).innerText = money(remaining); row.cells[6].className = `${PAD} text-right`;
      const statusCell = row.insertCell(7); statusCell.innerHTML = dueStatusBadge(line.due_status); statusCell.className = PAD;

      const actionsCell = row.insertCell(8); actionsCell.className = PAD;
      if (window.__canManageAccount && outstandingPenalty > 0 && line.due_status !== 'superseded') {
        const waiveLink = document.createElement('button');
        waiveLink.innerText = 'Waive';
        waiveLink.className = 'text-blue-600 hover:underline text-xs';
        waiveLink.addEventListener('click', () => openWaiveModal(line, outstandingPenalty));
        actionsCell.appendChild(waiveLink);
      }
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

    const waivePenaltyBtn = document.getElementById('waivePenaltyBtn');
    if (waivePenaltyBtn) {
      waivePenaltyBtn.addEventListener('click', () => {
        document.getElementById('scheduleBody').closest('.bg-white').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    const sendReminderBtn = document.getElementById('sendReminderBtn');
    if (sendReminderBtn) {
      sendReminderBtn.addEventListener('click', async () => {
        sendReminderBtn.disabled = true;
        sendReminderBtn.innerText = 'Sending...';
        try {
          const sendRes = await fetch(`/api/v1/credit-accounts/${accountId}/send-reminder`, { method: 'POST' });
          const body = await sendRes.json();
          if (!sendRes.ok) {
            showError(body.message || 'Could not send reminder.');
            return;
          }
          window.location.reload();
        } catch (err) {
          showError('Could not send reminder.');
        } finally {
          sendReminderBtn.disabled = false;
          sendReminderBtn.innerText = 'Send Reminder';
        }
      });
    }
  } catch (err) {
    console.error('Error loading credit account:', err);
    showError('Could not load credit account.');
  }

  // ---- Waive Penalty modal ----
  const waiveModal = document.getElementById('waivePenaltyModal');
  const waiveModalError = document.getElementById('waiveModalError');
  let waivingScheduleId = null;

  const openWaiveModal = (line, outstandingPenalty) => {
    waivingScheduleId = line.id;
    document.getElementById('waiveInstallmentNumber').innerText = line.installment_number;
    document.getElementById('waiveOutstandingPenalty').innerText = money(outstandingPenalty);
    const amountInput = document.getElementById('waiveAmountInput');
    amountInput.value = outstandingPenalty.toFixed(2);
    amountInput.max = outstandingPenalty.toFixed(2);
    document.getElementById('waiveReasonInput').value = '';
    waiveModalError.classList.add('hidden');
    waiveModal.classList.remove('hidden');
  };

  const closeWaiveModal = () => {
    waiveModal.classList.add('hidden');
    waivingScheduleId = null;
  };

  document.getElementById('waiveCancelBtn').addEventListener('click', closeWaiveModal);

  document.getElementById('waiveConfirmBtn').addEventListener('click', async () => {
    const amount = Number(document.getElementById('waiveAmountInput').value);
    const reason = document.getElementById('waiveReasonInput').value.trim();
    waiveModalError.classList.add('hidden');

    if (!reason) {
      waiveModalError.innerText = 'A reason is required.';
      waiveModalError.classList.remove('hidden');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      waiveModalError.innerText = 'Enter a valid amount greater than zero.';
      waiveModalError.classList.remove('hidden');
      return;
    }

    try {
      const res = await fetch(`/api/v1/credit-accounts/${accountId}/schedule/${waivingScheduleId}/waive-penalty`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, reason }),
      });
      const body = await res.json();
      if (!res.ok) {
        waiveModalError.innerText = body.message || 'Could not waive penalty.';
        waiveModalError.classList.remove('hidden');
        return;
      }
      closeWaiveModal();
      window.location.reload();
    } catch (err) {
      waiveModalError.innerText = 'Could not waive penalty.';
      waiveModalError.classList.remove('hidden');
    }
  });
});
