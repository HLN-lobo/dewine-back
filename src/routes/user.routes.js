const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
router.get("/users", (req, res) => {
  res.send("Rota de usuários funcionando");
});

router.post("/users", (req, res) => {
  const data = req.body;
  res.send("Usuário recebido: " + JSON.stringify(data));
});

router.post("/cadastro", async (req, res) => {
  try {
    const { nome, email, senha, confirmarSenha, cpf, cep } = req.body;

    if (!nome) {
      return res.status(422).json({ message: "O nome é obrigatório!" });
    }
    if (!email) {
      return res.status(422).json({ message: "O email é obrigatório!" });
    }
    if (!cpf) {
      return res.status(422).json({ message: "O cpf é obrigatório!" });
    }
    if (!cep) {
      return res.status(422).json({ message: "O CEP é obrigatório!" });
    }
    if (!senha) {
      return res.status(422).json({ message: "A senha é obrigatória!" });
    }
    if (senha !== confirmarSenha) {
      return res.status(422).json({ message: "As senhas são diferentes!" });
    }
    const hashSenha = await bcrypt.hash(senha, 10);

    return res.status(201).json({
      message: "Cliente cadastrado com sucesso!",
      cliente: {
        nome,
        email,
        cpf,
        cep,
        senhaHash: hashSenha,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro interno",
      error: error.message,
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, senha, senhaHash } = req.body;
    if (!email) {
      return res.status(422).json({ message: "O email é obrigatório!" });
    }

    if (!senha) {
      return res.status(422).json({ message: "A senha é obrigatória!" });
    }

    if (!senhaHash) {
      return res.status(422).json({ message: "Hash não informado!" });
    }
    const isAdmin = email.includes("admin");
    let senhaValida = false;
    console.log(isAdmin);
    if (isAdmin) {
      console.log("Comparando senhas sem hash para usuário admin");
      senhaValida = senha === senhaHash;
      console.log("Senha fornecida:", senhaValida);
    } else {
      senhaValida = await bcrypt.compare(senha, senhaHash);
    }

    if (!senhaValida) {
      return res.status(401).json({
        message: "Email ou senha inválidos!",
      });
    }
    const token = jwt.sign(
      {
        email: email,
      },
      process.env.SECRET,
      {
        expiresIn: "1d",
      },
    );
    return res.status(200).json({
      message: "Autenticado com sucesso!",
      token: token,
      usuario: {
        email,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Erro interno",
      error: error.message,
    });
  }
});

module.exports = router;