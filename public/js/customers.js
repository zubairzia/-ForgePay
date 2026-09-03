window.addEventListener('DOMContentLoaded', async () => {
  const table = document.getElementById('customersTable');
  const searchInput = document.getElementById('customerSearch');
  const toast = document.getElementById('customerToast');
  const toastMessage = document.getElementById('customerToastMessage');
  const toastClose = document.getElementById('customerToastClose');

  let toastTimeout = null;
  const showToast = (message) => {
    toastMessage.innerText = message;
    toast.classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.add('hidden'), 6000);
  };
  toastClose.addEventListener('click', () => toast.classList.add('hidden'));

  // Function to populate table
  const populateTable = (customers) => {
    table.innerHTML = ''; // Clear table

    if (customers.length === 0) {
      const row = table.insertRow();
      const cell = row.insertCell(0);
      cell.colSpan = 6;
      cell.innerText = 'No customers found';
      cell.className = 'text-center text-gray-500';
      return;
    }

    customers.forEach(c => {
      const row = table.insertRow();
      const hasId = Boolean(c.customer_code);

      const idCell = row.insertCell(0);
      if (hasId) {
        idCell.innerText = c.customer_code;
      } else {
        idCell.innerHTML = '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">No ID</span>';
      }

      row.insertCell(1).innerText = c.company_name || '-';
      row.insertCell(2).innerText = `${c.first_name || ''} ${c.last_name || ''}`;
      row.insertCell(3).innerText = c.email || '-';
      row.insertCell(4).innerText = c.status || '-';
      row.insertCell(5).innerText = c.created_at || '-';

      if (hasId) {
        // Click row to open customer detail
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
          window.location.href = `/customers/${c.customer_code}/view`;
        });
      } else {
        // Legacy record with no customer_code: nothing to open it by.
        // Keep the user on this page and explain, instead of navigating
        // to a broken URL that 404s.
        row.classList.add('opacity-60');
        row.style.cursor = 'not-allowed';
        row.title = 'This record is missing a customer ID and cannot be opened';
        row.addEventListener('click', () => {
          showToast(
            `"${c.company_name || 'This customer'}" is missing a customer ID and can't be opened. Please contact support to fix this record.`
          );
        });
      }
    });
  };

  // TEMPORARY: hardcoded tenant header until real login/session exists.
  // Once auth is added, drop this — the server should resolve tenant from
  // the authenticated session instead of trusting a client-sent header.
  const tenantHeaders = { 'X-Tenant-Id': '1' };

  // Fetch all customers initially
  try {
    const res = await fetch('/api/v1/customers', { headers: tenantHeaders });
    const customers = await res.json();
    populateTable(Array.isArray(customers) ? customers : []);
  } catch (err) {
    console.error('Error fetching customers:', err);
  }

  // Live search
  let timeout = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(timeout);
    const query = searchInput.value.trim();

    timeout = setTimeout(async () => {
      try {
        let url = '/api/v1/customers';
        if (query) {
        url = `/api/v1/customers/search?query=${encodeURIComponent(query)}`;
        }
        const res = await fetch(url, { headers: tenantHeaders });
        const customers = await res.json();
        populateTable(Array.isArray(customers) ? customers : []);
      } catch (err) {
        console.error('Customer search error:', err);
      }
    }, 300); // debounce 300ms
  });
});