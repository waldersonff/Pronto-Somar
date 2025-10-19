const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
// const localtunnel = require('localtunnel');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('../frontend'));

const db = mysql.createConnection(process.env.DATABASE_URL || {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'wsw240204'
});

db.connect(err => {
  if (err) throw err;
  console.log('Connected to MySQL');

  // Create database if not exists
  db.query('CREATE DATABASE IF NOT EXISTS gestao_residuos', (err) => {
    if (err) console.error(err);
    // Now connect to the database
    db.changeUser({ database: 'gestao_residuos' }, (err) => {
      if (err) console.error(err);
      // Create tables
      db.query(`CREATE TABLE IF NOT EXISTS produtos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        categoria VARCHAR(255),
        preco DECIMAL(10,2),
        estoque INT
      )`);

      db.query(`CREATE TABLE IF NOT EXISTS vendas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cliente VARCHAR(255),
        id_produto INT,
        quantidade INT,
        data DATE,
        valor_total DECIMAL(10,2),
        FOREIGN KEY (id_produto) REFERENCES produtos(id)
      )`);

      db.query(`CREATE TABLE IF NOT EXISTS licitacoes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        numero_licitacao VARCHAR(255),
        orgao_publico VARCHAR(255),
        valor_estimado DECIMAL(10,2),
        data_abertura DATE,
        status VARCHAR(255)
      )`);

      // Produtos
      app.get('/api/produtos', (req, res) => {
        db.query('SELECT * FROM produtos', (err, results) => {
          if (err) return res.status(500).json(err);
          res.json(results);
        });
      });

      app.post('/api/produtos', (req, res) => {
        const { nome, categoria, preco, estoque } = req.body;
        db.query('INSERT INTO produtos (nome, categoria, preco, estoque) VALUES (?, ?, ?, ?)', [nome, categoria, preco, estoque], (err, result) => {
          if (err) return res.status(500).json(err);
          res.json({ id: result.insertId, ...req.body });
        });
      });

      app.put('/api/produtos/:id', (req, res) => {
        const { id } = req.params;
        const { nome, categoria, preco, estoque } = req.body;
        db.query('UPDATE produtos SET nome=?, categoria=?, preco=?, estoque=? WHERE id=?', [nome, categoria, preco, estoque, id], (err) => {
          if (err) return res.status(500).json(err);
          res.json({ message: 'Updated' });
        });
      });

      app.delete('/api/produtos/:id', (req, res) => {
        const { id } = req.params;
        // Update vendas table to set id_produto to NULL for the deleted product
        db.query('UPDATE vendas SET id_produto = NULL WHERE id_produto = ?', [id], (err) => {
            if (err) return res.status(500).json(err);

            // Now, delete the product
            db.query('DELETE FROM produtos WHERE id=?', [id], (err) => {
                if (err) return res.status(500).json(err);
                res.json({ message: 'Deleted' });
            });
        });
    });

      // Vendas
      app.get('/api/vendas', (req, res) => {
        db.query('SELECT v.*, p.nome as produto_nome FROM vendas v LEFT JOIN produtos p ON v.id_produto = p.id', (err, results) => {
          if (err) return res.status(500).json(err);
          res.json(results);
        });
      });

      app.post('/api/vendas', (req, res) => {
        const { cliente, id_produto, quantidade, data } = req.body;
        db.query('SELECT preco, estoque FROM produtos WHERE id=?', [id_produto], (err, results) => {
          if (err) return res.status(500).json(err);
          if (results.length === 0) return res.status(400).json({ message: 'Produto não encontrado' });
          const produto = results[0];
          if (produto.estoque < quantidade) return res.status(400).json({ message: 'Estoque insuficiente' });
          const valor_total = produto.preco * quantidade;
          db.query('INSERT INTO vendas (cliente, id_produto, quantidade, data, valor_total) VALUES (?, ?, ?, ?, ?)', [cliente, id_produto, quantidade, data, valor_total], (err, result) => {
            if (err) return res.status(500).json(err);
            db.query('UPDATE produtos SET estoque = estoque - ? WHERE id=?', [quantidade, id_produto], (err) => {
              if (err) console.error('Error updating stock:', err);
            });
            // Fetch produto_nome
            db.query('SELECT nome as produto_nome FROM produtos WHERE id=?', [id_produto], (err, prodResults) => {
              if (err) console.error('Error fetching product name:', err);
              const produto_nome = prodResults.length > 0 ? prodResults[0].produto_nome : 'Excluído';
              res.json({ id: result.insertId, ...req.body, valor_total, produto_nome });
            });
          });
        });
      });

      app.put('/api/vendas/:id', (req, res) => {
        const { id } = req.params;
        const { cliente, id_produto, quantidade, data } = req.body;
        db.query('SELECT preco, estoque FROM produtos WHERE id=?', [id_produto], (err, results) => {
          if (err) return res.status(500).json(err);
          if (results.length === 0) return res.status(400).json({ message: 'Produto não encontrado' });
          const produto = results[0];
          // Get old venda to adjust stock
          db.query('SELECT quantidade, id_produto as old_id_produto FROM vendas WHERE id=?', [id], (err, oldResults) => {
            if (err) return res.status(500).json(err);
            if (oldResults.length === 0) return res.status(404).json({ message: 'Venda não encontrada' });
            const oldVenda = oldResults[0];
            const stockChange = quantidade - oldVenda.quantidade;
            if (produto.estoque < stockChange) return res.status(400).json({ message: 'Estoque insuficiente' });
            const valor_total = produto.preco * quantidade;
            db.query('UPDATE vendas SET cliente=?, id_produto=?, quantidade=?, data=?, valor_total=? WHERE id=?', [cliente, id_produto, quantidade, data, valor_total, id], (err) => {
              if (err) return res.status(500).json(err);
              // Adjust stock
              db.query('UPDATE produtos SET estoque = estoque - ? WHERE id=?', [stockChange, id_produto], (err) => {
                if (err) console.error('Error updating stock:', err);
              });
              res.json({ message: 'Updated' });
            });
          });
        });
      });

      app.delete('/api/vendas/:id', (req, res) => {
        const { id } = req.params;
        db.query('SELECT quantidade, id_produto FROM vendas WHERE id=?', [id], (err, results) => {
          if (err) return res.status(500).json(err);
          if (results.length === 0) return res.status(404).json({ message: 'Venda não encontrada' });
          const venda = results[0];
          db.query('DELETE FROM vendas WHERE id=?', [id], (err) => {
            if (err) return res.status(500).json(err);
            // Restore stock
            db.query('UPDATE produtos SET estoque = estoque + ? WHERE id=?', [venda.quantidade, venda.id_produto], (err) => {
              if (err) console.error('Error restoring stock:', err);
            });
            res.json({ message: 'Deleted' });
          });
        });
      });

      // Licitações
      app.get('/api/licitacoes', (req, res) => {
        db.query('SELECT * FROM licitacoes', (err, results) => {
          if (err) return res.status(500).json(err);
          res.json(results);
        });
      });

      app.post('/api/licitacoes', (req, res) => {
        const { numero_licitacao, orgao_publico, valor_estimado, data_abertura, status } = req.body;
        db.query('INSERT INTO licitacoes (numero_licitacao, orgao_publico, valor_estimado, data_abertura, status) VALUES (?, ?, ?, ?, ?)', [numero_licitacao, orgao_publico, valor_estimado, data_abertura, status], (err, result) => {
          if (err) return res.status(500).json(err);
          res.json({ id: result.insertId, ...req.body });
        });
      });

      app.put('/api/licitacoes/:id', (req, res) => {
        const { id } = req.params;
        const { numero_licitacao, orgao_publico, valor_estimado, data_abertura, status } = req.body;
        db.query('UPDATE licitacoes SET numero_licitacao=?, orgao_publico=?, valor_estimado=?, data_abertura=?, status=? WHERE id=?', [numero_licitacao, orgao_publico, valor_estimado, data_abertura, status, id], (err) => {
          if (err) return res.status(500).json(err);
          res.json({ message: 'Updated' });
        });
      });

      app.delete('/api/licitacoes/:id', (req, res) => {
        const { id } = req.params;
        db.query('DELETE FROM licitacoes WHERE id=?', [id], (err) => {
          if (err) return res.status(500).json(err);
          res.json({ message: 'Deleted' });
        });
      });

      // Truncate all tables
      app.post('/api/truncate', (req, res) => {
        db.query('TRUNCATE TABLE produtos', (err) => {
          if (err) return res.status(500).json(err);
          db.query('TRUNCATE TABLE vendas', (err) => {
            if (err) return res.status(500).json(err);
            db.query('TRUNCATE TABLE licitacoes', (err) => {
              if (err) return res.status(500).json(err);
              res.json({ message: 'All tables truncated successfully' });
            });
          });
        });
      });
    });
  });
});

const PORT = 3000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  // try {
  //   const tunnel = await localtunnel({ port: PORT });
  //   console.log(`Localtunnel created: ${tunnel.url}`);
  //   tunnel.on('close', () => {
  //     console.log('Tunnel closed');
  //   });
  // } catch (error) {
  //   console.error('Error creating localtunnel:', error);
  // }
});
