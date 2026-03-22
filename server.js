const express = require("express")
const sqlite3 = require("sqlite3").verbose()
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const path = require("path")
const whatsappRouter = require("./whatsapp")

const app = express()
const PORT = 8080
const SECRET = "prisma_ai_secret"

app.use(express.json())
app.use(express.static(path.join(__dirname, "public")))

const db = new sqlite3.Database("banco.db")
app.locals.db = db

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve(this)
    })
  })
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      telefone TEXT UNIQUE,
      plan TEXT NOT NULL DEFAULT 'free',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS transacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      descricao TEXT NOT NULL,
      valor REAL NOT NULL,
      tipo TEXT NOT NULL,
      categoria TEXT,
      data TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS cartoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      limite REAL NOT NULL,
      fechamento INTEGER DEFAULT 10,
      vencimento INTEGER DEFAULT 20
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS compras_cartao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      cartao_id INTEGER NOT NULL,
      descricao TEXT NOT NULL,
      valor_total REAL NOT NULL,
      valor_parcela REAL NOT NULL,
      parcelas INTEGER NOT NULL,
      parcela_atual INTEGER NOT NULL,
      data_compra TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS metas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      valor_meta REAL NOT NULL,
      valor_atual REAL NOT NULL DEFAULT 0
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS mensagens_whatsapp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      telefone TEXT,
      mensagem TEXT,
      tipo TEXT,
      status TEXT,
      resposta_ia TEXT,
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS confirmacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      telefone TEXT NOT NULL,
      acao TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)
})

function auth(req, res, next) {
  const token = req.headers.authorization

  if (!token) {
    return res.status(401).json({ erro: "sem token" })
  }

  try {
    req.user = jwt.verify(token, SECRET)
    next()
  } catch {
    return res.status(401).json({ erro: "token invalido" })
  }
}

async function getUserById(userId) {
  return await dbGet(
    "SELECT id, email, telefone, plan, created_at FROM users WHERE id = ?",
    [userId]
  )
}

async function countRows(sql, params = []) {
  const row = await dbGet(sql, params)
  return Number(row?.total || 0)
}

async function enforcePlanLimit(userId, type) {
  const user = await getUserById(userId)
  if (!user) return { ok: false, erro: "usuario nao encontrado" }
  if (user.plan === "pro") return { ok: true }

  if (type === "transacoes") {
    const total = await countRows(
      "SELECT COUNT(*) as total FROM transacoes WHERE user_id = ?",
      [userId]
    )
    if (total >= 50) {
      return { ok: false, erro: "limite do plano grátis: 50 transações" }
    }
  }

  if (type === "cartoes") {
    const total = await countRows(
      "SELECT COUNT(*) as total FROM cartoes WHERE user_id = ?",
      [userId]
    )
    if (total >= 1) {
      return { ok: false, erro: "limite do plano grátis: 1 cartão" }
    }
  }

  if (type === "metas") {
    const total = await countRows(
      "SELECT COUNT(*) as total FROM metas WHERE user_id = ?",
      [userId]
    )
    if (total >= 1) {
      return { ok: false, erro: "limite do plano grátis: 1 meta" }
    }
  }

  return { ok: true }
}

app.post("/api/register", async (req, res) => {
  const { email, password, telefone } = req.body

  if (!email || !password) {
    return res.status(400).json({ erro: "preencha email e senha" })
  }

  try {
    const hash = await bcrypt.hash(password, 10)

    await dbRun(
      "INSERT INTO users(email, password, telefone, plan) VALUES (?, ?, ?, 'free')",
      [email, hash, telefone || null]
    )

    res.json({ ok: true })
  } catch (err) {
    if (String(err.message || "").includes("UNIQUE")) {
      return res.status(400).json({ erro: "usuario existe" })
    }
    res.status(500).json({ erro: "erro no cadastro" })
  }
})

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ erro: "preencha email e senha" })
  }

  try {
    const user = await dbGet("SELECT * FROM users WHERE email = ?", [email])

    if (!user) {
      return res.status(400).json({ erro: "usuario nao encontrado" })
    }

    const ok = await bcrypt.compare(password, user.password)

    if (!ok) {
      return res.status(400).json({ erro: "senha incorreta" })
    }

    const token = jwt.sign({ id: user.id, email: user.email }, SECRET)
    res.json({ token })
  } catch {
    res.status(500).json({ erro: "erro no login" })
  }
})

app.get("/api/me", auth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id)

    if (!user) {
      return res.status(404).json({ erro: "usuario nao encontrado" })
    }

    const usage = {
      transacoes: await countRows("SELECT COUNT(*) as total FROM transacoes WHERE user_id = ?", [req.user.id]),
      cartoes: await countRows("SELECT COUNT(*) as total FROM cartoes WHERE user_id = ?", [req.user.id]),
      metas: await countRows("SELECT COUNT(*) as total FROM metas WHERE user_id = ?", [req.user.id])
    }

    const limits = user.plan === "pro"
      ? { transacoes: null, cartoes: null, metas: null }
      : { transacoes: 50, cartoes: 1, metas: 1 }

    res.json({
      ...user,
      usage,
      limits
    })
  } catch {
    res.status(500).json({ erro: "erro ao carregar conta" })
  }
})

