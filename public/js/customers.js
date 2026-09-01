window.addEventListener('DOMContentLoaded', async () => {
  const table = document.getElementById('customersTable');
  const searchInput = document.getElementById('customerSearch');

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
      row.insertCell(0).innerText = c.customer_code || '-';
      row.insertCell(1).innerText = c.company_name || '-';
      row.insertCell(2).innerText = `${c.first_name || ''} ${c.last_name || ''}`;
      row.insertCell(3).innerText = c.email || '-';
      row.insertCell(4).innerText = c.status || '-';
      row.insertCell(5).innerText = c.created_at || '-';

      // Optional: click row to open customer detail
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        window.location.href = `/customers/${c.customer_code}/view`;
      });
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