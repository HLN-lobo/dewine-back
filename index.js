const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(morgan("dev"));
app.use(express.json());
app.use(cors());

const rotaUser = require("./src/routes/user.routes");
const rotaProd = require("./src/routes/prod.routes");
const rotaCart = require("./src/routes/cart.routes");

app.use("/users", rotaUser);
app.use("/produtos", rotaProd);
app.use("/cart", rotaCart);

app.use("/", (req, res) => {
  return res.status(200).send({ mensagem: "API funcionando" });
});

module.exports = app;