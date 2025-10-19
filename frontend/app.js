const API_BASE = '/api';

let produtos = [];
let vendas = [];
let licitacoes = [];
let chartVendas, chartCategorias;

async function loadData() {
  try {
    const [prodRes, vendRes, licRes] = await Promise.all([
      fetch(`${API_BASE}/produtos`),
      fetch(`${API_BASE}/vendas`),
      fetch(`${API_BASE}/licitacoes`)
    ]);
    produtos = await prodRes.json();
    vendas = await vendRes.json();
    licitacoes = await licRes.json();
    updateProductOptions();
    renderAll();
  } catch (err) {
    console.error('Error loading data:', err);
  }
}

// --- FUNÇÕES DE RENDERIZAÇÃO ---
const formatCurrency = (value) => `R$ ${value.toFixed(2).replace('.', ',')}`;

const renderDashboard = () => {
  const valorEstoque = produtos.reduce((acc, p) => {
    const preco = parseFloat(p.preco);
    const estoque = parseInt(p.estoque);
    if (isNaN(preco) || isNaN(estoque) || preco < 0 || estoque < 0) return acc;
    return acc + (preco * estoque);
  }, 0);
  const receitaTotal = vendas.reduce((acc, v) => {
    const val = parseFloat(v.valor_total);
    return isNaN(val) || val < 0 ? acc : acc + val;
  }, 0);
  const licitacoesAtivas = licitacoes.filter(l => ['Em Aberto', 'Em Análise'].includes(l.status)).length;
  document.getElementById('metric-total-produtos').textContent = produtos.length;
  document.getElementById('metric-valor-estoque').textContent = formatCurrency(valorEstoque);
  document.getElementById('metric-total-vendas').textContent = vendas.length;
  document.getElementById('metric-receita-total').textContent = formatCurrency(receitaTotal);
  document.getElementById('metric-licitacoes-ativas').textContent = licitacoesAtivas;

  // Render chart
   renderChart();
  renderCategoryChart();


  // Render recent sales
  renderRecentSales();
};

const renderChart = () => {
  if (chartVendas) {
    chartVendas.destroy();
  }
  const ctx = document.getElementById('chart-vendas').getContext('2d');
  const vendasPorMes = vendas.reduce((acc, v) => {
    const date = new Date(v.data + 'T00:00:00');
    if (isNaN(date)) return acc;
    const mes = date.toLocaleDateString('pt-BR', { year: 'numeric', month: 'short' });
    const val = parseFloat(v.valor_total);
    if (isNaN(val) || val < 0) return acc;
    acc[mes] = (acc[mes] || 0) + val;
    return acc;
  }, {});
  const labels = Object.keys(vendasPorMes);
  const data = Object.values(vendasPorMes);

  chartVendas = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Receita por Mês',
        data: data,
        backgroundColor: 'rgba(34, 197, 94, 0.6)',
        borderColor: 'rgb(34, 197, 94)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'top',
        },
        title: {
          display: true,
          text: 'Vendas por Mês'
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
};

const renderCategoryChart = () => {
  if (chartCategorias) {
    chartCategorias.destroy();
  }
  const ctx = document.getElementById('chart-categorias').getContext('2d');
  const categorias = produtos.reduce((acc, p) => {
    acc[p.categoria] = (acc[p.categoria] || 0) + 1;
    return acc;
  }, {});
  const labels = Object.keys(categorias);
  const data = Object.values(categorias);

  chartCategorias = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        label: 'Produtos por Categoria',
        data: data,
        backgroundColor: [
          'rgba(54, 162, 235, 0.6)',
          'rgba(255, 99, 132, 0.6)',
          'rgba(255, 206, 86, 0.6)',
          'rgba(75, 192, 192, 0.6)',
          'rgba(153, 102, 255, 0.6)',
          'rgba(255, 159, 64, 0.6)'
        ],
        borderColor: [
          'rgba(54, 162, 235, 1)',
          'rgba(255, 99, 132, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(75, 192, 192, 1)',
          'rgba(153, 102, 255, 1)',
          'rgba(255, 159, 64, 1)'
        ],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'top',
        },
        title: {
          display: true,
          text: 'Produtos por Categoria'
        }
      }
    }
  });
};