app.post("/api/upgrade-demo", auth, async (req, res) => {
  try {
    await dbRun("UPDATE users SET plan = 'pro' WHERE id = ?", [req.user.id])
    res.json({ ok: true })
  } catch {
    res.status(500).json({ erro: "erro ao atualizar plano" })
  }
})

app.get("/api/transacoes", auth, async (req, res) => {
  try {
    const mes = req.query.mes
    let sql = "SELECT * FROM transacoes WHERE user_id = ?"
    const params = [req.user.id]

    if (mes) {
      sql += " AND substr(data, 1, 7) = ?"
      params.push(mes)
    }

    sql += " ORDER BY id DESC"

    const rows = await dbAll(sql, params)
    res.json(rows)
  } catch {
    res.json([])
  }
})

app.get("/api/resumo", auth, async (req, res) => {
  try {
    const mes = req.query.mes
    let sql = "SELECT * FROM transacoes WHERE user_id = ?"
    const params = [req.user.id]

    if (mes) {
      sql += " AND substr(data, 1, 7) = ?"
      params.push(mes)
    }

    const rows = await dbAll(sql, params)

    let receitas = 0
    let gastos = 0
    const categorias = {}

    for (const t of rows) {
      const valor = Number(t.valor) || 0

      if (t.tipo === "receita") {
        receitas += valor
      } else {
        gastos += valor
        const cat = t.categoria || "Sem categoria"
        categorias[cat] = (categorias[cat] || 0) + valor
      }
    }

    res.json({
      receitas,
      gastos,
      saldo: receitas - gastos,
      categorias
    })
  } catch {
    res.status(500).json({ erro: "erro ao gerar resumo" })
  }
})

app.post("/api/transacoes", auth, async (req, res) => {
  const { descricao, valor, tipo, categoria } = req.body

  if (!descricao || valor === undefined || valor === null || !tipo) {
    return res.status(400).json({ erro: "dados invalidos" })
  }

  try {
    const limit = await enforcePlanLimit(req.user.id, "transacoes")
    if (!limit.ok) return res.status(403).json({ erro: limit.erro })

    const info = await dbRun(
      `INSERT INTO transacoes (user_id, descricao, valor, tipo, categoria, data)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [req.user.id, descricao, Number(valor), tipo, categoria || ""]
    )

    res.json({ ok: true, id: info.lastID })
  } catch {
    res.status(500).json({ erro: "erro ao salvar transacao" })
  }
})

app.put("/api/transacoes/:id", auth, async (req, res) => {
  const { descricao, valor, tipo, categoria } = req.body

  if (!descricao || valor === undefined || valor === null || !tipo) {
    return res.status(400).json({ erro: "dados invalidos" })
  }

  try {
    await dbRun(
      `UPDATE transacoes
       SET descricao = ?, valor = ?, tipo = ?, categoria = ?
       WHERE id = ? AND user_id = ?`,
      [descricao, Number(valor), tipo, categoria || "", req.params.id, req.user.id]
    )

    res.json({ ok: true })
  } catch {
    res.status(500).json({ erro: "erro ao editar transacao" })
  }
})

app.delete("/api/transacoes/:id", auth, async (req, res) => {
  try {
    await dbRun(
      "DELETE FROM transacoes WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    )
    res.json({ ok: true })
  } catch {
    res.status(500).json({ erro: "erro ao excluir transacao" })
  }
})

app.get("/api/cartoes", auth, async (req, res) => {
  try {
    const rows = await dbAll(
      "SELECT * FROM cartoes WHERE user_id = ? ORDER BY id DESC",
      [req.user.id]
    )
    res.json(rows)
  } catch {
    res.json([])
  }
})

app.post("/api/cartoes", auth, async (req, res) => {
  const { nome, limite, fechamento, vencimento } = req.body

  if (!nome || limite === undefined || limite === null) {
    return res.status(400).json({ erro: "dados invalidos" })
  }

  try {
    const limit = await enforcePlanLimit(req.user.id, "cartoes")
    if (!limit.ok) return res.status(403).json({ erro: limit.erro })

    const info = await dbRun(
      `INSERT INTO cartoes (user_id, nome, limite, fechamento, vencimento)
       VALUES (?, ?, ?, ?, ?)`,
      [
        req.user.id,
        nome,
        Number(limite),
        Number(fechamento || 10),
        Number(vencimento || 20)
      ]
    )

    res.json({ ok: true, id: info.lastID })
  } catch {
    res.status(500).json({ erro: "erro ao criar cartao" })
  }
})

app.delete("/api/cartoes/:id", auth, async (req, res) => {
  try {
    await dbRun(
      "DELETE FROM cartoes WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    )
    res.json({ ok: true })
  } catch {
    res.status(500).json({ erro: "erro ao excluir cartao" })
  }
})

app.post("/api/compras-cartao", auth, async (req, res) => {
  const { cartao_id, descricao, valor_total, parcelas } = req.body

  if (!cartao_id || !descricao || !valor_total || !parcelas) {
    return res.status(400).json({ erro: "dados invalidos" })
  }

  try {
    const cartao = await dbGet(
      "SELECT * FROM cartoes WHERE id = ? AND user_id = ?",
      [cartao_id, req.user.id]
    )

    if (!cartao) {
      return res.status(404).json({ erro: "cartao nao encontrado" })
    }

    const total = Number(valor_total)
    const qtd = Number(parcelas)

    if (qtd < 1) {
      return res.status(400).json({ erro: "parcelas invalidas" })
    }

    const valorParcela = total / qtd

    for (let i = 1; i <= qtd; i++) {
      await dbRun(
        `INSERT INTO compras_cartao
        (user_id, cartao_id, descricao, valor_total, valor_parcela, parcelas, parcela_atual, data_compra)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [req.user.id, cartao_id, descricao, total, valorParcela, qtd, i]
      )
    }

    res.json({ ok: true })
  } catch {
    res.status(500).json({ erro: "erro ao salvar compra" })
  }
})

