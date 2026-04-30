// cart.routes.js
const express = require("express");
const router = express.Router();

const {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
} = require("../controllers/cart.controller");

// GET    /cart/:id_cliente        → busca carrinho ativo do cliente
router.get("/:id_cliente", getCart);

// POST   /cart/add                → adiciona produto ao carrinho
router.post("/add", addToCart);

// PUT    /cart/item/:id_item      → atualiza quantidade de um item
router.put("/item/:id_item", updateCartItem);

// DELETE /cart/item/:id_item      → remove um item do carrinho
router.delete("/item/:id_item", removeCartItem);

// DELETE /cart/:id_cliente        → limpa o carrinho inteiro
router.delete("/:id_cliente", clearCart);

module.exports = router;