let token = localStorage.getItem("token")
let chartResumo = null
let chartCategoria = null
let editandoId = null

function formatarMoeda(valor) {
  return "R$ " + Number(valor || 0).toFixed(2).replace(".", ",")
}

function abrirLogin() {
  document.getElementById("landing").style.display = "none"
  document.getElementById("login").style.display = "flex"
}

function mostrarLanding() {
  document.getElementById("landing").style.display = "block"
  document.getElementById("login").style.display = "none"
  document.getElementById("app").style.display = "none"
}

function mostrarLogin() {
  document.getElementById("landing").style.display = "none"
  document.getElementById("login").style.display = "flex"
  document.getElementById("app").style.display = "none"
}

function mostrarApp() {
  document.getElementById("landing").style.display = "none"
  document.getElementById("login").style.display = "none"
  document.getElementById("app").style.display = "flex"
}

function scrollToPlanos() {
  const el = document.getElementById("planos")
  if (el) el.scrollIntoView({ behavior: "smooth" })
}

function limparToken() {
  localStorage.removeItem("token")
  token = null
}

function logout() {
  limparToken()
  location.reload()
}

function obterMesFiltro() {
  return document.getElementById("mesFiltro")?.value || ""
}

function limparFormulario() {
  document.getElementById("descricao").value = ""
  document.getElementById("valor").value = ""
  document.getElementById("tipo").value = "receita"
  document.getElementById("categoria").value = ""
}

function cancelarEdicao() {
  editandoId = null
  document.getElementById("tituloForm").innerText = "Nova transação"
  limparFormulario()
}

function ativarBotaoSidebar(botao) {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"))
  if (botao) botao.classList.add("active")
}

function mostrarSecao(secao, botao = null) {
  document.getElementById("sec-dashboard").style.display = secao === "dashboard" ? "block" : "none"
  document.getElementById("sec-cartoes").style.display = secao === "cartoes" ? "block" : "none"
  document.getElementById("sec-metas").style.display = secao === "metas" ? "block" : "none"
  ativarBotaoSidebar(botao)
}

async function request(url, options = {}) {
  const config = {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: token } : {})
    }
  }

  const response = await fetch(url, config)

  if (response.status === 401) {
    limparToken()
    mostrarLanding()
    throw new Error("Não autenticado")
  }

  return response
}

async function register() {
  const email = document.getElementById("email").value
  const password = document.getElementById("password").value

  const response = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  })

  const data = await response.json()

  if (data.ok) {
    alert("Conta criada com sucesso")
  } else {
    alert(data.erro || "Erro ao criar conta")
  }
}

async function login() {
  const email = document.getElementById("email").value
  const password = document.getElementById("password").value

  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  })

  const data = await response.json()

  if (data.token) {
    localStorage.setItem("token", data.token)
    token = data.token
    mostrarApp()
    await recarregarTudo()
  } else {
    alert(data.erro || "Erro no login")
  }
}

async function carregarConta() {
  const response = await request("/api/me")
  const dados = await response.json()

  const telefone = dados.telefone ? ` • WhatsApp: ${dados.telefone}` : ""
  document.getElementById("planoInfo").innerText = `Plano: ${(dados.plan || "free").toUpperCase()}${telefone}`
}

async function upgradeDemo() {
  const response = await request("/api/upgrade-demo", { method: "POST" })
  const data = await response.json()

  if (data.ok) {
    alert("Plano premium demo ativado")
    await carregarConta()
  } else {
    alert(data.erro || "Erro ao ativar premium")
  }
}

async function salvarTransacao() {
  if (editandoId) {
    await atualizarTransacao()
  } else {
    await addTransacao()
  }
}

async function addTransacao() {
  const descricao = document.getElementById("descricao").value
  const valor = document.getElementById("valor").value
  const tipo = document.getElementById("tipo").value
  const categoria = document.getElementById("categoria").value

  const response = await request("/api/transacoes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ descricao, valor, tipo, categoria })
  })

  const data = await response.json()

  if (data.ok) {
    limparFormulario()
    await recarregarTudo()
  } else {
    alert(data.erro || "Erro ao salvar transação")
  }
}