app.get("/api/fatura/:cartaoId", auth, async (req, res) => {
  try {
    const mes = req.query.mes
    let sql = `
      SELECT * FROM compras_cartao
      WHERE user_id = ? AND cartao_id = ?
    `
    const params = [req.user.id, req.params.cartaoId]

    if (mes) {
      sql += " AND substr(data_compra, 1, 7) = ?"
      params.push(mes)
    }

    sql += " ORDER BY id DESC"

    const rows = await dbAll(sql, params)
    res.json(rows)
  } catch {
    res.json([])
  }
})

app.get("/api/metas", auth, async (req, res) => {
  try {
    const rows = await dbAll(
      "SELECT * FROM metas WHERE user_id = ? ORDER BY id DESC",
      [req.user.id]
    )
    res.json(rows)
  } catch {
    res.json([])
  }
})

app.post("/api/metas", auth, async (req, res) => {
  const { nome, valor_meta, valor_atual } = req.body

  if (!nome || valor_meta === undefined || valor_meta === null) {
    return res.status(400).json({ erro: "dados invalidos" })
  }

  try {
    const limit = await enforcePlanLimit(req.user.id, "metas")
    if (!limit.ok) return res.status(403).json({ erro: limit.erro })

    const info = await dbRun(
      "INSERT INTO metas (user_id, nome, valor_meta, valor_atual) VALUES (?, ?, ?, ?)",
      [req.user.id, nome, Number(valor_meta), Number(valor_atual || 0)]
    )

    res.json({ ok: true, id: info.lastID })
  } catch {
    res.status(500).json({ erro: "erro ao criar meta" })
  }
})

app.put("/api/metas/:id", auth, async (req, res) => {
  const { nome, valor_meta, valor_atual } = req.body

  try {
    await dbRun(
      `UPDATE metas
       SET nome = ?, valor_meta = ?, valor_atual = ?
       WHERE id = ? AND user_id = ?`,
      [nome, Number(valor_meta), Number(valor_atual), req.params.id, req.user.id]
    )

    res.json({ ok: true })
  } catch {
    res.status(500).json({ erro: "erro ao atualizar meta" })
  }
})

app.delete("/api/metas/:id", auth, async (req, res) => {
  try {
    await dbRun(
      "DELETE FROM metas WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    )
    res.json({ ok: true })
  } catch {
    res.status(500).json({ erro: "erro ao excluir meta" })
  }
})

app.get("/api/export/csv", auth, async (req, res) => {
  try {
    const rows = await dbAll(
      "SELECT * FROM transacoes WHERE user_id = ? ORDER BY id DESC",
      [req.user.id]
    )

    const header = "id,descricao,valor,tipo,categoria,data\n"
    const body = rows.map(r =>
      [
        r.id,
        `"${String(r.descricao).replace(/"/g, '""')}"`,
        r.valor,
        r.tipo,
        `"${String(r.categoria || "").replace(/"/g, '""')}"`,
        r.data
      ].join(",")
    ).join("\n")

    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", "attachment; filename=transacoes.csv")
    res.send(header + body)
  } catch {
    res.status(500).send("erro ao exportar")
  }
})

app.use("/", whatsappRouter)

app.listen(PORT, () => {
  console.log(`🚀 Prisma AI rodando em http://localhost:${PORT}`)
})