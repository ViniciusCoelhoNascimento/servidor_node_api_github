const Redis = require('ioredis');
const redis = new Redis(); // Conexão padrão na porta 6379

// Teste de conexão
redis.ping()
    .then(() => console.log('✅ Conectado ao Redis!'))
    .catch(err => console.error('Erro ao conectar ao Redis:', err));

module.exports = redis;