const renderProdutos = (filteredProdutos) => {
  const produtosToRender = filteredProdutos || produtos;
  const tbody = document.querySelector('#table-produtos tbody');
  tbody.innerHTML = produtosToRender.length === 0 ? `<tr><td colspan="5" class="px-4 py-8 text-center text-gray-500"><i class="fas fa-box-open text-4xl mb-4 block"></i><p>Nenhum produto encontrado.</p></td></tr>` : produtosToRender.map(p => `
    <tr class="hover:bg-gray-50">
      <td class="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${p.nome}</td>
      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500">${p.categoria}</td>
      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-900">${formatCurrency(parseFloat(p.preco))}</td>
      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500">${p.estoque}</td>
      <td class="px-4 py-4 whitespace-nowrap text-sm font-medium">
        <button onclick="editItem('produto', ${p.id})" class="text-blue-600 hover:text-blue-900 mr-3"><i class="fas fa-edit"></i></button>
        <button onclick="deleteItem('produto', ${p.id})" class="text-red-600 hover:text-red-900"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`).join('');
};

const renderVendas = (filteredVendas) => {
  const vendasToRender = filteredVendas || vendas;
  const tbody = document.querySelector('#table-vendas tbody');
  tbody.innerHTML = vendasToRender.length === 0 ? `<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500"><i class="fas fa-shopping-cart text-4xl mb-4 block"></i><p>Nenhuma venda encontrada.</p></td></tr>` : vendasToRender.map(v => {
    const date = new Date(v.data);
    const formattedDate = isNaN(date) ? 'Data inválida' : date.toLocaleDateString('pt-BR');
    return `
    <tr class="hover:bg-gray-50">
      <td class="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${v.cliente}</td>
      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500">${v.produto_nome || 'Excluído'}</td>
      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500">${v.quantidade}</td>
      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500">${formattedDate}</td>
      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-900">${formatCurrency(parseFloat(v.valor_total))}</td>
      <td class="px-4 py-4 whitespace-nowrap text-sm font-medium">
        <button onclick="editItem('venda', ${v.id})" class="text-blue-600 hover:text-blue-900 mr-3"><i class="fas fa-edit"></i></button>
        <button onclick="deleteItem('venda', ${v.id})" class="text-red-600 hover:text-red-900"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
};

const renderLicitacoes = (filteredLicitacoes) => {
  const licitacoesToRender = filteredLicitacoes || licitacoes;
  const tbody = document.querySelector('#table-licitacoes tbody');
  tbody.innerHTML = licitacoesToRender.length === 0 ? `<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500"><i class="fas fa-gavel text-4xl mb-4 block"></i><p>Nenhuma licitação encontrada.</p></td></tr>` : licitacoesToRender.map(l => {
    const statusColors = { 'Ganha': 'bg-green-100 text-green-800', 'Perdida': 'bg-red-100 text-red-800', 'Em Análise': 'bg-yellow-100 text-yellow-800', 'Em Aberto': 'bg-blue-100 text-blue-800' };
    const dateAbertura = new Date(l.data_abertura);
    const formattedDateAbertura = isNaN(dateAbertura) ? 'Data inválida' : dateAbertura.toLocaleDateString('pt-BR');
    return `<tr class="hover:bg-gray-50">
      <td class="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${l.numero_licitacao}</td>
      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500">${l.orgao_publico}</td>
      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-900">${formatCurrency(parseFloat(l.valor_estimado))}</td>
      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500">${formattedDateAbertura}</td>
      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500"><span class="px-2 py-1 text-xs font-semibold rounded-full ${statusColors[l.status] || ''}">${l.status}</span></td>
      <td class="px-4 py-4 whitespace-nowrap text-sm font-medium">
        <button onclick="editItem('licitacao', ${l.id})" class="text-blue-600 hover:text-blue-900 mr-3"><i class="fas fa-edit"></i></button>
        <button onclick="deleteItem('licitacao', ${l.id})" class="text-red-600 hover:text-red-900"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
};

const renderRecentSales = () => {
  const recentVendas = vendas.sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 5);
  const tbody = document.querySelector('#table-recent-sales tbody');
  tbody.innerHTML = recentVendas.length === 0 ? `<tr><td colspan="4" class="px-4 py-8 text-center text-gray-500"><i class="fas fa-shopping-cart text-4xl mb-4 block"></i><p>Nenhuma venda recente.</p></td></tr>` : recentVendas.map(v => {
    const date = new Date(v.data);
    const formattedDate = isNaN(date) ? 'Data inválida' : date.toLocaleDateString('pt-BR');
    return `
    <tr class="hover:bg-gray-50">
      <td class="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${v.cliente}</td>
      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500">${v.produto_nome || 'Excluído'}</td>
      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500">${formattedDate}</td>
      <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-900">${formatCurrency(parseFloat(v.valor_total))}</td>
    </tr>`;
  }).join('');
};

const updateProductOptions = () => {
  const select = document.querySelector('#modal-vendas select[name="id_produto"]');
  select.innerHTML = `<option value="">Selecione um produto</option>` + produtos.map(p => `<option value="${p.id}">${p.nome} (Estoque: ${p.estoque})</option>`).join('');
};

// --- CONTROLE DE NAVEGAÇÃO, MODAIS E EVENTOS ---
document.addEventListener('DOMContentLoaded', () => {
  const navLinks = document.querySelectorAll('.sidebar-link');
  const sections = document.querySelectorAll('main section');
  const pageTitle = document.getElementById('page-title');
  const pageTitles = {'nav-dashboard': 'Dashboard', 'nav-produtos': 'Catálogo de Produtos', 'nav-vendas': 'Registro de Vendas', 'nav-licitacoes': 'Controle de Licitações'};
  const sidebar = document.getElementById('sidebar');
  const logoContainer = document.getElementById('logo-container');
  const logoImg = logoContainer.querySelector('img');

  const updateLogoStyle = () => {
    if (sidebar.classList.contains('w-64')) {
      logoContainer.classList.remove('p-2');
      logoContainer.classList.add('p-4');
      logoImg.classList.remove('h-10');
      logoImg.classList.add('h-16');
    } else {
      logoContainer.classList.remove('p-4');
      logoContainer.classList.add('p-2');
      logoImg.classList.remove('h-16');
      logoImg.classList.add('h-10');
    }
  };

  navLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      pageTitle.textContent = pageTitles[link.id];
      sections.forEach(s => s.classList.toggle('hidden', s.id !== 'section-' + link.id.split('-')[1]));
    });
  });

  document.getElementById('menu-toggle-btn').addEventListener('click', () => {
    sidebar.classList.toggle('w-64');
    sidebar.classList.toggle('w-20');
    sidebar.querySelectorAll('span, #sidebar-title, #sidebar-footer-text').forEach(el => el.classList.toggle('hidden'));
    sidebar.querySelectorAll('.sidebar-link').forEach(el => el.classList.toggle('justify-center'));
    updateLogoStyle();
  });

  document.getElementById('form-produto').addEventListener('submit', handleProdutoSubmit);
  document.getElementById('form-venda').addEventListener('submit', handleVendaSubmit);
  document.getElementById('form-licitacao').addEventListener('submit', handleLicitacaoSubmit);

  // Add input listeners for clearing errors and real-time validation
  const addInputListeners = (formId) => {
    const form = document.getElementById(formId);
    form.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('input', () => {
        el.classList.remove('input-error', 'input-success');
        const errorDiv = form.querySelector(`#error-${el.name}`);
        if (errorDiv) {
          errorDiv.textContent = '';
          errorDiv.style.display = 'none';
        }
        // Real-time validation
        validateField(el, formId);
      });
      el.addEventListener('blur', () => {
        validateField(el, formId);
      });
    });
  };
  addInputListeners('form-produto');
  addInputListeners('form-venda');
  addInputListeners('form-licitacao');

  document.getElementById('search-produtos').addEventListener('input', handleProdutoFilter);
  document.getElementById('filter-categoria-produtos').addEventListener('change', handleProdutoFilter);
  document.getElementById('search-vendas').addEventListener('input', handleVendaFilter);
  document.getElementById('filter-month-vendas').addEventListener('change', handleVendaFilter);
  document.getElementById('search-licitacoes').addEventListener('input', handleLicitacaoFilter);
  document.getElementById('filter-status-licitacoes').addEventListener('change', handleLicitacaoFilter);


  updateLogoStyle();
  loadData();
});

