// cart.controller.js
// Gerencia as operações de carrinho usando a tabela `compras` + `itens_compra`
// O carrinho é uma compra com status 'pendente'.

const Database = require("better-sqlite3");
const path = require("path");

// Ajuste o caminho para onde seu banco SQLite está armazenado no backend
const DB_PATH = path.resolve(__dirname, "../../dewine.db");

const getDb = () => new Database(DB_PATH);

// ─────────────────────────────────────────────
// GET /cart/:id_cliente
// Retorna o carrinho ativo (status='pendente') do cliente
// ─────────────────────────────────────────────
const getCart = (req, res) => {
  const { id_cliente } = req.params;
  const db = getDb();

  try {
    // Busca a compra pendente mais recente do cliente
    const compra = db
      .prepare(
        `SELECT * FROM compras
         WHERE id_cliente = ? AND status = 'pendente'
         ORDER BY data_compra DESC LIMIT 1`
      )
      .get(id_cliente);

    if (!compra) {
      return res.status(200).json({ carrinho: null, itens: [] });
    }

    // Busca os itens do carrinho com info do produto
    const itens = db
      .prepare(
        `SELECT ic.id_item, ic.id_produto, ic.quantidade, ic.preco_unitario,
                p.nome, p.categoria, p.estoque,
                (SELECT url FROM produto_imagens
                 WHERE id_produto = p.id_produto AND is_principal = 1
                 LIMIT 1) AS imagem_principal
         FROM itens_compra ic
         JOIN produtos p ON p.id_produto = ic.id_produto
         WHERE ic.id_compra = ?`
      )
      .all(compra.id_compra);

    return res.status(200).json({ carrinho: compra, itens });
  } catch (err) {
    console.error("[getCart]", err);
    return res.status(500).json({ erro: "Erro ao buscar carrinho." });
  } finally {
    db.close();
  }
};

// ─────────────────────────────────────────────
// POST /cart/add
// Adiciona um produto ao carrinho (cria compra pendente se não existir)
// Body: { id_cliente, id_produto, quantidade }
// ─────────────────────────────────────────────
const addToCart = (req, res) => {
  const { id_cliente, id_produto, quantidade = 1 } = req.body;

  if (!id_cliente || !id_produto) {
    return res
      .status(400)
      .json({ erro: "id_cliente e id_produto são obrigatórios." });
  }

  if (quantidade <= 0) {
    return res.status(400).json({ erro: "Quantidade deve ser maior que 0." });
  }

  const db = getDb();

  try {
    // Valida produto e estoque
    const produto = db
      .prepare(
        `SELECT id_produto, preco, estoque FROM produtos WHERE id_produto = ?`
      )
      .get(id_produto);

    if (!produto) {
      return res.status(404).json({ erro: "Produto não encontrado." });
    }

    if (produto.estoque < quantidade) {
      return res.status(400).json({
        erro: `Estoque insuficiente. Disponível: ${produto.estoque}`,
      });
    }

    // Valida cliente
    const cliente = db
      .prepare(`SELECT id_cliente FROM cliente WHERE id_cliente = ?`)
      .get(id_cliente);

    if (!cliente) {
      return res.status(404).json({ erro: "Cliente não encontrado." });
    }

    // Busca endereço padrão do cliente (necessário para criar compra)
    const endereco = db
      .prepare(
        `SELECT id_endereco FROM endereco WHERE id_cliente = ? LIMIT 1`
      )
      .get(id_cliente);

    const id_endereco = endereco ? endereco.id_endereco : 0;

    // Usa transação para garantir consistência
    const transaction = db.transaction(() => {
      // Busca ou cria compra pendente
      let compra = db
        .prepare(
          `SELECT * FROM compras
           WHERE id_cliente = ? AND status = 'pendente'
           ORDER BY data_compra DESC LIMIT 1`
        )
        .get(id_cliente);

      if (!compra) {
        const result = db
          .prepare(
            `INSERT INTO compras (id_cliente, id_endereco, valor_total, status)
             VALUES (?, ?, 0, 'pendente')`
          )
          .run(id_cliente, id_endereco);

        compra = db
          .prepare(`SELECT * FROM compras WHERE id_compra = ?`)
          .get(result.lastInsertRowid);
      }

      // Verifica se o produto já está no carrinho
      const itemExistente = db
        .prepare(
          `SELECT * FROM itens_compra
           WHERE id_compra = ? AND id_produto = ?`
        )
        .get(compra.id_compra, id_produto);

      if (itemExistente) {
        const novaQtd = itemExistente.quantidade + quantidade;

        if (produto.estoque < novaQtd) {
          throw new Error(
            `Estoque insuficiente para a quantidade total. Disponível: ${produto.estoque}`
          );
        }

        db.prepare(
          `UPDATE itens_compra SET quantidade = ? WHERE id_item = ?`
        ).run(novaQtd, itemExistente.id_item);
      } else {
        db.prepare(
          `INSERT INTO itens_compra (id_compra, id_produto, quantidade, preco_unitario)
           VALUES (?, ?, ?, ?)`
        ).run(compra.id_compra, id_produto, quantidade, produto.preco);
      }

      // Recalcula valor_total
      const total = db
        .prepare(
          `SELECT SUM(quantidade * preco_unitario) AS total
           FROM itens_compra WHERE id_compra = ?`
        )
        .get(compra.id_compra);

      db.prepare(
        `UPDATE compras SET valor_total = ? WHERE id_compra = ?`
      ).run(total.total || 0, compra.id_compra);

      return compra.id_compra;
    });

    const id_compra = transaction();

    return res.status(200).json({
      mensagem: "Produto adicionado ao carrinho.",
      id_compra,
    });
  } catch (err) {
    console.error("[addToCart]", err);
    return res
      .status(500)
      .json({ erro: err.message || "Erro ao adicionar ao carrinho." });
  } finally {
    db.close();
  }
};