async function atualizarTransacao() {
  const descricao = document.getElementById("descricao").value
  const valor = document.getElementById("valor").value
  const tipo = document.getElementById("tipo").value
  const categoria = document.getElementById("categoria").value

  const response = await request(`/api/transacoes/${editandoId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ descricao, valor, tipo, categoria })
  })

  const data = await response.json()

  if (data.ok) {
    cancelarEdicao()
    await recarregarTudo()
  } else {
    alert(data.erro || "Erro ao atualizar transação")
  }
}

function editarTransacao(id, descricao, valor, tipo, categoria) {
  editandoId = id
  document.getElementById("tituloForm").innerText = "Editar transação"
  document.getElementById("descricao").value = descricao
  document.getElementById("valor").value = valor
  document.getElementById("tipo").value = tipo
  document.getElementById("categoria").value = categoria || ""
  mostrarSecao("dashboard", document.querySelectorAll(".nav-btn")[0])
  window.scrollTo({ top: 0, behavior: "smooth" })
}

async function deletarTransacao(id) {
  const response = await request(`/api/transacoes/${id}`, {
    method: "DELETE"
  })

  const data = await response.json()

  if (data.ok) {
    await recarregarTudo()
  } else {
    alert(data.erro || "Erro ao excluir transação")
  }
}

async function carregarTransacoes() {
  const mes = obterMesFiltro()
  const url = mes ? `/api/transacoes?mes=${mes}` : "/api/transacoes"

  const response = await request(url)
  const dados = await response.json()

  const lista = document.getElementById("lista")
  lista.innerHTML = ""

  if (!Array.isArray(dados) || dados.length === 0) {
    lista.innerHTML = "<li>Nenhuma transação encontrada</li>"
    return
  }

  dados.forEach(t => {
    const li = document.createElement("li")
    li.className = "item-linha"
    li.innerHTML = `
      <div>
        <strong>${t.descricao}</strong>
        <small>${t.categoria || "-"}</small>
      </div>
      <div class="item-actions">
        <span class="tag ${t.tipo === "receita" ? "receita" : "gasto"}">${formatarMoeda(t.valor)}</span>
        <button class="btn btn-secondary small-btn" onclick='editarTransacao(${t.id}, ${JSON.stringify(t.descricao)}, ${Number(t.valor)}, ${JSON.stringify(t.tipo)}, ${JSON.stringify(t.categoria || "")})'>Editar</button>
        <button class="btn btn-danger small-btn" onclick="deletarTransacao(${t.id})">Excluir</button>
      </div>
    `
    lista.appendChild(li)
  })
}

async function carregarResumo() {
  const mes = obterMesFiltro()
  const url = mes ? `/api/resumo?mes=${mes}` : "/api/resumo"

  const response = await request(url)
  const dados = await response.json()

  document.getElementById("saldoCard").innerText = formatarMoeda(dados.saldo)
  document.getElementById("receitasCard").innerText = formatarMoeda(dados.receitas)
  document.getElementById("despesasCard").innerText = formatarMoeda(dados.gastos)

  desenharGraficoResumo(dados.receitas || 0, dados.gastos || 0)
  desenharGraficoCategoria(dados.categorias || {})
}

function desenharGraficoResumo(receitas, gastos) {
  const ctx = document.getElementById("graficoResumo")

  if (chartResumo) chartResumo.destroy()

  chartResumo = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Receitas", "Despesas"],
      datasets: [{
        data: [receitas, gastos],
        backgroundColor: ["#22C55E", "#EF4444"]
      }]
    }
  })
}

function desenharGraficoCategoria(categorias) {
  const ctx = document.getElementById("graficoCategoria")

  if (chartCategoria) chartCategoria.destroy()

  const labels = Object.keys(categorias)
  const valores = Object.values(categorias)

  chartCategoria = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Gastos por categoria",
        data: valores,
        backgroundColor: "#16A34A"
      }]
    }
  })
}

async function addCartao() {
  const nome = document.getElementById("cartao_nome").value
  const limite = document.getElementById("cartao_limite").value
  const fechamento = document.getElementById("cartao_fechamento").value
  const vencimento = document.getElementById("cartao_vencimento").value

  const response = await request("/api/cartoes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome, limite, fechamento, vencimento })
  })

  const data = await response.json()

  if (data.ok) {
    document.getElementById("cartao_nome").value = ""
    document.getElementById("cartao_limite").value = ""
    document.getElementById("cartao_fechamento").value = ""
    document.getElementById("cartao_vencimento").value = ""
    await carregarCartoes()
  } else {
    alert(data.erro || "Erro ao criar cartão")
  }
}

async function deletarCartao(id) {
  const response = await request(`/api/cartoes/${id}`, {
    method: "DELETE"
  })

  const data = await response.json()

  if (data.ok) {
    await carregarCartoes()
  } else {
    alert(data.erro || "Erro ao excluir cartão")
  }
}

async function carregarCartoes() {
  const response = await request("/api/cartoes")
  const dados = await response.json()

  const lista = document.getElementById("listaCartoes")
  const selectCompra = document.getElementById("cartaoCompraSelect")
  const selectFatura = document.getElementById("cartaoFaturaSelect")

  lista.innerHTML = ""
  selectCompra.innerHTML = ""
  selectFatura.innerHTML = ""

  if (!Array.isArray(dados) || dados.length === 0) {
    lista.innerHTML = "<li>Nenhum cartão cadastrado</li>"
    return
  }

  dados.forEach(c => {
    const li = document.createElement("li")
    li.className = "item-linha"
    li.innerHTML = `
      <div>
        <strong>${c.nome}</strong>
        <small>Fechamento: ${c.fechamento || 10} / Vencimento: ${c.vencimento || 20}</small>
      </div>
      <div class="item-actions">
        <span class="tag neutra">${formatarMoeda(c.limite)}</span>
        <button class="btn btn-danger small-btn" onclick="deletarCartao(${c.id})">Excluir</button>
      </div>
    `
    lista.appendChild(li)

    const optCompra = document.createElement("option")
    optCompra.value = c.id
    optCompra.textContent = c.nome
    selectCompra.appendChild(optCompra)

    const optFatura = document.createElement("option")
    optFatura.value = c.id
    optFatura.textContent = c.nome
    selectFatura.appendChild(optFatura)
  })

  await carregarFatura()
}

async function addCompraCartao() {
  const cartao_id = document.getElementById("cartaoCompraSelect").value
  const descricao = document.getElementById("compra_descricao").value
  const valor_total = document.getElementById("compra_valor").value
  const parcelas = document.getElementById("compra_parcelas").value

  const response = await request("/api/compras-cartao", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cartao_id, descricao, valor_total, parcelas })
  })

  const data = await response.json()

  if (data.ok) {
    document.getElementById("compra_descricao").value = ""
    document.getElementById("compra_valor").value = ""
    document.getElementById("compra_parcelas").value = ""
    await carregarFatura()
  } else {
    alert(data.erro || "Erro ao salvar compra")
  }
}

async function carregarFatura() {
  const cartaoId = document.getElementById("cartaoFaturaSelect").value
  if (!cartaoId) return

  const mes = obterMesFiltro()
  const url = mes ? `/api/fatura/${cartaoId}?mes=${mes}` : `/api/fatura/${cartaoId}`

  const response = await request(url)
  const dados = await response.json()

  const lista = document.getElementById("listaFatura")
  lista.innerHTML = ""

  if (!Array.isArray(dados) || dados.length === 0) {
    lista.innerHTML = "<li>Nenhuma compra encontrada</li>"
    return
  }

  dados.forEach(item => {
    const li = document.createElement("li")
    li.className = "item-linha"
    li.innerHTML = `
      <div>
        <strong>${item.descricao}</strong>
        <small>${item.parcela_atual}/${item.parcelas} parcelas</small>
      </div>
      <div class="item-actions">
        <span class="tag neutra">${formatarMoeda(item.valor_parcela)}</span>
      </div>
    `
    lista.appendChild(li)
  })
}

async function addMeta() {
  const nome = document.getElementById("meta_nome").value
  const valor_meta = document.getElementById("meta_valor_meta").value
  const valor_atual = document.getElementById("meta_valor_atual").value

  const response = await request("/api/metas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome, valor_meta, valor_atual })
  })

  const data = await response.json()

  if (data.ok) {
    document.getElementById("meta_nome").value = ""
    document.getElementById("meta_valor_meta").value = ""
    document.getElementById("meta_valor_atual").value = ""
    await carregarMetas()
  } else {
    alert(data.erro || "Erro ao criar meta")
  }
}

async function deletarMeta(id) {
  const response = await request(`/api/metas/${id}`, {
    method: "DELETE"
  })

  const data = await response.json()

  if (data.ok) {
    await carregarMetas()
  } else {
    alert(data.erro || "Erro ao excluir meta")
  }
}

async function carregarMetas() {
  const response = await request("/api/metas")
  const dados = await response.json()

  const lista = document.getElementById("listaMetas")
  lista.innerHTML = ""

  if (!Array.isArray(dados) || dados.length === 0) {
    lista.innerHTML = "<li>Nenhuma meta cadastrada</li>"
    return
  }

  dados.forEach(meta => {
    const percentual = Math.min(100, ((Number(meta.valor_atual) / Number(meta.valor_meta)) * 100) || 0)

    const li = document.createElement("li")
    li.innerHTML = `
      <div class="meta-item">
        <div class="meta-head">
          <strong>${meta.nome}</strong>
          <button class="btn btn-danger small-btn" onclick="deletarMeta(${meta.id})">Excluir</button>
        </div>
        <small>${formatarMoeda(meta.valor_atual)} de ${formatarMoeda(meta.valor_meta)}</small>
        <div class="barra-meta">
          <div class="barra-meta-fill" style="width:${percentual}%"></div>
        </div>
      </div>
    `
    lista.appendChild(li)
  })
}

function exportarCSV() {
  window.open("/api/export/csv", "_blank")
}

async function recarregarTudo() {
  await carregarConta()
  await carregarTransacoes()
  await carregarResumo()
  await carregarCartoes()
  await carregarMetas()
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {})
  })
}

window.addEventListener("load", async () => {
  if (!token) {
    mostrarLanding()
    return
  }

  try {
    mostrarApp()
    await recarregarTudo()
  } catch {
    mostrarLanding()
  }
})