const openModal = (modalId) => {
  const modal = document.getElementById(modalId);
  if(modalId === 'modal-vendas') updateProductOptions();
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    modal.querySelector('.modal-content').classList.remove('scale-95', 'opacity-0');
  }, 10);
};

const closeModal = (modalId) => {
  const modal = document.getElementById(modalId);
  modal.classList.add('opacity-0');
  modal.querySelector('.modal-content').classList.add('scale-95', 'opacity-0');
  setTimeout(() => {
    modal.classList.add('hidden');
    const form = modal.querySelector('form');
    if (form) {
      form.reset();
      const idInput = form.querySelector('input[name="id"]');
      if (idInput) idInput.value = '';
      // Clear error messages and classes
      form.querySelectorAll('input, select').forEach(el => {
        el.classList.remove('input-error', 'input-success');
      });
      form.querySelectorAll('.error-message').forEach(el => {
        el.textContent = '';
        el.style.display = 'none';
      });
    }
    // Reset modal title for vendas
    if (modalId === 'modal-vendas') {
      document.querySelector('#modal-vendas h3').textContent = 'Registrar Venda';
    }
  }, 300);
};

// --- MANIPULAÇÃO DE DADOS (CRUD) ---
async function handleProdutoSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form).entries());
  data.preco = parseFloat(data.preco);
  data.estoque = parseInt(data.estoque);

  // Client-side validation
  let isValid = true;
  if (!data.nome.trim()) {
    const input = form.querySelector('[name="nome"]');
    input.classList.add('input-error');
    const errorDiv = form.querySelector('#error-nome');
    errorDiv.textContent = 'Nome do produto é obrigatório.';
    errorDiv.style.display = 'block';
    isValid = false;
  }
  if (isNaN(data.preco) || data.preco <= 0) {
    const input = form.querySelector('[name="preco"]');
    input.classList.add('input-error');
    const errorDiv = form.querySelector('#error-preco');
    errorDiv.textContent = 'Preço deve ser um número positivo.';
    errorDiv.style.display = 'block';
    isValid = false;
  }
  if (isNaN(data.estoque) || data.estoque < 0) {
    const input = form.querySelector('[name="estoque"]');
    input.classList.add('input-error');
    const errorDiv = form.querySelector('#error-estoque');
    errorDiv.textContent = 'Estoque deve ser um número não negativo.';
    errorDiv.style.display = 'block';
    isValid = false;
  }
  if (!isValid) return;

  try {
    if (data.id) {
      await fetch(`${API_BASE}/produtos/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } else {
      const res = await fetch(`${API_BASE}/produtos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const newItem = await res.json();
      produtos.push(newItem);
      renderAll();
    }
    await loadData();
    closeModal('modal-produtos');
  } catch (err) {
    console.error(err);
    alert('Erro ao salvar produto');
  }
}

