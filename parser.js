function extrairNumero(texto) {
  const match = texto.replace(",", ".").match(/(\d+(\.\d+)?)/)
  return match ? Number(match[1]) : null
}

function extrairParcelas(texto) {
  const match = texto.match(/(\d+)\s*(x|parcelas?)/i)
  return match ? Number(match[1]) : 1
}

function categorizarDescricao(descricao = "") {
  const t = descricao.toLowerCase()

  if (t.includes("uber") || t.includes("99") || t.includes("gasolina") || t.includes("ônibus") || t.includes("onibus")) {
    return "Transporte"
  }

  if (t.includes("mercado") || t.includes("ifood") || t.includes("restaurante") || t.includes("lanche") || t.includes("padaria")) {
    return "Alimentação"
  }

  if (t.includes("aluguel") || t.includes("energia") || t.includes("agua") || t.includes("água") || t.includes("internet")) {
    return "Moradia"
  }

  if (t.includes("farmacia") || t.includes("farmácia") || t.includes("medico") || t.includes("médico")) {
    return "Saúde"
  }

  if (t.includes("cinema") || t.includes("netflix") || t.includes("spotify")) {
    return "Lazer"
  }

  if (t.includes("salario") || t.includes("salário")) {
    return "Salário"
  }

  if (t.includes("freela") || t.includes("freelance")) {
    return "Freelance"
  }

  return "Outros"
}

function limparTextoBase(texto = "") {
  return texto
    .toLowerCase()
    .replace("gastei", "")
    .replace("recebi", "")
    .replace("ganhei", "")
    .replace("compra no cartão", "")
    .replace("compra no cartao", "")
    .replace("cartão", "")
    .replace("cartao", "")
    .replace("de", "")
    .replace("em", "")
    .trim()
}

function parseMensagem(texto) {
  const original = String(texto || "").trim()
  const t = original.toLowerCase()

  if (!original) {
    return { intent: "desconhecido", needs_confirmation: false }
  }

  if (["saldo", "meu saldo", "consultar saldo"].includes(t)) {
    return {
      intent: "consultar_saldo",
      needs_confirmation: false
    }
  }

  if (t.includes("gastei")) {
    const valor = extrairNumero(t)
    const descricao = limparTextoBase(original).replace(String(valor), "").trim()
    return {
      intent: "despesa",
      valor,
      descricao: descricao || "Despesa",
      categoria: categorizarDescricao(descricao),
      needs_confirmation: true
    }
  }

  if (t.includes("recebi") || t.includes("ganhei")) {
    const valor = extrairNumero(t)
    const descricao = limparTextoBase(original).replace(String(valor), "").trim()
    return {
      intent: "receita",
      valor,
      descricao: descricao || "Receita",
      categoria: categorizarDescricao(descricao),
      needs_confirmation: true
    }
  }

  if (t.includes("cartão") || t.includes("cartao")) {
    const valor_total = extrairNumero(t)
    const parcelas = extrairParcelas(t)
    const descricao = limparTextoBase(original)
      .replace(String(valor_total), "")
      .replace(String(parcelas), "")
      .replace("x", "")
      .replace("parcelas", "")
      .replace("parcela", "")
      .trim()

    return {
      intent: "cartao_compra",
      valor_total,
      parcelas,
      descricao: descricao || "Compra no cartão",
      categoria: categorizarDescricao(descricao),
      needs_confirmation: true
    }
  }

  return {
    intent: "desconhecido",
    needs_confirmation: false
  }
}

module.exports = {
  parseMensagem
}