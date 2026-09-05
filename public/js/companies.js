window.addEventListener('DOMContentLoaded', async () => {
  const table = document.getElementById('companiesTable');
  const searchInput = document.getElementById('companySearch');

  // NOTE: no X-Tenant-Id header here, deliberately. Companies are the
  // tenant itself — /api/v1/companies sits outside tenantMiddleware
  // entirely (see routes/index.js), so there's no tenant context to send.
  let allCompanies = [];

  const renderRows = (companies) => {
    table.innerHTML = '';

    if (!Array.isArray(companies) || companies.length === 0) {
      const row = table.insertRow();
      const cell = row.insertCell(0);
      cell.colSpan = 6;
      cell.innerText = 'No companies found';
      cell.className = 'text-center text-gray-500';
      return;
    }

    companies.forEach(company => {
      const row = table.insertRow();
      row.insertCell(0).innerText = company.id;
      row.insertCell(1).innerText = company.name || '-';
      row.insertCell(2).innerText = company.industry || '-';
      row.insertCell(3).innerText = company.country || '-';
      row.insertCell(4).innerText = company.subscription_plan || '-';
      row.insertCell(5).innerText = company.status || '-';

      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        window.location.href = `/companies/${company.id}/view`;
      });
    });
  };

  try {
    const res = await fetch('/api/v1/companies');
    allCompanies = await res.json();
    renderRows(Array.isArray(allCompanies) ? allCompanies : []);
  } catch (err) {
    console.error('Error fetching companies:', err);
  }

  // Client-side filter — no dedicated search endpoint for companies, and
  // the list is expected to stay small (one row per tenant).
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
      renderRows(allCompanies);
      return;
    }
    renderRows(allCompanies.filter(c =>
      (c.name || '').toLowerCase().includes(query) ||
      (c.industry || '').toLowerCase().includes(query) ||
      (c.country || '').toLowerCase().includes(query)
    ));
  });
});
