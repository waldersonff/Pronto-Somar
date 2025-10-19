const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('../frontend'));

// Create a new pool instance for connecting to the database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render requires SSL for external connections
  ssl: {
    rejectUnauthorized: false,
  },
});

// Function to set up the database tables
async function setupDatabase() {
  const client = await pool.connect();
  try {
    console.log('Connected to PostgreSQL, setting up database...');

    // Create 'produtos' table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS produtos (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        categoria VARCHAR(255),
        preco DECIMAL(10, 2),
        estoque INT
      )
    `);

    // Create 'vendas' table if it doesn't exist
    // ON DELETE SET NULL will automatically set id_produto to NULL if a product is deleted
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendas (
        id SERIAL PRIMARY KEY,
        cliente VARCHAR(255),
        id_produto INT,
        quantidade INT,
        data DATE,
        valor_total DECIMAL(10, 2),
        FOREIGN KEY (id_produto) REFERENCES produtos(id) ON DELETE SET NULL
      )
    `);

    // Create 'licitacoes' table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS licitacoes (
        id SERIAL PRIMARY KEY,
        numero_licitacao VARCHAR(255),
        orgao_publico VARCHAR(255),
        valor_estimado DECIMAL(10, 2),
        data_abertura DATE,
        status VARCHAR(255)
      )
    `);

    console.log('Tables are successfully created or already exist.');
  } catch (err) {
    console.error('Error setting up database:', err);
    // If setup fails, we should probably exit
    process.exit(1);
  } finally {
    // Release the client back to the pool
    client.release();
  }
}

// Call the setup function and then start the server
setupDatabase().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});


// --- API Endpoints ---

// Produtos
app.get('/api/produtos', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM produtos ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/produtos', async (req, res) => {
  try {
    const { nome, categoria, preco, estoque } = req.body;
    const result = await pool.query(
      'INSERT INTO produtos (nome, categoria, preco, estoque) VALUES ($1, $2, $3, $4) RETURNING id',
      [nome, categoria, preco, estoque]
    );
    res.status(201).json({ id: result.rows[0].id, ...req.body });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/produtos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, categoria, preco, estoque } = req.body;
    await pool.query(
      'UPDATE produtos SET nome = $1, categoria = $2, preco = $3, estoque = $4 WHERE id = $5',
      [nome, categoria, preco, estoque, id]
    );
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/produtos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // The ON DELETE SET NULL in the table definition handles updating the 'vendas' table
    await pool.query('DELETE FROM produtos WHERE id = $1', [id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Vendas
app.get('/api/vendas', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT v.*, p.nome as produto_nome FROM vendas v LEFT JOIN produtos p ON v.id_produto = p.id ORDER BY v.id ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/vendas', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { cliente, id_produto, quantidade, data } = req.body;

    const productResult = await client.query('SELECT nome, preco, estoque FROM produtos WHERE id = $1 FOR UPDATE', [id_produto]);
    if (productResult.rows.length === 0) {
      return res.status(400).json({ message: 'Produto não encontrado' });
    }

    const produto = productResult.rows[0];
    if (produto.estoque < quantidade) {
      return res.status(400).json({ message: 'Estoque insuficiente' });
    }

    const valor_total = produto.preco * quantidade;
    const newVendaResult = await client.query(
      'INSERT INTO vendas (cliente, id_produto, quantidade, data, valor_total) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [cliente, id_produto, quantidade, data, valor_total]
    );

    await client.query('UPDATE produtos SET estoque = estoque - $1 WHERE id = $2', [quantidade, id_produto]);

    await client.query('COMMIT');

    res.status(201).json({
      id: newVendaResult.rows[0].id,
      ...req.body,
      valor_total,
      produto_nome: produto.nome,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// PUT /api/vendas/:id is complex due to stock adjustments.
// This is a simplified version. For a real app, this needs careful transaction management.
app.put('/api/vendas/:id', async (req, res) => {
    // This is a complex operation. For simplicity, we'll just update the text fields.
    // A full implementation would need to handle stock adjustments carefully in a transaction.
    const { id } = req.params;
    const { cliente, data } = req.body;
    try {
        await pool.query('UPDATE vendas SET cliente = $1, data = $2 WHERE id = $3', [cliente, data, id]);
        res.json({ message: 'Updated (Note: Product and quantity changes not supported in this simplified version)' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


app.delete('/api/vendas/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const vendaResult = await client.query('SELECT quantidade, id_produto FROM vendas WHERE id = $1', [req.params.id]);
    if (vendaResult.rows.length === 0) {
      return res.status(404).json({ message: 'Venda não encontrada' });
    }
    const venda = vendaResult.rows[0];

    // Restore stock
    if (venda.id_produto) {
        await client.query('UPDATE produtos SET estoque = estoque + $1 WHERE id = $2', [venda.quantidade, venda.id_produto]);
    }

    await client.query('DELETE FROM vendas WHERE id = $1', [req.params.id]);

    await client.query('COMMIT');
    res.json({ message: 'Deleted and stock restored' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});


// Licitações
app.get('/api/licitacoes', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM licitacoes ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/licitacoes', async (req, res) => {
  try {
    const { numero_licitacao, orgao_publico, valor_estimado, data_abertura, status } = req.body;
    const result = await pool.query(
      'INSERT INTO licitacoes (numero_licitacao, orgao_publico, valor_estimado, data_abertura, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [numero_licitacao, orgao_publico, valor_estimado, data_abertura, status]
    );
    res.status(201).json({ id: result.rows[0].id, ...req.body });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/licitacoes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { numero_licitacao, orgao_publico, valor_estimado, data_abertura, status } = req.body;
    await pool.query(
      'UPDATE licitacoes SET numero_licitacao = $1, orgao_publico = $2, valor_estimado = $3, data_abertura = $4, status = $5 WHERE id = $6',
      [numero_licitacao, orgao_publico, valor_estimado, data_abertura, status, id]
    );
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/licitacoes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM licitacoes WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Truncate all tables - DANGEROUS, but was in original code
app.post('/api/truncate', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // TRUNCATE ... RESTART IDENTITY also resets the SERIAL sequence
        await client.query('TRUNCATE TABLE vendas, produtos, licitacoes RESTART IDENTITY');
        await client.query('COMMIT');
        res.json({ message: 'All tables truncated successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});