async function handleVendaSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form).entries());
  data.id_produto = parseInt(data.id_produto);
  data.quantidade = parseInt(data.quantidade);

  // Client-side validation
  let isValid = true;
  if (!data.cliente.trim()) {
    const input = form.querySelector('[name="cliente"]');
    input.classList.add('input-error');
    const errorDiv = form.querySelector('#error-cliente');
    errorDiv.textContent = 'Cliente é obrigatório.';
    errorDiv.style.display = 'block';
    isValid = false;
  }
  if (!data.id_produto) {
    const input = form.querySelector('[name="id_produto"]');
    input.classList.add('input-error');
    const errorDiv = form.querySelector('#error-id_produto');
    errorDiv.textContent = 'Selecione um produto.';
    errorDiv.style.display = 'block';
    isValid = false;
  }
  if (isNaN(data.quantidade) || data.quantidade <= 0) {
    const input = form.querySelector('[name="quantidade"]');
    input.classList.add('input-error');
    const errorDiv = form.querySelector('#error-quantidade');
    errorDiv.textContent = 'Quantidade deve ser um número positivo.';
    errorDiv.style.display = 'block';
    isValid = false;
  }
  if (!data.data) {
    const input = form.querySelector('[name="data"]');
    input.classList.add('input-error');
    const errorDiv = form.querySelector('#error-data');
    errorDiv.textContent = 'Data da venda é obrigatória.';
    errorDiv.style.display = 'block';
    isValid = false;
  }
  if (!isValid) return;

  try {
    if (data.id) {
      // Edit
      const res = await fetch(`${API_BASE}/vendas/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.message);
        return;
      }
    } else {
      // Create
      const res = await fetch(`${API_BASE}/vendas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.message);
        return;
      }
      const newItem = await res.json();
      vendas.push(newItem);
    }
    await loadData();
    closeModal('modal-vendas');
  } catch (err) {
    console.error(err);
    alert('Erro ao salvar venda');
  }
}

