require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const pool = require('./db');
const jwt = require('jsonwebtoken');
const redis = require('redis');
const bodyParser = require('body-parser');
const app = express();
const PORT = 3000;
const client = redis.createClient({
    socket: {
        host: '127.0.0.1', // IP do servidor Redis
        port: 6379 // Porta padrão do Redis
    }
});

client.on('error', (err) => console.log('Redis Client Error', err));

(async () => {
    await client.connect(); // Conectar ao Redis
    console.log('Conectado ao Redis!');
})();

app.use(cookieParser());
app.use(express.json());
app.use(cors({
    origin: '*'
}));

async function storeGHToken(gh_token, JWTToken) {
    await client.set(`github_token_from:${JWTToken}`, gh_token, 'EX', 7200);
}

async function storeRepos(repos, JWTToken) {
    await client.set(`repos_from:${JWTToken}`, repos, 'EX', 7200);
}

async function getGHToken(JWTToken) {
    return await client.get(`github_token_from:${JWTToken}`);
}

async function getRepos(JWTToken) {
    return await client.get(`repos_from:${JWTToken}`);
}

const generateJWTToken = (user) => {
    console.log(user.id, user.login, user.avatar_url)
    return jwt.sign(
        {
            id: user.id, login: user.login, avatar_url: user.avatar_url
        },
        process.env.JWT_SECRET,
        {
            expiresIn: '12h'
        }
    );
};

app.get('/teste', (req, res)=>{
   return res.send('Acesso permitido');
})

app.get('/auth/github', (req, res)=>{
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=user`
    res.redirect(githubAuthUrl);
});

app.get('/auth/callback', async (req, res)=>{
    const { code } = req.query;

    if (!code) {
        return res.status(400).json({ error: 'Código de autorização não encontrado' });
    }

    try {
        const response = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code,
        },{
            headers: { Accept: 'application/json'}
        });

        const GHToken = response.data.access_token;
        if (!GHToken){
            return res.status(400).json({error: 'Falha ao obter token de acesso'});
        }

        const userResponse = await axios.get('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${GHToken}`}
        });

        const userData = userResponse.data;

        const JWTtoken = generateJWTToken(userData);

        storeGHToken(GHToken, JWTtoken);
        
        res.json({ JWTtoken, userData});

    } catch (error) {
        console.error('Erro ao autenticar com GitHub:', error);
        res.status(500).json({error: 'Erro interno do servidor'});
    }
});

// Rota protegida que exige JWT
app.get('/api/protected', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]; // Pega o token do header

    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verifica o token
        res.json({ message: 'Acesso permitido', user: decoded });
    } catch (error) {
        res.status(401).json({ error: 'Token inválido' });
    }
});

//acessar api do github
app.get('/api/repos', async (req, res) => {
    const tokenJWT = req.headers.authorization?.split(' ')[1];

    if (!tokenJWT) {
        return res.status(401).json({ error: 'tokenJWT não fornecido' });
    }

    let tokenGH;
    try {
        tokenGH = await getGHToken(tokenJWT);
        console.log("Token do GitHub:", tokenGH);
    } catch (error) {
        return res.status(500).json({ error: 'Erro ao obter token do GitHub' });
    }

    try {
        // 1️⃣ Tenta obter os repositórios do Redis
        const cachedRepos = await client.get(`github_repos:${tokenGH}`);

        if (cachedRepos) {
            console.log("🔵 Repositórios encontrados no cache.");
            return res.json(JSON.parse(cachedRepos));
        }

        console.log("🔴 Repositórios não encontrados no cache. Buscando na API do GitHub...");

        // 2️⃣ Se não estiver no cache, busca na API do GitHub
        const response = await axios.get('https://api.github.com/user/repos', {
            headers: { Authorization: `Bearer ${tokenGH}` }
        });

        const repos = response.data;

        // 3️⃣ Armazena no Redis com expiração de 1 hora
        await client.set(`github_repos:${tokenGH}`, JSON.stringify(repos), 'EX', 3600);

        console.log("🟢 Repositórios armazenados no cache.");
        res.json(repos);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar repositórios' });
    }
});

//POST
app.use(bodyParser.json()); // Para parsear o corpo da requisição como JSON
app.post('/api/create-repo', async (req, res) => {
    const { repoName, description, private } = req.body; // Dados do repositório
    const JWTToken = req.headers.authorization?.split(' ')[1];
    const tokenGH = await getGHToken(JWTToken);
    console.log(tokenGH)
    if (!tokenGH) {
        return res.status(401).json({ error: 'Token do GitHub não fornecido' });
    }

    if (!repoName) {
        return res.status(400).json({ error: 'Nome do repositório é obrigatório' });
    }

    try {
        // Faz a requisição para a API do GitHub para criar o repositório
        const response = await axios.post('https://api.github.com/user/repos', 
            {
                name: repoName,
                description: description || '',
                private: private || false,  // Pode ser true ou false
            },
            {
                headers: {
                    Authorization: `Bearer ${tokenGH}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        res.status(201).json({ message: 'Repositório criado com sucesso!', repo: response.data });
    } catch (error) {
        console.error('erro create repos: ' + error);
        res.status(500).json({ error: 'Erro ao criar o repositório no GitHub' });
    }
});

app.get('/repos/favorites', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users_favs_repos');
        res.json(result.rows);
    } catch (error){
        console.error('Erro ao buscar favoritos:', error);
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

app.post('/repos/favorite', async (req, res) => {
    const { jwt_token, repository } = req.body;

    if(!jwt_token || !repository) {
        return res.status(400).json({
            error: 'jwt_token e repository são obrigatórios'
        });
    }

    try {
        const result = await pool.query(
            'INSERT INTO users_favs_repos (jwt_token, repository) VALUES ($1, $2) RETURNING *',
            [jwt_token, repository]
        );
        res.status(201).json({
            data: result.rows[0]
        });
    }catch (error) {
        console.error('Erro ao inserir repositório favorito:', error);
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

app.listen(PORT, () => {
    console.log(`servidor rodando em http://localhost:${PORT}`)
    console.log(`redirecionar ao github: http://localhost:${PORT}/auth/github`)
    console.log(`repositorios: http://localhost:${PORT}/api/repos`)
    console.log(`criar repo: http://localhost:${PORT}/api/create-repo`)
    
});