// ─────────────────────────────────────────────
// PUT /cart/item/:id_item
// Atualiza a quantidade de um item do carrinho
// Body: { quantidade }
// ─────────────────────────────────────────────
const updateCartItem = (req, res) => {
  const { id_item } = req.params;
  const { quantidade } = req.body;

  if (!quantidade || quantidade <= 0) {
    return res.status(400).json({ erro: "Quantidade inválida." });
  }

  const db = getDb();

  try {
    const item = db
      .prepare(
        `SELECT ic.*, p.estoque, p.preco
         FROM itens_compra ic
         JOIN produtos p ON p.id_produto = ic.id_produto
         WHERE ic.id_item = ?`
      )
      .get(id_item);

    if (!item) {
      return res.status(404).json({ erro: "Item não encontrado." });
    }

    if (item.estoque < quantidade) {
      return res.status(400).json({
        erro: `Estoque insuficiente. Disponível: ${item.estoque}`,
      });
    }

    const transaction = db.transaction(() => {
      db.prepare(
        `UPDATE itens_compra SET quantidade = ? WHERE id_item = ?`
      ).run(quantidade, id_item);

      const total = db
        .prepare(
          `SELECT SUM(quantidade * preco_unitario) AS total
           FROM itens_compra WHERE id_compra = ?`
        )
        .get(item.id_compra);

      db.prepare(
        `UPDATE compras SET valor_total = ? WHERE id_compra = ?`
      ).run(total.total || 0, item.id_compra);
    });

    transaction();

    return res.status(200).json({ mensagem: "Quantidade atualizada." });
  } catch (err) {
    console.error("[updateCartItem]", err);
    return res.status(500).json({ erro: "Erro ao atualizar item." });
  } finally {
    db.close();
  }
};

// ─────────────────────────────────────────────
// DELETE /cart/item/:id_item
// Remove um item do carrinho
// ─────────────────────────────────────────────
const removeCartItem = (req, res) => {
  const { id_item } = req.params;
  const db = getDb();

  try {
    const item = db
      .prepare(`SELECT * FROM itens_compra WHERE id_item = ?`)
      .get(id_item);

    if (!item) {
      return res.status(404).json({ erro: "Item não encontrado." });
    }

    const transaction = db.transaction(() => {
      db.prepare(`DELETE FROM itens_compra WHERE id_item = ?`).run(id_item);

      const total = db
        .prepare(
          `SELECT SUM(quantidade * preco_unitario) AS total
           FROM itens_compra WHERE id_compra = ?`
        )
        .get(item.id_compra);

      db.prepare(
        `UPDATE compras SET valor_total = ? WHERE id_compra = ?`
      ).run(total.total || 0, item.id_compra);
    });

    transaction();

    return res.status(200).json({ mensagem: "Item removido do carrinho." });
  } catch (err) {
    console.error("[removeCartItem]", err);
    return res.status(500).json({ erro: "Erro ao remover item." });
  } finally {
    db.close();
  }
};

// ─────────────────────────────────────────────
// DELETE /cart/:id_cliente
// Limpa/cancela o carrinho inteiro do cliente
// ─────────────────────────────────────────────
const clearCart = (req, res) => {
  const { id_cliente } = req.params;
  const db = getDb();

  try {
    const compra = db
      .prepare(
        `SELECT * FROM compras
         WHERE id_cliente = ? AND status = 'pendente'
         ORDER BY data_compra DESC LIMIT 1`
      )
      .get(id_cliente);

    if (!compra) {
      return res.status(200).json({ mensagem: "Carrinho já está vazio." });
    }

    // Deleta itens (CASCADE cuida, mas fazemos explicitamente por segurança)
    db.prepare(
      `DELETE FROM itens_compra WHERE id_compra = ?`
    ).run(compra.id_compra);

    db.prepare(
      `UPDATE compras SET valor_total = 0 WHERE id_compra = ?`
    ).run(compra.id_compra);

    return res.status(200).json({ mensagem: "Carrinho limpo com sucesso." });
  } catch (err) {
    console.error("[clearCart]", err);
    return res.status(500).json({ erro: "Erro ao limpar carrinho." });
  } finally {
    db.close();
  }
};

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
};