async function handleLicitacaoSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form).entries());
  data.valor_estimado = parseFloat(data.valor_estimado);

  // Client-side validation
  let isValid = true;
  if (!data.numero_licitacao.trim()) {
    const input = form.querySelector('[name="numero_licitacao"]');
    input.classList.add('input-error');
    const errorDiv = form.querySelector('#error-numero_licitacao');
    errorDiv.textContent = 'Número da licitação é obrigatório.';
    errorDiv.style.display = 'block';
    isValid = false;
  }
  if (!data.orgao_publico.trim()) {
    const input = form.querySelector('[name="orgao_publico"]');
    input.classList.add('input-error');
    const errorDiv = form.querySelector('#error-orgao_publico');
    errorDiv.textContent = 'Órgão público é obrigatório.';
    errorDiv.style.display = 'block';
    isValid = false;
  }
  if (isNaN(data.valor_estimado) || data.valor_estimado <= 0) {
    const input = form.querySelector('[name="valor_estimado"]');
    input.classList.add('input-error');
    const errorDiv = form.querySelector('#error-valor_estimado');
    errorDiv.textContent = 'Valor estimado deve ser um número positivo.';
    errorDiv.style.display = 'block';
    isValid = false;
  }
  if (!data.data_abertura) {
    const input = form.querySelector('[name="data_abertura"]');
    input.classList.add('input-error');
    const errorDiv = form.querySelector('#error-data_abertura');
    errorDiv.textContent = 'Data de abertura é obrigatória.';
    errorDiv.style.display = 'block';
    isValid = false;
  }
  if (!isValid) return;

  try {
    if (data.id) {
      await fetch(`${API_BASE}/licitacoes/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } else {
      const res = await fetch(`${API_BASE}/licitacoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const newItem = await res.json();
      licitacoes.push(newItem);
      renderAll();
    }
    await loadData();
    closeModal('modal-licitacoes');
  } catch (err) {
    console.error(err);
    alert('Erro ao salvar licitação');
  }
}

const editItem = (type, id) => {
  if (type === 'produto') {
    const item = produtos.find(p => p.id === id);
    const form = document.getElementById('form-produto');
    form.querySelector('[name="id"]').value = item.id;
    form.querySelector('[name="nome"]').value = item.nome;
    form.querySelector('[name="categoria"]').value = item.categoria;
    form.querySelector('[name="preco"]').value = item.preco;
    form.querySelector('[name="estoque"]').value = item.estoque;
    openModal('modal-produtos');
  } else if (type === 'venda') {
    const item = vendas.find(v => v.id === id);
    const form = document.getElementById('form-venda');
    form.querySelector('[name="id"]').value = item.id;
    form.querySelector('[name="cliente"]').value = item.cliente;
    form.querySelector('[name="id_produto"]').value = item.id_produto;
    form.querySelector('[name="quantidade"]').value = item.quantidade;
    form.querySelector('[name="data"]').value = item.data;
    // Change modal title
    document.querySelector('#modal-vendas h3').textContent = 'Editar Venda';
    openModal('modal-vendas');
  } else if (type === 'licitacao') {
    const item = licitacoes.find(l => l.id === id);
    const form = document.getElementById('form-licitacao');
    form.querySelector('[name="id"]').value = item.id;
    form.querySelector('[name="numero_licitacao"]').value = item.numero_licitacao;
    form.querySelector('[name="orgao_publico"]').value = item.orgao_publico;
    form.querySelector('[name="valor_estimado"]').value = item.valor_estimado;
    form.querySelector('[name="data_abertura"]').value = item.data_abertura;
    form.querySelector('[name="status"]').value = item.status;
    openModal('modal-licitacoes');
  }
};

