const express = require("express")
const { parseMensagem } = require("./parser")

const router = express.Router()

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve(this)
    })
  })
}

async function buscarUsuarioPorTelefone(db, telefone) {
  const row = await dbGet(
    db,
    "SELECT * FROM users WHERE telefone = ?",
    [telefone]
  )
  return row
}

async function salvarPendencia(db, userId, telefone, intent, payload) {
  await dbRun(
    db,
    `INSERT INTO confirmacoes (user_id, telefone, acao, payload_json, status, criado_em)
     VALUES (?, ?, ?, ?, 'pendente', datetime('now'))`,
    [userId, telefone, intent, JSON.stringify(payload)]
  )
}

async function buscarPendencia(db, telefone) {
  return await dbGet(
    db,
    `SELECT * FROM confirmacoes
     WHERE telefone = ? AND status = 'pendente'
     ORDER BY id DESC
     LIMIT 1`,
    [telefone]
  )
}

async function concluirPendencia(db, id) {
  await dbRun(
    db,
    "UPDATE confirmacoes SET status = 'confirmado' WHERE id = ?",
    [id]
  )
}

async function salvarHistorico(db, userId, telefone, mensagem, tipo, status, resposta) {
  await dbRun(
    db,
    `INSERT INTO mensagens_whatsapp (user_id, telefone, mensagem, tipo, status, resposta_ia, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    [userId || null, telefone, mensagem, tipo, status, resposta || ""]
  )
}

async function consultarSaldo(db, userId) {
  const rows = await dbAll(
    db,
    "SELECT * FROM transacoes WHERE user_id = ?",
    [userId]
  )

  let receitas = 0
  let gastos = 0

  for (const t of rows) {
    const valor = Number(t.valor) || 0
    if (t.tipo === "receita") receitas += valor
    else gastos += valor
  }

  return receitas - gastos
}

async function salvarAcaoConfirmada(db, userId, payload) {
  if (payload.intent === "despesa") {
    await dbRun(
      db,
      `INSERT INTO transacoes (user_id, descricao, valor, tipo, categoria, data)
       VALUES (?, ?, ?, 'gasto', ?, datetime('now'))`,
      [userId, payload.descricao, Number(payload.valor), payload.categoria || "Outros"]
    )
    return "Despesa salva com sucesso."
  }

  if (payload.intent === "receita") {
    await dbRun(
      db,
      `INSERT INTO transacoes (user_id, descricao, valor, tipo, categoria, data)
       VALUES (?, ?, ?, 'receita', ?, datetime('now'))`,
      [userId, payload.descricao, Number(payload.valor), payload.categoria || "Outros"]
    )
    return "Receita salva com sucesso."
  }

  if (payload.intent === "cartao_compra") {
    const cartao = await dbGet(
      db,
      "SELECT * FROM cartoes WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      [userId]
    )

    if (!cartao) {
      return "Você ainda não tem cartão cadastrado no app."
    }

    const total = Number(payload.valor_total)
    const parcelas = Number(payload.parcelas || 1)
    const valorParcela = total / parcelas

    for (let i = 1; i <= parcelas; i++) {
      await dbRun(
        db,
        `INSERT INTO compras_cartao
        (user_id, cartao_id, descricao, valor_total, valor_parcela, parcelas, parcela_atual, data_compra)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [userId, cartao.id, payload.descricao, total, valorParcela, parcelas, i]
      )
    }

    return `Compra no cartão salva em ${parcelas}x.`
  }

  return "Não consegui salvar essa ação."
}

router.post("/webhook/whatsapp", async (req, res) => {
  const db = req.app.locals.db
  const { telefone, mensagem } = req.body

  if (!telefone || !mensagem) {
    return res.status(400).json({ erro: "telefone e mensagem são obrigatórios" })
  }

  try {
    const user = await buscarUsuarioPorTelefone(db, telefone)

    if (!user) {
      await salvarHistorico(db, null, telefone, mensagem, "texto", "sem_usuario", "Telefone não vinculado")
      return res.json({
        reply: "Telefone não vinculado. Cadastre seu número no Prisma AI primeiro."
      })
    }

    const texto = String(mensagem).trim().toLowerCase()

    if (["sim", "confirmar", "ok"].includes(texto)) {
      const pendencia = await buscarPendencia(db, telefone)

      if (!pendencia) {
        return res.json({ reply: "Não encontrei nenhuma ação pendente para confirmar." })
      }

      const payload = JSON.parse(pendencia.payload_json)
      const resposta = await salvarAcaoConfirmada(db, user.id, payload)

      await concluirPendencia(db, pendencia.id)
      await salvarHistorico(db, user.id, telefone, mensagem, "texto", "confirmado", resposta)

      return res.json({ reply: resposta })
    }

    const parsed = parseMensagem(mensagem)

    if (parsed.intent === "consultar_saldo") {
      const saldo = await consultarSaldo(db, user.id)
      const resposta = `Seu saldo atual é R$ ${saldo.toFixed(2)}.`
      await salvarHistorico(db, user.id, telefone, mensagem, "texto", "consulta", resposta)
      return res.json({ reply: resposta })
    }

    if (parsed.intent === "desconhecido") {
      const resposta = "Não entendi. Exemplos: 'gastei 42 no uber', 'recebi 2500 de salário', 'compra no cartão 300 em 3x'."
      await salvarHistorico(db, user.id, telefone, mensagem, "texto", "nao_entendido", resposta)
      return res.json({ reply: resposta })
    }

    await salvarPendencia(db, user.id, telefone, parsed.intent, parsed)

    let confirmacao = "Confirma?"

    if (parsed.intent === "despesa") {
      confirmacao = `Entendi uma despesa de R$ ${Number(parsed.valor).toFixed(2)} em ${parsed.categoria} com descrição "${parsed.descricao}". Responda SIM para confirmar.`
    }

    if (parsed.intent === "receita") {
      confirmacao = `Entendi uma receita de R$ ${Number(parsed.valor).toFixed(2)} com descrição "${parsed.descricao}". Responda SIM para confirmar.`
    }

    if (parsed.intent === "cartao_compra") {
      confirmacao = `Entendi uma compra no cartão de R$ ${Number(parsed.valor_total).toFixed(2)} em ${parsed.parcelas}x com descrição "${parsed.descricao}". Responda SIM para confirmar.`
    }

    await salvarHistorico(db, user.id, telefone, mensagem, "texto", "pendente", confirmacao)

    return res.json({ reply: confirmacao })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ erro: "erro interno no webhook" })
  }
})

module.exports = router