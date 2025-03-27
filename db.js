const { Pool } = require('pg');

const pool = new Pool({
    user: 'vinicius',
    host: 'localhost',
    database: 'server_node',
    password: '1234',
    port: 5432,
});

pool.connect()
    .then(()=> console.log('Conectado ao banco!'))
    .catch(err => console.error('Erro ao conectarao banco', err));

module.exports = pool;