const deleteItem = async (type, id) => {
  if (type === 'produto') {
    if (confirm('Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.')) {
      try {
        const res = await fetch(`${API_BASE}/produtos/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const err = await res.json();
          alert(err.message);
          return;
        }
        produtos = produtos.filter(p => p.id !== id);
        renderAll();
        await loadData();
      } catch (err) {
        console.error(err);
        alert('Erro ao excluir');
      }
    }
  } else if (type === 'venda') {
    if (confirm('Tem certeza que deseja excluir esta venda? Esta ação não pode ser desfeita.')) {
      try {
        const res = await fetch(`${API_BASE}/vendas/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const err = await res.json();
          alert(err.message);
          return;
        }
        vendas = vendas.filter(v => v.id !== id);
        renderAll();
        await loadData();
      } catch (err) {
        console.error(err);
        alert('Erro ao excluir');
      }
    }
  } else if (type === 'licitacao') {
    if (confirm('Tem certeza que deseja excluir esta licitação? Esta ação não pode ser desfeita.')) {
      try {
        const res = await fetch(`${API_BASE}/licitacoes/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const err = await res.json();
          alert(err.message);
          return;
        }
        licitacoes = licitacoes.filter(l => l.id !== id);
        renderAll();
        await loadData();
      } catch (err) {
        console.error(err);
        alert('Erro ao excluir');
      }
    }
  }
};

const validateField = (el, formId) => {
  const name = el.name;
  const value = el.value.trim();
  const errorDiv = document.querySelector(`#${formId} #error-${name}`);
  if (!errorDiv) return;

  let isValid = true;
  let message = '';

  switch (name) {
    case 'nome':
      if (!value) {
        message = 'Nome do produto é obrigatório.';
        isValid = false;
      }
      break;
    case 'categoria':
      if (!value) {
        message = 'Categoria é obrigatória.';
        isValid = false;
      }
      break;
    case 'preco':
      const preco = parseFloat(value);
      if (isNaN(preco) || preco <= 0) {
        message = 'Preço deve ser um número positivo.';
        isValid = false;
      }
      break;
    case 'estoque':
      const estoque = parseInt(value);
      if (isNaN(estoque) || estoque < 0) {
        message = 'Estoque deve ser um número não negativo.';
        isValid = false;
      }
      break;
    case 'cliente':
      if (!value) {
        message = 'Cliente é obrigatório.';
        isValid = false;
      }
      break;
    case 'id_produto':
      if (!value) {
        message = 'Selecione um produto.';
        isValid = false;
      }
      break;
    case 'quantidade':
      const quantidade = parseInt(value);
      if (isNaN(quantidade) || quantidade <= 0) {
        message = 'Quantidade deve ser um número positivo.';
        isValid = false;
      }
      break;
    case 'data':
      if (!value) {
        message = 'Data da venda é obrigatória.';
        isValid = false;
      }
      break;
    case 'numero_licitacao':
      if (!value) {
        message = 'Número da licitação é obrigatório.';
        isValid = false;
      }
      break;
    case 'orgao_publico':
      if (!value) {
        message = 'Órgão público é obrigatório.';
        isValid = false;
      }
      break;
    case 'valor_estimado':
      const valor = parseFloat(value);
      if (isNaN(valor) || valor <= 0) {
        message = 'Valor estimado deve ser um número positivo.';
        isValid = false;
      }
      break;
    case 'data_abertura':
      if (!value) {
        message = 'Data de abertura é obrigatória.';
        isValid = false;
      }
      break;
    case 'status':
      if (!value) {
        message = 'Status é obrigatório.';
        isValid = false;
      }
      break;
  }

  if (isValid) {
    el.classList.remove('input-error');
    el.classList.add('input-success');
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';
  } else {
    el.classList.remove('input-success');
    el.classList.add('input-error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }
};

const handleProdutoFilter = () => {
    const searchTerm = document.getElementById('search-produtos').value.toLowerCase();
    const categoria = document.getElementById('filter-categoria-produtos').value;

    const filteredProdutos = produtos.filter(p => {
        const searchMatch = p.nome.toLowerCase().includes(searchTerm);
        const categoriaMatch = categoria ? p.categoria === categoria : true;
        return searchMatch && categoriaMatch;
    });

    renderProdutos(filteredProdutos);
};

const handleVendaFilter = () => {
    const searchTerm = document.getElementById('search-vendas').value.toLowerCase();
    const month = document.getElementById('filter-month-vendas').value;

    const filteredVendas = vendas.filter(v => {
        const searchMatch = v.cliente.toLowerCase().includes(searchTerm);
        const monthMatch = month ? v.data.startsWith(month) : true;
        return searchMatch && monthMatch;
    });

    renderVendas(filteredVendas);
};

const handleLicitacaoFilter = () => {
    const searchTerm = document.getElementById('search-licitacoes').value.toLowerCase();
    const status = document.getElementById('filter-status-licitacoes').value;

    const filteredLicitacoes = licitacoes.filter(l => {
        const searchMatch = l.orgao_publico.toLowerCase().includes(searchTerm);
        const statusMatch = status ? l.status === status : true;
        return searchMatch && statusMatch;
    });

    renderLicitacoes(filteredLicitacoes);
};


const renderAll = () => {
  renderDashboard();
  renderProdutos();
  renderVendas();
  renderLicitacoes();
};
