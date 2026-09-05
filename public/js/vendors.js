window.addEventListener('DOMContentLoaded', async () => {
  const table = document.getElementById('vendorsTable');
  const searchInput = document.getElementById('vendorSearch');

  // TEMPORARY: hardcoded tenant header until real login/session exists,
  // same as public/js/customers.js.
  const tenantHeaders = { 'X-Tenant-Id': '1' };

  const populateTable = (vendors) => {
    table.innerHTML = ''; // Clear table

    if (!Array.isArray(vendors) || vendors.length === 0) {
      const row = table.insertRow();
      const cell = row.insertCell(0);
      cell.colSpan = 5;
      cell.innerText = 'No vendors found';
      cell.className = 'text-center text-gray-500';
      return;
    }

    vendors.forEach(v => {
      const row = table.insertRow();
      row.insertCell(0).innerText = v.vendor_code || '-';
      row.insertCell(1).innerText = v.company_name || '-';
      row.insertCell(2).innerText = `${v.first_name || ''} ${v.last_name || ''}`;
      row.insertCell(3).innerText = v.email || '-';
      row.insertCell(4).innerText = v.status || '-';

      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        window.location.href = `/vendors/${v.vendor_code}/view`;
      });
    });
  };

  try {
    const res = await fetch('/api/v1/vendors', { headers: tenantHeaders });
    const vendors = await res.json();
    populateTable(Array.isArray(vendors) ? vendors : []);
  } catch (err) {
    console.error('Error fetching vendors:', err);
  }

  // Live search
  let timeout = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(timeout);
    const query = searchInput.value.trim();

    timeout = setTimeout(async () => {
      try {
        let url = '/api/v1/vendors';
        if (query) {
          url = `/api/v1/vendors/search?query=${encodeURIComponent(query)}`;
        }
        const res = await fetch(url, { headers: tenantHeaders });
        const vendors = await res.json();
        populateTable(Array.isArray(vendors) ? vendors : []);
      } catch (err) {
        console.error('Vendor search error:', err);
      }
    }, 300);
  });
});
